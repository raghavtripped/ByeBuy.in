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

// ---------- Helper Functions (parsePhotosJson remains the same) ------------------
const parsePhotosJson = (photosInput: string | string[] | null | undefined): string[] | null => {
  if (photosInput === null || photosInput === undefined) return null;
  if (Array.isArray(photosInput)) {
    return photosInput.every(item => typeof item === 'string') ? photosInput as string[] : null;
  }
  if (typeof photosInput === 'string') {
    try {
      const parsed = JSON.parse(photosInput);
      return (Array.isArray(parsed) && parsed.every(item => typeof item === 'string')) ? parsed as string[] : null;
    } catch (_error) {
      console.error('Failed to parse photos JSON string:', photosInput, _error);
      return null;
    }
  }
  return null;
};

// ---------- Types (MyBidDisplayItem, RawListingFromDB, RawBid, ViewFilter remain the same) ---
type MyBidDisplayItem = {
  listingId: string;
  listingTitle: string;
  listingPhotos: string[] | null;
  listingEndTime: string | null;
  listingStatus: 'active' | 'closed' | 'cancelled';
  listingWinningBidderId: string | null;
  userHighestBidOnItem: number | null;
  currentOverallHighestBid: number | null;
  currentOverallHighestBidderId: string | null;
  isEffectivelyEnded: boolean;
};

type RawListingFromDB = {
    id: string;
    title: string;
    photos: string | string[] | null;
    end_time: string | null;
    status: 'active' | 'closed' | 'cancelled' | string;
    winning_bidder_id: string | null;
};

type RawBid = { 
    id: string; // Assuming bids have an ID
    item_id: string; 
    bidder_id: string; 
    bid_price: number; 
    timestamp: string; // Assuming bids have a timestamp
};
type ViewFilter = 'active' | 'past';

// NEW: Types for Realtime Payloads
type ListingPayload = Partial<RawListingFromDB> & { id: string }; // For listings table changes
type BidPayload = Partial<RawBid> & { id: string, item_id: string }; // For bids table changes


