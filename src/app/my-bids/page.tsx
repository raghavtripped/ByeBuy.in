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

/* -------------------------------------------------------------------------- */
/*  Helper – parse photo JSON                                                 */
/* -------------------------------------------------------------------------- */
const parsePhotosJson = (
  photosInput: string | string[] | null | undefined
): string[] | null => {
  if (photosInput == null) return null;
  if (Array.isArray(photosInput))
    return photosInput.every((i) => typeof i === 'string') ? photosInput : null;

  if (typeof photosInput === 'string') {
    try {
      const parsed = JSON.parse(photosInput);
      return Array.isArray(parsed) && parsed.every((i) => typeof i === 'string')
        ? parsed
        : null;
    } catch (err) {
      console.error('Failed to parse photos JSON string:', photosInput, err);
      return null;
    }
  }
  return null;
};

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */
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
  id: string;
  item_id: string;
  bidder_id: string;
  bid_price: number;
  timestamp: string;
};

type ViewFilter = 'active' | 'past';

type ListingPayload = Partial<RawListingFromDB> & { id: string };
type BidPayload = Partial<RawBid> & { id: string; item_id: string };

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */
export default function MyBidsPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [allBidItems, setAllBidItems] = useState<MyBidDisplayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCountdownTimers, setActiveCountdownTimers] = useState<
    Record<string, string | null>
  >({});
  const [viewFilter, setViewFilter] = useState<ViewFilter>('active');
  const [listingIdsUserBidOn, setListingIdsUserBidOn] = useState<string[]>([]);

  /* --------------------------- fetch cur user + data ------------------- */
  const fetchMyBidData = useCallback(
    async (currentUser: User) => {
      setLoading(true);
      setError(null);
      setAllBidItems([]);
      setListingIdsUserBidOn([]);

      try {
        /* ----- listing IDs user has bid on (via RPC) ------------------- */
        const { data: listingIdRows, error: rpcError } = await supabase.rpc(
          'get_distinct_listing_ids_for_bidder',
          { p_bidder_id: currentUser.id }
        );
        if (rpcError) throw new Error(`RPC Error: ${rpcError.message}`);
        if (!listingIdRows || listingIdRows.length === 0) {
          setLoading(false);
          return;
        }

        const fetchedListingIds = listingIdRows.map(
          (row: { item_id: string }) => row.item_id
        );
        setListingIdsUserBidOn(fetchedListingIds);

        /* ----- basic listing info ------------------------------------- */
        const { data: listingsDataRaw, error: listingsError } = await supabase
          .from('listings')
          .select(
            'id, title, photos, end_time, status, winning_bidder_id'
          )
          .in('id', fetchedListingIds)
          .returns<RawListingFromDB[]>();

        if (listingsError)
          throw new Error(`Listings Fetch Error: ${listingsError.message}`);

        const listingsData = (listingsDataRaw || []).map((l) => ({
          ...l,
          photos: parsePhotosJson(l.photos),
        }));
        const listingsMap = new Map(listingsData.map((l) => [l.id, l]));

        /* ----- all bids for those listings ---------------------------- */
        const { data: bidsRaw, error: bidsError } = await supabase
          .from('bids')
          .select('id, item_id, bidder_id, bid_price, timestamp')
          .in('item_id', fetchedListingIds)
          .order('bid_price', { ascending: false })
          .order('timestamp', { ascending: true })
          .returns<RawBid[]>();

        if (bidsError)
          throw new Error(`Bids Fetch Error: ${bidsError.message}`);
        const bids = bidsRaw || [];

        /* ----- build display items ------------------------------------ */
        const processed: MyBidDisplayItem[] = [];

        for (const listingId of fetchedListingIds) {
          const listing = listingsMap.get(listingId);
          if (!listing) continue;

          const bidsOnItem = bids.filter((b) => b.item_id === listingId);
          bidsOnItem.sort(
            (a, b) =>
              b.bid_price - a.bid_price ||
              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );

          const userBids = bidsOnItem.filter(
            (b) => b.bidder_id === currentUser.id
          );
          const userHighest = userBids.length
            ? Math.max(...userBids.map((b) => b.bid_price))
            : null;

          const overallHighest = bidsOnItem[0];

          processed.push({
            listingId: listing.id,
            listingTitle: listing.title,
            listingPhotos: listing.photos,
            listingEndTime: listing.end_time,
            listingStatus: listing.status as MyBidDisplayItem['listingStatus'],
            listingWinningBidderId: listing.winning_bidder_id,
            userHighestBidOnItem: userHighest,
            currentOverallHighestBid: overallHighest?.bid_price ?? null,
            currentOverallHighestBidderId: overallHighest?.bidder_id ?? null,
            isEffectivelyEnded:
              listing.status === 'closed' ||
              listing.status === 'cancelled' ||
              (listing.end_time ? isPast(listing.end_time) : false),
          });
        }

        setAllBidItems(processed);
      } catch (err) {
        console.error('Error in fetchMyBidData:', err);
        setError(
          err instanceof Error
            ? `Failed to load your bids: ${err.message}`
            : 'An unknown error occurred.'
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /* -------------------------- initial load ---------------------------- */
  useEffect(() => {
    supabase.auth
      .getUser()
      .then(({ data, error }) => {
        if (error || !data?.user) {
          router.push('/auth?redirect=/my-bids');
          return;
        }
        setUser(data.user);
        fetchMyBidData(data.user);
      })
      .catch(console.error);
  }, [router, fetchMyBidData]);

  /* ----------------------- realtime subscriptions --------------------- */
  useEffect(() => {
    if (!user || listingIdsUserBidOn.length === 0) return;

    console.log(
      'MyBidsPage RT: Subscribing to listings:',
      listingIdsUserBidOn.join(', ')
    );

    /* ----- bids channel --------------------------------------------- */
    const bidsChannel = supabase
      .channel(`my-bids-bids-${user.id}`)
      .on<BidPayload>(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'bids',
          filter: `item_id=in.(${listingIdsUserBidOn.join(',')})`,
        },
        async (payload) => {
          console.log('MyBids RT: new bid', payload);
          const bid = payload.new;
          if (!bid?.item_id) return;

          /* refresh highest bid for that item ------------------------ */
          const { data: latestBids, error } = await supabase
            .from('bids')
            .select('bidder_id, bid_price, timestamp')
            .eq('item_id', bid.item_id)
            .order('bid_price', { ascending: false })
            .order('timestamp', { ascending: true });

          if (error) {
            console.error('MyBids RT: fetch latest bids error', error);
            return;
          }

          const highest = latestBids?.[0];
          setAllBidItems((prev) =>
            prev.map((it) =>
              it.listingId === bid.item_id
                ? {
                    ...it,
                    currentOverallHighestBid: highest?.bid_price ?? it.currentOverallHighestBid,
                    currentOverallHighestBidderId: highest?.bidder_id ?? it.currentOverallHighestBidderId,
                  }
                : it
            )
          );
        }
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR')
          console.error('MyBids RT bids channel err', err);
      });

    /* ----- listings channel ----------------------------------------- */
    const listingsChannel = supabase
      .channel(`my-bids-listings-${user.id}`)
      .on<ListingPayload>(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'listings',
          filter: `id=in.(${listingIdsUserBidOn.join(',')})`,
        },
        (payload) => {
          const upd = payload.new;
          if (!upd?.id) return;

          setAllBidItems((prev) =>
            prev.map((item) =>
              item.listingId === upd.id
                ? {
                    ...item,
                    listingStatus:
                      (upd.status as MyBidDisplayItem['listingStatus']) ??
                      item.listingStatus,
                    listingWinningBidderId:
                      upd.winning_bidder_id !== undefined
                        ? upd.winning_bidder_id
                        : item.listingWinningBidderId,
                    listingEndTime:
                      upd.end_time ?? item.listingEndTime,
                    isEffectivelyEnded:
                      upd.status === 'closed' ||
                      upd.status === 'cancelled' ||
                      (upd.end_time ? isPast(upd.end_time) : item.isEffectivelyEnded),
                  }
                : item
            )
          );
        }
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR')
          console.error('MyBids RT listings channel err', err);
      });

    return () => {
      supabase.removeChannel(bidsChannel).catch(console.error);
      supabase.removeChannel(listingsChannel).catch(console.error);
    };
  }, [user, listingIdsUserBidOn]);

  /* ------------------------ countdown timers -------------------------- */
  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];

    const liveItems = allBidItems.filter(
      (i) =>
        i.listingStatus === 'active' &&
        i.listingEndTime &&
        !isPast(i.listingEndTime)
    );

    liveItems.forEach((item) => {
      const tick = () => {
        const str = formatCountdown(item.listingEndTime);
        setActiveCountdownTimers((prev) => ({ ...prev, [item.listingId]: str }));
        if (str === null) {
          setAllBidItems((prev) =>
            prev.map((it) =>
              it.listingId === item.listingId
                ? { ...it, isEffectivelyEnded: true }
                : it
            )
          );
        }
      };
      tick();
      timers.push(setInterval(tick, 1000));
    });

    return () => timers.forEach(clearInterval);
  }, [allBidItems]);

  /* ------------------------ categorize items -------------------------- */
  const {
    activeWinningItems,
    activeLosingItems,
    pastWonItems,
    pastLostItems,
  } = useMemo(() => {
    if (!user)
      return {
        activeWinningItems: [],
        activeLosingItems: [],
        pastWonItems: [],
        pastLostItems: [],
      };

    const active = allBidItems.filter(
      (i) => !i.isEffectivelyEnded && i.listingStatus === 'active'
    );
    const past = allBidItems.filter(
      (i) =>
        i.isEffectivelyEnded ||
        i.listingStatus === 'closed' ||
        i.listingStatus === 'cancelled'
    );

    const sortActive = (a: MyBidDisplayItem, b: MyBidDisplayItem) =>
      (a.listingEndTime ? new Date(a.listingEndTime).getTime() : Infinity) -
      (b.listingEndTime ? new Date(b.listingEndTime).getTime() : Infinity);

    const sortPast = (a: MyBidDisplayItem, b: MyBidDisplayItem) =>
      (b.listingEndTime ? new Date(b.listingEndTime).getTime() : 0) -
      (a.listingEndTime ? new Date(a.listingEndTime).getTime() : 0);

    return {
      activeWinningItems: active
        .filter((i) => i.currentOverallHighestBidderId === user.id)
        .sort(sortActive),
      activeLosingItems: active
        .filter((i) => i.currentOverallHighestBidderId !== user.id)
        .sort(sortActive),
      pastWonItems: past
        .filter(
          (i) =>
            i.listingStatus === 'closed' && i.listingWinningBidderId === user.id
        )
        .sort(sortPast),
      pastLostItems: past
        .filter((i) => {
          if (i.listingStatus === 'cancelled') return true;
          if (i.listingStatus === 'closed') {
            if (
              i.listingWinningBidderId &&
              i.listingWinningBidderId !== user.id
            )
              return true;
            if (i.listingWinningBidderId === null) return true;
          }
          return false;
        })
        .sort(sortPast),
    };
  }, [allBidItems, user]);

  /* ----------------------------- helpers ------------------------------ */
  const tabClass = (tab: ViewFilter): string => {
    const base =
      'px-4 py-2 rounded-md text-sm font-medium transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-bye-dark-bg-primary';
    const active =
      'bg-indigo-600 dark:bg-indigo-500 text-white shadow-sm';
    const inactive =
      'bg-gray-100 dark:bg-bye-dark-bg-hover text-gray-700 dark:text-bye-dark-text-secondary hover:bg-gray-200 dark:hover:bg-bye-dark-bg-hover/75';
    return `${base} ${viewFilter === tab ? active : inactive}`;
  };

  /* ----------------------- card renderer ------------------------------ */
  const renderBidItemCard = (
    item: MyBidDisplayItem,
    cardType:
      | 'active-winning'
      | 'active-losing'
      | 'past-won'
      | 'past-lost'
  ) => {
    /* badge styles ---------------------------------------------------- */
    let statusText = '';
    let statusColorClasses = '';

    if (cardType === 'active-winning') {
      statusText = '🎉 Winning';
      statusColorClasses =
        'bg-green-100 dark:bg-green-900/25 text-green-700 dark:text-green-300 ring-green-600/20 dark:ring-green-500/30';
    } else if (cardType === 'active-losing') {
      statusText = '💔 Losing';
      statusColorClasses =
        'bg-orange-100 dark:bg-orange-900/25 text-orange-700 dark:text-orange-300 ring-orange-600/20 dark:ring-orange-500/30';
    } else if (cardType === 'past-won') {
      statusText = '🏆 You Won!';
      statusColorClasses =
        'bg-green-100 dark:bg-green-900/25 text-green-700 dark:text-green-300 ring-green-600/20 dark:ring-green-500/30';
    } else if (cardType === 'past-lost') {
      if (item.listingStatus === 'cancelled') {
        statusText = '🚫 Cancelled';
        statusColorClasses =
          'bg-yellow-100 dark:bg-yellow-900/25 text-yellow-700 dark:text-yellow-300 ring-yellow-600/30 dark:ring-yellow-500/30';
      } else if (item.listingStatus === 'closed') {
        if (
          item.listingWinningBidderId &&
          item.listingWinningBidderId !== user?.id
        ) {
          statusText = '💔 Not Won';
          statusColorClasses =
            'bg-red-100 dark:bg-red-900/25 text-red-700 dark:text-red-300 ring-red-600/30 dark:ring-red-500/30';
        } else if (!item.listingWinningBidderId) {
          statusText = 'Ended (No Winner)';
          statusColorClasses =
            'bg-blue-100 dark:bg-blue-900/25 text-blue-700 dark:text-blue-300 ring-blue-600/30 dark:ring-blue-500/30';
        } else {
          statusText = 'Auction Ended';
          statusColorClasses =
            'bg-gray-100 dark:bg-bye-dark-bg-hover text-gray-600 dark:text-bye-dark-text-secondary ring-gray-500/20 dark:ring-bye-dark-border-primary/30';
        }
      }
    }

    /* time display ---------------------------------------------------- */
    const timeToDisplay =
      !item.isEffectivelyEnded &&
      item.listingStatus === 'active' &&
      item.listingEndTime &&
      !isPast(item.listingEndTime)
        ? activeCountdownTimers[item.listingId] ??
          `Ends ${formatRelativeTime(item.listingEndTime)}`
        : item.listingEndTime
        ? `Ended ${formatRelativeTime(item.listingEndTime)}`
        : 'Ended';

    const thumbnail =
      item.listingPhotos && item.listingPhotos.length
        ? item.listingPhotos[0]
        : null;

    return (
      <li
        key={item.listingId}
        className="bg-white dark:bg-bye-dark-bg-secondary border border-gray-200 dark:border-bye-dark-border-primary p-4 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 flex flex-col sm:flex-row gap-4 items-start"
      >
        {/* image ------------------------------------------------------ */}
        <div className="flex-shrink-0 w-full sm:w-[120px] h-[90px] bg-gray-100 dark:bg-bye-dark-bg-hover rounded-md overflow-hidden group relative">
          {thumbnail ? (
            <Link
              href={`/listings/${item.listingId}`}
              aria-label={`View details for ${item.listingTitle}`}
            >
              <Image
                src={thumbnail}
                alt={`Cover for ${item.listingTitle}`}
                width={120}
                height={90}
                style={{ objectFit: 'cover' }}
                className="w-full h-full transition-transform duration-300 group-hover:scale-105"
                priority={false}
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    '/placeholder-image.svg';
                }}
              />
            </Link>
          ) : (
            <Link
              href={`/listings/${item.listingId}`}
              className="w-full h-full flex items-center justify-center"
              aria-label={`View details for ${item.listingTitle}`}
            >
              <svg
                className="h-10 w-10 text-gray-400 dark:text-bye-dark-text-secondary/60"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2 1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </Link>
          )}
        </div>

        {/* details ---------------------------------------------------- */}
        <div className="flex-grow min-w-0">
          <Link
            href={`/listings/${item.listingId}`}
            className="text-lg font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 hover:underline block mb-2 break-words"
          >
            {item.listingTitle}
          </Link>

          <div className="space-y-1.5 text-sm">
            <p className="text-gray-700 dark:text-bye-dark-text-primary">
              Your Highest Bid:{' '}
              <span className="font-semibold text-blue-700 dark:text-blue-400">
                {item.userHighestBidOnItem !== null
                  ? formatCurrency(item.userHighestBidOnItem)
                  : 'N/A'}
              </span>
            </p>

            {(cardType === 'active-winning' ||
              cardType === 'active-losing') && (
              <p className="text-gray-700 dark:text-bye-dark-text-primary">
                Current Top Bid:{' '}
                <span className="font-semibold text-green-700 dark:text-green-400">
                  {item.currentOverallHighestBid !== null
                    ? formatCurrency(item.currentOverallHighestBid)
                    : 'No bids yet'}
                </span>
              </p>
            )}

            {statusText && (
              <p className="text-gray-700 dark:text-bye-dark-text-primary">
                Status:{' '}
                <span
                  className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${statusColorClasses}`}
                >
                  {statusText}
                </span>
              </p>
            )}

            {item.listingEndTime && (
              <p
                className={`text-xs pt-1 ${
                  !item.isEffectivelyEnded &&
                  item.listingStatus === 'active' &&
                  !isPast(item.listingEndTime)
                    ? 'text-gray-600 dark:text-bye-dark-text-primary font-medium'
                    : 'text-gray-500 dark:text-bye-dark-text-secondary'
                }`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  className="w-3.5 h-3.5 inline-block mr-1 align-text-bottom opacity-70"
                >
                  <path
                    fillRule="evenodd"
                    d="M1 8a7 7 0 1 1 14 0A7 7 0 0 1 1 8Zm7.75-4.25a.75.75 0 0 0-1.5 0V8c0 .414.336.75.75.75h4.25a.75.75 0 0 0 0-1.5H8.5V3.75Z"
                    clipRule="evenodd"
                  />
                </svg>
                {timeToDisplay}
              </p>
            )}
          </div>
        </div>
      </li>
    );
  };

  /* ------------------------- render guards ---------------------------- */
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-4 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-900 dark:text-bye-dark-text-primary tracking-tight">
          My Bids
        </h1>
        <LoadingSpinner message="Loading your bidding activity" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-4 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-900 dark:text-bye-dark-text-primary tracking-tight">
          My Bids
        </h1>
        <div className="p-4 bg-red-50 dark:bg-red-900/25 border border-red-200 dark:border-red-600/50 rounded-md text-red-700 dark:text-red-300 text-center">
          {error}
        </div>
      </div>
    );
  }

  if (!user && !loading) {
    return (
      <div className="max-w-4xl mx-auto p-4 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-900 dark:text-bye-dark-text-primary tracking-tight">
          My Bids
        </h1>
        <p className="text-center text-gray-600 dark:text-bye-dark-text-secondary">
          Please{' '}
          <Link
            href="/auth?redirect=/my-bids"
            className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300 underline"
          >
            log in
          </Link>{' '}
          to view your bids.
        </p>
      </div>
    );
  }

  /* ------------------------------ page -------------------------------- */
  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 sm:mb-8 gap-4 pb-4 border-b border-gray-200 dark:border-bye-dark-border-primary">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-bye-dark-text-primary tracking-tight">
          My Bids
        </h1>
        <div className="flex space-x-2">
          <button
            className={tabClass('active')}
            onClick={() => setViewFilter('active')}
          >
            Active Bids
          </button>
          <button
            className={tabClass('past')}
            onClick={() => setViewFilter('past')}
          >
            Past Bids
          </button>
        </div>
      </header>

      {/* --------------------------- ACTIVE ----------------------------- */}
      {viewFilter === 'active' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 lg:gap-x-8 gap-y-8">
          <section>
            <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-bye-dark-text-primary pb-2 border-b border-gray-200 dark:border-bye-dark-border-primary">
              Currently Winning
            </h2>

            {activeWinningItems.length ? (
              <ul className="space-y-6">
                {activeWinningItems.map((item) =>
                  renderBidItemCard(item, 'active-winning')
                )}
              </ul>
            ) : (
              <EmptyState
                message="You are not currently winning any active auctions."
                className="py-6 text-sm"
              />
            )}
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-bye-dark-text-primary pb-2 border-b border-gray-200 dark:border-bye-dark-border-primary">
              Currently Losing
            </h2>

            {activeLosingItems.length ? (
              <ul className="space-y-6">
                {activeLosingItems.map((item) =>
                  renderBidItemCard(item, 'active-losing')
                )}
              </ul>
            ) : (
              <EmptyState
                message="You are not currently outbid on any active auctions, or haven't bid yet."
                className="py-6 text-sm"
              />
            )}
          </section>
        </div>
      )}

      {/* ----------------------------- PAST ----------------------------- */}
      {viewFilter === 'past' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 lg:gap-x-8 gap-y-8">
          <section>
            <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-bye-dark-text-primary pb-2 border-b border-gray-200 dark:border-bye-dark-border-primary">
              Auctions Won
            </h2>

            {pastWonItems.length ? (
              <ul className="space-y-6">
                {pastWonItems.map((item) =>
                  renderBidItemCard(item, 'past-won')
                )}
              </ul>
            ) : (
              <EmptyState
                message="You haven't won any past auctions yet."
                className="py-6 text-sm"
              />
            )}
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-bye-dark-text-primary pb-2 border-b border-gray-200 dark:border-bye-dark-border-primary">
              Auctions Lost or Cancelled
            </h2>

            {pastLostItems.length ? (
              <ul className="space-y-6">
                {pastLostItems.map((item) =>
                  renderBidItemCard(item, 'past-lost')
                )}
              </ul>
            ) : (
              <EmptyState
                message="No past auctions where you didn't win, or auctions were cancelled."
                className="py-6 text-sm"
              />
            )}
          </section>
        </div>
      )}

      {/* --------------------------- NONE ------------------------------- */}
      {allBidItems.length === 0 && !loading && (
        <EmptyState
          message="You haven't placed any bids yet. Time to find some treasures!"
          action={{ href: '/listings', text: 'Browse Listings' }}
          className="mt-8"
        />
      )}
    </div>
  );
}
