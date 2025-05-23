// src/app/listings/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { supabase, User } from '@/lib/supabaseClient';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import ListingCard, { ListingCardItem } from '@/components/ListingCard';
import CategoryCard from '@/components/CategoryCard';
import CategoryFilterModal from '@/components/CategoryFilterModal'; // Import the modal

// Import specific icons from Heroicons
import {
  ComputerDesktopIcon,
  HomeModernIcon,
  BookOpenIcon,
  ShoppingBagIcon,
  TrophyIcon,
  SquaresPlusIcon,
  FunnelIcon, // For the filter button
} from '@heroicons/react/24/outline';

// This is your existing categories definition
export const CATEGORIES_WITH_ICONS_ADJUSTED = [ // Export if CategoryFilterModal needs to import it
  { name: "Electronics & Gadgets",     icon: ComputerDesktopIcon },
  { name: "Furniture & Dorm Essentials", icon: HomeModernIcon },
  { name: "Textbooks & Study Materials", icon: BookOpenIcon },
  { name: "Apparel & Accessories",       icon: ShoppingBagIcon },
  { name: "Sports & Hobby Gear",         icon: TrophyIcon },
  { name: "Other",                       icon: SquaresPlusIcon },
] as const;


const parsePhotosJson = (photosInput: string | string[] | null | undefined): string[] | null => {
  if (photosInput === null || photosInput === undefined) return null;
  if (Array.isArray(photosInput)) {
    return photosInput.every(item => typeof item === 'string') ? photosInput as string[] : null;
  }
  if (typeof photosInput === 'string') {
    try {
      const parsed = JSON.parse(photosInput);
      return (Array.isArray(parsed) && parsed.every(item => typeof item === 'string')) ? parsed as string[] : null;
    } catch (parseError) {
      console.warn('Failed to parse photos JSON string:', parseError);
      return null;
    }
  }
  return null;
};

type ListingTablePayload = Partial<Omit<ListingCardItem, 'photos' | 'tags'>> & {
    photos?: string | string[] | null;
    tags?: string | string[] | null;
    id?: string;
};