// ---------- Component ---------------------------------------------
export default function MyBidsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [allBidItems, setAllBidItems] = useState<MyBidDisplayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCountdownTimers, setActiveCountdownTimers] = useState<Record<string, string | null>>({});
  const [viewFilter, setViewFilter] = useState<ViewFilter>('active');
  const [listingIdsUserBidOn, setListingIdsUserBidOn] = useState<string[]>([]); // Store listing IDs

  const fetchMyBidData = useCallback(async (currentUser: User) => {
    setLoading(true); setError(null); setAllBidItems([]); setListingIdsUserBidOn([]);
    try {
      const { data: distinctListingIdsData, error: rpcError } = await supabase.rpc(
        'get_distinct_listing_ids_for_bidder', { p_bidder_id: currentUser.id }
      );
      if (rpcError) throw new Error(`RPC Error: ${rpcError.message}`);
      if (!distinctListingIdsData || distinctListingIdsData.length === 0) { 
        setLoading(false); 
        setListingIdsUserBidOn([]); // Ensure it's empty
        return; 
      }
      const fetchedListingIds: string[] = distinctListingIdsData.map((row: {item_id: string}) => row.item_id);
      setListingIdsUserBidOn(fetchedListingIds); // Store for realtime subscriptions

      const { data: listingsDataRaw, error: listingsError } = await supabase
        .from('listings').select('id, title, photos, end_time, status, winning_bidder_id')
        .in('id', fetchedListingIds).returns<RawListingFromDB[]>();
      if (listingsError) throw new Error(`Listings Fetch Error: ${listingsError.message}`);
      if (!listingsDataRaw) { setLoading(false); return; }

      const listingsData = listingsDataRaw.map(listing => ({ ...listing, photos: parsePhotosJson(listing.photos) }));

      // Fetch all bids for these listings to determine current highest bid and user's highest bid
      const { data: allBidsForListings, error: allBidsError } = await supabase
        .from('bids').select('id, item_id, bidder_id, bid_price, timestamp').in('item_id', fetchedListingIds) // Added id, timestamp
        .order('bid_price', { ascending: false })
        .order('timestamp', { ascending: true }) // Earliest highest bid wins ties
        .returns<RawBid[]>();
      if (allBidsError) throw new Error(`Bids Fetch Error: ${allBidsError.message}`);

      const processedItems: MyBidDisplayItem[] = [];
      const listingsMap = new Map(listingsData.map(l => [l.id, l]));

      for (const listingId of fetchedListingIds) {
        const listing = listingsMap.get(listingId);
        if (!listing) continue;
        
        const bidsOnThisItem = allBidsForListings?.filter(b => b.item_id === listingId) || [];
        // Sort bids on this item to easily find the highest
        bidsOnThisItem.sort((a, b) => b.bid_price - a.bid_price || new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        const userBidsOnThisItem = bidsOnThisItem.filter(b => b.bidder_id === currentUser.id);
        const userHighestBid = userBidsOnThisItem.length > 0 ? Math.max(...userBidsOnThisItem.map(b => b.bid_price)) : null;
        
        const overallHighestBidObject = bidsOnThisItem[0]; // Highest bid after sorting

        processedItems.push({
          listingId: listing.id, listingTitle: listing.title, listingPhotos: listing.photos,
          listingEndTime: listing.end_time, listingStatus: listing.status as MyBidDisplayItem['listingStatus'],
          listingWinningBidderId: listing.winning_bidder_id, userHighestBidOnItem: userHighestBid,
          currentOverallHighestBid: overallHighestBidObject?.bid_price ?? null,
          currentOverallHighestBidderId: overallHighestBidObject?.bidder_id ?? null,
          isEffectivelyEnded: listing.status === 'closed' || listing.status === 'cancelled' || (listing.end_time ? isPast(listing.end_time) : false),
        });
      }
      setAllBidItems(processedItems);
    } catch (err) { 
      console.error("Error in fetchMyBidData:", err);
      setError(err instanceof Error ? `Failed to load your bids: ${err.message}` : 'An unknown error occurred.');
    } finally { setLoading(false); }
  }, []);

  // Effect for initial user fetch and data load
  useEffect(() => {
    supabase.auth.getUser().then(({ data: userData, error: userError }) => {
      if (userError || !userData?.user) { router.push('/auth?redirect=/my-bids'); return; }
      setUser(userData.user); 
      fetchMyBidData(userData.user);
    });
  }, [router, fetchMyBidData]);

  // **********************************************************************
  // NEW: useEffect for Real-Time Subscriptions
  // **********************************************************************
  useEffect(() => {
    if (!user || listingIdsUserBidOn.length === 0) {
      return; // No user or no listings to watch
    }

    console.log("MyBidsPage RT: Setting up subscriptions for listing IDs:", listingIdsUserBidOn.join(', '));

    // 1. Listen for new bids on the listings this user has bid on
    const bidsChannel = supabase
      .channel(`my-bids-page-bids-feed-${user.id}`) // Unique channel name
      .on<BidPayload>(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'bids',
          filter: `item_id=in.(${listingIdsUserBidOn.join(',')})`, // Filter for relevant listings
        },
        async (payload) => {
          console.log('MyBidsPage RT: New bid received for a watched listing!', payload);
          const newBid = payload.new;
          if (newBid && newBid.item_id) {
            // Refetch data for the specific listing that received a new bid
            // to update currentOverallHighestBid and currentOverallHighestBidderId
            // This is simpler than trying to merge just the bid, as highest bid logic can be complex.
            // Alternatively, for more optimization, you could update just the affected item in allBidItems.
            
            // Find the item in our state
            const itemToUpdate = allBidItems.find(item => item.listingId === newBid.item_id);
            if (itemToUpdate) {
                // Fetch latest bids for this specific item
                const { data: latestBidsForItem, error: bidsError } = await supabase
                    .from('bids')
                    .select('bidder_id, bid_price, timestamp') // Select necessary fields
                    .eq('item_id', newBid.item_id)
                    .order('bid_price', { ascending: false })
                    .order('timestamp', { ascending: true });

                if (bidsError) {
                    console.error("MyBidsPage RT: Error fetching latest bids for item", newBid.item_id, bidsError);
                    return;
                }
                
                const overallHighestBidObject = latestBidsForItem?.[0];

                setAllBidItems(prevItems =>
                    prevItems.map(item =>
                        item.listingId === newBid.item_id
                            ? {
                                ...item,
                                currentOverallHighestBid: overallHighestBidObject?.bid_price ?? item.currentOverallHighestBid,
                                currentOverallHighestBidderId: overallHighestBidObject?.bidder_id ?? item.currentOverallHighestBidderId,
                              }
                            : item
                    )
                );
            }
          }
        }
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR') console.error('MyBidsPage RT Bids Channel Error:', err);
        else if (status === 'SUBSCRIBED') console.log('MyBidsPage RT Bids Channel Subscribed');
      });

    // 2. Listen for status changes on the listings this user has bid on
    const listingsChannel = supabase
      .channel(`my-bids-page-listings-feed-${user.id}`) // Unique channel name
      .on<ListingPayload>(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'listings',
          filter: `id=in.(${listingIdsUserBidOn.join(',')})`, // Filter for relevant listings
        },
        (payload) => {
          console.log('MyBidsPage RT: Listing update received!', payload);
          const updatedListing = payload.new;
          if (updatedListing && updatedListing.id) {
            setAllBidItems(prevItems =>
              prevItems.map(item =>
                item.listingId === updatedListing.id
                  ? {
                      ...item,
                      listingStatus: (updatedListing.status as MyBidDisplayItem['listingStatus']) || item.listingStatus,
                      listingWinningBidderId: updatedListing.winning_bidder_id === undefined ? item.listingWinningBidderId : updatedListing.winning_bidder_id,
                      listingEndTime: updatedListing.end_time === undefined ? item.listingEndTime : updatedListing.end_time,
                      // Re-evaluate if effectively ended based on new status/end_time
                      isEffectivelyEnded: (updatedListing.status === 'closed' || updatedListing.status === 'cancelled' || (updatedListing.end_time ? isPast(updatedListing.end_time) : item.isEffectivelyEnded)),
                    }
                  : item
              )
            );
          }
        }
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR') console.error('MyBidsPage RT Listings Channel Error:', err);
        else if (status === 'SUBSCRIBED') console.log('MyBidsPage RT Listings Channel Subscribed');
      });

    return () => {
      console.log("MyBidsPage RT: Cleaning up subscriptions");
      if (bidsChannel) supabase.removeChannel(bidsChannel).catch(console.error);
      if (listingsChannel) supabase.removeChannel(listingsChannel).catch(console.error);
    };
  }, [user, listingIdsUserBidOn, allBidItems]); // Added allBidItems to re-evaluate if needed for update logic

  // Countdown timer useEffect remains the same
  useEffect(() => {
    const intervalIds: NodeJS.Timeout[] = [];
    const itemsNeedingTimers = allBidItems.filter(item => item.listingStatus === 'active' && item.listingEndTime && !isPast(item.listingEndTime));
    if (itemsNeedingTimers.length > 0) {
      itemsNeedingTimers.forEach(item => {
        const updateTimer = () => {
          const countdownStr = formatCountdown(item.listingEndTime);
          setActiveCountdownTimers(prev => ({ ...prev, [item.listingId]: countdownStr }));
          if (countdownStr === null && item.listingId) { // Auction ended via timer
             setAllBidItems(prevItems => prevItems.map(prevItem => 
                prevItem.listingId === item.listingId ? {...prevItem, isEffectivelyEnded: true } : prevItem
             ));
             // Optionally, trigger a refetch for this specific item to get final status from DB
             // This might be useful if the backend close_auction function takes a moment
          }
        };
        updateTimer(); 
        const intervalId = setInterval(updateTimer, 1000); 
        intervalIds.push(intervalId);
      });
    }
    return () => { intervalIds.forEach(clearInterval); };
  }, [allBidItems]); // Depends on allBidItems to re-evaluate timers

  // useMemo for categorized items remains the same
  const { activeWinningItems, activeLosingItems, pastWonItems, pastLostItems } = useMemo(() => {
    // ... (same logic as before)
    if (!user) return { activeWinningItems: [], activeLosingItems: [], pastWonItems: [], pastLostItems: [] };
    const active = allBidItems.filter(item => !item.isEffectivelyEnded && item.listingStatus === 'active');
    const past = allBidItems.filter(item => item.isEffectivelyEnded || item.listingStatus === 'closed' || item.listingStatus === 'cancelled');
    const sortActive = (a: MyBidDisplayItem, b: MyBidDisplayItem) => (a.listingEndTime ? new Date(a.listingEndTime).getTime() : Infinity) - (b.listingEndTime ? new Date(b.listingEndTime).getTime() : Infinity);
    const sortPast = (a: MyBidDisplayItem, b: MyBidDisplayItem) => (b.listingEndTime ? new Date(b.listingEndTime).getTime() : 0) - (a.listingEndTime ? new Date(a.listingEndTime).getTime() : 0);
    
    return { 
        activeWinningItems: active.filter(i => i.currentOverallHighestBidderId === user.id).sort(sortActive), 
        activeLosingItems: active.filter(i => i.currentOverallHighestBidderId !== user.id).sort(sortActive), 
        pastWonItems: past.filter(i => i.listingStatus === 'closed' && i.listingWinningBidderId === user.id).sort(sortPast), 
        pastLostItems: past.filter(item => {
            if (item.listingStatus === 'cancelled') return true;
            if (item.listingStatus === 'closed') {
                return (item.listingWinningBidderId !== null && item.listingWinningBidderId !== user.id) || item.listingWinningBidderId === null;
            }
            return false; // Only include items that are explicitly lost or cancelled
        }).sort(sortPast)
    };
  }, [allBidItems, user]);

  // tabClass function remains the same
  const tabClass = (tab: ViewFilter): string => { /* ... same ... */ 
      const base = 'px-4 py-2 rounded-md text-sm font-medium transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900';
      return `${base} ${viewFilter === tab ? 'bg-indigo-600 text-white shadow-sm' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`;
  };

  // renderBidItemCard function remains the same
  const renderBidItemCard = (item: MyBidDisplayItem, cardType: 'active-winning' | 'active-losing' | 'past-won' | 'past-lost') => { /* ... same ... */ 
      let statusText = '';
      let statusColorClasses = '';

      if (cardType === 'active-winning') {
          statusText = '🎉 Winning';
          statusColorClasses = 'bg-green-100 dark:bg-green-700/30 text-green-700 dark:text-green-200 ring-green-600/20 dark:ring-green-500/30';
      } else if (cardType === 'active-losing') {
          statusText = '💔 Losing';
          statusColorClasses = 'bg-orange-100 dark:bg-orange-700/30 text-orange-700 dark:text-orange-200 ring-orange-600/20 dark:ring-orange-500/30';
      } else if (cardType === 'past-won') {
          statusText = '🏆 You Won!';
          statusColorClasses = 'bg-green-100 dark:bg-green-700/30 text-green-700 dark:text-green-200 ring-green-600/20 dark:ring-green-500/30';
      } else if (cardType === 'past-lost') {
          if (item.listingStatus === 'cancelled') {
              statusText = '🚫 Cancelled';
              statusColorClasses = 'bg-yellow-100 dark:bg-yellow-700/40 text-yellow-700 dark:text-yellow-200 ring-yellow-600/30 dark:ring-yellow-500/40';
          } else if (item.listingStatus === 'closed') {
              if (item.listingWinningBidderId && item.listingWinningBidderId !== user?.id) {
                  statusText = '💔 Not Won';
                  statusColorClasses = 'bg-red-100 dark:bg-red-700/30 text-red-700 dark:text-red-200 ring-red-600/30 dark:ring-red-500/30';
              } else if (!item.listingWinningBidderId) {
                  statusText = 'Ended (No Winner)';
                  statusColorClasses = 'bg-blue-100 dark:bg-blue-700/30 text-blue-700 dark:text-blue-200 ring-blue-600/30 dark:ring-blue-500/30';
              } else { // This case should ideally not happen if logic is correct (won items are in pastWonItems)
                  statusText = 'Auction Ended'; 
                  statusColorClasses = 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 ring-gray-500/20 dark:ring-gray-500/30';
              }
          } else { // Should not happen for 'past-lost' if status is not closed/cancelled
              statusText = item.listingStatus.charAt(0).toUpperCase() + item.listingStatus.slice(1);
              statusColorClasses = 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 ring-gray-500/20 dark:ring-gray-500/30';
          }
      }
      
      const timeToDisplay = !item.isEffectivelyEnded && item.listingStatus === 'active' && item.listingEndTime && !isPast(item.listingEndTime)
          ? activeCountdownTimers[item.listingId] || `Ends ${formatRelativeTime(item.listingEndTime)}`
          : item.listingEndTime ? `Ended ${formatRelativeTime(item.listingEndTime)}` : 'Ended';

      const thumbnailUrl = (item.listingPhotos && item.listingPhotos.length > 0) ? item.listingPhotos[0] : null;

      return (
          <li key={item.listingId} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 flex flex-col sm:flex-row gap-4 items-start">
            <div className="flex-shrink-0 w-full sm:w-[120px] h-[90px] bg-gray-100 dark:bg-gray-700 rounded-md overflow-hidden group relative">
              {thumbnailUrl ? (
                <Link href={`/listings/${item.listingId}`} aria-label={`View details for ${item.listingTitle}`}>
                  <Image src={thumbnailUrl} alt={`Cover for ${item.listingTitle}`} width={120} height={90} style={{ objectFit: 'cover' }} className="w-full h-full transition-transform duration-300 group-hover:scale-105" priority={false} onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder-image.svg'; }}/>
                </Link>
              ) : ( <Link href={`/listings/${item.listingId}`} className="w-full h-full flex items-center justify-center" aria-label={`View details for ${item.listingTitle}`}> <svg className="h-10 w-10 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> </Link> )}
            </div>
            <div className="flex-grow min-w-0">
              <Link href={`/listings/${item.listingId}`} className="text-lg font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 hover:underline block mb-2 break-words">{item.listingTitle}</Link>
              <div className="space-y-1.5 text-sm">
                <p className="text-gray-700 dark:text-gray-300">Your Highest Bid:{' '} <span className="font-semibold text-blue-700 dark:text-blue-400">{item.userHighestBidOnItem !== null ? formatCurrency(item.userHighestBidOnItem) : 'N/A'}</span></p>
                {(cardType === 'active-winning' || cardType === 'active-losing') && <p className="text-gray-700 dark:text-gray-300">Current Top Bid:{' '} <span className="font-semibold text-green-700 dark:text-green-400">{item.currentOverallHighestBid !== null ? formatCurrency(item.currentOverallHighestBid) : 'No bids yet'}</span></p>}
                {statusText && <p className="text-gray-700 dark:text-gray-300">Status:{' '} <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${statusColorClasses}`}>{statusText}</span></p>}
                {item.listingEndTime && <p className={`text-xs pt-1 ${!item.isEffectivelyEnded && item.listingStatus === 'active' && !isPast(item.listingEndTime) ? 'text-gray-600 dark:text-gray-300 font-medium' : 'text-gray-500 dark:text-gray-400'}`}> <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 inline-block mr-1 align-text-bottom opacity-70"><path fillRule="evenodd" d="M1 8a7 7 0 1 1 14 0A7 7 0 0 1 1 8Zm7.75-4.25a.75.75 0 0 0-1.5 0V8c0 .414.336.75.75.75h4.25a.75.75 0 0 0 0-1.5H8.5V3.75Z" clipRule="evenodd" /></svg> {timeToDisplay}</p>}
              </div>
            </div>
          </li>
      );
  };

  // Loading, error, and main return JSX remains the same
  if (loading) { return (<div className="max-w-4xl mx-auto p-4 sm:p-8"><h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-900 dark:text-gray-100 tracking-tight">My Bids</h1><LoadingSpinner message="Loading your bidding activity..." /></div>); }
  if (error) { return (<div className="max-w-4xl mx-auto p-4 sm:p-8"><h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-900 dark:text-gray-100 tracking-tight">My Bids</h1><div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-600/50 rounded-md text-red-700 dark:text-red-200 text-center">{error}</div></div>); }
  if (!user && !loading) { return (<div className="max-w-4xl mx-auto p-4 sm:p-8"><h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-900 dark:text-gray-100 tracking-tight">My Bids</h1><p className="text-center text-gray-600 dark:text-gray-400">Please{' '}<Link href="/auth?redirect=/my-bids" className="text-indigo-600 hover:text-indigo-500 underline">log in</Link>{' '}to view your bids.</p></div>); }

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
          <section><h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200 pb-2 border-b border-gray-200 dark:border-gray-700">Currently Winning</h2>{activeWinningItems.length > 0 ? ( <ul className="space-y-6">{activeWinningItems.map(item => renderBidItemCard(item, 'active-winning'))}</ul> ) : ( <EmptyState message="You are not currently winning any active auctions." className="py-6 text-sm" /> )}</section>
          <section><h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200 pb-2 border-b border-gray-200 dark:border-gray-700">Currently Losing</h2>{activeLosingItems.length > 0 ? ( <ul className="space-y-6">{activeLosingItems.map(item => renderBidItemCard(item, 'active-losing'))}</ul> ) : ( <EmptyState message="You are not currently outbid on any active auctions, or haven't bid yet." className="py-6 text-sm" /> )}</section>
        </div>
      )}

      {viewFilter === 'past' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 lg:gap-x-8 gap-y-8">
          <section><h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200 pb-2 border-b border-gray-200 dark:border-gray-700">Auctions Won</h2>{pastWonItems.length > 0 ? ( <ul className="space-y-6">{pastWonItems.map(item => renderBidItemCard(item, 'past-won'))}</ul> ) : ( <EmptyState message="You haven't won any past auctions yet." className="py-6 text-sm" /> )}</section>
          <section><h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200 pb-2 border-b border-gray-200 dark:border-gray-700">Auctions Lost or Cancelled</h2>{pastLostItems.length > 0 ? ( <ul className="space-y-6">{pastLostItems.map(item => renderBidItemCard(item, 'past-lost'))}</ul> ) : ( <EmptyState message="No past auctions where you didn't win, or auctions were cancelled." className="py-6 text-sm" /> )}</section>
        </div>
      )}

       {allBidItems.length === 0 && !loading && (<EmptyState message="You haven't placed any bids yet. Time to find some treasures!" action={{ href: '/listings', text: 'Browse Listings' }} className="mt-8" />)}
    </div>
  );
}