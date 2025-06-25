'use client';

import { useEffect } from 'react';
import { useWatchlistStore, type WatchlistState } from '@/stores/watchlistStore';
import ListingCard, { type ListingCardItem } from '@/components/ListingCard';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function WatchlistPage() {
  const watchedListingIds = useWatchlistStore((state: WatchlistState) => state.watchedListingIds);
  const router = useRouter();
  const [listings, setListings] = useState<ListingCardItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        /* Redirect unauthenticated users to the central auth flow, preserving the intended return path */
        router.push('/auth?redirect=/my-watchlist');
      }
    };
    void checkAuth();
  }, [router]);

  useEffect(() => {
    const fetchListings = async () => {
      if (watchedListingIds.size === 0) {
        setListings([]);
        setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('listings_with_highest_bid')
          .select('*')
          .in('id', Array.from(watchedListingIds));

        if (error) throw error;
        setListings(data || []);
      } catch (error) {
        console.error('Error fetching listings:', error);
      } finally {
        setIsLoading(false);
      }
    };

    void fetchListings();
  }, [watchedListingIds]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <LoadingSpinner message="Loading your watchlist..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-bye-dark-bg-primary">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8 bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
          My Watchlist
        </h1>
        {listings.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600 dark:text-bye-dark-text-secondary text-lg">
              Your watchlist is empty. Start adding items you&apos;re interested in!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
} 