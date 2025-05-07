// src/app/listings/(detail)/[id]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import Slider from "react-slick";

// Import slick carousel CSS
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css"; // Keep theme CSS for arrow base styles

import { supabase, type User } from '@/lib/supabaseClient';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import {
  formatRelativeTime,
  isPast,
  formatCountdown,
} from '@/lib/timeUtils';
import { formatCurrency } from '@/lib/formatUtils';
import LoadingSpinner from '@/components/LoadingSpinner';

// Type Definitions
type Listing = {
  id: string;
  title: string;
  description: string;
  min_price: number;
  photos: string[] | null;
  end_time?: string | null;
  upper_cap?: number | null;
  rules?: string | null;
  seller_email?: string | null;
  seller_id?: string;
  status: 'active' | 'closed' | 'cancelled' | string; // Required
  winning_bidder_id?: string | null;
};

type Bid = {
  id: string;
  bid_price: number;
  bidder_id: string;
  timestamp: string;
  bidder_email?: string | null;
};

// Type for the payload coming from the 'listings' table realtime changes
type ListingTablePayload = Partial<{ // Use Partial as UPDATE might only send changed fields
  id: string;
  title: string;
  description: string;
  min_price: number;
  photos: string[] | null; // Type after migration
  end_time: string | null;
  upper_cap: number | null;
  rules: string | null;
  seller_id: string;
  status: 'active' | 'closed' | 'cancelled' | string; // Still allow broader string
  winning_bid_id: string | null;
  winning_bidder_id: string | null;
  created_at: string;
  tags: string[] | null;
}> & { id: string }; // Ensure ID is always present if payload exists

// Type for payload from 'bids' table
type BidTablePayload = Partial<{
    id: string;
    item_id: string;
    bidder_id: string;
    bid_price: number;
    timestamp: string;
}> & { id?: string }; // ID might be missing in some edge cases, handle defensively


