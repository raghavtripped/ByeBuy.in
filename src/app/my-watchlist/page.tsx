// src/app/my-watchlist/page.tsx
'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, User } from '@/lib/supabaseClient';
import { useWatchlistStore } from '@/stores/watchlistStore'; // Import your Zustand store
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState'; // Ensure EmptyState is imported and used
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

// Define a type for the raw data coming from the listings_with_highest_bid view
type RawListingFromView = {
  id: string;
  title: string;
  photos: string | string[] | null; // Can be string or array from DB/view
  min_price: number;
  current_highest_bid: number | null;
  end_time: string | null;
  status: string; // Raw status from DB/view
};

// Type for Realtime Payload from 'watched_listings' table
type WatchedListingPayload = {
  id: string; // Primary key of watched_listings table
  user_id: string;
  listing_id: string;
  created_at: string;
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

  // Memoize the array of watched IDs for stable useEffect dependency
  const watchedIdsArray = useMemo(() => Array.from(watchedListingIds), [watchedListingIds]);

  // Effect 1: Handle user authentication
  useEffect(() => {
    const checkUser = async () => {
      setLoadingAuth(true);
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session?.user) {
        router.push('/auth?redirect=/my-watchlist');
        setLoadingAuth(false);
        return;
      }
      
      setCurrentUser(session.user);
      setLoadingAuth(false);
    };
    checkUser();
  }, [router]);

  // Effect 2: Fetch watchlist IDs into Zustand store (if user is present and store is empty)
  // This acts as a fallback/initial load if AuthWatchlistManager hasn't populated it yet.
  useEffect(() => {
    if (currentUser && watchedListingIds.size === 0 && !storeLoading && !storeError) {
      console.log("MyWatchlistPage: User present but store empty/not loading, attempting fetch via store.");
      fetchWatchedListingsFromStore(currentUser); // No await, let it run in background
    }
  }, [currentUser, watchedListingIds.size, storeLoading, storeError, fetchWatchedListingsFromStore]);


  // Effect 3: Fetch details of listings once watched IDs are available from the store
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
        .order('created_at', { ascending: false }) // Optional: order them
        .overrideTypes<RawListingFromView[], { merge: false }>(); // Use overrideTypes instead of returns

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
      // Original code to be replaced:
// const filteredAndOrderedListings = watchedIdsArray // Use the memoized array for consistent order
//   .map(id => parsedListings.find(listing => listing.id === id))
//   .filter((listing): listing is ListingCardItem => listing !== undefined);

// Replacement:
const filteredAndOrderedListings = watchedIdsArray.reduce((acc: ListingCardItem[], id) => {
  const listing = parsedListings.find(item => item.id === id);
  if (listing) {
    acc.push(listing);
  }
  return acc;
}, []);

      setListingsDetails(filteredAndOrderedListings);

    } catch (err) {
      console.error("Error fetching listing details for watchlist:", err);
      const message = err instanceof Error ? err.message : 'Failed to load details for watched items.';
      setDetailsError(message);
      setListingsDetails([]);
    } finally {
      setLoadingDetails(false);
    }
  }, [watchedIdsArray]); // Dependency on memoized array

  useEffect(() => {
    if (currentUser) { // Only fetch details if user is authenticated
      fetchListingDetailsByIds(watchedIdsArray);
    } else {
      // If user logs out or is not authenticated, clear details
      setListingsDetails([]);
      setLoadingDetails(false);
    }
  }, [currentUser, watchedIdsArray, fetchListingDetailsByIds]);

  // Effect 4: Realtime subscription for watched_listings table
  useEffect(() => {
    if (!currentUser) {
      // If no user, ensure no active subscription
      // Safely remove channel by name if it exists, or create a dummy name for unsubscribe
      supabase.removeChannel(supabase.channel(`my-watchlist-rt-anon`));
      return;
    }

    const channel = supabase.channel(`my-watchlist-rt-${currentUser.id}`)
      .on<WatchedListingPayload>(
        'postgres_changes',
        {
          event: '*', // Listen for INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'watched_listings',
          filter: `user_id=eq.${currentUser.id}`, // Only changes for this user
        },
        (payload) => {
          console.log("MyWatchlistPage RT: Watched listings change detected!", payload);
          // When a change occurs, trigger a re-fetch of the watchlist IDs into the store
          // AuthWatchlistManager also listens, but this ensures page is reactive.
          fetchWatchedListingsFromStore(currentUser);
        }
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR') console.error('MyWatchlistPage RT Channel Error:', err);
        else if (status === 'SUBSCRIBED') console.log('MyWatchlistPage RT Channel Subscribed');
      });

    return () => {
      console.log("MyWatchlistPage RT: Cleaning up subscription.");
      supabase.removeChannel(channel).catch(console.error);
    };
  }, [currentUser, fetchWatchedListingsFromStore]); // Re-subscribe if user changes


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
            <div className="bg-red-50 dark:bg-red-900/25 border border-red-200 dark:border-red-700/50 text-red-800 dark:text-red-300 p-4 rounded-md inline-block">
                <p className="font-semibold">Error Loading Watchlist</p>
                <p className="text-sm mt-1">{pageError}</p>
                 <button 
                    onClick={() => {
                        if (currentUser) fetchWatchedListingsFromStore(currentUser);
                        if (detailsError && watchedListingIds.size > 0) fetchListingDetailsByIds(Array.from(watchedListingIds));
                    }}
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
      <h1 className="text-2xl sm:text-3xl font-bold mb-8 text-gray-900 dark:text-bye-dark-text-primary tracking-tight">
        ⭐ My Watchlist
      </h1>

      {/* Corrected: Use the EmptyState component directly */}
      {!isLoadingPage && listingsDetails.length === 0 && !pageError && (
        <EmptyState
          message={"Your watchlist is empty."}
          action={{
            href: "/listings",
            text: "Browse Listings"
          }}
          className="py-10 bg-white dark:bg-bye-dark-bg-secondary border border-gray-200 dark:border-bye-dark-border-primary rounded-lg shadow-md"
        />
      )}

      {!isLoadingPage && listingsDetails.length > 0 && !pageError && (
        <ul role="list" className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {listingsDetails.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              currentUser={currentUser}
            />
          ))}
        </ul>
      )}
    </div>
  );
}