// src/app/listings/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { supabase, User } from '@/lib/supabaseClient';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import ListingCard, { ListingCardItem } from '@/components/ListingCard';
import CategoryCard from '@/components/CategoryCard'; // Import CategoryCard

// Import specific icons from Heroicons
import {
  ComputerDesktopIcon,
  HomeModernIcon,
  BookOpenIcon,
  ShoppingBagIcon,
  TrophyIcon,
  SquaresPlusIcon,
} from '@heroicons/react/24/outline';

// Adjusted CATEGORIES_WITH_ICONS to use original names and map to chosen icons
const CATEGORIES_WITH_ICONS_ADJUSTED = [
  { name: "Electronics & Gadgets",     icon: ComputerDesktopIcon },
  { name: "Furniture & Dorm Essentials", icon: HomeModernIcon },
  { name: "Textbooks & Study Materials", icon: BookOpenIcon },
  { name: "Apparel & Accessories",       icon: ShoppingBagIcon },
  { name: "Sports & Hobby Gear",         icon: TrophyIcon },
  { name: "Other",                       icon: SquaresPlusIcon },
] as const; // Use 'as const' for better type inference for names


// Helper function to parse photos (assuming it might be a JSON string or already an array)
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
          tags: parsePhotosJson(item.tags), // Assuming tags might also be JSON string
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
        (payload) => {
          let changedItemId: string | undefined = undefined;
          if (payload.new && typeof payload.new === 'object' && 'id' in payload.new) {
            const newId = (payload.new as { id?: unknown }).id;
            if (typeof newId === 'string') changedItemId = newId;
          } else if (payload.old && typeof payload.old === 'object' && 'id' in payload.old) {
            const oldId = (payload.old as { id?: unknown }).id;
            if (typeof oldId === 'string') changedItemId = oldId;
          }
          console.log('ListingsPage RT change (event:', payload.eventType, ', item ID:', changedItemId || 'N/A', '), refetching with filter:', selectedCategory);
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
    if (selectedCategory === categoryName) {
      setSelectedCategory(null);
    } else {
      setSelectedCategory(categoryName);
    }
  };

  if (loading && rows.length === 0) {
    return ( <div className="container mx-auto px-4 py-20 flex justify-center"><LoadingSpinner message="Loading active auctions..." /></div> );
  }
  
  if (error) return (
    <div className="container mx-auto px-4 py-8 text-center">
      <p className="font-medium text-red-600 dark:text-red-400">Error loading auctions:</p>
      <p className="text-sm text-red-500 dark:text-red-300">{error}</p>
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
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 sm:mb-8 pb-4 border-b border-gray-200 dark:border-gray-700 gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
          🎯 Active Auctions
        </h1>
        {currentUser && (
            <Link href="/listings/new" className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800 transition-colors whitespace-nowrap">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 mr-2"><path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" /></svg>
                Create Listing
            </Link>
        )}
      </header>

      <section aria-labelledby="categories-heading" className="mb-8 sm:mb-10">
        <h2 id="categories-heading" className="text-xl sm:text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-4 sm:mb-6">
          Explore Categories
        </h2>
        {/* Reduced gap for tighter packing, especially on mobile */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
          {CATEGORIES_WITH_ICONS_ADJUSTED.map((category) => (
            <CategoryCard
              key={category.name}
              categoryName={category.name}
              icon={category.icon} // Pass the component type directly
              isSelected={selectedCategory === category.name}
              onClick={() => handleCategoryClick(category.name)}
            />
          ))}
        </div>
      </section>
      
      {loading && rows.length > 0 && (
        <div className="py-8 flex justify-center">
          <LoadingSpinner message="Updating auctions..." />
        </div>
      )}

      {!loading && rows.length === 0 ? (
        <EmptyState
          message={
            selectedCategory
              ? `No active auctions found for "${selectedCategory}". Try a different category.`
              : "No active auctions available right now. Check back soon or list your own item!"
          }
          action={!selectedCategory ? emptyStateAction : undefined}
          className="py-10"
        />
      ) : (
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
    </div>
  );
}