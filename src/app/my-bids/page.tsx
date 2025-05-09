// src/app/my-bids/page.tsx
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { supabase, type User } from '@/lib/supabaseClient';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import { formatCurrency } from '@/lib/formatUtils';
import { formatRelativeTime, formatCountdown, isPast } from '@/lib/timeUtils';

// ---------- Helper Functions ---------------------------------------
/**
 * Safely parses a JSON string (expected to be an array of photo URLs)
 * into a string array or returns null if input is invalid, null, or already an array.
 * @param photosInput - The input which can be a JSON string, an array of strings, null, or undefined.
 * @returns A string array of photo URLs or null.
 */
const parsePhotosJson = (photosInput: string | string[] | null | undefined): string[] | null => {
  if (photosInput === null || photosInput === undefined) {
    return null;
  }
  if (Array.isArray(photosInput)) {
    if (photosInput.every(item => typeof item === 'string')) {
      return photosInput as string[];
    }
    console.warn('Photos input is an array but not uniformly strings:', photosInput);
    return null;
  }
  if (typeof photosInput === 'string') {
    try {
      const parsed = JSON.parse(photosInput);
      if (Array.isArray(parsed) && parsed.every(item => typeof item === 'string')) {
        return parsed as string[];
      }
      console.warn('Parsed photos JSON string is not an array of strings:', parsed);
      return null;
    } catch (error) {
      console.error('Failed to parse photos JSON string:', photosInput, error);
      return null;
    }
  }
  console.warn('Unexpected type for photosInput, cannot parse:', typeof photosInput, photosInput);
  return null;
};

// ---------- Types --------------------------------------------------
type MyBidDisplayItem = {
  listingId: string;
  listingTitle: string;
  listingPhotos: string[] | null; // Ensured to be array or null after parsing
  listingEndTime: string | null;
  listingStatus: 'active' | 'closed' | 'cancelled';
  listingWinningBidderId: string | null;
  userHighestBidOnItem: number | null;
  currentOverallHighestBid: number | null;
  currentOverallHighestBidderId: string | null;
  isEffectivelyEnded: boolean;
};

type RawListingFromDB = { // Type for data directly from 'listings' table select
    id: string;
    title: string;
    photos: string | string[] | null; // Can be JSON string or already array
    end_time: string | null;
    status: 'active' | 'closed' | 'cancelled';
    winning_bidder_id: string | null;
};

type RawBid = {
    item_id: string;
    bidder_id: string;
    bid_price: number;
};

type ViewFilter = 'active' | 'past';

