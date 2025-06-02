'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PostgrestError } from '@supabase/postgrest-js';
import { supabase } from '@/lib/supabaseClient';
import { useWatchlistStore, type WatchlistState } from '@/stores/watchlistStore';

interface ListingCardItem {
  id: string;
  title: string;
  description: string;
  current_price: number;
  image_url: string;
  end_time: string;
}

export default function WatchlistPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null);
  const [watchedItems, setWatchedItems] = useState<ListingCardItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const watchedListingIds = useWatchlistStore((state: WatchlistState) => state.watchedListingIds);
  const storeIsLoading = useWatchlistStore((state: WatchlistState) => state.isLoading);
  const storeError = useWatchlistStore((state: WatchlistState) => state.error);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push('/login'); // Redirect to login if not authenticated
        return;
      }
      setCurrentUser({ id: session.user.id });
    };

    checkAuth();
  }, [router]);

  useEffect(() => {
    const fetchWatchedItems = async () => {
      if (!watchedListingIds.size) {
        setWatchedItems([]);
        setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('listings_with_highest_bid')
          .select('*')
          .in('id', Array.from(watchedListingIds));

        if (error) throw error;

        setWatchedItems(data || []);
      } catch (error: unknown) {
        const errorMessage = error instanceof PostgrestError 
          ? error.message 
          : 'Failed to fetch watched items';
        setError(errorMessage);
        console.error('Error fetching watched items:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchWatchedItems();
  }, [watchedListingIds]);

  if (!currentUser) {
    return null; // Will redirect in useEffect
  }

  if (isLoading || storeIsLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-gray-900 dark:border-gray-100" />
      </div>
    );
  }

  if (error || storeError) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-red-500 text-center">
          <h3 className="text-lg font-semibold">Error Loading Watchlist</h3>
          <p>{error || storeError}</p>
        </div>
      </div>
    );
  }

  if (!watchedItems.length) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <h2 className="text-2xl font-semibold mb-4">Your Watchlist</h2>
        <p className="text-gray-600 dark:text-gray-400">
          You haven&apos;t added any items to your watchlist yet.
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h2 className="text-2xl font-semibold mb-6">Your Watchlist</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {watchedItems.map((item) => (
          <div key={item.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
            {/* TODO: Replace with your ListingCard component */}
            <div className="p-4">
              <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
              <p className="text-gray-600 dark:text-gray-400">{item.description}</p>
              <p className="mt-2 text-lg font-bold">${item.current_price.toFixed(2)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
} 