// src/app/my-watchlist/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase, type User } from '@/lib/supabaseClient';
import LoadingSpinner from '@/components/LoadingSpinner';
import ListingCard, { type ListingCardItem } from '@/components/ListingCard';

export default function MyWatchlistPage() {
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [watchedListings, setWatchedListings] = useState<ListingCardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* ------------------------------------------------------------------ */
  /*  Helpers                                                           */
  /* ------------------------------------------------------------------ */
  const parsePhotos = (photosData: string | string[] | null | undefined): string[] | null => {
    if (!photosData) return null;
    if (Array.isArray(photosData)) return photosData.every((p) => typeof p === 'string') ? photosData : null;
    try {
      const parsed = JSON.parse(photosData as string);
      return Array.isArray(parsed) && parsed.every((p) => typeof p === 'string') ? parsed : null;
    } catch (e) {
      console.error('Photo parse error in watchlist:', e);
      return null;
    }
  };

  /* ------------------------------------------------------------------ */
  /*  Fetch watch‑list items                                            */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    const checkUserAndLoadWatchlist = async () => {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.user) {
        router.push('/auth?redirect=/my-watchlist');
        return;
      }

      setCurrentUser(session.user);
      setLoading(true);
      setError(null);

      try {
        /* --- 1. All watched listing IDs -------------------------------- */
        const { data: watchedEntries, error: fetchIdsErr } = await supabase
          .from('watched_listings')
          .select('listing_id')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false });

        if (fetchIdsErr) throw fetchIdsErr;

        if (watchedEntries && watchedEntries.length > 0) {
          const listingIds = watchedEntries.map((e) => e.listing_id);

          /* --- 2. Listing details -------------------------------------- */
          const { data: listingsData, error: fetchListingsErr } = await supabase
            .from('listings_with_highest_bid')
            .select('id, title, photos_jsonb, min_price, current_highest_bid, end_time, status')
            .in('id', listingIds);

          if (fetchListingsErr) throw fetchListingsErr;

          /* --- 3. Map to ListingCardItem ------------------------------- */
          const parsedListings = listingsData
            ?.map((item) => ({
              id: item.id || '',
              title: item.title || 'Untitled Listing',
              photos: parsePhotos(item.photos_jsonb as string[] | null),
              min_price: item.min_price || 0,
              current_highest_bid: item.current_highest_bid ?? null,
              end_time: item.end_time ?? null,
              status: (item.status as ListingCardItem['status']) || 'unknown',
            }))
            .filter((i) => i.id) as ListingCardItem[];

          setWatchedListings(parsedListings);
        } else {
          setWatchedListings([]);
        }
      } catch (err: unknown) {
        console.error('Error loading watchlist:', err);
        let msg = 'Failed to load your watchlist.';
        if (err instanceof Error) msg = err.message;
        else if (typeof err === 'string') msg = err;
        else if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
          msg = (err as { message: string }).message;
        }
        setError(msg);
      } finally {
        setLoading(false);
      }
    };

    checkUserAndLoadWatchlist();
  }, [router]);

  /* ------------------------------------------------------------------ */
  /*  Render guards                                                     */
  /* ------------------------------------------------------------------ */
  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner message="Loading your watchlist..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8 text-center">
        <div className="bg-red-50 dark:bg-red-900/25 border border-red-200 dark:border-red-600/50 text-red-800 dark:text-red-300 p-4 rounded-md inline-block">
          <p className="font-semibold dark:text-red-300">Error Loading Watchlist</p>
          <p className="text-sm mt-1">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-3 py-1.5 bg-red-600 dark:bg-red-500 hover:bg-red-700 dark:hover:bg-red-600 text-white dark:text-gray-100 text-xs font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:ring-offset-2 dark:focus:ring-offset-red-900/25"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------ */
  /*  Main UI                                                           */
  /* ------------------------------------------------------------------ */
  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
      <h1 className="text-2xl sm:text-3xl font-bold mb-8 text-gray-900 dark:text-bye-dark-text-primary tracking-tight">My Watchlist</h1>

      {watchedListings.length === 0 ? (
        <div className="text-center py-10 bg-white dark:bg-bye-dark-bg-secondary border border-gray-200 dark:border-bye-dark-border-primary rounded-lg shadow-md">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="mx-auto h-12 w-12 text-gray-400 dark:text-bye-dark-text-secondary/75"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.846 5.675a.5.5 0 00.475.345h5.975c.925 0 1.315 1.193.586 1.815l-4.834 3.51a.5.5 0 00-.182.557l1.846 5.675c.3.921-.751 1.688-1.538 1.162l-4.834-3.51a.5.5 0 00-.586 0l-4.834 3.51c-.787.526-1.838-.241-1.538-1.162l1.846-5.675a.5.5 0 00-.182-.557l-4.834-3.51c-.73-.622-.339-1.815.586-1.815h5.975a.5.5 0 00.475-.345L11.049 2.927z"
            />
          </svg>

          <h3 className="mt-2 text-lg font-medium text-gray-900 dark:text-bye-dark-text-primary">Your watchlist is empty.</h3>

          <p className="mt-1 text-sm text-gray-500 dark:text-bye-dark-text-secondary">Start browsing and add items you&#39;re interested in!</p>

          <div className="mt-6">
            <Link
              href="/listings"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white dark:text-gray-100 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:ring-offset-2 dark:focus:ring-offset-bye-dark-bg-secondary"
            >
              Browse Listings
            </Link>
          </div>
        </div>
      ) : (
        <ul role="list" className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {watchedListings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} currentUser={currentUser} />
          ))}
        </ul>
      )}
    </div>
  );
}
