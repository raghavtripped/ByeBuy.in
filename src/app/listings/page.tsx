'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { supabase, type User } from '@/lib/supabaseClient';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import ListingCard, { ListingCardItem } from '@/components/ListingCard';
import CategoryFilterModal from '@/components/CategoryFilterModal';
import { useSearchParams, useRouter } from 'next/navigation';

import { CATEGORIES_DATA } from '@/lib/categories';
import { FunnelIcon, SparklesIcon, FireIcon, AdjustmentsHorizontalIcon, MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import SortOptionModal from '@/components/SortOptionModal';
import IntegratedSearchBar from '@/components/IntegratedSearchBar';

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
/*  Sort Options Configuration                                        */
/* ------------------------------------------------------------------ */
type SortOptionValue = 'created_at_desc' | 'end_time_asc' | 'price_asc' | 'price_desc' | 'bid_count_desc';

const sortOptions = [
  { value: 'created_at_desc', label: 'Newest First' },
  { value: 'end_time_asc', label: 'Ending Soonest' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'bid_count_desc', label: 'Most Bids' },
] as const;

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
  const router = useRouter();
  const currentSearchTerm = searchParams.get('search');
  
  const [searchInput, setSearchInput] = useState(currentSearchTerm || '');
  
  // Sort state - read from URL or default to 'created_at_desc'
  const urlSortParam = searchParams.get('sort') as SortOptionValue | null;
  const [sortOption, setSortOption] = useState<SortOptionValue>(
    urlSortParam && sortOptions.find(opt => opt.value === urlSortParam) ? urlSortParam : 'created_at_desc'
  );
  const [isSortModalOpen, setIsSortModalOpen] = useState(false);

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

  useEffect(() => {
    setSearchInput(currentSearchTerm || '');
  }, [currentSearchTerm]);

  /* ------------------------- Fetch listings ------------------------- */
  // Fetch listings, memoized and updated when selectedCategory changes
  
  const fetchListings = useCallback(
    async (category: string | null, searchTerm: string | null = null, sortBy: SortOptionValue = 'created_at_desc') => {
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

        // Apply dynamic ordering based on sortBy parameter
        switch (sortBy) {
          case 'end_time_asc':
            query = query.order('end_time', { ascending: true, nullsFirst: false });
            break;
          case 'price_asc':
            query = query.order('min_price', { ascending: true });
            break;
          case 'price_desc':
            query = query.order('min_price', { ascending: false });
            break;
          case 'bid_count_desc':
            query = query.order('bid_count', { ascending: false, nullsFirst: false });
            break;
          case 'created_at_desc':
          default:
            query = query.order('created_at', { ascending: false });
            break;
        }

        const { data, error: fetchErr } = await query;

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
    [selectedCategory, currentSearchTerm, sortOption], // eslint-disable-line react-hooks/exhaustive-deps
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
                await fetchListings(selectedCategory, currentSearchTerm, sortOption);
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
        await fetchListings(selectedCategory, currentSearchTerm, sortOption);
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
  }, [selectedCategory, fetchListings, currentSearchTerm, sortOption]);

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

  // Handler for category changes from IntegratedSearchBar
  const handleCategoryFilterChange = useCallback((categoryName: string | null) => {
    setSelectedCategory(categoryName);
  }, []);

  // Handle sort option change with URL persistence
  const handleSortChange = useCallback((newSortOption: SortOptionValue) => {
    setSortOption(newSortOption);
    
    // Update URL with new sort parameter
    const currentParams = new URLSearchParams(searchParams.toString());
    currentParams.set('sort', newSortOption);
    
    // Use replace to avoid adding to browser history for every sort change
    router.replace(`/listings?${currentParams.toString()}`, { scroll: false });
  }, [searchParams, router]);

  const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const term = searchInput.trim();
    const currentParams = new URLSearchParams(searchParams.toString());
    if (term) {
      currentParams.set('search', term);
    } else {
      currentParams.delete('search');
    }
    router.replace(`/listings?${currentParams.toString()}`, { scroll: false });
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
              onClick={() => fetchListings(selectedCategory, currentSearchTerm, sortOption)}
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

          {/* New Integrated Search and Filter Section */}
          <div className="relative z-30 max-w-4xl mx-auto mb-8 px-4 sm:px-0">
            {/* Desktop Search Bar */}
            <div className="hidden md:block">
              <IntegratedSearchBar
                searchInput={searchInput}
                setSearchInput={setSearchInput}
                onSearchSubmit={handleSearchSubmit}
                selectedCategory={selectedCategory}
                onCategoryChange={handleCategoryFilterChange}
                categoriesData={CATEGORIES_DATA}
                selectedSort={sortOption}
                onSortChange={handleSortChange}
                sortOptionsData={sortOptions}
              />
            </div>

            {/* Mobile Search Bar & Filters */}
            <div className={`md:hidden ${currentSearchTerm || selectedCategory ? 'space-y-2' : 'space-y-3'}`}>
              {/* Mobile Search Input */}
              <form onSubmit={handleSearchSubmit} className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search listings..."
                  className={`w-full pl-10 pr-4 ${currentSearchTerm || selectedCategory ? 'py-2.5' : 'py-3'} bg-white/90 dark:bg-bye-dark-bg-secondary/90 backdrop-blur-sm border border-gray-200 dark:border-bye-dark-border-primary rounded-xl text-gray-900 dark:text-bye-dark-text-primary placeholder-gray-500 dark:placeholder-bye-dark-text-secondary focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                />
              </form>
              {/* Mobile Filter/Sort Buttons */}
              <div className={`grid grid-cols-2 ${currentSearchTerm || selectedCategory ? 'gap-2' : 'gap-3'}`}>
                <button
                  onClick={() => setIsCategoryModalOpen(true)}
                  className={`flex items-center justify-center gap-1.5 w-full px-3 ${currentSearchTerm || selectedCategory ? 'py-2.5' : 'py-3'} bg-white/90 dark:bg-bye-dark-bg-secondary/90 backdrop-blur-sm border border-gray-200 dark:border-bye-dark-border-primary rounded-xl text-gray-700 dark:text-bye-dark-text-primary font-medium text-sm`}
                >
                  <FunnelIcon className="w-4 h-4" />
                  <span>{selectedCategory ? `${selectedCategory.substring(0,8)}...` : 'Filter'}</span>
                </button>
                <button
                  onClick={() => setIsSortModalOpen(true)}
                  className={`flex items-center justify-center gap-1.5 w-full px-3 ${currentSearchTerm || selectedCategory ? 'py-2.5' : 'py-3'} bg-white/90 dark:bg-bye-dark-bg-secondary/90 backdrop-blur-sm border border-gray-200 dark:border-bye-dark-border-primary rounded-xl text-gray-700 dark:text-bye-dark-text-primary font-medium text-sm`}
                >
                  <AdjustmentsHorizontalIcon className="w-4 h-4" />
                  <span>Sort</span>
                </button>
              </div>
            </div>

            {/* Active Filter Indicators */}
            <div className={`${currentSearchTerm || selectedCategory ? 'mt-2' : 'mt-3'} flex flex-wrap justify-center gap-2 text-sm`}>
              {selectedCategory && (
                <div className="inline-flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full px-3 py-1">
                  Category: {selectedCategory}
                  <button onClick={() => handleCategoryFilterChange(null)} className="ml-1">
                    <XMarkIcon className="w-4 h-4 hover:text-indigo-900 dark:hover:text-indigo-100" />
                  </button>
                </div>
              )}
              {currentSearchTerm && (
                <div className="inline-flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full px-3 py-1">
                  Search: &quot;{currentSearchTerm}&quot;
                  <Link href="/listings" className="ml-1" onClick={() => setSearchInput('')}>
                    <XMarkIcon className="w-4 h-4 hover:text-blue-900 dark:hover:text-blue-100" />
                  </Link>
                </div>
              )}
            </div>
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

      <SortOptionModal
        isOpen={isSortModalOpen}
        onClose={() => setIsSortModalOpen(false)}
        selectedSort={sortOption}
        onSortSelect={(val) => handleSortChange(val as SortOptionValue)}
        sortOptions={sortOptions}
      />
    </div>
  );
}