export default function ListingsPage() {
  const [rows, setRows] = useState<ListingCardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
        setCurrentUser(session?.user ?? null);
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
        setCurrentUser(session?.user ?? null);
    });
    return () => {
        authListener?.subscription.unsubscribe();
    };
  }, []);

  const fetchListings = useCallback(async (category: string | null) => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('listings_with_highest_bid')
        .select(`id, title, min_price, photos, current_highest_bid, end_time, status, created_at, tags`)
        .eq('status', 'active');

      if (category) {
        query = query.contains('tags', [category]);
      }

      const { data, error: fetchError } = await query
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      const correctlyTypedData = (data ?? []).map(item => ({
          id: item.id || '',
          title: item.title || 'Untitled Listing',
          min_price: item.min_price || 0,
          photos: parsePhotosJson(item.photos),
          tags: parsePhotosJson(item.tags),
          status: item.status as ListingCardItem['status'] || 'unknown',
          current_highest_bid: item.current_highest_bid ?? null,
          end_time: item.end_time ?? null,
      })).filter(item => item.id) as ListingCardItem[];
      setRows(correctlyTypedData);

    } catch (err: unknown) {
      console.error("Detailed error in listings/page.tsx fetchListings:", err);
      let message = 'Failed to load active listings.';
      if (err instanceof Error) message = err.message;
      else if (typeof err === 'string') message = err;
      else if (err && typeof err === 'object' && 'message' in err && typeof (err as {message: unknown}).message === 'string') {
          message = (err as {message: string}).message;
      }
      setError(message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchListings(selectedCategory);

    const listingsSubscription = supabase
      .channel('public-listings-active-page-listings-page')
      .on<ListingTablePayload>(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'listings' },
        (_payload) => { // MODIFIED: Renamed payload to _payload to satisfy ESLint if rule is strict
          let changedItemId: string | undefined = undefined;
          if (_payload.new && typeof _payload.new === 'object' && 'id' in _payload.new) {
            const newId = (_payload.new as { id?: unknown }).id;
            if (typeof newId === 'string') changedItemId = newId;
          } else if (_payload.old && typeof _payload.old === 'object' && 'id' in _payload.old) {
            const oldId = (_payload.old as { id?: unknown }).id;
            if (typeof oldId === 'string') changedItemId = oldId;
          }
          console.log('ListingsPage RT change (event:', _payload.eventType, ', item ID:', changedItemId || 'N/A', '), refetching with filter:', selectedCategory);
          fetchListings(selectedCategory);
        }
      )
      .subscribe((status, err) => {
         if (status === 'SUBSCRIBED') { console.log('ListingsPage RT channel subscribed.'); }
         else if (status === 'CHANNEL_ERROR') { console.error(`ListingsPage RT channel error:`, err); }
         else if (status === 'TIMED_OUT') { console.warn(`ListingsPage RT channel timed out.`); }
       });

    return () => {
      if (listingsSubscription) {
          supabase.removeChannel(listingsSubscription).then(() => console.log('ListingsPage RT channel unsubscribed.'));
      }
    };
  }, [selectedCategory, fetchListings]);

  const handleCategoryClick = (categoryName: string) => {
    setSelectedCategory(prev => (prev === categoryName ? null : categoryName));
  };

  const handleModalCategorySelect = (categoryName: string) => {
    setSelectedCategory(categoryName);
    setIsCategoryModalOpen(false);
  };

  const handleModalClearFilter = () => {
    setSelectedCategory(null);
    setIsCategoryModalOpen(false);
  };

  if (loading && rows.length === 0) {
    return ( <div className="container mx-auto px-4 py-20 flex justify-center"><LoadingSpinner message="Loading active auctions..." /></div> );
  }
  
  if (error) return (
    <div className="container mx-auto px-4 py-8 text-center">
      <p className="font-medium text-red-600 dark:text-red-300">Error loading auctions:</p>
      <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
      <button
        onClick={() => fetchListings(selectedCategory)}
        className="mt-4 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
      >
        Try Again
      </button>
    </div>
  );

  const emptyStateAction = currentUser
    ? { href: '/listings/new', text: 'List an Item' }
    : { href: '/auth?redirect=/listings/new', text: 'Login to List an Item' };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 sm:mb-8 pb-4 border-b border-gray-200 dark:border-bye-dark-border-primary gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-bye-dark-text-primary tracking-tight">
          🎯 Active Auctions
        </h1>
        {currentUser && (
            <Link href="/listings/new" className="hidden md:inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-bye-dark-bg-primary dark:focus:ring-indigo-400 transition-colors whitespace-nowrap">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 mr-2"><path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" /></svg>
                Create Listing
            </Link>
        )}
      </header>

      {/* Desktop inline category grid (md and up) */}
      <section aria-labelledby="categories-heading-desktop" className="hidden md:block mb-8 sm:mb-10">
        <h2 id="categories-heading-desktop" className="text-xl sm:text-2xl font-semibold text-gray-800 dark:text-bye-dark-text-primary mb-4 sm:mb-6">
          Explore Categories
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
          {CATEGORIES_WITH_ICONS_ADJUSTED.map((category) => (
            <CategoryCard
              key={category.name}
              categoryName={category.name}
              icon={category.icon}
              isSelected={selectedCategory === category.name}
              onClick={() => handleCategoryClick(category.name)}
            />
          ))}
        </div>
      </section>
      
      {/* Mobile filter button (hidden on md and up) */}
      <div className="flex md:hidden justify-center mb-6">
        <button
          onClick={() => setIsCategoryModalOpen(true)}
          className="inline-flex items-center px-4 py-2.5 bg-white dark:bg-bye-dark-bg-secondary border border-gray-300 dark:border-bye-dark-border-primary rounded-lg text-sm font-medium text-gray-700 dark:text-bye-dark-text-primary hover:bg-gray-50 dark:hover:bg-bye-dark-bg-hover transition-colors shadow-sm w-full max-w-xs sm:max-w-sm"
        >
          <FunnelIcon className="w-5 h-5 mr-2 text-gray-500 dark:text-bye-dark-text-secondary" />
          <span className="flex-grow text-left">
            {selectedCategory ? `Category: ${selectedCategory}` : 'Filter All Categories'}
          </span>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 ml-2 text-gray-400 dark:text-bye-dark-text-secondary">
            <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
      
      {loading && rows.length > 0 && (
        <div className="py-8 flex justify-center">
          <LoadingSpinner message="Updating auctions..." />
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <EmptyState
          message={
            selectedCategory
              ? `No active auctions found for "${selectedCategory}". Try a different category.`
              : "No active auctions available right now. Check back soon or list your own item!"
          }
          action={!selectedCategory ? emptyStateAction : undefined}
          className="py-10"
        />
      )}
      
      {!loading && !error && rows.length > 0 && (
        <ul
          role="list"
          className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {rows.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              currentUser={currentUser}
            />
          ))}
        </ul>
      )}

      <CategoryFilterModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        selectedCategory={selectedCategory}
        onCategorySelect={handleModalCategorySelect}
        onClearFilter={handleModalClearFilter}
        categories={CATEGORIES_WITH_ICONS_ADJUSTED} 
      />
    </div>
  );
}