// --- Component ---
export default function ListingDetails() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  // --- State ---
  const [listing, setListing] = useState<Listing | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [price, setPrice] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bidStatusMessage, setBidStatusMessage] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<string | null>(null);
  const [winnerEmail, setWinnerEmail] = useState<string | null>(null);


  // --- Load listing, bids, and winner email ---
  useEffect(() => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!id || !uuidRegex.test(id)) {
      setError('Invalid listing ID format.'); setLoading(false); return;
    }

    setLoading(true); setError(null); setListing(null); setBids([]); setPrice(''); setWinnerEmail(null);

    supabase.auth.getUser().then(({ data }) => setUser(data.user));

    const loadData = async () => {
      try {
        const { data: lData, error: lError } = await supabase
          .from('listings_with_seller_email')
          .select('id, title, description, min_price, photos, end_time, upper_cap, rules, seller_email, seller_id, status, winning_bidder_id')
          .eq('id', id)
          .maybeSingle();

        if (lError) throw lError;
        if (!lData || !lData.status) {
             setError('Listing not found or missing status.'); setLoading(false); return;
        }

        const fetchedListing = {
             ...lData,
             photos: lData.photos as string[] | null,
             status: lData.status as Listing['status']
        } as Listing;
        setListing(fetchedListing);

        const { data: bData, error: bError } = await supabase
          .from('bids_with_bidder_email')
          .select('*').eq('item_id', id).order('timestamp', { ascending: false });
        if (bError) throw bError;
        setBids(bData ?? []);

        if (fetchedListing.status === 'closed' && fetchedListing.winning_bidder_id) {
          const { data: winnerData, error: winnerError } = await supabase
             .from('users') // Check RLS/Permissions
             .select('email')
             .eq('id', fetchedListing.winning_bidder_id)
             .single();
           if (winnerError) console.error("Error fetching winner email (check RLS/table permissions):", winnerError.message);
           else if (winnerData) setWinnerEmail(winnerData.email);
        }

      } catch (err) {
        console.error("Data loading error:", err);
        setError(`Error loading details: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        setLoading(false);
      }
    };
    loadData();

    // --- Realtime Bids Channel ---
    const bidsChannel = supabase.channel(`listing-bids-${id}`);
    bidsChannel
      .on<BidTablePayload>( // Use corrected payload type
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bids', filter: `item_id=eq.${id}` },
        async (payload) => {
          // Defensive check
          if (payload.new && 'id' in payload.new && payload.new.id) {
            console.log('New bid received via realtime:', payload.new.id);
            const { data: newBid, error } = await supabase
              .from('bids_with_bidder_email')
              .select('*').eq('id', payload.new.id).single();
            if (!error && newBid) {
              setBids((currentBids) => [newBid as Bid, ...currentBids.filter((b) => b.id !== newBid.id)]);
            } else if (error) { console.error("Error fetching new bid details:", error); }
          } else {
              console.warn("Received bid INSERT payload without an ID:", payload.new);
          }
        }
      )
      .subscribe(status => console.log(`Bids channel status for ${id}: ${status}`));

    // --- Realtime Listing Status Updates Channel ---
    const listingChannel = supabase.channel(`listing-details-status-${id}`);
    listingChannel
        .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'listings', filter: `id=eq.${id}` },
            (payload: RealtimePostgresChangesPayload<ListingTablePayload>) => { // Callback uses specific payload type
                const updatedListingData = payload.new && 'id' in payload.new ? payload.new : null;
                if (!updatedListingData) return;
                console.log("Listing update received:", updatedListingData.status);

                 setListing(prev => {
                     if (!prev) return null;
                     const newStatus = updatedListingData.status ?? prev.status;
                     const newWinnerId = updatedListingData.winning_bidder_id !== undefined ? updatedListingData.winning_bidder_id : prev.winning_bidder_id;
                     let stateNeedsUpdate = false;
                     if (prev.status !== newStatus) stateNeedsUpdate = true;
                     if (prev.winning_bidder_id !== newWinnerId) stateNeedsUpdate = true;

                     if (stateNeedsUpdate) {
                         console.log(`RT Updating state: Status ${prev.status}->${newStatus}, Winner ${prev.winning_bidder_id}->${newWinnerId}`);
                         if (newStatus === 'closed' && newWinnerId && prev.winning_bidder_id !== newWinnerId) {
                            supabase.from('users').select('email').eq('id', newWinnerId).single().then(({data, error}) => {
                                if(!error && data) { setWinnerEmail(data.email); }
                                else { setWinnerEmail(null); }
                            });
                         } else if (newStatus !== 'closed') { setWinnerEmail(null); }
                         return { ...prev, status: newStatus, winning_bidder_id: newWinnerId };
                     }
                     return prev;
                 });
            }
        )
        .subscribe(status => console.log(`Listing status channel status for ${id}: ${status}`));

    return () => {
      supabase.removeChannel(bidsChannel);
      supabase.removeChannel(listingChannel);
      console.log(`RT channels unsubscribed for listing ${id}`);
    };
  }, [id]);

  // --- Countdown timer ---
  useEffect(() => {
      if (!listing?.end_time) { setCountdown(null); return; }
      const auctionIsClosed = listing.status === 'closed' || listing.status === 'cancelled';
      if (auctionIsClosed || isPast(listing.end_time)) { setCountdown(null); return; }
      let interval: number | undefined = undefined;
      const updateTimer = () => {
        if (!listing?.end_time) return;
        const remaining = formatCountdown(listing.end_time);
        setCountdown(remaining);
        if (remaining === null && interval) clearInterval(interval);
      };
      updateTimer();
      interval = window.setInterval(updateTimer, 1000);
      return () => { if (interval) clearInterval(interval); };
  }, [listing?.end_time, listing?.status]);

  // --- Bid action ---
  const placeBid = async () => {
    setBidStatusMessage(null);
    if (!user) return router.push('/auth');
    if (!listing) return;
    if (listing.status === 'closed' || listing.status === 'cancelled' || (listing.end_time && isPast(listing.end_time))) {
        setBidStatusMessage('⚠️ Auction has ended.'); return;
    }
    if (user.id === listing.seller_id) { setBidStatusMessage('⚠️ You cannot bid on your own item.'); return; }
    const amt = parseInt(price, 10);
    if (isNaN(amt) || amt <= 0) { setBidStatusMessage('⚠️ Enter a valid positive whole number bid.'); return; }
    const currentTop = bids[0]?.bid_price ?? 0;
    const minRequiredBid = Math.max(listing.min_price, currentTop);
    if (amt <= minRequiredBid) { setBidStatusMessage(`⚠️ Bid must be higher than ${formatCurrency(minRequiredBid)}.`); return; }
    if (listing.upper_cap && amt >= listing.upper_cap) { setBidStatusMessage(`⚠️ Bid cannot meet or exceed the Buy Now price (${formatCurrency(listing.upper_cap)}).`); return; }
    try {
      const { error: insertError } = await supabase.from('bids').insert({ item_id: id, bidder_id: user.id, bid_price: amt });
      if (insertError) throw insertError;
      setPrice(''); setBidStatusMessage('✅ Bid placed successfully!');
      setTimeout(() => setBidStatusMessage(null), 4000);
    } catch(error) {
        console.error("Bid placement failed:", error);
        let userMessage = '❌ Bid failed.';
        if (error instanceof Error) { userMessage = `❌ Bid failed: ${error.message}`; }
        setBidStatusMessage(userMessage);
    }
  };

  // --- Render Guards ---
  if (loading) return <div className="flex justify-center py-20"><LoadingSpinner message="Loading listing details..." /></div>;
  if (error) return <p className="p-6 text-center text-red-600 dark:text-red-400 font-medium">{error}</p>;
  if (!listing) return <p className="p-6 text-center text-gray-700 dark:text-gray-300">Listing details could not be loaded.</p>;

  // --- Derived State for Rendering ---
  const auctionEnded = listing.status === 'closed' || listing.status === 'cancelled';
  const photos = listing.photos ?? [];
  const timeDisplay = auctionEnded
    ? listing.end_time ? `Ended ${formatRelativeTime(listing.end_time)}` : 'Auction Ended'
    : countdown !== null ? `Ends in: ${countdown}` : listing.end_time ? `Ends ${formatRelativeTime(listing.end_time)}` : 'End time not set';
  const highestBid = bids[0] ?? null;

  // --- Slider Settings ---
  const sliderSettings = {
    dots: false, // Dots are removed
    infinite: photos.length > 1,
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1,
    arrows: true, // Arrows are kept
    adaptiveHeight: true,
    // No appendDots or customPaging needed
  };

  // --- JSX ---
  return (
    <main className="listing-detail-page max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8">
      <section className="flex flex-col md:flex-row gap-6 md:gap-8 items-start">
        {/* Image Slider */}
        {photos.length > 0 ? (
            // Container does not need extra padding-bottom now
            <div className="w-full md:w-1/2 flex-shrink-0 slick-container relative">
                 <Slider {...sliderSettings}>
                    {photos.map((photoUrl, index) => (
                        <div key={photoUrl} className="aspect-square relative bg-gray-100 dark:bg-gray-800">
                             <Image
                                src={photoUrl} alt={`Photo ${index + 1} for ${listing.title}`} fill
                                style={{ objectFit: 'contain' }}
                                sizes="(max-width: 768px) 100vw, 50vw"
                                className="rounded-lg"
                                priority={index === 0}
                            />
                        </div>
                     ))}
                </Slider>
            </div>
        ) : ( <div className="w-full md:w-1/2 flex-shrink-0 aspect-square bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center"> <svg className="h-20 w-20 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"> <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /> </svg> </div> )}

        {/* Details Column */}
        <div className={`w-full ${photos.length > 0 ? 'md:w-1/2' : ''} space-y-4`}>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100 break-words">{listing.title}</h1>
            {listing.seller_email && ( <p className="text-sm text-gray-600 dark:text-gray-400"> Sold by:{' '} <span className="font-medium text-gray-800 dark:text-gray-200">{listing.seller_email}</span> </p> )}

            {/* Price Info & Highest Bid Block */}
            <div className="flex flex-col sm:flex-row gap-4 pt-2">
                <div className="flex-1 space-y-2 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-md border border-gray-200 dark:border-gray-700">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Minimum Bid:</p>
                    <p className="text-xl font-bold text-indigo-700 dark:text-indigo-400">{formatCurrency(listing.min_price)}</p>
                    {listing.upper_cap && listing.upper_cap > 0 && ( <div className="pt-1"> <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Buy Now Price:</p> <p className="text-xl font-bold text-purple-700 dark:text-purple-400">{formatCurrency(listing.upper_cap)}</p> </div> )}
                </div>
                <div className="flex-1 space-y-1 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-md border border-gray-200 dark:border-gray-700">
                     <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Current Highest Bid:</h3>
                     {highestBid ? ( <> <p className="text-2xl font-bold text-green-700 dark:text-green-300">{formatCurrency(highestBid.bid_price)}</p> {highestBid.bidder_email && ( <p className="text-xs text-gray-500 dark:text-gray-400 pt-1"> by <span className="font-medium text-gray-700 dark:text-gray-300">{highestBid.bidder_email}</span></p> )} </> ) : ( <p className="text-lg text-gray-500 dark:text-gray-400 pt-2">No bids yet.</p> )}
                </div>
            </div>

            {/* Display Auction Status & Winner */}
            {auctionEnded && listing.status && (
                 <div className={`p-3 rounded-md text-sm font-medium ${ listing.status === 'closed' && listing.winning_bidder_id ? 'bg-green-100 dark:bg-green-800/50 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-700' : listing.status === 'closed' ? 'bg-yellow-100 dark:bg-yellow-800/50 text-yellow-800 dark:text-yellow-200 border border-yellow-200 dark:border-yellow-700' : listing.status === 'cancelled' ? 'bg-red-100 dark:bg-red-800/50 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-700' : '' }`}>
                     <p>Status: {listing.status.charAt(0).toUpperCase() + listing.status.slice(1)}</p>
                     {listing.status === 'closed' && listing.winning_bidder_id && winnerEmail && ( <p>Winner: <span className="font-semibold">{winnerEmail}</span></p> )}
                     {listing.status === 'closed' && !listing.winning_bidder_id && ( <p>This auction ended with no winning bids.</p> )}
                 </div>
            )}

             {/* Time Remaining/Ended */}
             {listing.end_time && !auctionEnded && (
                 <p className={`text-sm font-medium pt-2 text-gray-600 dark:text-gray-300`}>
                     <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 inline-block mr-1 align-text-bottom"> <path fillRule="evenodd" d="M8 1.75a.75.75 0 0 1 .75.75v5.5a.75.75 0 0 1-1.5 0V2.5A.75.75 0 0 1 8 1.75ZM8 14a.75.75 0 0 1 .75.75v.01a.75.75 0 0 1-1.5 0v-.01A.75.75 0 0 1 8 14ZM4.21 3.97a.75.75 0 0 1 1.06 0l.74.745a.75.75 0 1 1-1.06 1.06l-.745-.74a.75.75 0 0 1 0-1.06Zm6.52 0a.75.75 0 0 1 0 1.06l-.74.745a.75.75 0 1 1-1.06-1.06l.74-.74a.75.75 0 0 1 1.06 0ZM1.75 8a.75.75 0 0 1 .75-.75h.01a.75.75 0 0 1 0 1.5H2.5a.75.75 0 0 1-.75-.75Zm11.5 0a.75.75 0 0 1 .75-.75h.01a.75.75 0 0 1 0 1.5h-.01a.75.75 0 0 1-.75-.75ZM4.21 10.97a.75.75 0 0 1 0 1.06l-.745.74a.75.75 0 1 1-1.06-1.06l.74-.74a.75.75 0 0 1 1.06 0Zm6.52 0a.75.75 0 0 1 1.06 0l.74.74a.75.75 0 1 1-1.06 1.06l-.74-.74a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" /> <path d="M8 4.75a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0V5.5a.75.75 0 0 1 .75-.75Z" /> </svg>
                     {timeDisplay}
                 </p>
            )}
        </div>
      </section>

      {/* --- Description --- */}
      <section>
          <h3 className="text-lg font-semibold mb-2 text-gray-800 dark:text-gray-200">Description</h3>
          <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800">
             <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{listing.description || <span className="text-gray-500 italic">No description provided.</span>}</p>
          </div>
      </section>

      {/* --- Rules --- */}
      {listing.rules && (
        <section>
             <h3 className="text-lg font-semibold mb-2 text-gray-800 dark:text-gray-200">Auction Rules</h3>
             <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-800/50">
                <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{listing.rules}</p>
             </div>
        </section>
      )}

      {/* --- Bid Form Section --- */}
      <section>
         {user && user.id !== listing.seller_id && listing.status === 'active' && (!listing.end_time || !isPast(listing.end_time)) && (
             <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 shadow-sm">
                 <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-white">Place Your Bid</h3>
                 <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                     <div className="flex-grow">
                         <label htmlFor="bidAmount" className="sr-only">Bid Amount</label>
                         <div className="relative">
                             <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 dark:text-gray-400 pointer-events-none">₹</span>
                             <input id="bidAmount" type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={`Bid > ${formatCurrency(Math.max(listing.min_price, highestBid?.bid_price ?? 0))}${listing.upper_cap ? ` (Max: ${formatCurrency(listing.upper_cap - 1)})` : ''}`} className="pl-7 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md w-full focus:ring-indigo-500 focus:border-indigo-500 text-sm dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500" step="1" min="1" />
                         </div>
                     </div>
                     <button onClick={placeBid} className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white px-6 py-2 rounded-md font-medium transition whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800">Place Bid</button>
                 </div>
                 {bidStatusMessage && ( <p className={`mt-3 text-sm font-medium ${bidStatusMessage.startsWith('✅') ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{bidStatusMessage}</p> )}
             </div>
         )}
         {user && user.id === listing.seller_id && listing.status === 'active' && (!listing.end_time || !isPast(listing.end_time)) && (
             <div className="p-3 border border-yellow-300 dark:border-yellow-700 rounded-md bg-yellow-50 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 text-center text-sm"> You cannot place bids on your own listing. </div>
         )}
         {!user && listing.status === 'active' && (!listing.end_time || !isPast(listing.end_time)) && (
             <div className="p-3 border border-blue-200 dark:border-blue-700 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 text-center text-sm"> Please{' '} <Link href="/auth" className="font-bold underline hover:text-blue-900 dark:hover:text-blue-200">log in</Link>{' '} to place a bid. </div>
         )}
         {auctionEnded && listing.status && (
            <div className="p-3 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-center text-sm font-medium"> This auction has ended. </div>
         )}
      </section>

      {/* --- Bid History --- */}
      <section className="pt-8 border-t border-gray-200 dark:border-gray-700">
         <h2 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-white"> Bid History ({bids.length}) </h2>
         {bids.length === 0 ? ( <p className="text-gray-600 dark:text-gray-400">No bids have been placed yet.</p> ) : (
             <ul className="space-y-3 max-h-[400px] overflow-y-auto pr-2 -mr-2">
                 {bids.map((bid, index) => (
                     <li key={bid.id} className={`p-3 border rounded-md flex justify-between items-center text-sm ${ index === 0 ? 'bg-green-50 dark:bg-green-900/40 border-green-200 dark:border-green-700' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700' }`}>
                         <div><span className={`font-semibold ${index === 0 ? 'text-green-800 dark:text-green-300' : 'text-indigo-800 dark:text-indigo-400'}`}>{formatCurrency(bid.bid_price)}</span>{bid.bidder_email && ( <span className="text-xs text-gray-500 dark:text-gray-400 ml-2"> by {bid.bidder_email} </span> )}</div>
                         <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 ml-4">{new Date(bid.timestamp).toLocaleString()}</span>
                     </li>
                 ))}
             </ul>
         )}
      </section>

      {/* Global Styles for Slider - FINAL VERSION (No Dots, Centered Arrows) */}
      <style jsx global>{`
        /* Arrow Styling - Positioned Inside */
        .slick-prev, .slick-next {
           position: absolute !important; /* Use important to override potential inline styles */
           top: 50% !important;
           transform: translateY(-50%) !important;
           z-index: 10 !important;
           width: 40px !important;
           height: 40px !important;
           background-color: rgba(0, 0, 0, 0.3) !important;
           border-radius: 50% !important;
           transition: background-color 0.2s, opacity 0.2s !important;
           opacity: 0.7 !important;
           cursor: pointer !important;
           display: flex !important;
           align-items: center !important;
           justify-content: center !important;
           padding: 0 !important;
           border: none !important;
        }
        .slick-prev:hover, .slick-next:hover {
            background-color: rgba(0, 0, 0, 0.5) !important;
            opacity: 1 !important;
        }
        .slick-prev { left: 10px !important; }
        .slick-next { right: 10px !important; }

        /* The actual arrow character/icon */
        .slick-prev::before, .slick-next::before {
            font-family: 'slick' !important; /* Ensure slick font is used */
            font-size: 18px !important;
            color: white !important;
            opacity: 1 !important;
            line-height: normal !important; /* Reset line-height */
            display: block !important; /* Ensure it's treated as block */
        }

        /* Hide Dots */
        .slick-dots {
            display: none !important;
        }

        /* Responsive Arrow Adjustments */
        @media (max-width: 640px) {
             .slick-prev { left: 5px !important; }
             .slick-next { right: 5px !important; }
             .slick-prev, .slick-next { width: 32px !important; height: 32px !important; }
             .slick-prev:before, .slick-next:before { font-size: 14px !important; }
        }
      `}</style>
    </main>
  );
}