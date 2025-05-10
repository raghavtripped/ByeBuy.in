// src/app/listings/(detail)/[id]/page.tsx
'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import Slider from "react-slick";

// Import slick carousel CSS
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
  photos: string[] | null;
  end_time?: string | null;
  upper_cap?: number | null;
  rules?: string | null;
  seller_email?: string | null;
  seller_id?: string;
  status: 'active' | 'closed' | 'cancelled' | string;
  winning_bidder_id?: string | null;
  winning_bid_id?: string | null;
  final_sale_price?: number | null;
};

type Bid = {
  id: string;
  bid_price: number;
  bidder_id: string;
  timestamp: string;
  bidder_email?: string | null;
};

type ListingTablePayload = Partial<Omit<Listing, 'photos' | 'tags'> & { photos: string | string[] | null, tags: string | string[] | null }> & { id: string };
type BidTablePayload = Partial<Bid> & { item_id?: string; id?: string };

// --- Helper Icons ---
const CheckCircleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 inline-block mr-1.5 align-text-bottom text-green-600 dark:text-green-500">
    <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.06 0l4.071-5.66Z" clipRule="evenodd" />
  </svg>
);

const ClockIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 inline-block mr-1 align-text-bottom">
        <path fillRule="evenodd" d="M8 1.75a.75.75 0 0 1 .75.75v5.5a.75.75 0 0 1-1.5 0V2.5A.75.75 0 0 1 8 1.75ZM8 14a.75.75 0 0 1 .75.75v.01a.75.75 0 0 1-1.5 0v-.01A.75.75 0 0 1 8 14ZM4.21 3.97a.75.75 0 0 1 1.06 0l.74.745a.75.75 0 1 1-1.06 1.06l-.745-.74a.75.75 0 0 1 0-1.06Zm6.52 0a.75.75 0 0 1 0 1.06l-.74.745a.75.75 0 1 1-1.06-1.06l.74-.74a.75.75 0 0 1 1.06 0ZM1.75 8a.75.75 0 0 1 .75-.75h.01a.75.75 0 0 1 0 1.5H2.5a.75.75 0 0 1-.75-.75Zm11.5 0a.75.75 0 0 1 .75-.75h.01a.75.75 0 0 1 0 1.5h-.01a.75.75 0 0 1-.75-.75ZM4.21 10.97a.75.75 0 0 1 0 1.06l-.745.74a.75.75 0 1 1-1.06-1.06l.74-.74a.75.75 0 0 1 1.06 0Zm6.52 0a.75.75 0 0 1 1.06 0l.74.74a.75.75 0 1 1-1.06 1.06l-.74-.74a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
        <path d="M8 4.75a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0V5.5a.75.75 0 0 1 .75-.75Z" />
    </svg>
);

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
      } catch (e) { console.error("Failed to parse photos JSON string:", e); return null; }
    }
    return Array.isArray(photosData) ? photosData.filter(p => typeof p === 'string') : null;
  };

  const loadData = useCallback(async () => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!id || !uuidRegex.test(id)) {
      setError('Invalid listing ID format.'); setLoading(false); return;
    }
    setLoading(true); setError(null); setBids([]); setPrice(''); setWinnerEmail(null);

    try {
      let fetchedListingData: Partial<Listing> & { id: string, status: Listing['status'] } | null = null;
      const { data: archivedData, error: archivedError } = await supabase
        .from('archived_listings_details').select('*').eq('id', id).maybeSingle();

      if (archivedError) { console.warn("Could not fetch from archived_listings_details. Error:", archivedError?.message); }

      if (archivedData) {
          fetchedListingData = {
              ...archivedData, photos: parseListingPhotos(archivedData.photos),
              status: archivedData.status as Listing['status'], final_sale_price: archivedData.final_sale_price,
          };
          if (archivedData.winner_email) setWinnerEmail(archivedData.winner_email);
      } else {
          const { data: lData, error: lError } = await supabase
              .from('listings_with_seller_email')
              .select('id, title, description, min_price, photos, end_time, upper_cap, rules, seller_email, seller_id, status, winning_bidder_id, winning_bid_id')
              .eq('id', id).maybeSingle();
          if (lError) throw lError;
          if (!lData) { setError('Listing not found.'); setLoading(false); return; }
          fetchedListingData = { ...lData, photos: parseListingPhotos(lData.photos), status: lData.status as Listing['status'] };
          if (fetchedListingData.status === 'closed' && fetchedListingData.winning_bidder_id) {
              if (fetchedListingData.winning_bid_id) {
                  const {data: WBidData} = await supabase.from('bids').select('bid_price').eq('id', fetchedListingData.winning_bid_id).single();
                  if (WBidData) fetchedListingData.final_sale_price = WBidData.bid_price;
              }
              const {data: WUserData} = await supabase.from('users').select('email').eq('id', fetchedListingData.winning_bidder_id).single();
              if (WUserData) setWinnerEmail(WUserData.email);
          }
      }
      if (!fetchedListingData) { setError('Listing not found after all attempts.'); setLoading(false); return; }
      setListing(fetchedListingData as Listing);

      const { data: bData, error: bError } = await supabase.from('bids_with_bidder_email').select('*').eq('item_id', id).order('timestamp', { ascending: false });
      if (bError) throw bError;
      setBids(bData ?? []);
    } catch (err) {
      console.error("Data loading error:", err);
      setError(`Error loading details: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    loadData();
    const bidsChannel = supabase.channel(`listing-bids-${id}`);
    bidsChannel.on<BidTablePayload>(
        'postgres_changes', { event: 'INSERT', schema: 'public', table: 'bids', filter: `item_id=eq.${id}` },
        async (payload) => {
          if (payload.new?.id) {
            const { data: newBid } = await supabase.from('bids_with_bidder_email').select('*').eq('id', payload.new.id).single();
            if (newBid) setBids((cb) => [newBid as Bid, ...cb.filter((b) => b.id !== newBid.id)]);
          }
        }
      ).subscribe();
    const listingChannel = supabase.channel(`listing-details-status-${id}`);
    listingChannel.on<ListingTablePayload>(
        'postgres_changes', { event: 'UPDATE', schema: 'public', table: 'listings', filter: `id=eq.${id}` },
        (payload) => {
          const updated = payload.new; if (!updated) return;
          setListing(prev => {
            if (!prev) return null;
            let needsFullReload = false;
            if ((updated.status && prev.status !== updated.status) ||
                (updated.winning_bidder_id !== undefined && prev.winning_bidder_id !== updated.winning_bidder_id) ||
                (updated.winning_bid_id !== undefined && prev.winning_bid_id !== updated.winning_bid_id)) {
                needsFullReload = true;
            }
            if (needsFullReload) { loadData(); return prev; }
            const newPartial: Partial<Listing> = {};
            if (updated.title !== undefined && prev.title !== updated.title) newPartial.title = updated.title;
            if (updated.description !== undefined && prev.description !== updated.description) newPartial.description = updated.description;
            if (updated.min_price !== undefined && prev.min_price !== updated.min_price) newPartial.min_price = updated.min_price;
            if (updated.upper_cap !== undefined && prev.upper_cap !== updated.upper_cap) newPartial.upper_cap = updated.upper_cap;
            if (updated.rules !== undefined && prev.rules !== updated.rules) newPartial.rules = updated.rules;
            if (updated.photos !== undefined) newPartial.photos = parseListingPhotos(updated.photos); // Ensure photos are parsed
            return Object.keys(newPartial).length > 0 ? { ...prev, ...newPartial } : prev;
          });
        }
      ).subscribe();
    return () => { supabase.removeChannel(bidsChannel); supabase.removeChannel(listingChannel); };
  }, [id, loadData]);

  const auctionEnded = !!(listing && (listing.status === 'closed' || listing.status === 'cancelled'));
  const photos = listing?.photos ?? [];
  const currentHighestBidVal = useMemo(() => bids[0]?.bid_price ?? 0, [bids]);

  const { sliderMin, sliderMax, sliderStep, displaySlider } = useMemo(() => {
    if (!listing || auctionEnded) return { sliderMin: 1, sliderMax: 100, sliderStep: 1, displaySlider: false };
    const nextValidBid = Math.max(listing.min_price, currentHighestBidVal + 1);
    if (listing.upper_cap && nextValidBid >= listing.upper_cap) return { sliderMin: nextValidBid, sliderMax: nextValidBid, sliderStep: 1, displaySlider: false };
    let sMin = nextValidBid; let sMax: number;
    if (listing.upper_cap && listing.upper_cap > sMin) { sMax = listing.upper_cap - 1; }
    else {
      const base = currentHighestBidVal || listing.min_price;
      const jump3 = base + Math.max(500, Math.ceil(base * 0.30 / 50) * 50);
      sMax = Math.max(sMin + 500, jump3); sMax = Math.min(sMax, 200000);
    }
    if (sMax <= sMin) sMax = sMin + Math.max(100, Math.ceil(sMin * 0.1));
    if (listing.upper_cap && sMax >= listing.upper_cap) sMax = listing.upper_cap - 1;
    if (sMax <= sMin) return { sliderMin: sMin, sliderMax: sMin, sliderStep: 1, displaySlider: false };
    let sStep = 1; const range = sMax - sMin;
    if (range <= 100) sStep = 1; else if (range <= 500) sStep = 5; else if (range <= 2000) sStep = 10;
    else if (range <= 10000) sStep = 50; else if (range <= 50000) sStep = 100; else sStep = 250;
    return { sliderMin: Math.max(1, sMin), sliderMax: Math.max(sMin + sStep, sMax), sliderStep: sStep, displaySlider: true };
  }, [listing, auctionEnded, currentHighestBidVal]);

  useEffect(() => {
      if (!listing?.end_time || auctionEnded || isPast(listing.end_time)) { setCountdown(null); return; }
      let i:number|undefined; const u=()=>{if(!listing?.end_time||auctionEnded){if(i)clearInterval(i);setCountdown(null);return}const r=formatCountdown(listing.end_time);setCountdown(r);if(r===null&&i)clearInterval(i)}; u(); i=window.setInterval(u,1000);
      return () => { if (i) clearInterval(i); };
  }, [listing?.end_time, listing?.status, auctionEnded]);

  const placeBid = async () => {
    setBidStatusMessage(null);
    if (!user) { router.push('/auth'); return; }
    if (!listing) return;
    if (auctionEnded || (listing.end_time && isPast(listing.end_time))) { setBidStatusMessage('⚠️ Auction has ended.'); loadData(); return; }
    if (user.id === listing.seller_id) { setBidStatusMessage('⚠️ You cannot bid on your own item.'); return; }
    const amt = parseInt(price, 10);
    if (isNaN(amt) || amt <= 0) { setBidStatusMessage('⚠️ Enter a valid positive whole number bid.'); return; }
    if (listing.upper_cap && amt >= listing.upper_cap) { setBidStatusMessage(`⚠️ Bid cannot meet or exceed the Buy Now price of ${formatCurrency(listing.upper_cap)}.`); return; }
    const minRequired = Math.max(listing.min_price, currentHighestBidVal + 1);
    if (amt < minRequired) { setBidStatusMessage(`⚠️ Bid must be at least ${formatCurrency(minRequired)}.`); return; }
    try {
      const { error: e } = await supabase.from('bids').insert({ item_id: id, bidder_id: user.id, bid_price: amt });
      if (e) throw e;
      setPrice(''); setBidStatusMessage('✅ Bid placed successfully!'); setTimeout(() => setBidStatusMessage(null), 4000);
    } catch (err: any) { console.error("Bid failed:", err); setBidStatusMessage(`❌ Bid failed: ${err.message?.substring(0,100) || 'Unknown error'}`); }
  };

  if (loading && !listing) return <div className="flex justify-center py-20"><LoadingSpinner message="Loading listing details..." /></div>;
  if (error) return <p className="p-6 text-center text-red-600 dark:text-red-400 font-medium">{error}</p>;
  if (!listing) return <p className="p-6 text-center text-gray-700 dark:text-gray-300">Listing details could not be loaded.</p>;

  const timeDisplay = auctionEnded ? (listing.end_time ? `Ended ${formatRelativeTime(listing.end_time)}` : 'Auction Ended')
    : countdown !== null ? `Ends in: ${countdown}` : (listing.end_time ? `Ends ${formatRelativeTime(listing.end_time)}` : 'No end time set');
  const sliderSettings = { dots: false, infinite: photos.length > 1, speed: 500, slidesToShow: 1, slidesToScroll: 1, arrows: true, adaptiveHeight: true };
  const typedPriceNum = parseInt(price);
  const showExceedsSliderNote = displaySlider && !isNaN(typedPriceNum) && typedPriceNum > sliderMax && typedPriceNum >= sliderMin && (listing.upper_cap ? typedPriceNum < listing.upper_cap : true);

  return (
    <main className="listing-detail-page max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8">
      {/* Section 1: Image and Core Details */}
      <section className="flex flex-col md:flex-row gap-6 md:gap-8 items-start">
        <div className="w-full md:w-1/2 flex-shrink-0 slick-container relative">
            {photos.length > 0 ? (
                 <Slider {...sliderSettings}>
                    {photos.map((photoUrl: string, index: number) => (
                        <div key={photoUrl || `photo-${index}`} className="aspect-square relative bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden">
                             <Image src={photoUrl} alt={`Photo ${index + 1} for ${listing.title}`} fill style={{ objectFit: 'contain' }} sizes="(max-width: 768px) 100vw, 50vw" priority={index === 0} />
                        </div>
                     ))}
                </Slider>
            ) : ( <div className="w-full md:w-1/2 flex-shrink-0 aspect-square bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center"> <svg className="h-20 w-20 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"> <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /> </svg> </div> )}
        </div>

        <div className={`w-full ${photos.length > 0 ? 'md:w-1/2' : ''} space-y-4`}>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100 break-words">{listing.title}</h1>
            {listing.seller_id && listing.seller_email ? (
                <p className="text-sm text-gray-600 dark:text-gray-400">Sold by: {' '}
                    <Link href={`/user/${listing.seller_id}`} className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300 hover:underline">
                        {listing.seller_email}
                    </Link>
                </p>
            ) : listing.seller_email ? (
                <p className="text-sm text-gray-600 dark:text-gray-400"> Sold by: <span className="font-medium text-gray-800 dark:text-gray-200">{listing.seller_email}</span></p>
            ): null}

            {listing.status === 'active' && (
                <div className="flex flex-col sm:flex-row gap-4 pt-2">
                    <div className="flex-1 space-y-2 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-md border border-gray-200 dark:border-gray-700">
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Minimum Bid:</p>
                        <p className="text-xl font-bold text-indigo-700 dark:text-indigo-400">{formatCurrency(listing.min_price)}</p>
                        {listing.upper_cap && listing.upper_cap > 0 && (
                            <div className="pt-1 mt-1 border-t border-gray-200 dark:border-gray-700/60">
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-1">Buy Now Price:</p>
                                <p className="text-xl font-bold text-purple-700 dark:text-purple-400">{formatCurrency(listing.upper_cap)}</p>
                            </div>
                        )}
                    </div>
                    <div className="flex-1 space-y-1 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-md border border-gray-200 dark:border-gray-700">
                         <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Current Highest Bid:</h3>
                         {currentHighestBidVal > 0 && bids.length > 0 ? (
                            <>
                                <p className="text-2xl font-bold text-green-700 dark:text-green-300">{formatCurrency(currentHighestBidVal)}</p>
                                {bids[0]?.bidder_email && (
                                    <p className="text-xs text-gray-500 dark:text-gray-400 pt-1 min-w-0">by <span className="font-medium text-gray-700 dark:text-gray-300 truncate inline-block max-w-full">{bids[0].bidder_email}</span></p>
                                )}
                            </>
                         ) : ( <p className="text-lg text-gray-500 dark:text-gray-400 pt-2">No bids yet.</p> )}
                    </div>
                </div>
            )}

            {listing.status === 'closed' && (
                 <div className={`p-4 rounded-md my-3 border ${listing.winning_bidder_id ? 'bg-green-50 dark:bg-green-900/30 border-green-300 dark:border-green-700' : 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700'}`}>
                     <h3 className={`text-lg font-semibold text-center mb-2 ${listing.winning_bidder_id ? 'text-green-700 dark:text-green-300' : 'text-blue-700 dark:text-blue-300'}`}>Auction Ended</h3>
                     {listing.winning_bidder_id && listing.final_sale_price ? (
                         <><p className="text-md text-center">Sold for: <span className="font-bold">{formatCurrency(listing.final_sale_price)}</span></p>
                         {winnerEmail && (<p className="text-sm text-center text-gray-600 dark:text-gray-400">Winner: <span className="font-medium">{winnerEmail}</span></p>)}</>
                     ) : (<p className="text-md text-center text-gray-700 dark:text-gray-300">This auction closed with no winning bids.</p>)}
                 </div>
            )}
            {listing.status === 'cancelled' && (
                 <div className="p-4 rounded-md my-3 border bg-yellow-50 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700">
                     <h3 className="text-lg font-semibold text-center text-yellow-700 dark:text-yellow-300">Auction Cancelled</h3>
                 </div>
            )}

            {listing.end_time && (<p className={`text-sm font-medium pt-2 text-center ${auctionEnded ? 'text-gray-500 dark:text-gray-400' : 'text-gray-600 dark:text-gray-300'}`}><ClockIcon /> {timeDisplay}</p>)}
        </div>
      </section>

      {/* Section 2: "Place Your Bid" Card - Relocated and Corrected Styling */}
      {!auctionEnded && (
        <section className="my-8 py-6 bg-gray-100 dark:bg-gray-800/40 rounded-xl shadow-inner">
            <div className="max-w-lg mx-auto bg-white dark:bg-gray-800 shadow-xl rounded-lg p-6 sm:p-8">
                {user && user.id !== listing.seller_id ? (
                    <>
                        <h3 className="text-xl font-semibold mb-4 text-center text-gray-800 dark:text-white">Place Your Bid</h3>
                        
                        {/* NEW: Dynamic Preview Text for Slider Range */}
                        {displaySlider && (
                            <p className="text-xs text-center text-gray-500 dark:text-gray-400 mb-3">
                                Suggested bid range: {formatCurrency(sliderMin)} - {formatCurrency(sliderMax)}
                            </p>
                        )}

                        {displaySlider && (
                            <div className="mb-5"> {/* Adjusted margin from mb-6 to mb-5 */}
                                <label htmlFor="bidSlider" className="sr-only">Bid Amount Slider</label>
                                <input id="bidSlider" type="range" min={sliderMin} max={sliderMax} step={sliderStep} value={price || sliderMin}
                                    onChange={(e) => { setPrice(e.target.value); setBidStatusMessage(null); }}
                                    className="w-full h-2.5 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-indigo-600 dark:accent-indigo-500" />
                                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1.5 px-1">
                                    <span>{formatCurrency(sliderMin)}</span>
                                    <span>{formatCurrency(sliderMax)}</span>
                                </div>
                            </div>
                        )}
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                            <div className="flex-grow relative">
                                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 dark:text-gray-400 pointer-events-none">₹</span>
                                <input id="bidAmount" type="number" value={price}
                                    onChange={(e) => { setPrice(e.target.value); setBidStatusMessage(null); }}
                                    placeholder={`Min. ${formatCurrency(sliderMin)}`} // Uses sliderMin for placeholder
                                    className="pl-7 pr-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-md w-full focus:ring-indigo-500 focus:border-indigo-500 text-base dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
                                    step="1" min={sliderMin > 0 ? sliderMin : 1} />
                            </div>
                            <button onClick={placeBid} className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white px-6 py-2.5 rounded-md font-medium transition whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 text-base">
                                Place Bid
                            </button>
                        </div>
                        {showExceedsSliderNote && (
                            <p className="mt-3 text-xs text-center text-green-600 dark:text-green-400 flex items-center justify-center">
                                <CheckCircleIcon /> Your bid of {formatCurrency(typedPriceNum)} is noted!
                            </p>
                        )}
                        {bidStatusMessage && (<p className={`mt-4 text-sm font-medium text-center ${bidStatusMessage.startsWith('✅') ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{bidStatusMessage}</p>)}
                    </>
                ) : user && user.id === listing.seller_id ? (
                    <div className="p-3 border border-yellow-300 dark:border-yellow-700 rounded-md bg-yellow-50 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 text-center text-sm">You cannot place bids on your own listing.</div>
                ) : (
                    <div className="p-3 border border-blue-200 dark:border-blue-700 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 text-center text-sm">Please{' '} <Link href="/auth" className="font-bold underline hover:text-blue-900 dark:hover:text-blue-200">log in</Link>{' '} to place a bid.</div>
                )}
            </div>
        </section>
      )}

      {/* Section 3: Description */}
      <section>
          <h3 className="text-lg font-semibold mb-2 text-gray-800 dark:text-gray-200">Description</h3>
          <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800">
             <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{listing.description || <span className="text-gray-500 italic">No description provided.</span>}</p>
          </div>
      </section>

      {/* Section 4: Rules (if any) */}
      {listing.rules && (
        <section>
             <h3 className="text-lg font-semibold mb-2 text-gray-800 dark:text-gray-200">Auction Rules</h3>
             <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-800/50">
                <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{listing.rules}</p>
             </div>
        </section>
      )}

      {/* Section 5: Bid History */}
      <section className="pt-8 border-t border-gray-200 dark:border-gray-700">
         <h2 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-white"> Bid History ({bids.length}) </h2>
         {bids.length === 0 ? ( <p className="text-gray-600 dark:text-gray-400">No bids have been placed yet.</p> ) : (
             <ul className="space-y-3 max-h-[400px] overflow-y-auto pr-2 -mr-2 custom-scrollbar">
                 {bids.map((bid: Bid, index: number) => (
                     <li key={bid.id} className={`p-3 border rounded-md flex justify-between items-center text-sm ${ index === 0 ? 'bg-green-50 dark:bg-green-900/40 border-green-200 dark:border-green-700' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700' }`}>
                         <div><span className={`font-semibold ${index === 0 ? 'text-green-800 dark:text-green-300' : 'text-indigo-800 dark:text-indigo-400'}`}>{formatCurrency(bid.bid_price)}</span>{bid.bidder_email && ( <span className="text-xs text-gray-500 dark:text-gray-400 ml-2"> by {bid.bidder_email} </span> )}</div>
                         <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 ml-4">{new Date(bid.timestamp).toLocaleString()}</span>
                     </li>
                 ))}
             </ul>
         )}
      </section>

      {/* Global Styles for Slick Slider & Custom Scrollbar */}
      <style jsx global>{`
        /* Slick Slider Arrow Styling (from your original) */
        .slick-prev, .slick-next {
           position: absolute !important; top: 50% !important; transform: translateY(-50%) !important; z-index: 10 !important;
           width: 40px !important; height: 40px !important; background-color: rgba(0, 0, 0, 0.3) !important;
           border-radius: 50% !important; transition: background-color 0.2s, opacity 0.2s !important; opacity: 0.7 !important;
           cursor: pointer !important; display: flex !important; align-items: center !important; justify-content: center !important;
           padding: 0 !important; border: none !important;
        }
        .slick-prev:hover, .slick-next:hover { background-color: rgba(0, 0, 0, 0.5) !important; opacity: 1 !important; }
        .slick-prev { left: 10px !important; } .slick-next { right: 10px !important; }
        .slick-prev::before, .slick-next::before {
            font-family: 'slick' !important; font-size: 18px !important; color: white !important;
            opacity: 1 !important; line-height: normal !important; display: block !important;
        }
        .slick-dots { display: none !important; }
        @media (max-width: 640px) {
             .slick-prev { left: 5px !important; } .slick-next { right: 5px !important; }
             .slick-prev, .slick-next { width: 32px !important; height: 32px !important; }
             .slick-prev:before, .slick-next:before { font-size: 14px !important; }
        }

        /* Optional Custom Scrollbar for Bid History */
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 20px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: #94a3b8; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #4a5568; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: #718096; }
      `}</style>
    </main>
  );
}