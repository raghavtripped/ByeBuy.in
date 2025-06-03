// src/app/listings/(detail)/[id]/page.tsx
'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import Slider from "react-slick";
import WatchlistButton from '@/components/WatchlistButton';

import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";

import { supabase, type User } from '@/lib/supabaseClient';
import {
  formatRelativeTime,
  isPast,
  formatCountdown,
} from '@/lib/timeUtils';
import { formatCurrency } from '@/lib/formatUtils';
import LoadingSpinner from '@/components/LoadingSpinner';
import ListingChat from '@/components/ListingChat';
import ConfirmBidModal from '@/components/ConfirmBidModal';

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

type ListingTablePayload = Partial<Omit<Listing, 'photos' | 'tags'> & { photos: string | string[] | null, tags?: string | string[] | null }> & { id: string };
type BidTablePayload = Partial<Bid> & { item_id?: string; id?: string };

// --- Helper Icons ---
const CheckCircleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 inline-block mr-2 text-emerald-500 dark:text-emerald-400">
    <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.06 0l4.071-5.66Z" clipRule="evenodd" />
  </svg>
);

const ClockIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 inline-block mr-1.5">
    <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z" clipRule="evenodd" />
  </svg>
);

const TrendingUpIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 inline-block mr-1.5 text-emerald-500 dark:text-emerald-400">
    <path d="M3.5 3.75a.25.25 0 0 1 .25-.25h13.5a.25.25 0 0 1 .25.25v10.5a.75.75 0 0 1-1.5 0V5.56l-5.72 5.72a.75.75 0 0 1-1.06 0L6.97 9.03 4.03 12.72a.75.75 0 0 1-1.06-1.06l3.5-4.5a.75.75 0 0 1 .9-.15L10 8.44l5.22-5.22H4.75A.75.75 0 0 1 4 2.5V3.75Z" />
  </svg>
);

const GavelIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 inline-block mr-2">
    <path d="M10.75 2.75a.75.75 0 0 0-1.5 0V4.5h-2.5a.75.75 0 0 0 0 1.5h2.5V15h-1.5a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5H12.25V6h2.5a.75.75 0 0 0 0-1.5h-2.5V2.75Z" />
    <path fillRule="evenodd" d="M2.755 4.877c-.306-.086-.629-.127-.955-.127C.822 4.75.005 5.56.005 6.547v.186c0 .986.817 1.796 1.795 1.796.326 0 .65-.04.955-.127a4.012 4.012 0 0 1 2.55 1.63c.305.4.713.716 1.188.933a4.026 4.026 0 0 03.02-.002c.474-.216.882-.532 1.188-.93a4.012 4.012 0 0 1 2.55-1.63c.306.086.629.127.955.127 1.018 0 1.79-.849 1.79-1.836 0-.986-.817-1.796-1.79-1.796-.326 0-.65.04-.955.127a4.012 4.012 0 0 1-2.55-1.63c-.306-.4-.713-.716-1.188-.933a4.026 4.026 0 0 0-3.02.001c-.474.217-.882.533-1.188.93A4.012 4.012 0 0 1 2.755 4.877ZM1.505 6.733C1.23 6.662 1.03 6.61 1.005 6.58v.153c0 .46.348.836.95.836.025 0 .225-.052.495-.123a2.512 2.512 0 0 0-1.188-.836l.243.123Zm15.233-.123c.27.07.47.123.495.123.602 0 .95-.376.95-.836v-.153c-.025.03-.225.082-.495.123a2.512 2.512 0 0 0 1.188.836l-.243-.123Z" clipRule="evenodd" />
  </svg>
);

const UserIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 inline-block mr-1.5 opacity-70">
    <path d="M10 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.465 14.493a11.542 11.542 0 0 1 13.07 0A.75.75 0 0 1 16.18 16a9.542 9.542 0 0 0-12.36 0 .75.75 0 0 1-.375-1.507Z" />
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

  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isPlacingBid, setIsPlacingBid] = useState(false);
  
  const parseListingPhotos = (photosData: unknown): string[] | null => {
    if (Array.isArray(photosData)) {
      const stringPhotos = photosData.filter(p => typeof p === 'string');
      return stringPhotos.length > 0 ? stringPhotos : null;
    }
    if (photosData === null || photosData === undefined) return null;
    console.warn("parseListingPhotos: Unexpected photosData type", typeof photosData, photosData);
    return null;
  };

  const loadData = useCallback(async () => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!id || !uuidRegex.test(id)) { setError('Invalid listing ID format.'); setLoading(false); return; }
    setLoading(true); setError(null); setBids([]); setPrice(''); setWinnerEmail(null); setBidStatusMessage(null);
    try {
      let fetchedListingData: Partial<Listing> & { id: string, status: Listing['status'], description: string, title: string } | null = null;
      const { data: archivedData, error: archivedError } = await supabase.from('archived_listings_details').select('*').eq('id', id).maybeSingle();
      if (archivedError) console.warn("Could not fetch from archived_listings_details:", archivedError?.message);
      if (archivedData) {
          fetchedListingData = {...archivedData, photos: parseListingPhotos(archivedData.photos), description: archivedData.description || '', title: archivedData.title || "Untitled Listing", status: archivedData.status as Listing['status'], final_sale_price: archivedData.final_sale_price,};
          if (archivedData.winner_email) setWinnerEmail(archivedData.winner_email);
      } else {
          const { data: lData, error: lError } = await supabase.from('listings_with_seller_email').select('id, title, description, min_price, photos, end_time, upper_cap, rules, seller_email, seller_id, status, winning_bidder_id, winning_bid_id').eq('id', id).maybeSingle();
          if (lError) throw lError;
          if (!lData) { setError('Listing not found.'); setLoading(false); return; }
          fetchedListingData = {...lData, photos: parseListingPhotos(lData.photos), description: lData.description || '', title: lData.title || "Untitled Listing", status: lData.status as Listing['status']};
          if (fetchedListingData.status === 'closed' && fetchedListingData.winning_bidder_id) {
              if (fetchedListingData.winning_bid_id) {
                  const {data: WBidData} = await supabase.from('bids').select('bid_price').eq('id', fetchedListingData.winning_bid_id).single();
                  if (WBidData) fetchedListingData.final_sale_price = WBidData.bid_price;
              }
              const {data: WUserData} = await supabase.from('users').select('email').eq('id', fetchedListingData.winning_bidder_id).single();
              if (WUserData) setWinnerEmail(WUserData.email);
          }
      }
      if (!fetchedListingData || !fetchedListingData.id ) { setError('Listing not found.'); setLoading(false); return; }
      setListing(fetchedListingData as Listing);
      const { data: bData, error: bError } = await supabase.from('bids_with_bidder_email').select('*').eq('item_id', id).order('timestamp', { ascending: false });
      if (bError) throw bError;
      setBids(bData ?? []);
    } catch (err: unknown) {
      console.error("Data loading error:", err);
      let message = 'Error loading details.';
      if (err instanceof Error) message = err.message; else if (typeof err === 'string') message = err; else if (err && typeof err === 'object' && 'message' in err && typeof (err as {message: unknown}).message === 'string') message = (err as {message: string}).message;
      setError(message);
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { 
    supabase.auth.getUser().then(({ data }) => setUser(data.user)); loadData();
    const bidsChannel = supabase.channel(`listing-bids-${id}`);
    bidsChannel.on<BidTablePayload>('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bids', filter: `item_id=eq.${id}` }, async (payload) => { if (payload.new?.id) { const { data: nb } = await supabase.from('bids_with_bidder_email').select('*').eq('id', payload.new.id).single(); if (nb) setBids(cb => { if (cb.find(b => b.id === nb.id)) return cb; const ub = [nb as Bid, ...cb]; return ub.sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());});}});
    const listingChannel = supabase.channel(`listing-details-status-${id}`);
    listingChannel.on<ListingTablePayload>('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'listings', filter: `id=eq.${id}` }, (payload) => { const u = payload.new; if (!u) return; setListing(p => { if (!p) return null; if ((u.status && p.status !== u.status) || (u.winning_bidder_id !== undefined && p.winning_bidder_id !== u.winning_bidder_id) || (u.winning_bid_id !== undefined && p.winning_bid_id !== u.winning_bid_id)) { loadData(); return p; } const np: Partial<Listing> = {}; if (u.title !== undefined && p.title !== u.title) np.title = u.title; if (u.description !== undefined && p.description !== u.description) np.description = u.description || ''; if (u.min_price !== undefined && p.min_price !== u.min_price) np.min_price = u.min_price; if (u.upper_cap !== undefined && p.upper_cap !== u.upper_cap) np.upper_cap = u.upper_cap; if (u.rules !== undefined && p.rules !== u.rules) np.rules = u.rules; if (u.photos !== undefined) { const prp = parseListingPhotos(u.photos); if (JSON.stringify(prp) !== JSON.stringify(p.photos)) np.photos = prp;} return Object.keys(np).length > 0 ? { ...p, ...np } : p;});});
    bidsChannel.subscribe((s,e) => { if (s === 'CHANNEL_ERROR') console.error('Bids RT Error:', e); else if (s === 'TIMED_OUT') console.warn('Bids RT Timeout');});
    listingChannel.subscribe((s,e) => { if (s === 'CHANNEL_ERROR') console.error('Listing RT Error:', e); else if (s === 'TIMED_OUT') console.warn('Listing RT Timeout');});
    return () => { supabase.removeChannel(bidsChannel); supabase.removeChannel(listingChannel); };
  }, [id, loadData]);

  // Add useEffect to scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  
  const auctionEnded = !!(listing && (listing.status === 'closed' || listing.status === 'cancelled'));
  const photos = listing?.photos ?? [];
  const currentHighestBidVal = useMemo(() => bids[0]?.bid_price ?? 0, [bids]);
  const { sliderMin, sliderMax, sliderStep, displaySlider } = useMemo(() => { if (!listing || auctionEnded) return { sliderMin: 1, sliderMax: 100, sliderStep: 1, displaySlider: false }; const nextValidBid = Math.max(listing.min_price, currentHighestBidVal + 1); if (listing.upper_cap && nextValidBid >= listing.upper_cap) return { sliderMin: nextValidBid, sliderMax: nextValidBid, sliderStep: 1, displaySlider: false }; const sMin = nextValidBid; let sMax; if (listing.upper_cap && listing.upper_cap > sMin) { sMax = listing.upper_cap - 1; } else { const base = currentHighestBidVal || listing.min_price; const jump3 = base + Math.max(500, Math.ceil(base * 0.30 / 50) * 50); sMax = Math.max(sMin + 500, jump3); sMax = Math.min(sMax, 200000); } if (sMax <= sMin) sMax = sMin + Math.max(100, Math.ceil(sMin * 0.1)); if (listing.upper_cap && sMax >= listing.upper_cap) sMax = listing.upper_cap - 1; if (sMax <= sMin) return { sliderMin: sMin, sliderMax: sMin + (sMin === 0 ? 100 : Math.max(100, Math.ceil(sMin * 0.1))), sliderStep: 1, displaySlider: sMin === 0 ? true : false }; let sStep = 1; const range = sMax - sMin; if (range <= 100) sStep = 1; else if (range <= 500) sStep = 5; else if (range <= 2000) sStep = 10; else if (range <= 10000) sStep = 50; else if (range <= 50000) sStep = 100; else sStep = 250; return { sliderMin: Math.max(1, sMin), sliderMax: Math.max(sMin + sStep, sMax), sliderStep: sStep, displaySlider: true }; }, [listing, auctionEnded, currentHighestBidVal]);
  useEffect(() => { if (!listing?.end_time || auctionEnded || isPast(listing.end_time)) { setCountdown(null); return; } const updateTimer = (): boolean => { if (!listing?.end_time || auctionEnded || isPast(listing.end_time)) { setCountdown(null); return true; } const remaining = formatCountdown(listing.end_time); setCountdown(remaining); if (remaining === "Auction Ended") { if (!auctionEnded) { loadData(); } return true; } return false; }; if (updateTimer()) return; const intervalId = window.setInterval(() => { if (updateTimer()) clearInterval(intervalId); }, 1000); return () => clearInterval(intervalId);}, [listing?.end_time, listing?.status, auctionEnded, loadData, id]);
  const executePlaceBid = async () => { if (!user || !listing || auctionEnded || isPlacingBid) { setIsPlacingBid(false); setIsConfirmModalOpen(false); return; } const amt = parseInt(price, 10); if (isNaN(amt) || amt <= 0) { setBidStatusMessage('⚠️ Invalid bid.'); setIsPlacingBid(false); setIsConfirmModalOpen(false); return; } setIsPlacingBid(true); setBidStatusMessage(null); try { const { error: insertError } = await supabase.from('bids').insert({ item_id: id, bidder_id: user.id, bid_price: amt }); if (insertError) throw insertError; setPrice(''); setBidStatusMessage('✅ Bid placed!'); setTimeout(() => setBidStatusMessage(null), 4000); } catch (err: unknown) { let userMessage = '❌ Bid failed.'; if (err instanceof Error) { userMessage = `❌ Bid failed: ${err.message.substring(0,100)}`; const pe = err as {code?:string;details?:string;message?:string}; if (pe.code === '23514' || pe.details?.includes('violates check constraint')) userMessage = '❌ Invalid bid amount.'; else if (pe.message?.toLowerCase().includes('rls')) userMessage = '❌ Permission denied.';} setBidStatusMessage(userMessage); } finally { setIsPlacingBid(false); setIsConfirmModalOpen(false); }};
  const handlePlaceBidClick = () => { setBidStatusMessage(null); if (!user) { router.push(`/auth?redirect=/listings/${id}`); return; } if (!listing) return; if (auctionEnded || (listing.end_time && isPast(listing.end_time))) { setBidStatusMessage('⚠️ Auction ended.'); if (!auctionEnded) loadData(); return; } if (user.id === listing.seller_id) { setBidStatusMessage('⚠️ Cannot bid on own item.'); return; } const amt = parseInt(price, 10); if (isNaN(amt) || amt <= 0) { setBidStatusMessage('⚠️ Invalid bid.'); return; } if (listing.upper_cap && amt >= listing.upper_cap) { setBidStatusMessage(`⚠️ Max bid is ${formatCurrency(listing.upper_cap-1)}.`); return; } const minRequired = Math.max(listing.min_price, currentHighestBidVal + 1); if (amt < minRequired) { setBidStatusMessage(`⚠️ Min bid: ${formatCurrency(minRequired)}.`); return; } setIsConfirmModalOpen(true); };

  // --- RENDER GUARDS ---
  if (loading && !listing) return <div className="flex justify-center items-center min-h-[70vh]"><LoadingSpinner message="Summoning Listing Details..." /></div>;
  if (error) return <div className="p-6 text-center text-red-600 dark:text-red-300 font-medium rounded-lg bg-red-50 dark:bg-red-900/20 max-w-lg mx-auto mt-10">{error}</div>;
  if (!listing) return <div className="p-6 text-center text-gray-700 dark:text-bye-dark-text-secondary rounded-lg bg-gray-50 dark:bg-bye-dark-bg-hover max-w-lg mx-auto mt-10">This listing seems to have vanished! Try exploring other auctions.</div>;

  // --- DERIVED VALUES FOR UI ---
  const timeDisplay = auctionEnded
    ? (listing.end_time ? `Ended ${formatRelativeTime(listing.end_time)}` : 'Auction Ended')
    : countdown === "Auction Ended" ? "Ending soon..."
    : countdown !== null ? countdown
    : (listing.end_time ? `Ends ${formatRelativeTime(listing.end_time)}` : 'Timeless Treasure');

  const sliderSettings = { 
    dots: true, 
    infinite: photos.length > 1, 
    speed: 500, 
    slidesToShow: 1, 
    slidesToScroll: 1, 
    arrows: photos.length > 1, 
    adaptiveHeight: false,
    className: "details-slick-slider"
  };
  const typedPriceNum = parseInt(price);
  const showExceedsSliderNote = displaySlider && !isNaN(typedPriceNum) && typedPriceNum > sliderMax && typedPriceNum >= sliderMin && (listing.upper_cap ? typedPriceNum < listing.upper_cap : true);

  return (
    <> {/* Main Fragment */}
      {/* MODIFIED: Removed outer page gradient, will rely on layout.tsx for bye-dark-bg-primary */}
      <div className="min-h-screen"> {/* Removed specific background here */}
        <main className="listing-detail-page max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
          {/* SECTION 1: Main Listing Info (Photos, Title, Core Details, Bidding Card) */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12 mb-12">
            
            {/* LEFT COLUMN: Photo Gallery, Title, Watchlist Button */}
            <div className="lg:col-span-2 space-y-6">
              {/* Photo Gallery Card */}
              <div className="relative bg-white dark:bg-bye-dark-bg-secondary rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-bye-dark-border-primary">
                {photos.length > 0 ? (
                  <div className="aspect-[4/3] relative">
                    <Slider {...sliderSettings}>
                      {photos.map((photoUrl: string, index: number) => (
                        <div key={photoUrl || `photo-${index}`} className="aspect-[4/3] relative">
                          <Image 
                            src={photoUrl} 
                            alt={`Photo ${index + 1} for ${listing.title}`} 
                            fill 
                            style={{ objectFit: 'contain' }} 
                            sizes="(max-width: 1024px) 100vw, 67vw" 
                            priority={index === 0}
                            className="bg-gray-50 dark:bg-bye-dark-bg-hover"
                          />
                        </div>
                      ))}
                    </Slider>
                  </div>
                ) : ( 
                  <div className="aspect-[4/3] bg-gradient-to-br from-gray-100 to-gray-200 dark:from-bye-dark-bg-hover dark:to-bye-dark-bg-secondary flex items-center justify-center rounded-t-2xl">
                    <div className="text-center">
                      <svg className="h-24 w-24 text-gray-400 dark:text-bye-dark-text-secondary opacity-60 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"> 
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /> 
                      </svg>
                       <p className="text-sm text-gray-500 dark:text-bye-dark-text-secondary">No Photos Available</p>
                    </div>
                  </div>
                )}
              </div> {/* End Photo Gallery Card */}

              {/* Title & Watchlist Button - MOVED HERE, BELOW GALLERY */}
              <div className="mt-6 flex items-start justify-between gap-4">
                <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-bye-dark-text-primary leading-tight break-words">
                  {listing.title}
                </h1>
                <WatchlistButton
                  listingId={listing.id}
                  currentUser={user}
                  size="lg"
                  className="flex-shrink-0 mt-1 text-gray-500 dark:text-bye-dark-text-secondary hover:text-red-500 dark:hover:text-red-400 bg-white dark:bg-bye-dark-bg-secondary p-2 rounded-full shadow hover:shadow-md"
                />
              </div>
            </div> {/* End Left Column */}

            {/* RIGHT COLUMN: Core Details, Bidding Box - SHIFTED UP */}
            <div className="lg:col-span-1 space-y-6"> {/* This will now be the first item in this column */}
              {/* Seller Info - MOVED HERE */}
              {listing.seller_email && (
                <div className="p-3 bg-white dark:bg-bye-dark-bg-secondary rounded-lg shadow-sm border border-gray-100 dark:border-bye-dark-border-primary">
                    <p className="text-sm text-gray-600 dark:text-bye-dark-text-secondary flex items-center">
                        <UserIcon /> Sold by: {' '}
                        {listing.seller_id ? (
                            <Link href={`/user/${listing.seller_id}`} className="ml-1 font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300 hover:underline">
                                {listing.seller_email.split('@')[0]}
                            </Link>
                        ) : (
                            <span className="ml-1 font-medium text-gray-700 dark:text-bye-dark-text-primary">{listing.seller_email.split('@')[0]}</span>
                        )}
                    </p>
                </div>
              )}

              {/* Core Stats Card */}
              <div className="bg-white dark:bg-bye-dark-bg-secondary p-5 rounded-xl shadow-lg border border-gray-100 dark:border-bye-dark-border-primary space-y-4">
                  {/* Time Remaining / Status */}
                  <div className={`flex items-center p-3 rounded-lg text-sm font-semibold ${
                      auctionEnded 
                        ? (listing.status === 'closed' ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300' 
                          : listing.status === 'cancelled' ? 'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300' 
                          : 'bg-gray-100 dark:bg-bye-dark-bg-hover text-gray-700 dark:text-bye-dark-text-primary')
                        : 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 animate-pulse'
                  }`}>
                      <ClockIcon />
                      <span className="flex-grow">{timeDisplay}</span>
                  </div>

                  {/* Price Info */}
                  <div className="grid grid-cols-2 gap-4">
                      <div>
                          <p className="text-xs text-gray-500 dark:text-bye-dark-text-secondary mb-0.5">Minimum Bid</p>
                          <p className="text-xl font-bold text-indigo-700 dark:text-indigo-400">{formatCurrency(listing.min_price)}</p>
                      </div>
                      {listing.upper_cap && listing.upper_cap > 0 && listing.status === 'active' && (
                          <div className="text-right">
                              <p className="text-xs text-gray-500 dark:text-bye-dark-text-secondary mb-0.5">Buy Now Price</p>
                              <p className="text-xl font-bold text-purple-700 dark:text-purple-400">{formatCurrency(listing.upper_cap)}</p>
                          </div>
                      )}
                  </div>

                  {/* Highest Bid Info */}
                  <div className="border-t border-gray-200 dark:border-bye-dark-border-primary pt-3">
                      <p className="text-xs text-gray-500 dark:text-bye-dark-text-secondary mb-0.5">Current Highest Bid</p>
                      {currentHighestBidVal > 0 && bids.length > 0 ? (
                         <>
                             <p className="text-2xl sm:text-3xl font-extrabold text-green-600 dark:text-green-300 flex items-center">
                                <TrendingUpIcon />
                                {formatCurrency(currentHighestBidVal)}
                             </p>
                             {bids[0]?.bidder_email && (
                                 <p className="text-xs text-gray-500 dark:text-bye-dark-text-secondary pt-1">
                                   by <span className="font-medium text-gray-700 dark:text-bye-dark-text-primary truncate">{bids[0].bidder_email.split('@')[0]}</span>
                                 </p>
                             )}
                         </>
                      ) : ( <p className="text-lg text-gray-500 dark:text-bye-dark-text-secondary pt-1 italic">No bids yet. Be the first!</p> )}
                  </div>
              </div> {/* End Core Stats Card */}

              {/* "Auction Ended" State Card */}
              {auctionEnded && (
                <div className={`p-4 rounded-xl shadow-lg my-4 border ${
                    listing.status === 'closed' && listing.winning_bidder_id ? 'bg-green-50 dark:bg-green-900/30 border-green-300 dark:border-green-700/50' 
                  : listing.status === 'closed' ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700/50' 
                  : 'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700/50'}`}>
                    <h3 className={`text-xl font-semibold text-center mb-2 flex items-center justify-center ${
                        listing.status === 'closed' && listing.winning_bidder_id ? 'text-green-700 dark:text-green-200' 
                      : listing.status === 'closed' ? 'text-blue-700 dark:text-blue-200'
                      : 'text-yellow-700 dark:text-yellow-200'}`}>
                        <GavelIcon /> {listing.status === 'cancelled' ? 'Auction Cancelled' : 'Auction Ended'}
                    </h3>
                    {listing.status === 'closed' && listing.winning_bidder_id && listing.final_sale_price ? (
                        <>
                           <p className="text-md text-center text-gray-700 dark:text-bye-dark-text-primary">
                               Sold for: <span className="font-bold text-green-600 dark:text-green-300">{formatCurrency(listing.final_sale_price)}</span>
                           </p>
                           {winnerEmail && (
                               <p className="text-sm text-center text-gray-600 dark:text-bye-dark-text-secondary mt-1">
                                   Winner: <span className="font-medium text-gray-800 dark:text-bye-dark-text-primary">{winnerEmail.split('@')[0]}</span>
                               </p>
                           )}
                        </>
                    ) : listing.status === 'closed' ? (
                       <p className="text-md text-center text-gray-700 dark:text-bye-dark-text-primary">This auction closed with no winning bids.</p>
                    ): null}
                </div>
              )}

              {/* "Place Your Bid" Card (only if active) */}
              {!auctionEnded && (
                <div className="bg-white dark:bg-bye-dark-bg-secondary p-5 rounded-xl shadow-lg border border-gray-100 dark:border-bye-dark-border-primary">
                    {user && user.id !== listing.seller_id ? (
                        <>
                            <h3 className="text-xl font-semibold mb-4 text-center text-gray-800 dark:text-bye-dark-text-primary">Place Your Bid</h3>
                            {displaySlider && (
                                <p className="text-xs text-center text-gray-500 dark:text-bye-dark-text-secondary mb-3">
                                    Suggested range: {formatCurrency(sliderMin)} - {formatCurrency(sliderMax)}
                                </p>
                            )}
                            {displaySlider && (
                                <div className="mb-5">
                                    <label htmlFor="bidSlider" className="sr-only">Bid Amount Slider</label>
                                    <input id="bidSlider" type="range" min={sliderMin} max={sliderMax} step={sliderStep} value={price || sliderMin}
                                        onChange={(e) => { setPrice(e.target.value); setBidStatusMessage(null); }}
                                        className="w-full h-2.5 bg-gray-200 dark:bg-bye-dark-border-primary rounded-lg appearance-none cursor-pointer accent-indigo-600 dark:accent-indigo-400" />
                                    <div className="flex justify-between text-xs text-gray-500 dark:text-bye-dark-text-secondary mt-1.5 px-1">
                                        <span>{formatCurrency(sliderMin)}</span>
                                        <span>{formatCurrency(sliderMax)}</span>
                                    </div>
                                </div>
                            )}
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                                <div className="flex-grow relative">
                                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 dark:text-bye-dark-text-secondary pointer-events-none">₹</span>
                                    <input id="bidAmount" type="number" value={price}
                                        onChange={(e) => { setPrice(e.target.value); setBidStatusMessage(null); }}
                                        placeholder={`Min. ${formatCurrency(sliderMin)}`}
                                        className="pl-7 pr-3 py-2.5 border border-gray-300 dark:border-bye-dark-border-primary rounded-md w-full focus:ring-indigo-500 focus:border-indigo-500 text-base bg-white dark:bg-bye-dark-bg-hover text-gray-900 dark:text-bye-dark-text-primary dark:placeholder-bye-dark-text-secondary"
                                        step="1" min={sliderMin > 0 ? sliderMin : 1} />
                                </div>
                                <button 
                                  onClick={handlePlaceBidClick} 
                                  className="w-full sm:w-auto bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 dark:from-indigo-500 dark:to-purple-600 dark:hover:from-indigo-600 dark:hover:to-purple-700 text-white px-6 py-2.5 rounded-lg font-semibold transition-all whitespace-nowrap shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:ring-offset-2 dark:focus:ring-offset-bye-dark-bg-secondary text-base"
                                  disabled={isPlacingBid || !price.trim()}
                                >
                                  {isPlacingBid ? 'Processing...' : 'Place Bid'}
                                </button>
                            </div>
                            {showExceedsSliderNote && (
                                <p className="mt-3 text-xs text-center text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                                    <CheckCircleIcon /> Your bid of {formatCurrency(typedPriceNum)} is noted!
                                </p>
                            )}
                            {bidStatusMessage && (<p className={`mt-4 text-sm font-medium text-center ${bidStatusMessage.startsWith('✅') ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-300'}`}>{bidStatusMessage}</p>)}
                        </>
                    ) : user && user.id === listing.seller_id ? ( 
                        <div className="p-3 border border-yellow-300 dark:border-yellow-600/50 rounded-lg bg-yellow-50 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 text-center text-sm">You cannot place bids on your own listing.</div>
                    ) : ( 
                        <div className="p-3 border border-blue-300 dark:border-blue-600/50 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 text-center text-sm">Please{' '} <Link href={`/auth?redirect=/listings/${id}`} className="font-bold underline hover:text-blue-900 dark:hover:text-blue-200">log in</Link>{' '} to place a bid.</div>
                    )}
                </div>
              )}
            </div> {/* End Right Column */}
          </section> {/* End Section 1 */}

          {/* SECTION 2: Description & Rules (Side-by-Side on larger screens) */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
            <div>
              <h2 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-bye-dark-text-primary border-b border-gray-200 dark:border-bye-dark-border-primary pb-2">Item Description</h2>
              <div className="p-5 bg-white dark:bg-bye-dark-bg-secondary rounded-lg shadow border border-gray-100 dark:border-bye-dark-border-primary prose dark:prose-invert prose-sm max-w-none">
                 <p className="whitespace-pre-wrap">{listing.description || <span className="italic opacity-75">No detailed description provided.</span>}</p>
              </div>
            </div>
            {listing.rules && (
              <div>
                 <h2 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-bye-dark-text-primary border-b border-gray-200 dark:border-bye-dark-border-primary pb-2">Auction Rules</h2>
                 <div className="p-5 bg-white dark:bg-bye-dark-bg-secondary rounded-lg shadow border border-gray-100 dark:border-bye-dark-border-primary prose dark:prose-invert prose-sm max-w-none">
                    <p className="whitespace-pre-wrap">{listing.rules}</p>
                 </div>
              </div>
            )}
          </section>

          {/* SECTION 3: Listing Chat */}
          <section className="mb-12">
            {id && user !== undefined && listing && (
                <ListingChat listingId={id} currentUser={user} />
            )}
          </section>

          {/* SECTION 4: Bid History */}
          <section>
             <h2 className="text-2xl font-semibold mb-6 text-gray-800 dark:text-bye-dark-text-primary border-b border-gray-200 dark:border-bye-dark-border-primary pb-3"> Bid History ({bids.length}) </h2>
             {bids.length === 0 ? ( 
                <div className="p-5 text-center text-gray-600 dark:text-bye-dark-text-secondary bg-white dark:bg-bye-dark-bg-secondary rounded-lg shadow border border-gray-100 dark:border-bye-dark-border-primary">
                    No bids have been placed yet. Be the first!
                </div> 
              ) : (
                 <ul className="space-y-4">
                     {bids.map((bid: Bid, index: number) => (
                         <li key={bid.id} 
                             className={`p-4 border rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center text-sm shadow-sm transition-all duration-200 hover:shadow-md
                                ${ index === 0 
                                  ? 'bg-green-50 dark:bg-green-900/30 border-green-300 dark:border-green-700/60 transform scale-[1.01]'
                                  : 'bg-white dark:bg-bye-dark-bg-secondary border-gray-200 dark:border-bye-dark-border-primary' 
                              }`}>
                             <div className="mb-2 sm:mb-0">
                                 <span className={`font-semibold text-lg ${index === 0 ? 'text-green-700 dark:text-green-200' : 'text-indigo-700 dark:text-indigo-300'}`}>{formatCurrency(bid.bid_price)}</span>
                                 {bid.bidder_email && ( 
                                     <span className="text-xs text-gray-500 dark:text-bye-dark-text-secondary ml-2"> 
                                        by {bid.bidder_id === user?.id ? <span className="font-medium text-blue-600 dark:text-blue-400">You</span> : bid.bidder_email.split('@')[0]}
                                     </span> 
                                 )}
                             </div>
                             <span className="text-xs text-gray-500 dark:text-bye-dark-text-secondary flex-shrink-0 sm:ml-4 flex items-center"> {/* Added flex items-center */}
                                 <ClockIcon /> {new Date(bid.timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                             </span>
                         </li>
                     ))}
                 </ul>
             )}
          </section>
        </main>
        
        <style jsx global>{`
          .details-slick-slider .slick-dots {
            bottom: 10px;
          }
          .details-slick-slider .slick-dots li button:before {
            font-size: 10px;
            color: rgb(79 70 229 / 0.5); 
            opacity: 0.5;
            transition: all 0.3s ease;
          }
          .details-slick-slider .slick-dots li.slick-active button:before {
            color: rgb(79 70 229); 
            opacity: 1;
          }
          html.dark .details-slick-slider .slick-dots li button:before {
            color: rgb(129 140 248 / 0.6); 
          }
          html.dark .details-slick-slider .slick-dots li.slick-active button:before {
            color: rgb(129 140 248); 
          }

          .details-slick-slider .slick-prev, 
          .details-slick-slider .slick-next {
           width: 36px !important; height: 36px !important; 
           background-color: rgba(255, 255, 255, 0.7) !important;
           backdrop-filter: blur(2px);
           border-radius: 50% !important;
           z-index: 10 !important;
           box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          html.dark .details-slick-slider .slick-prev, 
          html.dark .details-slick-slider .slick-next {
            background-color: rgba(30, 41, 59, 0.7) !important; /* bye-dark-bg-primary with opacity */
          }
          .details-slick-slider .slick-prev:hover, 
          .details-slick-slider .slick-next:hover { 
            background-color: rgba(255, 255, 255, 0.9) !important;
          }
          html.dark .details-slick-slider .slick-prev:hover, 
          html.dark .details-slick-slider .slick-next:hover {
            background-color: rgba(51, 65, 85, 0.9) !important; /* bye-dark-bg-secondary with opacity */
          }
          .details-slick-slider .slick-prev { left: 12px !important; } 
          .details-slick-slider .slick-next { right: 12px !important; }
          .details-slick-slider .slick-prev::before, 
          .details-slick-slider .slick-next::before {
            font-family: 'slick' !important; 
            font-size: 16px !important; 
            color: rgb(55 65 81) !important; 
            opacity: 1 !important;
          }
           html.dark .details-slick-slider .slick-prev::before, 
           html.dark .details-slick-slider .slick-next::before {
            color: rgb(209 213 219) !important; 
           }

          .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
          .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
          .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: #94a3b8; }
          html.dark .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #343536; }
          html.dark .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: #2A2A2B; }
        `}</style>
      </div> {/* End outer page div */}

      {listing && (
        <ConfirmBidModal
          isOpen={isConfirmModalOpen}
          onClose={() => { 
            setIsConfirmModalOpen(false); 
            setIsPlacingBid(false);
          }}
          onConfirm={executePlaceBid}
          bidAmount={price && !isNaN(parseInt(price, 10)) ? parseInt(price, 10) : null}
          listingTitle={listing.title}
          currentHighestBid={currentHighestBidVal}
          minimumBid={listing.min_price}
          isLoading={isPlacingBid}
        />
      )}
    </>
  );
}