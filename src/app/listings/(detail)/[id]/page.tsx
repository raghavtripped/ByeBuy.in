// src/app/listings/(detail)/[id]/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import Slider from "react-slick";

import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";

import { supabase, type User } from '@/lib/supabaseClient';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import {
  formatRelativeTime,
  isPast,
  formatCountdown,
} from '@/lib/timeUtils';
import { formatCurrency } from '@/lib/formatUtils';
import LoadingSpinner from '@/components/LoadingSpinner';

// --- Type Definitions ---
type Listing = {
  id: string;
  title: string;
  description: string;
  min_price: number;
  photos: string[] | null; // This should be string[] after parsing JSON from DB
  end_time?: string | null;
  upper_cap?: number | null;
  rules?: string | null;
  seller_email?: string | null;
  seller_id?: string;
  status: 'active' | 'closed' | 'cancelled' | string;
  winning_bidder_id?: string | null;
  winning_bid_id?: string | null; // <<< FIX 1: Added winning_bid_id
  final_sale_price?: number | null;
};

type Bid = {
  id: string;
  bid_price: number;
  bidder_id: string;
  timestamp: string;
  bidder_email?: string | null;
};

type ListingTablePayload = Partial<{
  id: string;
  title: string;
  description: string;
  min_price: number;
  photos: string[] | null; // Assuming this is how it comes, or string for JSON
  end_time: string | null;
  upper_cap: number | null;
  rules: string | null;
  seller_id: string;
  status: 'active' | 'closed' | 'cancelled' | string;
  winning_bid_id: string | null;
  winning_bidder_id: string | null;
  created_at: string;
  tags: string[] | null;
  final_sale_price?: number | null;
}> & { id: string };

type BidTablePayload = Partial<{
    id: string;
    item_id: string;
    bidder_id: string;
    bid_price: number;
    timestamp: string;
}> & { id?: string };


