// src/app/my-bids/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase, type User } from '@/lib/supabaseClient';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import { formatCurrency } from '@/lib/formatUtils';

/* ---------- Types -------------------------------------------------- */
type MyBidDisplayItem = {
  listingId: string;
  listingTitle: string;
  listingEndTime: string | null;
  userHighestBid: number;
  currentHighestBid: number;
  isUserWinning: boolean;
  listingPhoto: string | null;
};

type RawBid = {
  id: string;
  item_id: string;
  bidder_id: string;
  bid_price: number;
};

/* ---------- Component --------------------------------------------- */
export default function MyBidsPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [bidItems, setBidItems] = useState<MyBidDisplayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* ---------- Fetch my bids --------------------------------------- */
  useEffect(() => {
    const fetchMyBids = async () => {
      setLoading(true);
      setError(null);
      setBidItems([]);

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData?.user) {
        router.push('/auth');
        return;
      }

      const currentUser = userData.user;
      setUser(currentUser);

      try {
        // 1. user’s bids
        const { data: userBidsData, error: userBidsError } = await supabase
          .from('bids')
          .select('id, item_id, bidder_id, bid_price')
          .eq('bidder_id', currentUser.id);

        if (userBidsError) throw userBidsError;
        if (!userBidsData?.length) {
          setLoading(false);
          return;
        }

        // 2. unique listing IDs
        const listingIds = [...new Set(userBidsData.map((b) => b.item_id))];
        if (!listingIds.length) {
          setLoading(false);
          return;
        }

        // 3. listing details
        const { data: listingsData, error: listingsError } = await supabase
          .from('listings')
          .select('id, title, end_time, photos')
          .in('id', listingIds);

        if (listingsError) throw listingsError;

        // 4. all bids for those listings
        const { data: allBidsData, error: allBidsError } = await supabase
          .from('bids')
          .select('id, item_id, bidder_id, bid_price')
          .in('item_id', listingIds)
          .order('bid_price', { ascending: false });

        if (allBidsError) throw allBidsError;

        /* -------- Combine data ------------------------------------ */
        const processed: MyBidDisplayItem[] = [];

        const listingsMap = new Map(listingsData?.map((l) => [l.id, l]));
        const allBidsMap = new Map<string, RawBid[]>();

        allBidsData?.forEach((b) => {
          if (!allBidsMap.has(b.item_id)) allBidsMap.set(b.item_id, []);
          allBidsMap.get(b.item_id)!.push(b as RawBid);
        });

        for (const listingId of listingIds) {
          const listing = listingsMap.get(listingId);
          if (!listing) continue;

          const userBidsForItem = userBidsData.filter(
            (b) => b.item_id === listingId,
          );
          const userHighestBid = Math.max(
            ...userBidsForItem.map((b) => b.bid_price),
            0,
          );

          const bidsForItem = allBidsMap.get(listingId) ?? [];
          const currentHighestBid = bidsForItem[0]?.bid_price ?? 0;
          const highestBidderId = bidsForItem[0]?.bidder_id ?? '';

          processed.push({
            listingId: listing.id,
            listingTitle: listing.title,
            listingEndTime: listing.end_time,
            userHighestBid,
            currentHighestBid,
            isUserWinning:
              currentHighestBid > 0 && highestBidderId === currentUser.id,
            listingPhoto: listing.photos,
          });
        }

        processed.sort((a, b) => a.listingTitle.localeCompare(b.listingTitle));
        setBidItems(processed);
      } catch (err) {
        console.error('Error fetching bid data:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to load your bids.',
        );
      } finally {
        setLoading(false);
      }
    };

    fetchMyBids();
  }, [router]);

  /* ---------- Render guards --------------------------------------- */
  if (loading)
    return (
      <div className="max-w-4xl mx-auto p-4 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-800 dark:text-gray-100">
          My Bids
        </h1>
        <LoadingSpinner />
      </div>
    );

  if (error)
    return (
      <div className="max-w-4xl mx-auto p-4 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-800 dark:text-gray-100">
          My Bids
        </h1>
        <p className="text-center text-red-600">{`Error loading bids: ${error}`}</p>
      </div>
    );

  if (!user)
    return (
      <div className="max-w-4xl mx-auto p-4 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-800 dark:text-gray-100">
          My Bids
        </h1>
        <p className="text-center text-gray-600 dark:text-gray-400">
          Please{' '}
          <Link href="/auth" className="text-indigo-600 underline">
            log in
          </Link>{' '}
          to view your bids.
        </p>
      </div>
    );

  /* ---------- Main JSX -------------------------------------------- */
  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-8">
      <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-800 dark:text-gray-100">
        My Bids
      </h1>

      {bidItems.length === 0 ? (
        <EmptyState
          message="You haven't placed any bids yet."
          action={{ href: '/listings', text: 'Browse Listings' }}
        />
      ) : (
        <ul className="space-y-6">
          {bidItems.map((item) => (
            <li
              key={item.listingId}
              className="border border-gray-200 dark:border-gray-700 p-4 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 flex flex-col sm:flex-row gap-4 items-start bg-white dark:bg-gray-800"
            >
              {/* image */}
              {item.listingPhoto && (
                <Link
                  href={`/listings/${item.listingId}`}
                  className="flex-shrink-0 block"
                >
                  <div className="w-full sm:w-[120px] h-[120px] sm:h-[80px] bg-gray-100 dark:bg-gray-700 rounded overflow-hidden group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.listingPhoto}
                      alt={`Cover image for ${item.listingTitle}`}
                      className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
                    />
                  </div>
                </Link>
              )}

              {/* details */}
              <div className="flex-grow">
                <Link
                  href={`/listings/${item.listingId}`}
                  className="text-lg font-semibold text-indigo-600 hover:text-indigo-800 hover:underline block mb-2"
                >
                  {item.listingTitle}
                </Link>

                <div className="space-y-1 text-sm">
                  <p>
                    Your Highest Bid:{' '}
                    <span className="font-medium text-blue-700 dark:text-blue-400">
                      {formatCurrency(item.userHighestBid)}
                    </span>
                  </p>
                  <p>
                    Current Highest Bid:{' '}
                    <span className="font-medium text-green-700 dark:text-green-400">
                      {formatCurrency(item.currentHighestBid)}
                    </span>
                  </p>

                  <div>
                    Status:{' '}
                    {item.isUserWinning ? (
                      <span className="font-medium text-green-600 dark:text-green-300 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full text-xs">
                        🎉 Winning
                      </span>
                    ) : (
                      <span className="font-medium text-orange-600 dark:text-orange-300 bg-orange-100 dark:bg-orange-900/30 px-2 py-0.5 rounded-full text-xs">
                        Losing
                      </span>
                    )}
                  </div>

                  {item.listingEndTime && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 pt-1">
                      Auction Ends:{' '}
                      {new Date(item.listingEndTime).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
