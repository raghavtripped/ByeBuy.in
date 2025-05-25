// src/app/my-watchlist/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase, User } from '@/lib/supabaseClient';
import { useWatchlistStore } from '@/stores/watchlistStore'; // Import your Zustand store
import LoadingSpinner from '@/components/LoadingSpinner';
import ListingCard, { ListingCardItem } from '@/components/ListingCard'; // Assuming ListingCard is styled


// Helper to parse photos, ensure it's consistent if used elsewhere
const parsePhotos = (photosData: string | string[] | null | undefined): string[] | null => {
  if (!photosData) return null;
  if (Array.isArray(photosData)) return photosData.every(p => typeof p === 'string') ? photosData : null;
  try {
    const parsed = JSON.parse(photosData as string);
    return Array.isArray(parsed) && parsed.every(p => typeof p === 'string') ? parsed : null;
  } catch (e) { 
    console.error("Photo parse error in watchlist:", e); 
    return null; 
  }
};

export default function MyWatchlistPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  
  // Get state and actions from Zustand store
  const watchedListingIds = useWatchlistStore(state => state.watchedListingIds);
  const fetchWatchedListingsFromStore = useWatchlistStore(state => state.fetchWatchedListings);
  const storeLoading = useWatchlistStore(state => state.isLoading);
  const storeError = useWatchlistStore(state => state.error);

  const [listingsDetails, setListingsDetails] = useState<ListingCardItem[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  // Effect to handle user authentication and initial watchlist fetch
  useEffect(() => {
    const checkUserAndFetch = async () => {
      setLoadingAuth(true);
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session?.user) {
        router.push('/auth?redirect=/my-watchlist');
        setLoadingAuth(false);
        return;
      }
      
      const user = session.user;
      setCurrentUser(user);
      // fetchWatchedListingsFromStore is already called by AuthWatchlistManager on auth change.
      // We might not need to call it explicitly here if AuthWatchlistManager is reliable.
      // However, if this page can be accessed before AuthWatchlistManager has populated the store,
      // an explicit call might be a good fallback. For now, let's assume AuthWatchlistManager handles it.
      // If store is empty and user exists, it might indicate a need to fetch.
      if (user && watchedListingIds.size === 0 && !storeLoading) {
          console.log("MyWatchlistPage: User present but store empty, attempting fetch via store.");
          await fetchWatchedListingsFromStore(user);
      }
      setLoadingAuth(false);
    };
    checkUserAndFetch();
  }, [router, fetchWatchedListingsFromStore, watchedListingIds.size, storeLoading]); // Dependencies for initial check

  // Effect to fetch details of listings once watched IDs are available from the store
  const fetchListingDetailsByIds = useCallback(async (ids: string[]) => {
    if (ids.length === 0) {
      setListingsDetails([]);
      setLoadingDetails(false);
      setDetailsError(null);
      return;
    }
    setLoadingDetails(true);
    setDetailsError(null);
    try {
      const { data, error } = await supabase
        .from('listings_with_highest_bid') // Use a view that gives necessary card info
        .select('id, title, photos, min_price, current_highest_bid, end_time, status')
        .in('id', ids)
        .order('created_at', { ascending: false }); // Optional: order them

      if (error) throw error;

      const parsedListings = (data || []).map(item => ({
        id: item.id || '',
        title: item.title || 'Untitled Listing',
        photos: parsePhotos(item.photos),
        min_price: item.min_price || 0,
        current_highest_bid: item.current_highest_bid ?? null,
        end_time: item.end_time ?? null,
        status: (item.status as ListingCardItem['status']) || 'unknown',
      })).filter(item => item.id) as ListingCardItem[];
      
      // Ensure the order reflects the watchlist order (most recently added) if desired,
      // or match the order of IDs from the store. For simplicity, we use fetched order.
      setListingsDetails(parsedListings);

    } catch (err) {
      console.error("Error fetching listing details for watchlist:", err);
      const message = err instanceof Error ? err.message : 'Failed to load details for watched items.';
      setDetailsError(message);
      setListingsDetails([]);
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  useEffect(() => {
    if (currentUser && watchedListingIds.size > 0) {
      fetchListingDetailsByIds(Array.from(watchedListingIds));
    } else if (currentUser && watchedListingIds.size === 0) {
      // If user is loaded but watchlist is empty (after store fetch attempt)
      setListingsDetails([]);
      setLoadingDetails(false);
    }
  }, [currentUser, watchedListingIds, fetchListingDetailsByIds]);


  // Combined loading state
  const isLoadingPage = loadingAuth || storeLoading || loadingDetails;

  if (isLoadingPage && listingsDetails.length === 0) { // Show main loader only if no data yet
    return <div className="flex justify-center py-20"><LoadingSpinner message="Loading your watchlist..." /></div>;
  }

  // Handle store error or details error
  const pageError = storeError || detailsError;
  if (pageError) {
    return (
        <div className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8 text-center">
            {/* Updated error box styling */}
            <div className="bg-red-50 dark:bg-red-900/25 border border-red-200 dark:border-red-700/50 text-red-800 dark:text-red-300 p-4 rounded-md inline-block">
                <p className="font-semibold">Error Loading Watchlist</p>
                <p className="text-sm mt-1">{pageError}</p>
                 <button 
                    onClick={() => {
                        if (currentUser) fetchWatchedListingsFromStore(currentUser);
                        // Optionally, could try refetching details if detailsError
                        if (detailsError && watchedListingIds.size > 0) fetchListingDetailsByIds(Array.from(watchedListingIds));
                    }}
                    // Updated button styling
                    className="mt-4 px-3 py-1.5 bg-red-600 dark:bg-red-500 text-white dark:text-gray-100 text-xs font-medium rounded-md hover:bg-red-700 dark:hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:ring-offset-2 dark:focus:ring-offset-red-900/25"
                >
                    Try Again
                </button>
            </div>
        </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Updated page title */}
      <h1 className="text-2xl sm:text-3xl font-bold mb-8 text-gray-900 dark:text-bye-dark-text-primary tracking-tight">
        ⭐ My Watchlist
      </h1>

      {/* Updated EmptyState and its container styling */}
      {!isLoadingPage && listingsDetails.length === 0 && !pageError && (
        <div className="text-center py-10 bg-white dark:bg-bye-dark-bg-secondary border border-gray-200 dark:border-bye-dark-border-primary rounded-lg shadow-md">
          <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12 text-gray-400 dark:text-bye-dark-text-secondary opacity-75" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.846 5.675a.5.5 0 00.475.345h5.975c.925 0 1.315 1.193.586 1.815l-4.834 3.51a.5.5 0 00-.182.557l1.846 5.675c.3.921-.751 1.688-1.538 1.162l-4.834-3.51a.5.5 0 00-.586 0l-4.834 3.51c-.787.526-1.838-.241-1.538-1.162l1.846-5.675a.5.5 0 00-.182-.557l-4.834-3.51c-.73-.622-.339-1.815.586-1.815h5.975a.5.5 0 00.475-.345L11.049 2.927z" />
          </svg>
          <h3 className="mt-2 text-lg font-medium text-gray-900 dark:text-bye-dark-text-primary">Your watchlist is empty.</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-bye-dark-text-secondary">
            {"Start browsing and add items you're interested in!"}
          </p>
          <div className="mt-6">
            {/* Updated button styling */}
            <Link
              href="/listings"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-bye-dark-bg-secondary focus:ring-indigo-500 dark:focus:ring-indigo-400"
            >
              Browse Listings
            </Link>
          </div>
        </div>
      )}

      {!isLoadingPage && listingsDetails.length > 0 && !pageError && (
        <ul role="list" className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {listingsDetails.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              currentUser={currentUser} // Pass currentUser to ListingCard
            />
          ))}
        </ul>
      )}
    </div>
  );
}