// src/app/my-bids/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { supabase, type User } from '@/lib/supabaseClient';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import { formatCurrency } from '@/lib/formatUtils';
import { formatRelativeTime, formatCountdown, isPast } from '@/lib/timeUtils';

// ---------- Types --------------------------------------------------
// Type for the combined data we'll construct for each bid item card
type MyBidDisplayItem = {
  listingId: string;
  listingTitle: string;
  listingPhoto: string | null;
  listingEndTime: string | null;
  listingStatus: 'active' | 'closed' | 'cancelled';
  listingWinningBidderId: string | null; // Who won if closed
  userHighestBidOnItem: number | null; // User's max bid on this item
  currentOverallHighestBid: number | null; // Overall highest bid on this item
  currentOverallHighestBidderId: string | null; // Bidder of the overall highest bid
};

// Raw listing type from DB
type RawListing = {
    id: string;
    title: string;
    photos: string | null;
    end_time: string | null;
    status: 'active' | 'closed' | 'cancelled';
    winning_bidder_id: string | null;
};

// Raw bid type from DB
type RawBid = {
    item_id: string;
    bidder_id: string;
    bid_price: number;
};


// ---------- Component ---------------------------------------------
export default function MyBidsPage() {
  const router = useRouter();

  // --- State ---
  const [user, setUser] = useState<User | null>(null);
  const [bidItems, setBidItems] = useState<MyBidDisplayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCountdownTimers, setActiveCountdownTimers] = useState<Record<string, string | null>>({});


  // --- Data Fetching (Iterative Approach) ---
  const fetchMyBidData = useCallback(async (currentUser: User) => {
    setLoading(true);
    setError(null);
    setBidItems([]);

    try {
      // 1. Fetch distinct listing IDs the user has bid on using the RPC function
      console.log("Fetching distinct listing IDs for user:", currentUser.id);
      const { data: distinctListingIdsData, error: rpcError } = await supabase.rpc(
        'get_distinct_listing_ids_for_bidder',
        { p_bidder_id: currentUser.id }
      );

      if (rpcError) throw new Error(`Failed to get distinct listing IDs: ${rpcError.message}`);
      if (!distinctListingIdsData || distinctListingIdsData.length === 0) {
        console.log("User has not bid on any items.");
        setLoading(false);
        return;
      }

      const listingIds: string[] = distinctListingIdsData.map((row: {item_id: string}) => row.item_id);
      console.log("Distinct listing IDs user bid on:", listingIds);

      // 2. Fetch details for these listings
      console.log("Fetching listing details for IDs:", listingIds);
      const { data: listingsData, error: listingsError } = await supabase
        .from('listings')
        .select('id, title, photos, end_time, status, winning_bidder_id')
        .in('id', listingIds)
        .returns<RawListing[]>(); // Ensure correct typing for fetched data

      if (listingsError) throw new Error(`Failed to fetch listing details: ${listingsError.message}`);
      if (!listingsData) {
          console.warn("No listing data returned for the given IDs.");
          setLoading(false);
          return;
      }
      console.log("Fetched listing details:", listingsData);


      // 3. Fetch ALL bids for these listings to determine:
      //    a) User's highest bid on each item
      //    b) Overall highest bid on each item
      console.log("Fetching all bids for relevant listings:", listingIds);
      const { data: allBidsForListings, error: allBidsError } = await supabase
        .from('bids')
        .select('item_id, bidder_id, bid_price')
        .in('item_id', listingIds)
        .order('bid_price', { ascending: false }) // Important for easily finding highest bids
        .returns<RawBid[]>();

      if (allBidsError) throw new Error(`Failed to fetch all bids: ${allBidsError.message}`);
      if (!allBidsForListings) {
          console.warn("No bid data returned for the listings.");
          // We can still proceed if some listings had no bids, but data might be partial.
      }
      console.log("Fetched all bids for relevant listings:", allBidsForListings);


      // 4. Process and combine data
      const processedItems: MyBidDisplayItem[] = [];
      const listingsMap = new Map(listingsData.map(l => [l.id, l]));

      for (const listingId of listingIds) {
        const listing = listingsMap.get(listingId);
        if (!listing) {
            console.warn(`Skipping listing ID ${listingId} as no details were found.`);
            continue;
        }

        // Filter bids for the current listing
        const bidsOnThisItem = allBidsForListings?.filter(b => b.item_id === listingId) || [];

        // Find user's highest bid on this item
        const userBidsOnThisItem = bidsOnThisItem.filter(b => b.bidder_id === currentUser.id);
        const userHighestBid = userBidsOnThisItem.length > 0
          ? Math.max(...userBidsOnThisItem.map(b => b.bid_price))
          : null;

        // Find overall highest bid on this item
        // Since `allBidsForListings` is ordered by `bid_price` descending, the first bid for this item_id is the highest.
        const overallHighestBidObject = bidsOnThisItem[0]; // First element is highest if array is sorted
        const overallHighestBid = overallHighestBidObject?.bid_price || null;
        const overallHighestBidderId = overallHighestBidObject?.bidder_id || null;


        processedItems.push({
          listingId: listing.id,
          listingTitle: listing.title,
          listingPhoto: listing.photos,
          listingEndTime: listing.end_time,
          listingStatus: listing.status,
          listingWinningBidderId: listing.winning_bidder_id,
          userHighestBidOnItem: userHighestBid,
          currentOverallHighestBid: overallHighestBid,
          currentOverallHighestBidderId: overallHighestBidderId,
        });
      }

      // Sort by end time (soonest ending first, then active, then closed)
      processedItems.sort((a, b) => {
          if (a.listingStatus === 'active' && b.listingStatus !== 'active') return -1;
          if (a.listingStatus !== 'active' && b.listingStatus === 'active') return 1;
          const timeA = a.listingEndTime ? new Date(a.listingEndTime).getTime() : Infinity;
          const timeB = b.listingEndTime ? new Date(b.listingEndTime).getTime() : Infinity;
          return timeA - timeB;
      });


      console.log("Processed bid items:", processedItems);
      setBidItems(processedItems);

    } catch (err) {
      console.error('Error in fetchMyBidData:', err);
      setError(
        err instanceof Error ? `Failed to load your bids: ${err.message}` : 'An unknown error occurred.'
      );
    } finally {
      setLoading(false);
    }
  // Add currentUser.id to dependencies if you want to refetch on user change (though page usually reloads)
  }, [router]); // Removed currentUser from deps, page will reload if user changes significantly


  useEffect(() => {
    supabase.auth.getUser().then(({ data: userData, error: userError }) => {
      if (userError || !userData?.user) {
        router.push('/auth?redirect=/my-bids');
        return;
      }
      setUser(userData.user);
      fetchMyBidData(userData.user); // Pass current user to fetch function
    });
  }, [router, fetchMyBidData]); // fetchMyBidData is now memoized with useCallback


  // --- Countdown Timer Logic (same as before) ---
  useEffect(() => {
    const intervalIds: NodeJS.Timeout[] = [];
    const activeAuctionItems = bidItems.filter(
      item => item.listingStatus === 'active' && item.listingEndTime && !isPast(item.listingEndTime)
    );

    if (activeAuctionItems.length > 0) {
      activeAuctionItems.forEach(item => {
        const updateTimer = () => {
          const countdownStr = formatCountdown(item.listingEndTime);
          setActiveCountdownTimers(prev => ({ ...prev, [item.listingId]: countdownStr }));
        };
        updateTimer();
        const intervalId = setInterval(updateTimer, 1000);
        intervalIds.push(intervalId);
      });
    }
    return () => {
      intervalIds.forEach(clearInterval);
    };
  }, [bidItems]);


  // --- Render Guards (same as before, with slight text adjustments) ---
  if (loading) {
    return (
      <div className="max-w-3xl mx-auto p-4 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-900 dark:text-gray-100 tracking-tight">
          My Bids
        </h1>
        <LoadingSpinner message="Loading your bidding activity..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto p-4 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-900 dark:text-gray-100 tracking-tight">
          My Bids
        </h1>
        <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-600/50 rounded-md text-red-700 dark:text-red-200 text-center">
          {error}
        </div>
      </div>
    );
  }

   if (!user && !loading) {
    return (
      <div className="max-w-3xl mx-auto p-4 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-900 dark:text-gray-100 tracking-tight">
          My Bids
        </h1>
        <p className="text-center text-gray-600 dark:text-gray-400">
          Please{' '}
          <Link href="/auth?redirect=/my-bids" className="text-indigo-600 hover:text-indigo-500 underline">
            log in
          </Link>{' '}
          to view your bids.
        </p>
      </div>
    );
  }


  // --- Main JSX (Structure largely the same, logic for status/time display adapted) ---
  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8">
      <h1 className="text-2xl sm:text-3xl font-bold mb-6 sm:mb-8 text-gray-900 dark:text-gray-100 tracking-tight pb-4 border-b border-gray-200 dark:border-gray-700">
        My Bids
      </h1>

      {bidItems.length === 0 ? (
        <EmptyState
          message="You haven't placed any bids yet. Time to find some treasures!"
          action={{ href: '/listings', text: 'Browse Listings' }}
        />
      ) : (
        <ul className="space-y-6">
          {bidItems.map((item) => {
            let statusText = '';
            let statusColorClasses = '';
            const auctionIsEffectivelyEnded = item.listingStatus === 'closed' || item.listingStatus === 'cancelled' || (item.listingEndTime ? isPast(item.listingEndTime) : false);

            if (item.listingStatus === 'cancelled') {
                statusText = 'Auction Cancelled';
                statusColorClasses = 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 ring-gray-500/20 dark:ring-gray-500/30';
            } else if (item.listingStatus === 'closed') {
                if (item.listingWinningBidderId === user?.id) { // Compare with current user's ID
                    statusText = '🎉 You Won!';
                    statusColorClasses = 'bg-green-100 dark:bg-green-800/50 text-green-700 dark:text-green-200 ring-green-600/20 dark:ring-green-500/30';
                } else {
                    statusText = 'Auction Ended (Not Won)';
                    statusColorClasses = 'bg-red-100 dark:bg-red-800/50 text-red-700 dark:text-red-200 ring-red-600/20 dark:ring-red-500/30';
                }
            } else if (item.listingStatus === 'active') {
                if (item.userHighestBidOnItem === null) {
                    statusText = 'Error: Bid data missing'; // Should ideally not happen
                    statusColorClasses = 'bg-yellow-100 dark:bg-yellow-800/50 text-yellow-700 dark:text-yellow-200 ring-yellow-600/20 dark:ring-yellow-500/30';
                } else if (item.currentOverallHighestBidderId === user?.id) { // Compare with current user's ID
                    statusText = '🎉 Winning';
                    statusColorClasses = 'bg-green-100 dark:bg-green-800/50 text-green-700 dark:text-green-200 ring-green-600/20 dark:ring-green-500/30';
                } else {
                    statusText = '💔 Losing';
                    statusColorClasses = 'bg-orange-100 dark:bg-orange-800/50 text-orange-700 dark:text-orange-200 ring-orange-600/20 dark:ring-orange-500/30';
                }
            }

            const timeToDisplay = auctionIsEffectivelyEnded
                ? formatRelativeTime(item.listingEndTime)
                : activeCountdownTimers[item.listingId] || formatRelativeTime(item.listingEndTime);


            return (
              <li
                key={item.listingId} // Use listingId as key
                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 flex flex-col sm:flex-row gap-4 items-start"
              >
                {item.listingPhoto && (
                  <Link href={`/listings/${item.listingId}`} className="flex-shrink-0 block w-full sm:w-auto" aria-label={`View details for ${item.listingTitle}`}>
                    <div className="relative w-full h-32 sm:w-[120px] sm:h-[90px] bg-gray-100 dark:bg-gray-700 rounded-md overflow-hidden group">
                      <Image
                        src={item.listingPhoto}
                        alt={`Cover image for ${item.listingTitle}`}
                        width={120}
                        height={90}
                        style={{ objectFit: 'cover' }}
                        className="w-full h-full transition-transform duration-300 group-hover:scale-105"
                      />
                    </div>
                  </Link>
                )}
                <div className="flex-grow">
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
                        {/* Handle null case for userHighestBidOnItem, though unlikely if they bid */}
                        {item.userHighestBidOnItem !== null ? formatCurrency(item.userHighestBidOnItem) : 'N/A'}
                      </span>
                    </p>
                    <p className="text-gray-700 dark:text-gray-300">
                      Current Top Bid:{' '}
                      <span className="font-semibold text-green-700 dark:text-green-400">
                        {/* Handle null case for currentOverallHighestBid */}
                        {item.currentOverallHighestBid !== null ? formatCurrency(item.currentOverallHighestBid) : 'No bids yet'}
                      </span>
                    </p>
                    {statusText && (
                        <p className="text-gray-700 dark:text-gray-300">
                            Status:{' '}
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${statusColorClasses}`}>
                                {statusText}
                            </span>
                        </p>
                    )}
                    {item.listingEndTime && (
                      <p className={`text-xs pt-1 ${auctionIsEffectivelyEnded ? 'text-gray-500 dark:text-gray-400' : 'text-gray-600 dark:text-gray-300 font-medium'}`}>
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
          })}
        </ul>
      )}
    </div>
  );
}