// --- Component ---
export default function ListingDetails() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [listing, setListing] = useState<Listing | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [price, setPrice] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bidStatusMessage, setBidStatusMessage] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<string | null>(null);
  const [winnerEmail, setWinnerEmail] = useState<string | null>(null);

  const parseListingPhotos = (photosData: unknown): string[] | null => {
    if (typeof photosData === 'string') {
      try {
        const parsed = JSON.parse(photosData);
        return Array.isArray(parsed) ? parsed.filter(p => typeof p === 'string') : null;
      } catch (e) {
        console.error("Failed to parse photos JSON string:", e);
        return null;
      }
    }
    return Array.isArray(photosData) ? photosData.filter(p => typeof p === 'string') : null;
  };


  const loadData = useCallback(async () => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!id || !uuidRegex.test(id)) {
      setError('Invalid listing ID format.'); setLoading(false); return;
    }

    setLoading(true); setError(null); setListing(null); setBids([]); setPrice(''); setWinnerEmail(null);

    try {
      let fetchedListingData: Partial<Listing> & { id: string, status: Listing['status'] } | null = null; // Use Partial for intermediate steps

      const { data: archivedData, error: archivedError } = await supabase
        .from('archived_listings_details')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (archivedError) {
          console.warn("Could not fetch from archived_listings_details, trying listings_with_seller_email. Error:", archivedError?.message);
      }

      if (archivedData) {
          fetchedListingData = {
              ...archivedData,
              photos: parseListingPhotos(archivedData.photos),
              status: archivedData.status as Listing['status'],
              final_sale_price: archivedData.final_sale_price,
          };
          if (archivedData.winner_email) {
              setWinnerEmail(archivedData.winner_email);
          }
      } else {
          const { data: lData, error: lError } = await supabase
              .from('listings_with_seller_email')
              .select('id, title, description, min_price, photos, end_time, upper_cap, rules, seller_email, seller_id, status, winning_bidder_id, winning_bid_id')
              .eq('id', id)
              .maybeSingle();

          if (lError) throw lError;
          if (!lData) {
              setError('Listing not found.'); setLoading(false); return;
          }

          fetchedListingData = {
              ...lData,
              photos: parseListingPhotos(lData.photos),
              status: lData.status as Listing['status'],
          };

          // <<< FIX 1 applied: Check winning_bid_id on fetchedListingData (which is now correctly typed with it)
          if (fetchedListingData.status === 'closed' && fetchedListingData.winning_bidder_id) {
              if (fetchedListingData.winning_bid_id) { // Now this property exists on fetchedListingData
                  const {data: winningBidData, error: winningBidError} = await supabase
                      .from('bids')
                      .select('bid_price')
                      .eq('id', fetchedListingData.winning_bid_id)
                      .single();
                  if (winningBidError) console.error("Error fetching winning bid price:", winningBidError.message)
                  else if (winningBidData) fetchedListingData.final_sale_price = winningBidData.bid_price;
              }
              const { data: winnerData, error: winnerError } = await supabase
                  .from('users')
                  .select('email')
                  .eq('id', fetchedListingData.winning_bidder_id)
                  .single();
              if (winnerError) console.error("Error fetching winner email:", winnerError.message);
              else if (winnerData) setWinnerEmail(winnerData.email);
          }
      }

      if (!fetchedListingData) {
        setError('Listing not found.'); setLoading(false); return;
      }
      setListing(fetchedListingData as Listing); // Cast to full Listing type

      const { data: bData, error: bError } = await supabase
        .from('bids_with_bidder_email')
        .select('*').eq('item_id', id).order('timestamp', { ascending: false });
      if (bError) throw bError;
      setBids(bData ?? []);

    } catch (err) {
      console.error("Data loading error:", err);
      setError(`Error loading details: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    loadData();

    const bidsChannel = supabase.channel(`listing-bids-${id}`);
    bidsChannel
      .on<BidTablePayload>(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bids', filter: `item_id=eq.${id}` },
        async (payload) => {
          if (payload.new && 'id' in payload.new && payload.new.id) {
            const { data: newBid, error } = await supabase
              .from('bids_with_bidder_email')
              .select('*').eq('id', payload.new.id).single();
            if (!error && newBid) {
              setBids((currentBids) => [newBid as Bid, ...currentBids.filter((b) => b.id !== newBid.id)]);
            } else if (error) { console.error("Error fetching new bid details:", error); }
          }
        }
      )
      .subscribe(status => console.log(`Bids channel status for ${id}: ${status}`));

    const listingChannel = supabase.channel(`listing-details-status-${id}`);
    listingChannel
        .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'listings', filter: `id=eq.${id}` },
            (payload: RealtimePostgresChangesPayload<ListingTablePayload>) => {
                const updatedListingData = payload.new && 'id' in payload.new ? payload.new : null;
                if (!updatedListingData) return;

                 setListing(prev => {
                     if (!prev) return null;
                     const newPartialListing: Partial<Listing> = {};
                     let needsFullReload = false;

                     if (updatedListingData.status && prev.status !== updatedListingData.status) {
                         newPartialListing.status = updatedListingData.status;
                         if (updatedListingData.status === 'closed' || updatedListingData.status === 'cancelled') {
                             needsFullReload = true;
                         }
                     }
                     if (updatedListingData.winning_bidder_id !== undefined && prev.winning_bidder_id !== updatedListingData.winning_bidder_id) {
                         newPartialListing.winning_bidder_id = updatedListingData.winning_bidder_id;
                         needsFullReload = true;
                     }
                     if (updatedListingData.winning_bid_id !== undefined && prev.winning_bid_id !== updatedListingData.winning_bid_id) {
                        newPartialListing.winning_bid_id = updatedListingData.winning_bid_id;
                        // If winning_bid_id changes, final_sale_price likely changes too, so reload
                        needsFullReload = true;
                     }
                     if (updatedListingData.photos && JSON.stringify(prev.photos) !== JSON.stringify(updatedListingData.photos)) {
                        newPartialListing.photos = updatedListingData.photos; // Assume photos in payload is already string[]
                     }
                     // Add other fields to update in real-time if necessary
                     // e.g. title, description, min_price, upper_cap, rules
                     if (updatedListingData.title && prev.title !== updatedListingData.title) newPartialListing.title = updatedListingData.title;
                     // ... and so on for other directly updatable fields

                     if (needsFullReload) {
                         console.log("Significant listing update detected, reloading data for listing:", id);
                         loadData();
                         return prev;
                     }

                     if (Object.keys(newPartialListing).length > 0) {
                        return { ...prev, ...newPartialListing };
                     }
                     return prev;
                 });
            }
        )
        .subscribe(status => console.log(`Listing status channel status for ${id}: ${status}`));

    return () => {
      supabase.removeChannel(bidsChannel);
      supabase.removeChannel(listingChannel);
    };
  }, [id, loadData]);

  // --- Derived State for Rendering ---
  // <<< FIX 3 & 4: Moved auctionEnded declaration here, before useEffect for countdown
  const auctionEnded = !!(listing && (listing.status === 'closed' || listing.status === 'cancelled'));
  const photos = listing?.photos ?? []; // photos is already string[] | null from parseListingPhotos

  // --- Countdown timer ---
  useEffect(() => {
      if (!listing?.end_time) { setCountdown(null); return; }
      // Now auctionEnded is defined and can be used
      if (auctionEnded || isPast(listing.end_time)) { setCountdown(null); return; }

      let interval: number | undefined = undefined;
      const updateTimer = () => {
        if (!listing?.end_time || auctionEnded) { // Add auctionEnded check here too
            if(interval) clearInterval(interval);
            setCountdown(null);
            return;
        }
        const remaining = formatCountdown(listing.end_time);
        setCountdown(remaining);
        if (remaining === null && interval) clearInterval(interval);
      };
      updateTimer();
      interval = window.setInterval(updateTimer, 1000);
      return () => { if (interval) clearInterval(interval); };
  }, [listing?.end_time, listing?.status, auctionEnded]);


  const placeBid = async () => {
    setBidStatusMessage(null);
    if (!user) return router.push('/auth');
    if (!listing) return;
    // Use the derived auctionEnded constant
    if (auctionEnded || (listing.end_time && isPast(listing.end_time))) {
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

  if (loading) return <div className="flex justify-center py-20"><LoadingSpinner message="Loading listing details..." /></div>;
  if (error) return <p className="p-6 text-center text-red-600 dark:text-red-400 font-medium">{error}</p>;
  if (!listing) return <p className="p-6 text-center text-gray-700 dark:text-gray-300">Listing details could not be loaded.</p>;

  // Moved photos declaration above timeDisplay because it might be used in other derived states if any
  const timeDisplay = auctionEnded
    ? listing.end_time ? `Ended ${formatRelativeTime(listing.end_time)}` : 'Auction Ended'
    : countdown !== null ? `Ends in: ${countdown}` : listing.end_time ? `Ends ${formatRelativeTime(listing.end_time)}` : 'End time not set';
  const highestBid = bids[0] ?? null;

  const sliderSettings = {
    dots: false,
    infinite: photos.length > 1,
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1,
    arrows: true,
    adaptiveHeight: true,
  };

  return (
    <main className="listing-detail-page max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8">
      <section className="flex flex-col md:flex-row gap-6 md:gap-8 items-start">
        {photos.length > 0 ? (
            <div className="w-full md:w-1/2 flex-shrink-0 slick-container relative">
                 <Slider {...sliderSettings}>
                    {/* <<< FIX 5 & 6: Added types for photoUrl and index */}
                    {photos.map((photoUrl: string, index: number) => (
                        <div key={photoUrl || `photo-${index}`} className="aspect-square relative bg-gray-100 dark:bg-gray-800">
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

        <div className={`w-full ${photos.length > 0 ? 'md:w-1/2' : ''} space-y-4`}>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100 break-words">{listing.title}</h1>
            {listing.seller_email && ( <p className="text-sm text-gray-600 dark:text-gray-400"> Sold by:{' '} <span className="font-medium text-gray-800 dark:text-gray-200">{listing.seller_email}</span> </p> )}

            {listing.status === 'active' && (
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
            )}

            {listing.status === 'closed' && (
                 <div className={`p-4 rounded-md my-3 border ${listing.winning_bidder_id ? 'bg-green-50 dark:bg-green-900/30 border-green-300 dark:border-green-700' : 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700'}`}>
                     <h3 className={`text-lg font-semibold text-center mb-2 ${listing.winning_bidder_id ? 'text-green-700 dark:text-green-300' : 'text-blue-700 dark:text-blue-300'}`}>
                         Auction Ended
                     </h3>
                     {listing.winning_bidder_id && listing.final_sale_price ? (
                         <>
                             <p className="text-md text-center">
                                 Sold for: <span className="font-bold">{formatCurrency(listing.final_sale_price)}</span>
                             </p>
                             {winnerEmail && (
                                 <p className="text-sm text-center text-gray-600 dark:text-gray-400">
                                     Winner: <span className="font-medium">{winnerEmail}</span>
                                 </p>
                             )}
                         </>
                     ) : (
                         <p className="text-md text-center text-gray-700 dark:text-gray-300">This auction closed with no winning bids.</p>
                     )}
                 </div>
            )}

            {listing.status === 'cancelled' && (
                 <div className="p-4 rounded-md my-3 border bg-yellow-50 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700">
                     <h3 className="text-lg font-semibold text-center text-yellow-700 dark:text-yellow-300">
                         Auction Cancelled
                     </h3>
                 </div>
            )}

             {listing.end_time && (
                 <p className={`text-sm font-medium pt-2 ${auctionEnded ? 'text-gray-500 dark:text-gray-400' : 'text-gray-600 dark:text-gray-300'}`}>
                     {/* SVG Code - Assuming this is where line 445 was. If error persists, inspect this SVG closely or simplify/componentize it */}
                     <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 inline-block mr-1 align-text-bottom">
                        <path fillRule="evenodd" d="M8 1.75a.75.75 0 0 1 .75.75v5.5a.75.75 0 0 1-1.5 0V2.5A.75.75 0 0 1 8 1.75ZM8 14a.75.75 0 0 1 .75.75v.01a.75.75 0 0 1-1.5 0v-.01A.75.75 0 0 1 8 14ZM4.21 3.97a.75.75 0 0 1 1.06 0l.74.745a.75.75 0 1 1-1.06 1.06l-.745-.74a.75.75 0 0 1 0-1.06Zm6.52 0a.75.75 0 0 1 0 1.06l-.74.745a.75.75 0 1 1-1.06-1.06l.74-.74a.75.75 0 0 1 1.06 0ZM1.75 8a.75.75 0 0 1 .75-.75h.01a.75.75 0 0 1 0 1.5H2.5a.75.75 0 0 1-.75-.75Zm11.5 0a.75.75 0 0 1 .75-.75h.01a.75.75 0 0 1 0 1.5h-.01a.75.75 0 0 1-.75-.75ZM4.21 10.97a.75.75 0 0 1 0 1.06l-.745.74a.75.75 0 1 1-1.06-1.06l.74-.74a.75.75 0 0 1 1.06 0Zm6.52 0a.75.75 0 0 1 1.06 0l.74.74a.75.75 0 1 1-1.06 1.06l-.74-.74a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                        <path d="M8 4.75a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0V5.5a.75.75 0 0 1 .75-.75Z" />
                     </svg>
                     {timeDisplay}
                 </p>
            )}
        </div>
      </section>

      <section>
          <h3 className="text-lg font-semibold mb-2 text-gray-800 dark:text-gray-200">Description</h3>
          <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800">
             <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{listing.description || <span className="text-gray-500 italic">No description provided.</span>}</p>
          </div>
      </section>

      {listing.rules && (
        <section>
             <h3 className="text-lg font-semibold mb-2 text-gray-800 dark:text-gray-200">Auction Rules</h3>
             <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-800/50">
                <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{listing.rules}</p>
             </div>
        </section>
      )}

      {!auctionEnded && user && user.id !== listing.seller_id && (
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
      {!auctionEnded && user && user.id === listing.seller_id && (
             <div className="p-3 border border-yellow-300 dark:border-yellow-700 rounded-md bg-yellow-50 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 text-center text-sm"> You cannot place bids on your own listing. </div>
         )}
      {!auctionEnded && !user && (
             <div className="p-3 border border-blue-200 dark:border-blue-700 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 text-center text-sm"> Please{' '} <Link href="/auth" className="font-bold underline hover:text-blue-900 dark:hover:text-blue-200">log in</Link>{' '} to place a bid. </div>
         )}

      <section className="pt-8 border-t border-gray-200 dark:border-gray-700">
         <h2 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-white"> Bid History ({bids.length}) </h2>
         {bids.length === 0 ? ( <p className="text-gray-600 dark:text-gray-400">No bids have been placed yet.</p> ) : (
             <ul className="space-y-3 max-h-[400px] overflow-y-auto pr-2 -mr-2">
                 {bids.map((bid: Bid, index: number) => ( // Added type for bid here too
                     <li key={bid.id} className={`p-3 border rounded-md flex justify-between items-center text-sm ${ index === 0 ? 'bg-green-50 dark:bg-green-900/40 border-green-200 dark:border-green-700' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700' }`}>
                         <div><span className={`font-semibold ${index === 0 ? 'text-green-800 dark:text-green-300' : 'text-indigo-800 dark:text-indigo-400'}`}>{formatCurrency(bid.bid_price)}</span>{bid.bidder_email && ( <span className="text-xs text-gray-500 dark:text-gray-400 ml-2"> by {bid.bidder_email} </span> )}</div>
                         <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 ml-4">{new Date(bid.timestamp).toLocaleString()}</span>
                     </li>
                 ))}
             </ul>
         )}
      </section>

      <style jsx global>{`
        .slick-prev, .slick-next {
           position: absolute !important;
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

        .slick-prev::before, .slick-next::before {
            font-family: 'slick' !important;
            font-size: 18px !important;
            color: white !important;
            opacity: 1 !important;
            line-height: normal !important;
            display: block !important;
        }
        .slick-dots { display: none !important; }
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