// src/app/listings/(detail)/[id]/page.tsx
'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import Slider from "react-slick";

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
  photos: string[] | null; // Expecting this to be populated from photos_jsonb
  end_time?: string | null;
  upper_cap?: number | null;
  rules?: string | null;
  seller_email?: string | null;
  seller_id?: string;
  status: 'active' | 'closed' | 'cancelled' | string;
  winning_bidder_id?: string | null;
  winning_bid_id?: string | null; // Note: duplicate key, should be distinct if intended for different purposes
  final_sale_price?: number | null;
  // If tags are used on this page, add:
  // tags?: string[] | null; // Expecting this to be populated from tags_jsonb
};

type Bid = {
  id: string;
  bid_price: number;
  bidder_id: string;
  timestamp: string;
  bidder_email?: string | null;
};

// This payload type is for realtime updates.
// It's flexible to handle potential old format (string) or new format (string[]) for photos/tags during transition.
// Once DB migration fully renames photos_jsonb to photos (as JSONB), this can be simplified.
type ListingTablePayload = Partial<Omit<Listing, 'photos' | 'tags'> & { photos: string | string[] | null, tags?: string | string[] | null }> & { id: string };
type BidTablePayload = Partial<Bid> & { item_id?: string; id?: string };

// --- Helper Icons ---
const CheckCircleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 inline-block mr-1.5 align-text-bottom text-green-600 dark:text-green-400">
    <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.06 0l4.071-5.66Z" clipRule="evenodd" />
  </svg>
);

const ClockIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 inline-block mr-1 align-text-bottom">
        <path fillRule="evenodd" d="M8 1.75a.75.75 0 0 1 .75.75v5.5a.75.75 0 0 1-1.5 0V2.5A.75.75 0 0 1 8 1.75ZM8 14a.75.75 0 0 1 .75.75v.01a.75.75 0 0 1-1.5 0v-.01A.75.75 0 0 1 8 14ZM4.21 3.97a.75.75 0 0 1 1.06 0l.74.745a.75.75 0 1 1-1.06 1.06l-.745-.74a.75.75 0 0 1 0-1.06Zm6.52 0a.75.75 0 0 1 0 1.06l-.74.745a.75.75 0 1 1-1.06-1.06l.74-.74a.75.75 0 0 1 1.06 0ZM1.75 8a.75.75 0 0 1 .75-.75h.01a.75.75 0 0 1 0 1.5H2.5a.75.75 0 0 1-.75-.75Zm11.5 0a.75.75 0 0 1 .75-.75h.01a.75.75 0 0 1 0 1.5h-.01a.75.75 0 0 1-.75-.75ZM4.21 10.97a.75.75 0 0 1 0 1.06l-.745.74a.75.75 0 1 1-1.06-1.06l.74-.74a.75.75 0 0 1 1.06 0Zm6.52 0a.75.75 0 0 1 1.06 0l.74.74a.75.75 0 1 1-1.06-1.06l-.74-.74a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
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

  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isPlacingBid, setIsPlacingBid] = useState(false);

  // MODIFIED: Simplified parseListingPhotos
  // Assumes photosData is expected to be string[] | null (from photos_jsonb)
  // or null/undefined. It no longer attempts to JSON.parse a string.
  const parseListingPhotos = (photosData: unknown): string[] | null => {
    if (Array.isArray(photosData)) {
      // Ensure all elements in the array are strings
      const stringPhotos = photosData.filter(p => typeof p === 'string');
      return stringPhotos.length > 0 ? stringPhotos : null;
    }
    if (photosData === null || photosData === undefined) {
      return null;
    }
    // If photosData is a string or other type, it's unexpected for photos_jsonb.
    // Log an error or handle as appropriate. For now, return null.
    console.warn("parseListingPhotos: Unexpected photosData type, expected array or null, got:", typeof photosData, photosData);
    return null;
  };

  const loadData = useCallback(async () => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!id || !uuidRegex.test(id)) {
      setError('Invalid listing ID format.'); setLoading(false); return;
    }
    setLoading(true); setError(null); setBids([]); setPrice(''); setWinnerEmail(null); setBidStatusMessage(null);

    try {
      let fetchedListingData: Partial<Listing> & { id: string, status: Listing['status'], description: string, title: string } | null = null;
      
      // IMPORTANT: The 'archived_listings_details' view MUST select 'photos_jsonb AS photos'
      const { data: archivedData, error: archivedError } = await supabase
        .from('archived_listings_details') // This view needs to select photos_jsonb AS photos
        .select('*') // Ensure this view selects all necessary fields including the aliased 'photos'
        .eq('id', id)
        .maybeSingle();

      if (archivedError) { console.warn("Could not fetch from archived_listings_details. Error:", archivedError?.message); }

      if (archivedData) {
          fetchedListingData = {
              ...archivedData, 
              photos: parseListingPhotos(archivedData.photos), // photos should be string[]|null from view
              description: archivedData.description || '',
              title: archivedData.title || "Untitled Listing",
              status: archivedData.status as Listing['status'], 
              final_sale_price: archivedData.final_sale_price,
          };
          if (archivedData.winner_email) setWinnerEmail(archivedData.winner_email);
      } else {
          // IMPORTANT: The 'listings_with_seller_email' view MUST select 'photos_jsonb AS photos'
          const { data: lData, error: lError } = await supabase
              .from('listings_with_seller_email') // This view needs to select photos_jsonb AS photos
              .select('id, title, description, min_price, photos, end_time, upper_cap, rules, seller_email, seller_id, status, winning_bidder_id, winning_bid_id')
              .eq('id', id)
              .maybeSingle();

          if (lError) throw lError;
          if (!lData) { setError('Listing not found.'); setLoading(false); return; }
          
          fetchedListingData = {
              ...lData,
              photos: parseListingPhotos(lData.photos), // photos should be string[]|null from view
              description: lData.description || '',
              title: lData.title || "Untitled Listing",
              status: lData.status as Listing['status']
            };

          if (fetchedListingData.status === 'closed' && fetchedListingData.winning_bidder_id) {
              if (fetchedListingData.winning_bid_id) {
                  const {data: WBidData} = await supabase.from('bids').select('bid_price').eq('id', fetchedListingData.winning_bid_id).single();
                  if (WBidData) fetchedListingData.final_sale_price = WBidData.bid_price;
              }
              // Assuming 'users' is a table, not 'auth.users' for this direct query. If it's auth.users, this is fine.
              const {data: WUserData} = await supabase.from('users').select('email').eq('id', fetchedListingData.winning_bidder_id).single();
              if (WUserData) setWinnerEmail(WUserData.email);
          }
      }
      if (!fetchedListingData || !fetchedListingData.id ) { setError('Listing not found or missing essential data.'); setLoading(false); return; }
      setListing(fetchedListingData as Listing);

      const { data: bData, error: bError } = await supabase.from('bids_with_bidder_email').select('*').eq('item_id', id).order('timestamp', { ascending: false });
      if (bError) throw bError;
      setBids(bData ?? []);
    } catch (err: unknown) {
      console.error("Data loading error:", err);
      let message = 'Error loading details.';
      if (err instanceof Error) message = err.message;
      else if (typeof err === 'string') message = err;
      else if (err && typeof err === 'object' && 'message' in err && typeof (err as {message: unknown}).message === 'string') message = (err as {message: string}).message;
      setError(message);
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    loadData();

    const bidsChannelName = `listing-bids-${id}`;
    const bidsChannel = supabase.channel(bidsChannelName);
    bidsChannel.on<BidTablePayload>(
        'postgres_changes', { event: 'INSERT', schema: 'public', table: 'bids', filter: `item_id=eq.${id}` },
        async (payload) => {
          if (payload.new?.id) {
            const { data: newBid } = await supabase.from('bids_with_bidder_email').select('*').eq('id', payload.new.id).single();
            if (newBid) setBids((currentBids) => {
                if (currentBids.find(b => b.id === newBid.id)) return currentBids;
                const updatedBids = [newBid as Bid, ...currentBids];
                return updatedBids.sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            });
          }
        }
      ).subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR') console.error(`Bids RT Channel Error (${bidsChannelName}):`, err);
        else if (status === 'TIMED_OUT') console.warn(`Bids RT Channel Timeout (${bidsChannelName})`);
      });

    const listingChannelName = `listing-details-status-${id}`;
    const listingChannel = supabase.channel(listingChannelName);
    listingChannel.on<ListingTablePayload>( // ListingTablePayload handles photos as string | string[] | null
        'postgres_changes', { event: 'UPDATE', schema: 'public', table: 'listings', filter: `id=eq.${id}` },
        (payload) => { 
          const updated = payload.new; if (!updated) return;
          console.log("ListingDetailsPage: Realtime update received for listing:", id, updated);
          setListing(prev => {
            if (!prev) return null;
            // If status or winner changes, trigger a full reload to get all derived data correctly
            if ((updated.status && prev.status !== updated.status) ||
                (updated.winning_bidder_id !== undefined && prev.winning_bidder_id !== updated.winning_bidder_id) ||
                (updated.winning_bid_id !== undefined && prev.winning_bid_id !== updated.winning_bid_id)) {
                console.log("ListingDetailsPage: Realtime update triggered full reload for listing:", id);
                loadData(); 
                return prev; // Return previous state until loadData completes to avoid flicker
            }
            // For other changes, update selectively
            const newPartial: Partial<Listing> = {};
            if (updated.title !== undefined && prev.title !== updated.title) newPartial.title = updated.title;
            if (updated.description !== undefined && prev.description !== updated.description) newPartial.description = updated.description || '';
            if (updated.min_price !== undefined && prev.min_price !== updated.min_price) newPartial.min_price = updated.min_price;
            if (updated.upper_cap !== undefined && prev.upper_cap !== updated.upper_cap) newPartial.upper_cap = updated.upper_cap;
            if (updated.rules !== undefined && prev.rules !== updated.rules) newPartial.rules = updated.rules;
            
            // MODIFIED: Use simplified parseListingPhotos for realtime updates as well.
            // Assumes updated.photos from payload (if present) is string[] | null
            // or a string that parseListingPhotos will now ignore (returning null).
            if (updated.photos !== undefined) {
                const parsedRtPhotos = parseListingPhotos(updated.photos);
                // Only update if there's a meaningful change to avoid re-renders from same data
                if (JSON.stringify(parsedRtPhotos) !== JSON.stringify(prev.photos)) {
                    newPartial.photos = parsedRtPhotos;
                }
            }
            
            return Object.keys(newPartial).length > 0 ? { ...prev, ...newPartial } : prev;
          });
        }
      ).subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR') console.error(`Listing RT Channel Error (${listingChannelName}):`, err);
        else if (status === 'TIMED_OUT') console.warn(`Listing RT Channel Timeout (${listingChannelName})`);
      });

    return () => { 
        console.log("ListingDetailsPage: Cleaning up channels for listing:", id);
        supabase.removeChannel(bidsChannel).catch(err => console.error("Error removing bidsChannel", err)); 
        supabase.removeChannel(listingChannel).catch(err => console.error("Error removing listingChannel", err));
    };
  }, [id, loadData]);

  const auctionEnded = !!(listing && (listing.status === 'closed' || listing.status === 'cancelled'));
  const photos = listing?.photos ?? []; // This will now correctly be string[] | null
  const currentHighestBidVal = useMemo(() => bids[0]?.bid_price ?? 0, [bids]);

  const { sliderMin, sliderMax, sliderStep, displaySlider } = useMemo(() => {
    if (!listing || auctionEnded) return { sliderMin: 1, sliderMax: 100, sliderStep: 1, displaySlider: false };
    const nextValidBid = Math.max(listing.min_price, currentHighestBidVal + 1);
    if (listing.upper_cap && nextValidBid >= listing.upper_cap) return { sliderMin: nextValidBid, sliderMax: nextValidBid, sliderStep: 1, displaySlider: false };
    const sMin = nextValidBid;
    let sMax: number;
    if (listing.upper_cap && listing.upper_cap > sMin) { sMax = listing.upper_cap - 1; }
    else {
      const base = currentHighestBidVal || listing.min_price;
      const jump3 = base + Math.max(500, Math.ceil(base * 0.30 / 50) * 50);
      sMax = Math.max(sMin + 500, jump3); sMax = Math.min(sMax, 200000);
    }
    if (sMax <= sMin) sMax = sMin + Math.max(100, Math.ceil(sMin * 0.1));
    if (listing.upper_cap && sMax >= listing.upper_cap) sMax = listing.upper_cap - 1;
    if (sMax <= sMin) return { sliderMin: sMin, sliderMax: sMin + (sMin === 0 ? 100 : Math.max(100, Math.ceil(sMin * 0.1))), sliderStep: 1, displaySlider: sMin === 0 ? true : false };
    let sStep = 1; const range = sMax - sMin;
    if (range <= 100) sStep = 1; else if (range <= 500) sStep = 5; else if (range <= 2000) sStep = 10;
    else if (range <= 10000) sStep = 50; else if (range <= 50000) sStep = 100; else sStep = 250;
    return { sliderMin: Math.max(1, sMin), sliderMax: Math.max(sMin + sStep, sMax), sliderStep: sStep, displaySlider: true };
  }, [listing, auctionEnded, currentHighestBidVal]);

  useEffect(() => {
      if (!listing?.end_time || auctionEnded || isPast(listing.end_time)) {
          setCountdown(null); return;
      }
      const updateTimer = (): boolean => {
          if (!listing?.end_time || auctionEnded || isPast(listing.end_time)) {
              setCountdown(null); return true;
          }
          const remaining = formatCountdown(listing.end_time);
          setCountdown(remaining);
          if (remaining === "Auction Ended") {
            if (!auctionEnded) { // Check if status hasn't updated yet
                console.log("ListingDetailsPage: Countdown timer ended, triggering data reload for listing:", id);
                loadData(); // Reload data to get final status and winner
            }
            return true;
          }
          return false;
      };
      if (updateTimer()) return; // Initial call
      const intervalId = window.setInterval(() => { if (updateTimer()) clearInterval(intervalId); }, 1000);
      return () => clearInterval(intervalId);
  }, [listing?.end_time, listing?.status, auctionEnded, loadData, id]);


  const executePlaceBid = async () => {
    if (!user || !listing || auctionEnded || isPlacingBid) {
      console.warn("executePlaceBid: Pre-conditions not met or already placing bid.");
      setIsPlacingBid(false); 
      setIsConfirmModalOpen(false);
      return;
    }
    
    const amt = parseInt(price, 10);
    if (isNaN(amt) || amt <= 0) {
        setBidStatusMessage('⚠️ Bid amount became invalid during confirmation.');
        setIsPlacingBid(false);
        setIsConfirmModalOpen(false);
        return;
    }

    setIsPlacingBid(true); 
    setBidStatusMessage(null);

    try {
      console.log(`Placing bid of ${amt} for listing ${id} by user ${user.id}`);
      const { error: insertError } = await supabase.from('bids').insert({ item_id: id, bidder_id: user.id, bid_price: amt });
      if (insertError) {
        console.error("Supabase bid insert error:", insertError);
        throw insertError;
      }
      
      setPrice(''); 
      setBidStatusMessage('✅ Bid placed successfully!');
      setTimeout(() => setBidStatusMessage(null), 4000);
    } catch (err: unknown) {
        console.error("executePlaceBid failed:", err);
        let userMessage = '❌ Bid failed: An unexpected error occurred.';
        if (err instanceof Error) {
            userMessage = `❌ Bid failed: ${err.message.substring(0, 100)}`; // Keep message brief
            const potentialError = err as { code?: string; details?: string; message?: string };
            if (potentialError.code === '23514' || potentialError.details?.includes('violates check constraint')) { // Check for constraint violation
                userMessage = '❌ Bid failed: The bid amount is invalid or violates auction rules.';
            } else if (potentialError.message?.toLowerCase().includes('row-level security policy')) {
                userMessage = '❌ Bid failed: You do not have permission to place this bid.';
            }
        }
        setBidStatusMessage(userMessage);
    } finally {
      setIsPlacingBid(false);
      setIsConfirmModalOpen(false); 
      console.log("executePlaceBid: finished, modal closed.");
    }
  };

  const handlePlaceBidClick = () => {
    setBidStatusMessage(null);
    if (!user) { router.push(`/auth?redirect=/listings/${id}`); return; }
    if (!listing) { console.error("handlePlaceBidClick: Listing data not available."); return; }
    
    if (auctionEnded || (listing.end_time && isPast(listing.end_time))) {
        setBidStatusMessage('⚠️ Auction has ended.');
        if (!auctionEnded) loadData(); // Refresh if local state is stale
        return;
    }
    if (user.id === listing.seller_id) { setBidStatusMessage('⚠️ You cannot bid on your own item.'); return; }
    
    const amt = parseInt(price, 10);
    if (isNaN(amt) || amt <= 0) { setBidStatusMessage('⚠️ Enter a valid positive whole number bid.'); return; }
    if (listing.upper_cap && amt >= listing.upper_cap) { setBidStatusMessage(`⚠️ Bid cannot meet or exceed the Buy Now price of ${formatCurrency(listing.upper_cap)}.`); return; }
    
    const minRequired = Math.max(listing.min_price, currentHighestBidVal + 1);
    if (amt < minRequired) { setBidStatusMessage(`⚠️ Bid must be at least ${formatCurrency(minRequired)}.`); return; }

    console.log("handlePlaceBidClick: Validations passed, opening confirmation modal for amount:", amt);
    setIsConfirmModalOpen(true); 
  };


  if (loading && !listing) return <div className="flex justify-center py-20"><LoadingSpinner message="Loading listing details..." /></div>;
  if (error) return <p className="p-6 text-center text-red-600 dark:text-red-300 font-medium">{error}</p>;
  if (!listing) return <p className="p-6 text-center text-gray-700 dark:text-bye-dark-text-secondary">Listing details could not be loaded.</p>;

  const timeDisplay = auctionEnded
    ? (listing.end_time ? `Ended ${formatRelativeTime(listing.end_time)}` : 'Auction Ended')
    : countdown === "Auction Ended" // If countdown specifically says "Auction Ended"
    ? "Processing end..." // Show processing while loadData might be refreshing status
    : countdown !== null ? `Ends in: ${countdown}` // Active countdown
    : (listing.end_time ? `Ends ${formatRelativeTime(listing.end_time)}` : 'No end time set'); // Fallback if countdown is null but not ended

  const sliderSettings = { dots: false, infinite: photos.length > 1, speed: 500, slidesToShow: 1, slidesToScroll: 1, arrows: photos.length > 1, adaptiveHeight: true };
  const typedPriceNum = parseInt(price);
  const showExceedsSliderNote = displaySlider && !isNaN(typedPriceNum) && typedPriceNum > sliderMax && typedPriceNum >= sliderMin && (listing.upper_cap ? typedPriceNum < listing.upper_cap : true);

  return (
    <>
      <main className="listing-detail-page max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8">
        <section className="flex flex-col md:flex-row gap-6 md:gap-8 items-start">
          {/* Photo Gallery Section */}
          <div className="w-full md:w-1/2 flex-shrink-0 slick-container relative">
            {photos.length > 0 ? (
                 <Slider {...sliderSettings}>
                    {photos.map((photoUrl: string, index: number) => (
                        <div key={photoUrl || `photo-${index}`} className="aspect-square relative bg-gray-100 dark:bg-bye-dark-bg-hover rounded-lg overflow-hidden">
                             <Image src={photoUrl} alt={`Photo ${index + 1} for ${listing.title}`} fill style={{ objectFit: 'contain' }} sizes="(max-width: 768px) 100vw, 50vw" priority={index === 0} />
                        </div>
                     ))}
                </Slider>
            ) : ( 
                <div className="w-full aspect-square bg-gray-200 dark:bg-bye-dark-bg-secondary rounded-lg flex items-center justify-center"> {/* Removed md:w-1/2 and flex-shrink-0 for consistency when no photos */}
                    <svg className="h-20 w-20 text-gray-400 dark:text-bye-dark-text-secondary opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"> 
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /> 
                    </svg> 
                </div>
            )}
          </div>

          <div className={`w-full ${photos.length > 0 ? 'md:w-1/2' : ''} space-y-4`}>
              {/* Remove watchlist button and simplify title section */}
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-bye-dark-text-primary break-words">
                {listing.title}
              </h1>

              {/* Rest of the listing details remain the same */}
              {listing.seller_id && listing.seller_email ? (
                  <p className="text-sm text-gray-600 dark:text-bye-dark-text-secondary">
                    Sold by: {' '}
                    <Link href={`/user/${listing.seller_id}`} className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300 hover:underline">
                      {listing.seller_email}
                    </Link>
                  </p>
              ) : listing.seller_email ? (
                  <p className="text-sm text-gray-600 dark:text-bye-dark-text-secondary">
                    Sold by: <span className="font-medium text-gray-800 dark:text-bye-dark-text-primary">{listing.seller_email}</span>
                  </p>
              ): null}

              {listing.status === 'active' && (
                  <div className="flex flex-col sm:flex-row gap-4 pt-2">
                      <div className="flex-1 space-y-2 bg-gray-50 dark:bg-bye-dark-bg-secondary p-3 rounded-md border border-gray-200 dark:border-bye-dark-border-primary">
                          <p className="text-sm font-medium text-gray-700 dark:text-bye-dark-text-primary">Minimum Bid:</p>
                          <p className="text-xl font-bold text-indigo-700 dark:text-indigo-400">{formatCurrency(listing.min_price)}</p>
                          {listing.upper_cap && listing.upper_cap > 0 && (
                              <div className="pt-1 mt-1 border-t border-gray-200 dark:border-bye-dark-border-primary opacity-70 dark:opacity-100">
                                  <p className="text-sm font-medium text-gray-700 dark:text-bye-dark-text-primary mt-1">Buy Now Price:</p>
                                  <p className="text-xl font-bold text-purple-700 dark:text-purple-400">{formatCurrency(listing.upper_cap)}</p>
                              </div>
                          )}
                      </div>
                      <div className="flex-1 space-y-1 bg-gray-50 dark:bg-bye-dark-bg-secondary p-3 rounded-md border border-gray-200 dark:border-bye-dark-border-primary">
                           <h3 className="text-sm font-medium text-gray-700 dark:text-bye-dark-text-primary">Current Highest Bid:</h3>
                           {currentHighestBidVal > 0 && bids.length > 0 ? (
                              <>
                                  <p className="text-2xl font-bold text-green-700 dark:text-green-400">{formatCurrency(currentHighestBidVal)}</p>
                                  {bids[0]?.bidder_email && (
                                      <p className="text-xs text-gray-500 dark:text-bye-dark-text-secondary pt-1 min-w-0">by <span className="font-medium text-gray-700 dark:text-bye-dark-text-primary truncate inline-block max-w-full">{bids[0].bidder_email}</span></p>
                                  )}
                              </>
                           ) : ( <p className="text-lg text-gray-500 dark:text-bye-dark-text-secondary pt-2">No bids yet.</p> )}
                      </div>
                  </div>
              )}

            {listing.status === 'closed' && (
                 <div className={`p-4 rounded-md my-3 border ${listing.winning_bidder_id ? 'bg-green-50 dark:bg-green-900/25 border-green-300 dark:border-green-700/50' : 'bg-blue-50 dark:bg-blue-900/25 border-blue-300 dark:border-blue-700/50'}`}>
                     <h3 className={`text-lg font-semibold text-center mb-2 ${listing.winning_bidder_id ? 'text-green-700 dark:text-green-300' : 'text-blue-700 dark:text-blue-300'}`}>Auction Ended</h3>
                     {listing.winning_bidder_id && listing.final_sale_price ? (
                         <>
                            <p className="text-md text-center text-gray-700 dark:text-bye-dark-text-primary">
                                Sold for: <span className="font-bold text-green-600 dark:text-green-400">{formatCurrency(listing.final_sale_price)}</span>
                            </p>
                            {winnerEmail && (
                                <p className="text-sm text-center text-gray-600 dark:text-bye-dark-text-secondary">
                                    Winner: <span className="font-medium text-gray-800 dark:text-bye-dark-text-primary">{winnerEmail}</span>
                                </p>
                            )}
                         </>
                     ) : (
                        <p className="text-md text-center text-gray-700 dark:text-bye-dark-text-primary">This auction closed with no winning bids.</p>
                     )}
                 </div>
            )}
            {listing.status === 'cancelled' && (
                 <div className="p-4 rounded-md my-3 border bg-yellow-50 dark:bg-yellow-900/25 border-yellow-300 dark:border-yellow-700/50">
                     <h3 className="text-lg font-semibold text-center text-yellow-700 dark:text-yellow-300">Auction Cancelled</h3>
                 </div>
            )}
              {listing.end_time && (<p className={`text-sm font-medium pt-2 text-center ${auctionEnded ? 'text-gray-500 dark:text-bye-dark-text-secondary' : 'text-gray-600 dark:text-bye-dark-text-primary'}`}><ClockIcon /> {timeDisplay}</p>)}
          </div>
        </section>

        {!auctionEnded && (
          <section className="my-8 py-6 bg-gray-100 dark:bg-bye-dark-bg-hover rounded-xl shadow-inner">
              <div className="max-w-lg mx-auto bg-white dark:bg-bye-dark-bg-secondary shadow-xl rounded-lg p-6 sm:p-8">
                  {user && user.id !== listing.seller_id ? (
                      <>
                          <h3 className="text-xl font-semibold mb-4 text-center text-gray-800 dark:text-bye-dark-text-primary">Place Your Bid</h3>
                          
                          {displaySlider && (
                              <p className="text-xs text-center text-gray-500 dark:text-bye-dark-text-secondary mb-3">
                                  Suggested bid range: {formatCurrency(sliderMin)} - {formatCurrency(sliderMax)}
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
                                className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white px-6 py-2.5 rounded-md font-medium transition whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:ring-offset-2 dark:focus:ring-offset-bye-dark-bg-secondary text-base"
                                disabled={isPlacingBid || !price.trim()}
                              >
                                {isPlacingBid ? 'Processing...' : 'Place Bid'}
                              </button>
                          </div>
                          {showExceedsSliderNote && (
                              <p className="mt-3 text-xs text-center text-green-600 dark:text-green-400 flex items-center justify-center">
                                  <CheckCircleIcon /> Your bid of {formatCurrency(typedPriceNum)} is noted!
                              </p>
                          )}
                          {bidStatusMessage && (<p className={`mt-4 text-sm font-medium text-center ${bidStatusMessage.startsWith('✅') ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-300'}`}>{bidStatusMessage}</p>)}
                      </>
                  ) : user && user.id === listing.seller_id ? ( 
                      <div className="p-3 border border-yellow-300 dark:border-yellow-700/50 rounded-md bg-yellow-50 dark:bg-yellow-900/25 text-yellow-800 dark:text-yellow-300 text-center text-sm">You cannot place bids on your own listing.</div>
                  ) : ( 
                      <div className="p-3 border border-blue-200 dark:border-blue-700/50 rounded-md bg-blue-50 dark:bg-blue-900/25 text-blue-800 dark:text-blue-300 text-center text-sm">Please{' '} <Link href={`/auth?redirect=/listings/${id}`} className="font-bold underline hover:text-blue-900 dark:hover:text-blue-200">log in</Link>{' '} to place a bid.</div>
                  )}
              </div>
          </section>
        )}

        <section>
            <h3 className="text-lg font-semibold mb-2 text-gray-800 dark:text-bye-dark-text-primary">Description</h3>
            <div className="p-4 border border-gray-200 dark:border-bye-dark-border-primary rounded-md bg-white dark:bg-bye-dark-bg-secondary">
               <p className="text-gray-700 dark:text-bye-dark-text-primary whitespace-pre-wrap">{listing.description || <span className="text-gray-500 dark:text-bye-dark-text-secondary italic">No description provided.</span>}</p>
            </div>
        </section>

        {listing.rules && (
          <section>
               <h3 className="text-lg font-semibold mb-2 text-gray-800 dark:text-bye-dark-text-primary">Auction Rules</h3>
               <div className="p-4 border border-gray-200 dark:border-bye-dark-border-primary rounded-md bg-gray-50 dark:bg-bye-dark-bg-secondary opacity-90 dark:opacity-100">
                  <p className="text-sm text-gray-600 dark:text-bye-dark-text-secondary whitespace-pre-wrap">{listing.rules}</p>
               </div>
          </section>
        )}

        <section className="pt-8 border-t border-gray-200 dark:border-bye-dark-border-primary">
          {id && user !== undefined && listing && ( // Ensure listing is also loaded before rendering chat
              <ListingChat listingId={id} currentUser={user} />
          )}
        </section>

        <section className="pt-8 border-t border-gray-200 dark:border-bye-dark-border-primary">
           <h2 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-bye-dark-text-primary"> Bid History ({bids.length}) </h2>
           {bids.length === 0 ? ( <p className="text-gray-600 dark:text-bye-dark-text-secondary">No bids have been placed yet.</p> ) : (
               <ul className="space-y-3 max-h-[400px] overflow-y-auto pr-2 -mr-2 custom-scrollbar">
                   {bids.map((bid: Bid, index: number) => (
                       <li key={bid.id} className={`p-3 border rounded-md flex justify-between items-center text-sm ${ index === 0 
                            ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700/60' 
                            : 'bg-gray-50 dark:bg-bye-dark-bg-hover border-gray-200 dark:border-bye-dark-border-primary' 
                        }`}>
                           <div>
                               <span className={`font-semibold ${index === 0 ? 'text-green-800 dark:text-green-300' : 'text-indigo-800 dark:text-indigo-400'}`}>{formatCurrency(bid.bid_price)}</span>
                               {bid.bidder_email && ( <span className="text-xs text-gray-500 dark:text-bye-dark-text-secondary ml-2"> by {bid.bidder_email} </span> )}
                           </div>
                           <span className="text-xs text-gray-500 dark:text-bye-dark-text-secondary flex-shrink-0 ml-4">{new Date(bid.timestamp).toLocaleString()}</span>
                       </li>
                   ))}
               </ul>
           )}
        </section>

        <style jsx global>{`
          .slick-prev, .slick-next {
           position: absolute !important; top: 50% !important; transform: translateY(-50%) !important; z-index: 10 !important;
           width: 40px !important; height: 40px !important; background-color: rgba(0, 0, 0, 0.3) !important;
           border-radius: 50% !important; transition: background-color 0.2s, opacity 0.2s !important; opacity: 0.7 !important;
           cursor: pointer !important; display: flex !important; align-items: center !important; justify-content: center !important;
           padding: 0 !important; border: none !important;}
        
          .slick-prev:hover, .slick-next:hover { background-color: rgba(0, 0, 0, 0.5) !important; opacity: 1 !important; }
          .slick-prev { left: 10px !important; } .slick-next { right: 10px !important; }
          .slick-prev::before, .slick-next::before {font-family: 'slick' !important; font-size: 18px !important; color: white !important;
            opacity: 1 !important; line-height: normal !important; display: block !important;}
        
          .slick-dots { display: none !important; } 
          @media (max-width: 640px) {.slick-prev { left: 5px !important; } .slick-next { right: 5px !important; }
             .slick-prev, .slick-next { width: 32px !important; height: 32px !important; }
             .slick-prev:before, .slick-next:before { font-size: 14px !important; }}

          .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
          .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
          .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: #94a3b8; }
          html.dark .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #343536; }
          html.dark .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: #2A2A2B; }
        `}</style>
      </main>

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