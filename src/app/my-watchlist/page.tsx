// src/app/my-watchlist/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
// import Image from 'next/image'; // No longer needed directly if ListingCard handles it
import { supabase, User } from '@/lib/supabaseClient';
// import WatchlistButton from '@/components/WatchlistButton'; // No longer needed directly
import LoadingSpinner from '@/components/LoadingSpinner';
// import { formatCurrency } from '@/lib/formatUtils'; // No longer needed directly
// import { formatRelativeTime, isPast } from '@/lib/timeUtils'; // No longer needed directly
import ListingCard, { ListingCardItem } from '@/components/ListingCard'; // NEW IMPORT

// Changed type name to match ListingCard's expected prop
// type WatchedListingItem = { ... }; // This is now ListingCardItem

export default function MyWatchlistPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  // MODIFIED: State type to use ListingCardItem
  const [watchedListings, setWatchedListings] = useState<ListingCardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkUserAndLoadWatchlist = async () => {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.user) {
        router.push('/auth?redirect=/my-watchlist');
        return;
      }
      setCurrentUser(session.user); // Set currentUser here
      setLoading(true); setError(null);
      try {
        const { data: watchedEntries, error: fetchWatchedIdsError } = await supabase
          .from('watched_listings')
          .select('listing_id')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false });
        if (fetchWatchedIdsError) throw fetchWatchedIdsError;

        if (watchedEntries && watchedEntries.length > 0) {
          const listingIds = watchedEntries.map(entry => entry.listing_id);
          const { data: listingsData, error: fetchListingsError } = await supabase
            .from('listings_with_highest_bid') // Ensure this view has all fields for ListingCardItem
            .select('id, title, photos, min_price, current_highest_bid, end_time, status')
            .in('id', listingIds);
          if (fetchListingsError) throw fetchListingsError;
          
          const parsedListings = listingsData?.map(item => ({
            ...item,
            photos: typeof item.photos === 'string' ? JSON.parse(item.photos || '[]') : item.photos || [],
            status: item.status as ListingCardItem['status'],
          })) || [];
          setWatchedListings(parsedListings as ListingCardItem[]);
        } else {
          setWatchedListings([]);
        }
      } catch (err: unknown) {
        // ... (your existing error handling)
        console.error("Error loading watchlist:", err);
        let message = 'Failed to load your watchlist.';
        if (err instanceof Error) message = err.message;
        else if (typeof err === 'string') message = err;
        else if (err && typeof err === 'object' && 'message' in err && typeof (err as {message: any}).message === 'string') message = (err as {message: string}).message;
        setError(message);
      } finally {
        setLoading(false);
      }
    };
    checkUserAndLoadWatchlist();
  }, [router]);

  if (loading) { /* ... loading JSX ... */ }
  if (error) { /* ... error JSX ... */ }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8"> {/* Matched listings page width */}
      <h1 className="text-2xl sm:text-3xl font-bold mb-8 text-gray-900 dark:text-white tracking-tight">
        My Watchlist
      </h1>
      {watchedListings.length === 0 ? (
        // ... (your existing empty state JSX - it's good) ...
         <div className="text-center py-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-md">
            {/* ... SVG and text ... */}
         </div>
      ) : (
        // MODIFIED: Use ul and map with ListingCard
        <ul role="list" className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {watchedListings.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              currentUser={currentUser} // Pass currentUser to the card
            />
          ))}
        </ul>
      )}
    </div>
  );
}