// ---------- Component ---------------------------------------------
export default function MyBidsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [allBidItems, setAllBidItems] = useState<MyBidDisplayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCountdownTimers, setActiveCountdownTimers] = useState<Record<string, string | null>>({});
  const [viewFilter, setViewFilter] = useState<ViewFilter>('active');

  const fetchMyBidData = useCallback(async (currentUser: User) => {
    setLoading(true);
    setError(null);
    setAllBidItems([]);

    try {
      const { data: distinctListingIdsData, error: rpcError } = await supabase.rpc(
        'get_distinct_listing_ids_for_bidder',
        { p_bidder_id: currentUser.id }
      );
      if (rpcError) throw new Error(`RPC Error: ${rpcError.message}`);
      if (!distinctListingIdsData || distinctListingIdsData.length === 0) {
        setLoading(false);
        return;
      }
      const listingIds: string[] = distinctListingIdsData.map((row: {item_id: string}) => row.item_id);

      const { data: listingsDataRaw, error: listingsError } = await supabase
        .from('listings')
        .select('id, title, photos, end_time, status, winning_bidder_id')
        .in('id', listingIds)
        .returns<RawListingFromDB[]>(); // Use specific raw type
      if (listingsError) throw new Error(`Listings Fetch Error: ${listingsError.message}`);
      if (!listingsDataRaw) { setLoading(false); return; }

      // Parse photos for each listing
      const listingsData = listingsDataRaw.map(listing => ({
        ...listing,
        photos: parsePhotosJson(listing.photos)
      }));

      const { data: allBidsForListings, error: allBidsError } = await supabase
        .from('bids')
        .select('item_id, bidder_id, bid_price')
        .in('item_id', listingIds)
        .order('bid_price', { ascending: false })
        .returns<RawBid[]>();
      if (allBidsError) throw new Error(`Bids Fetch Error: ${allBidsError.message}`);

      const processedItems: MyBidDisplayItem[] = [];
      const listingsMap = new Map(listingsData.map(l => [l.id, l]));

      for (const listingId of listingIds) {
        const listing = listingsMap.get(listingId);
        if (!listing) continue;

        const bidsOnThisItem = allBidsForListings?.filter(b => b.item_id === listingId) || [];
        const userBidsOnThisItem = bidsOnThisItem.filter(b => b.bidder_id === currentUser.id);
        
        const userHighestBid = userBidsOnThisItem.length > 0
          ? Math.max(...userBidsOnThisItem.map(b => b.bid_price))
          : null;

        const overallHighestBidObject = bidsOnThisItem[0]; // Bids are sorted desc by price
        const overallHighestBid = overallHighestBidObject?.bid_price || null;
        const overallHighestBidderId = overallHighestBidObject?.bidder_id || null;
        
        const isEffectivelyEnded = listing.status === 'closed' ||
                                   listing.status === 'cancelled' ||
                                   (listing.end_time ? isPast(listing.end_time) : false);

        processedItems.push({
          listingId: listing.id,
          listingTitle: listing.title,
          listingPhotos: listing.photos, // Already parsed
          listingEndTime: listing.end_time,
          listingStatus: listing.status,
          listingWinningBidderId: listing.winning_bidder_id,
          userHighestBidOnItem: userHighestBid,
          currentOverallHighestBid: overallHighestBid,
          currentOverallHighestBidderId: overallHighestBidderId,
          isEffectivelyEnded,
        });
      }
      setAllBidItems(processedItems);

    } catch (err) {
      console.error("Error in fetchMyBidData:", err);
      setError(
        err instanceof Error ? `Failed to load your bids: ${err.message}` : 'An unknown error occurred.'
      );
    } finally {
      setLoading(false);
    }
  }, []); // No unstable dependencies

  useEffect(() => {
    supabase.auth.getUser().then(({ data: userData, error: userError }) => {
      if (userError || !userData?.user) {
        router.push('/auth?redirect=/my-bids');
        return;
      }
      setUser(userData.user);
      fetchMyBidData(userData.user);
    });
  }, [router, fetchMyBidData]);

  useEffect(() => {
    const intervalIds: NodeJS.Timeout[] = [];
    const itemsNeedingTimers = allBidItems.filter(
      item => item.listingStatus === 'active' && item.listingEndTime && !isPast(item.listingEndTime)
    );

    if (itemsNeedingTimers.length > 0) {
      itemsNeedingTimers.forEach(item => {
        const updateTimer = () => {
          const countdownStr = formatCountdown(item.listingEndTime);
          setActiveCountdownTimers(prev => ({ ...prev, [item.listingId]: countdownStr }));
          // If countdown reaches null, it means time is up.
          // Consider fetching fresh data or updating item status locally.
          if (countdownStr === null && item.listingId) {
             // This logic might need to be more robust, e.g., re-fetch the item
             // to confirm its status after the timer ends.
             console.log(`Timer ended for listing ${item.listingId}. Status might need update.`);
             // For now, we just stop updating the timer for this item.
             // A more complete solution might involve setting item.isEffectivelyEnded = true
             // and re-filtering, or a fresh fetch.
             setAllBidItems(prevItems => prevItems.map(prevItem => 
                prevItem.listingId === item.listingId ? {...prevItem, isEffectivelyEnded: true } : prevItem
             ));
          }
        };
        updateTimer(); // Initial call
        const intervalId = setInterval(updateTimer, 1000);
        intervalIds.push(intervalId);
      });
    }
    return () => {
      intervalIds.forEach(clearInterval);
    };
  }, [allBidItems]); // Rerun if allBidItems change (e.g., new items, status updates)

  const { activeWinningItems, activeLosingItems, pastWonItems, pastLostItems } = useMemo(() => {
    if (!user) return { activeWinningItems: [], activeLosingItems: [], pastWonItems: [], pastLostItems: [] };

    const active = allBidItems.filter(item => !item.isEffectivelyEnded && item.listingStatus === 'active');
    const past = allBidItems.filter(item => item.isEffectivelyEnded || item.listingStatus === 'closed' || item.listingStatus === 'cancelled');

    const sortActive = (a: MyBidDisplayItem, b: MyBidDisplayItem) => 
        (a.listingEndTime ? new Date(a.listingEndTime).getTime() : Infinity) -
        (b.listingEndTime ? new Date(b.listingEndTime).getTime() : Infinity);

    const sortPast = (a: MyBidDisplayItem, b: MyBidDisplayItem) =>
        (b.listingEndTime ? new Date(b.listingEndTime).getTime() : 0) -
        (a.listingEndTime ? new Date(a.listingEndTime).getTime() : 0);

    const activeWinning = active
        .filter(item => item.currentOverallHighestBidderId === user.id)
        .sort(sortActive);
    const activeLosing = active
        .filter(item => item.currentOverallHighestBidderId !== user.id)
        .sort(sortActive);
    
    const pastWon = past
        .filter(item => item.listingStatus === 'closed' && item.listingWinningBidderId === user.id)
        .sort(sortPast);
    const pastLost = past
        .filter(item => (item.listingStatus === 'closed' && item.listingWinningBidderId !== user.id) || item.listingStatus === 'cancelled')
        .sort(sortPast);

    return { 
        activeWinningItems: activeWinning, 
        activeLosingItems: activeLosing, 
        pastWonItems: pastWon, 
        pastLostItems: pastLost 
    };
  }, [allBidItems, user]);

  const tabClass = (tab: ViewFilter): string => {
      const baseClasses = 'px-4 py-2 rounded-md text-sm font-medium transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900';
      const activeClasses = 'bg-indigo-600 text-white shadow-sm';
      const inactiveClasses = 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600';
      return `${baseClasses} ${viewFilter === tab ? activeClasses : inactiveClasses}`;
  };

  const renderBidItemCard = (item: MyBidDisplayItem, cardType: 'active-winning' | 'active-losing' | 'past-won' | 'past-lost') => {
      let statusText = '';
      let statusColorClasses = '';

      if (cardType === 'active-winning') {
          statusText = '🎉 Winning';
          statusColorClasses = 'bg-green-100 dark:bg-green-800/50 text-green-700 dark:text-green-200 ring-green-600/20 dark:ring-green-500/30';
      } else if (cardType === 'active-losing') {
          statusText = '💔 Losing';
          statusColorClasses = 'bg-orange-100 dark:bg-orange-800/50 text-orange-700 dark:text-orange-200 ring-orange-600/20 dark:ring-orange-500/30';
      } else if (cardType === 'past-won') {
          statusText = '🏆 You Won!';
          statusColorClasses = 'bg-green-100 dark:bg-green-800/50 text-green-700 dark:text-green-200 ring-green-600/20 dark:ring-green-500/30';
      } else if (cardType === 'past-lost') {
          statusText = item.listingStatus === 'cancelled' ? 'Auction Cancelled' : 'Auction Ended';
          statusColorClasses = item.listingStatus === 'cancelled' 
              ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 ring-gray-500/20 dark:ring-gray-500/30'
              : 'bg-red-100 dark:bg-red-800/50 text-red-700 dark:text-red-200 ring-red-600/20 dark:ring-red-500/30';
      }
      
      const timeToDisplay = !item.isEffectivelyEnded && item.listingStatus === 'active' && item.listingEndTime && !isPast(item.listingEndTime)
          ? activeCountdownTimers[item.listingId] || `Ends ${formatRelativeTime(item.listingEndTime)}`
          : item.listingEndTime ? `Ended ${formatRelativeTime(item.listingEndTime)}` : 'Ended (No specific time)';

      const thumbnailUrl = (item.listingPhotos && item.listingPhotos.length > 0) ? item.listingPhotos[0] : null;

      return (
          <li
            key={item.listingId}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 flex flex-col sm:flex-row gap-4 items-start"
          >
            {/* Image Container - Retaining fixed size for this page layout */}
            <div className="flex-shrink-0 w-full sm:w-[120px] h-[90px] bg-gray-100 dark:bg-gray-700 rounded-md overflow-hidden group relative">
              {thumbnailUrl ? (
                <Link href={`/listings/${item.listingId}`} aria-label={`View details for ${item.listingTitle}`}>
                  <Image
                    src={thumbnailUrl}
                    alt={`Cover image for ${item.listingTitle}`} // Standardized alt text
                    width={120} // Retaining fixed dimensions for this layout
                    height={90}
                    style={{ objectFit: 'cover' }} // Crucial for fixed size
                    className="w-full h-full transition-transform duration-300 group-hover:scale-105" // Consistent hover effect
                    priority={false}
                    onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder-image.svg'; }}
                  />
                </Link>
              ) : (
                  <Link href={`/listings/${item.listingId}`} className="w-full h-full flex items-center justify-center" aria-label={`View details for ${item.listingTitle}`}>
                    {/* Using a standard image placeholder SVG */}
                    <svg className="h-10 w-10 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  </Link>
              )}
            </div>
            <div className="flex-grow min-w-0"> {/* Added min-w-0 for flex child text wrapping */}
              <Link
                href={`/listings/${item.listingId}`}
                className="text-lg font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 hover:underline block mb-2 break-words"
              >
                {item.listingTitle}
              </Link>
              <div className="space-y-1.5 text-sm">
                <p className="text-gray-700 dark:text-gray-300">
                  Your Highest Bid:{' '}
                  <span className="font-semibold text-blue-700 dark:text-blue-400">
                    {item.userHighestBidOnItem !== null ? formatCurrency(item.userHighestBidOnItem) : 'N/A'}
                  </span>
                </p>
                { (cardType === 'active-winning' || cardType === 'active-losing') && 
                  <p className="text-gray-700 dark:text-gray-300">
                    Current Top Bid:{' '}
                    <span className="font-semibold text-green-700 dark:text-green-400">
                      {item.currentOverallHighestBid !== null ? formatCurrency(item.currentOverallHighestBid) : 'No bids yet'}
                    </span>
                  </p>
                }
                {statusText && (
                    <p className="text-gray-700 dark:text-gray-300">
                        Status:{' '}
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${statusColorClasses}`}>
                            {statusText}
                        </span>
                    </p>
                )}
                {item.listingEndTime && (
                  <p className={`text-xs pt-1 ${!item.isEffectivelyEnded && item.listingStatus === 'active' && !isPast(item.listingEndTime) ? 'text-gray-600 dark:text-gray-300 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 inline-block mr-1 align-text-bottom opacity-70">
                        <path fillRule="evenodd" d="M1 8a7 7 0 1 1 14 0A7 7 0 0 1 1 8Zm7.75-4.25a.75.75 0 0 0-1.5 0V8c0 .414.336.75.75.75h4.25a.75.75 0 0 0 0-1.5H8.5V3.75Z" clipRule="evenodd" />
                    </svg>
                    {timeToDisplay}
                  </p>
                )}
              </div>
            </div>
          </li>
      );
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-4 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-900 dark:text-gray-100 tracking-tight">My Bids</h1>
        <LoadingSpinner message="Loading your bidding activity..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-4 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-900 dark:text-gray-100 tracking-tight">My Bids</h1>
        <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-600/50 rounded-md text-red-700 dark:text-red-200 text-center">
          {error}
        </div>
      </div>
    );
  }

   if (!user && !loading) {
    return (
      <div className="max-w-4xl mx-auto p-4 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-900 dark:text-gray-100 tracking-tight">My Bids</h1>
        <p className="text-center text-gray-600 dark:text-gray-400">Please{' '}<Link href="/auth?redirect=/my-bids" className="text-indigo-600 hover:text-indigo-500 underline">log in</Link>{' '}to view your bids.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 sm:mb-8 gap-4 pb-4 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">My Bids</h1>
        <div className="flex space-x-2 flex-shrink-0">
          <button className={tabClass('active')} onClick={() => setViewFilter('active')}>Active Bids</button>
          <button className={tabClass('past')} onClick={() => setViewFilter('past')}>Past Bids</button>
        </div>
      </header>

      {viewFilter === 'active' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 lg:gap-x-8 gap-y-8">
          <section>
            <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200 pb-2 border-b border-gray-200 dark:border-gray-700">Currently Winning</h2>
            {activeWinningItems.length > 0 ? ( <ul className="space-y-6">{activeWinningItems.map(item => renderBidItemCard(item, 'active-winning'))}</ul> ) : ( <EmptyState message="You are not currently winning any active auctions." className="py-6 text-sm" /> )}
          </section>
          <section>
            <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200 pb-2 border-b border-gray-200 dark:border-gray-700">Currently Losing</h2>
            {activeLosingItems.length > 0 ? ( <ul className="space-y-6">{activeLosingItems.map(item => renderBidItemCard(item, 'active-losing'))}</ul> ) : ( <EmptyState message="You are not currently outbid on any active auctions, or haven't bid yet." className="py-6 text-sm" /> )}
          </section>
        </div>
      )}

      {viewFilter === 'past' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 lg:gap-x-8 gap-y-8">
          <section>
            <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200 pb-2 border-b border-gray-200 dark:border-gray-700">Auctions Won</h2>
            {pastWonItems.length > 0 ? ( <ul className="space-y-6">{pastWonItems.map(item => renderBidItemCard(item, 'past-won'))}</ul> ) : ( <EmptyState message="You haven't won any past auctions yet." className="py-6 text-sm" /> )}
          </section>
          <section>
            <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200 pb-2 border-b border-gray-200 dark:border-gray-700">Auctions Lost or Cancelled</h2>
            {pastLostItems.length > 0 ? ( <ul className="space-y-6">{pastLostItems.map(item => renderBidItemCard(item, 'past-lost'))}</ul> ) : ( <EmptyState message="No past auctions where you didn't win, or auctions were cancelled." className="py-6 text-sm" /> )}
          </section>
        </div>
      )}

       {allBidItems.length === 0 && !loading && (
           <EmptyState message="You haven't placed any bids yet. Time to find some treasures!" action={{ href: '/listings', text: 'Browse Listings' }} className="mt-8" />
       )}
    </div>
  );
}