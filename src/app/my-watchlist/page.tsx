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
          .select('id, title, min_price, photos, current_highest_bid, end_time, status, bid_count, seller_id')
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
      <div className="min-h-screen bg-white dark:bg-bye-dark-bg-primary flex justify-center items-center">
        <div className="text-center space-y-4">
          <LoadingSpinner message="Loading your watchlist..." />
          <div className="animate-pulse">
            <div className="flex justify-center space-x-2">
              <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
              <div className="w-2 h-2 bg-pink-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-bye-dark-bg-primary">
      {/* Hero Section */}
      <div className="relative overflow-hidden mx-4 mt-4 rounded-2xl">
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 via-purple-500/5 to-pink-500/5"></div>
        <div className="relative container mx-auto px-4 pt-12 pb-8">
          <div className="text-center space-y-4">
            <div className="inline-flex items-center space-x-2 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-full px-4 py-2 border border-gray-200/50 dark:border-gray-700/50">
              <div className="w-2 h-2 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium text-gray-600 dark:text-bye-dark-text-secondary">
                {listings.length} {listings.length === 1 ? 'item' : 'items'} watched
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent leading-tight">
              My Watchlist
            </h1>
            <p className="text-lg text-gray-600 dark:text-bye-dark-text-secondary max-w-2xl mx-auto">
              Keep track of your favorite listings and never miss an opportunity
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 pb-12">
        {listings.length === 0 ? (
          <div className="max-w-md mx-auto text-center">
            <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-2xl p-12 border border-gray-200/50 dark:border-gray-700/50 shadow-xl">
              <div className="space-y-6">
                {/* Empty State Illustration */}
                <div className="relative mx-auto w-24 h-24">
                  <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full opacity-20 animate-pulse"></div>
                  <div className="absolute inset-2 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full opacity-40 animate-ping"></div>
                  <div className="absolute inset-4 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Your watchlist is empty
                  </h3>
                  <p className="text-gray-600 dark:text-bye-dark-text-secondary leading-relaxed">
                    Start exploring and add items you&apos;re interested in to build your personal collection
                  </p>
                </div>

                <div className="pt-4">
                  <button 
                    onClick={() => router.push('/')}
                    className="inline-flex items-center space-x-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white px-6 py-3 rounded-lg font-medium transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <span>Explore Listings</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Filter/Sort Bar */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 border border-gray-200/50 dark:border-gray-700/50">
              <div className="flex items-center space-x-3">
                <div className="w-3 h-3 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium text-gray-700 dark:text-bye-dark-text-secondary">
                  Showing {listings.length} watched {listings.length === 1 ? 'listing' : 'listings'}
                </span>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100/50 dark:bg-gray-700/50 px-3 py-1 rounded-full">
                Updated just now
              </div>
            </div>

            {/* Listings Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {listings.map((listing, index) => (
                <div 
                  key={listing.id} 
                  className="transform transition-all duration-300 hover:scale-105"
                  style={{ 
                    animationDelay: `${index * 0.1}s`,
                    animation: 'fadeInUp 0.6s ease-out forwards'
                  }}
                >
                  <div className="relative group">
                    <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-lg opacity-0 group-hover:opacity-20 transition-opacity duration-300 blur"></div>
                    <div className="relative">
                      <ListingCard listing={listing} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
} 