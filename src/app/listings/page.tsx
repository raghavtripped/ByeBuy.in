'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { supabase, type User } from '@/lib/supabaseClient';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import ListingCard, { ListingCardItem } from '@/components/ListingCard';
import CategoryFilterModal from '@/components/CategoryFilterModal';
import { useSearchParams } from 'next/navigation';

import { CATEGORIES_DATA } from '@/lib/categories';
import { FunnelIcon, SparklesIcon, FireIcon } from '@heroicons/react/24/outline';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */
const parsePhotosJson = (
  photosInput: string | string[] | null | undefined,
): string[] | null => {
  if (photosInput === null || photosInput === undefined) return null;
  if (Array.isArray(photosInput)) {
    return photosInput.every((item) => typeof item === 'string')
      ? (photosInput as string[])
      : null;
  }
  if (typeof photosInput === 'string') {
    try {
      const parsed = JSON.parse(photosInput);
      return Array.isArray(parsed) && parsed.every((i) => typeof i === 'string')
        ? (parsed as string[])
        : null;
    } catch (e) {
      console.warn('Failed to parse photos JSON string:', e);
      return null;
    }
  }
  return null;
};

type ListingTablePayload = Partial<
  Omit<ListingCardItem, 'photos' | 'tags'>
> & {
  photos?: string | string[] | null;
  tags?: string | string[] | null;
  id?: string;
};

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */
export default function ListingsPage() {
  // State for listings, loading, error, category filter, user, and modal
  const [rows, setRows] = useState<ListingCardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const searchParams = useSearchParams();
  const currentSearchTerm = searchParams.get('search');

  /* ---------------------------- Auth -------------------------------- */
  useEffect(() => {
    // Get current session and subscribe to auth changes
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUser(session?.user ?? null);
    });
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setCurrentUser(session?.user ?? null);
      },
    );
    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

  /* ------------------------- Fetch listings ------------------------- */
  // Fetch listings, memoized and updated when selectedCategory changes
  
  const fetchListings = useCallback(
    async (category: string | null, searchTerm: string | null = null) => {
      setLoading(true);
      setError(null);
      try {
        let query = supabase
          .from('listings_with_highest_bid')
          .select(
            `id, title, min_price, photos, current_highest_bid, end_time, status, created_at, tags, description, bid_count`,
          )
          .eq('status', 'active');

        // Filter by category if selected
        if (category) {
          query = query.contains('tags', JSON.stringify([category]));
        }

        // Add search functionality
        if (searchTerm) {
          const trimmedTerm = searchTerm.trim();
          if (trimmedTerm) {
            query = query.or(
              `title.ilike.%${trimmedTerm}%,description.ilike.%${trimmedTerm}%`
            );
          }
        }

        // Order by creation date (newest first)
        const { data, error: fetchErr } = await query.order('created_at', {
          ascending: false,
        });

        if (fetchErr) throw fetchErr;

        // Parse and normalize data
        const typed = (data ?? [])
          .map((item) => ({
            id: item.id || '',
            title: item.title || 'Untitled Listing',
            min_price: item.min_price || 0,
            photos: parsePhotosJson(item.photos),
            tags: parsePhotosJson(item.tags),
            status: (item.status as ListingCardItem['status']) || 'unknown',
            current_highest_bid: item.current_highest_bid ?? null,
            end_time: item.end_time ?? null,
            description: item.description || '',
            bid_count: item.bid_count ?? 0,
          }))
          .filter((i) => i.id) as ListingCardItem[];

        setRows(typed);
      } catch (err: unknown) {
        // Handle errors and set error state
        console.error('fetchListings error:', err);
        let msg = 'Failed to load active listings.';
        if (err instanceof Error) msg = err.message;
        else if (typeof err === 'string') msg = err;
        else if (
          err &&
          typeof err === 'object' &&
          'message' in err &&
          typeof (err as { message: unknown }).message === 'string'
        ) {
          msg = (err as { message: string }).message;
        }
        setError(msg);
        setRows([]);
      } finally {
        setLoading(false);
      }
    },
    [selectedCategory, currentSearchTerm], // eslint-disable-line react-hooks/exhaustive-deps
  );

  /* ----------------------- Initial & RT load ------------------------ */
  useEffect(() => {
    let isMounted = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const setupRealtimeSubscription = async () => {
      try {
        // Clean up any existing subscription
        if (channel) {
          await supabase.removeChannel(channel);
        }

        // Create and subscribe to new channel
        channel = supabase.channel('public-listings-active-page');
        
        channel
          .on<ListingTablePayload>(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'listings' },
            async (payload) => {
              console.log('Received listings update:', payload.eventType);
              if (isMounted) {
                await fetchListings(selectedCategory, currentSearchTerm);
              }
            }
          )
          .subscribe((status) => {
            console.log('Listings RT subscription status:', status);
            if (status === 'SUBSCRIBED') {
              console.log('Successfully subscribed to listings updates');
            } else {
              console.error('Failed to subscribe to listings channel:', status);
            }
          });

        console.log('Realtime subscription initialized');
      } catch (error) {
        console.error('Error setting up listings realtime subscription:', error);
      }
    };

    // Initial fetch and setup
    const initialize = async () => {
      try {
        await fetchListings(selectedCategory, currentSearchTerm);
        if (isMounted) {
          await setupRealtimeSubscription();
        }
      } catch (error) {
        console.error('Error during listings page initialization:', error);
      }
    };

    initialize();

    // Cleanup function
    return () => {
      isMounted = false;
      if (channel) {
        console.log('Cleaning up listings RT subscription');
        supabase.removeChannel(channel)
          .then(() => console.log('Listings RT channel unsubscribed.'))
          .catch(err => console.error('Error removing listings channel:', err));
      }
    };
  }, [selectedCategory, fetchListings, currentSearchTerm]);

  /* --------------------------- Handlers ----------------------------- */
  // REMOVED: handleCategoryClick function
  // Handle category selection from modal
  const handleModalCategorySelect = (categoryName: string) => {
    setSelectedCategory(categoryName);
    setIsCategoryModalOpen(false);
  };

  // Handle clearing category filter from modal
  const handleModalClearFilter = () => {
    setSelectedCategory(null);
    setIsCategoryModalOpen(false);
  };

  /* ------------------------------------------------------------------ */
  /*  Render guards                                                     */
  /* ------------------------------------------------------------------ */
  // Show loading spinner if loading and no data yet
  if (loading && rows.length === 0)
    return (
      // Global Page Background
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 dark:from-bye-dark-bg-primary dark:via-bye-dark-bg-primary dark:to-bye-dark-bg-primary">
        <div className="container mx-auto px-4 py-20 flex justify-center">
          <div className="text-center">
            <div className="relative">
              <div className="w-16 h-16 mx-auto mb-6 relative">
                {/* Spinner Container Gradient */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 animate-spin opacity-20"></div>
                <div className="absolute inset-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 animate-pulse"></div>
                <SparklesIcon className="absolute inset-3 text-white" />
              </div>
              <LoadingSpinner message="Discovering amazing auctions..." />
            </div>
          </div>
        </div>
      </div>
    );

  // Show error UI if error occurs
  if (error)
    return (
      // Global Page Background
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 dark:from-bye-dark-bg-primary dark:via-bye-dark-bg-primary dark:to-bye-dark-bg-primary">
        <div className="container mx-auto px-4 py-8">
          {/* Error Card Background and Border */}
          <div className="max-w-md mx-auto text-center bg-white dark:bg-bye-dark-bg-secondary rounded-2xl shadow-xl p-8 border border-red-100 dark:border-red-700/50">
            {/* Error Icon Background */}
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/25 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            {/* Error Title */}
            <h3 className="text-lg font-semibold text-gray-900 dark:text-bye-dark-text-primary mb-2">
              Oops! Something went wrong
            </h3>
            {/* Error Message */}
            <p className="text-sm text-gray-600 dark:text-bye-dark-text-secondary mb-6">{error}</p>
            <button
              onClick={() => fetchListings(selectedCategory)}
              className="w-full px-6 py-3 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white font-medium rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );

  // Action for empty state (depends on user login)
  const emptyAction = currentUser
    ? { href: '/listings/new', text: 'List an Item' }
    : { href: '/auth?redirect=/listings/new', text: 'Login to List an Item' };

  /* ------------------------------------------------------------------ */
  /*  Main UI                                                           */
  /* ------------------------------------------------------------------ */
  return (
    // Global Page Background
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 dark:from-bye-dark-bg-primary dark:via-bye-dark-bg-primary dark:to-bye-dark-bg-primary">
      {/* Hero Section with Animated Background */}
      <div className="relative overflow-hidden">
        {/* Animated background elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {/* Animated Background Gradient 1 */}
          <div className="absolute -top-4 -right-4 w-96 h-96 bg-gradient-to-br from-indigo-400/20 to-purple-600/20 rounded-full blur-3xl animate-pulse"></div>
          {/* Animated Background Gradient 2 */}
          <div className="absolute -bottom-8 -left-8 w-96 h-96 bg-gradient-to-tr from-blue-400/20 to-cyan-600/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>


        {/* Increased z-index from z-10 to z-20 */}
        <div className="relative z-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-12">
          {/* ------------------------- Hero Header (Hidden on Search or Category Filter) ------------------------ */}
          {(!currentSearchTerm && !selectedCategory) ? (
            <header className="text-center mb-12">
              <div className="flex items-center justify-center mb-6">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-violet-500 to-purple-600 rounded-2xl blur opacity-30 animate-pulse"></div>
                  {/* FireIcon Container Background */}
                  <div className="relative bg-white dark:bg-bye-dark-bg-secondary rounded-2xl p-3 shadow-xl">
                    <FireIcon className="w-8 h-8 text-violet-600 dark:text-violet-400" />
                  </div>
                </div>
              </div>
              
              {/* Main Title */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold bg-gradient-to-r from-violet-600 via-purple-600 to-blue-600 bg-clip-text text-transparent mb-4 pb-1 sm:pb-2">
                Live Listings
              </h1>
              
              {/* Subtitle */}
              <p className="text-lg sm:text-xl text-gray-600 dark:text-bye-dark-text-secondary max-w-2xl mx-auto mb-8">
                Discover amazing deals on items from around the Campus
              </p>

              {/* Stats or CTA */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
                {/* Stats/CTA Container */}
                <div className="flex items-center gap-2 px-4 py-2 bg-white/80 dark:bg-bye-dark-bg-secondary/80 backdrop-blur-sm rounded-full shadow-lg">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <span className="text-sm font-medium text-gray-700 dark:text-bye-dark-text-primary">
                    {rows.length} Active Auctions
                  </span>
                </div>
                
                {currentUser && (
                  <Link
                    href="/listings/new"
                    className="group relative px-8 py-3 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white font-semibold rounded-full shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-violet-400 to-purple-500 rounded-full blur opacity-0 group-hover:opacity-50 transition-opacity duration-300"></div>
                    <span className="relative flex items-center gap-2">
                      <SparklesIcon className="w-5 h-5" />
                      Create Listing
                    </span>
                  </Link>
                )}
              </div>
            </header>
          ) : null}

          {/* Universal category filter section */}
          <div
            className={`flex flex-col items-center space-y-1 relative z-30 ${
              currentSearchTerm || selectedCategory
                ? 'pt-2 sm:pt-3 mb-2'
                : 'pt-4 sm:pt-6 mb-3'
            }`}
          >
            {/* Filter Button */}
            <button
              onClick={() => setIsCategoryModalOpen(true)}
              className={`group w-full max-w-sm sm:max-w-md lg:max-w-lg z-40 ${
                currentSearchTerm ? 'transform -translate-y-1' : ''
              }`}
            >
              {/* Button Background - Reduce padding during search */}
              <div 
                className={`relative bg-white/90 dark:bg-bye-dark-bg-secondary/90 backdrop-blur-sm border border-gray-200 dark:border-bye-dark-border-primary rounded-2xl shadow-lg transition-all duration-300 group-hover:shadow-xl z-10 ${
                  currentSearchTerm ? 'p-2.5' : 'p-4'
                }`}
              >
                <div className="flex items-center">
                  {/* Funnel Icon - Smaller during search */}
                  <div className={`bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl mr-3 ${
                    currentSearchTerm ? 'p-1.5' : 'p-2' // Smaller padding during search
                  }`}>
                    <FunnelIcon className={`text-white ${
                      currentSearchTerm ? 'w-4 h-4' : 'w-5 h-5' // Smaller icon during search
                    }`} />
                  </div>
                  {/* Button Text */}
                  <span className="flex-grow text-left font-medium text-gray-700 dark:text-bye-dark-text-primary">
                    {selectedCategory
                      ? `Category: ${selectedCategory}`
                      : 'Filter All Categories'}
                  </span>
                  {/* Chevron Icon */}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="w-5 h-5 text-gray-400 dark:text-bye-dark-text-secondary group-hover:text-indigo-500 transition-colors"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              </div>
            </button>

            {/* Active Filter Indicator */}
            {selectedCategory && (
              <div className="inline-flex items-center gap-2 bg-white/90 dark:bg-bye-dark-bg-secondary/90 backdrop-blur-sm rounded-full px-4 py-1 shadow-lg border border-indigo-100 dark:border-indigo-900/30">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                <span className="font-medium text-gray-700 dark:text-bye-dark-text-primary text-sm">
                  Results for {selectedCategory}
                </span>
                <button
                  onClick={() => setSelectedCategory(null)}
                  className="ml-1 p-1 hover:bg-gray-100 dark:hover:bg-bye-dark-bg-hover rounded-full transition-colors"
                >
                  <svg 
                    className="w-4 h-4 text-gray-500 hover:text-gray-700 dark:text-bye-dark-text-secondary dark:hover:text-bye-dark-text-primary" 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2} 
                      d="M6 18L18 6M6 6l12 12" 
                    />
                  </svg>
                </button>
              </div>
            )}

            {/* Search Results Indicator - Moved inside container */}
            {currentSearchTerm && (
              <div className="inline-flex items-center gap-2 bg-white/90 dark:bg-bye-dark-bg-secondary/90 backdrop-blur-sm rounded-full px-4 py-1 shadow-lg border border-indigo-100 dark:border-indigo-900/30">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                <span className="font-medium text-gray-700 dark:text-bye-dark-text-primary text-sm">
                  Results for &quot;{currentSearchTerm}&quot;
                </span>
                <Link
                  href="/listings"
                  className="ml-1 p-1 hover:bg-gray-100 dark:hover:bg-bye-dark-bg-hover rounded-full transition-colors"
                >
                  <svg className="w-4 h-4 text-gray-500 hover:text-gray-700 dark:text-bye-dark-text-secondary dark:hover:text-bye-dark-text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Search Results Indicator - Centered & Compact */}
      {/* Remove the original search results indicator section */}

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        {/* ---------------- Loading during RT updates ------------------ */}
        {loading && rows.length > 0 && (
          <div className="py-8 flex justify-center">
            {/* Container Background */}
            <div className="bg-white/80 dark:bg-bye-dark-bg-secondary/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg">
              <LoadingSpinner message="Updating auctions..." />
            </div>
          </div>
        )}

        {/* ---------------- Empty state -------------------------------- */}
        {!loading && !error && rows.length === 0 && (
          <div className="text-center py-16">
            <div className="max-w-md mx-auto bg-white/80 dark:bg-bye-dark-bg-secondary/80 backdrop-blur-sm rounded-3xl p-8 shadow-xl">
              <div className="w-20 h-20 bg-gradient-to-r from-violet-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <SparklesIcon className="w-10 h-10 text-violet-600 dark:text-violet-400" />
              </div>
              <EmptyState
                message={
                  currentSearchTerm
                    ? `No auctions found for '${currentSearchTerm}'. Try a different search term.`
                    : selectedCategory
                    ? `No active auctions found for '${selectedCategory}'. Try exploring other categories.`
                    : 'No active auctions available right now. Be the first to start one!'
                }
                action={!currentSearchTerm && !selectedCategory ? emptyAction : undefined}
                className=""
              />
            </div>
          </div>
        )}

        {/* ---------------- Listings grid ------------------------------ */}
        {!loading && !error && rows.length > 0 && (
          <div className={`${
            currentSearchTerm || selectedCategory 
              ? 'pt-8 sm:pt-10' // More spacing when in search/filter mode
              : 'space-y-6 pt-6 sm:pt-8'
          }`}>
            {/* Title Section - Only show when not searching AND not filtering */}
            {(!currentSearchTerm && !selectedCategory) && (
              <div className="text-center mb-4">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-bye-dark-text-primary mb-1">
                  {selectedCategory ? `${selectedCategory} Auctions` : 'All Active Listings'}
                </h2>
                <p className="text-gray-600 dark:text-bye-dark-text-secondary text-sm">
                  {rows.length} auction{rows.length !== 1 ? 's' : ''} ending soon
                </p>
              </div>
            )}

            <ul
              role="list"
              className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            >
              {rows.map((listing, index) => (
                <li
                  key={listing.id}
                  className="group"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="relative">
                    {/* ListingCard Wrapper Gradient */}
                    <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 to-purple-600/10 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-all duration-500 transform group-hover:scale-110"></div>
                    <div className="relative transform transition-all duration-300 group-hover:scale-105">
                      <ListingCard
                        listing={listing}
                        className="shadow-lg hover:shadow-2xl transition-all duration-300"
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ---------------- Category modal (mobile) -------------------- */}
      <CategoryFilterModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        selectedCategory={selectedCategory}
        onCategorySelect={handleModalCategorySelect}
        onClearFilter={handleModalClearFilter}
        categories={CATEGORIES_DATA}
      />
    </div>
  );
}