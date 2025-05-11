// src/app/listings/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { supabase, User } from '@/lib/supabaseClient'; // REMOVED: type Session
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState'; 
import ListingCard, { ListingCardItem } from '@/components/ListingCard';

const PREDEFINED_CATEGORIES = [
  "Electronics & Gadgets",
  "Furniture & Dorm Essentials",
  "Textbooks & Study Materials",
  "Apparel & Accessories",
  "Sports & Hobby Gear",
  "Other"
];

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
  // REMOVED: const [session, setSession] = useState<Session | null>(null);
  const [rows, setRows] = useState<ListingCardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    // MODIFIED: Only set currentUser
    supabase.auth.getSession().then(({ data: { session } }) => { // Destructure session here
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

  const handleCategoryClick = (category: string) => {
    if (selectedCategory === category) {
      setSelectedCategory(null);
    } else {
      setSelectedCategory(category);
    }
  };

  if (loading) return ( <div className="container mx-auto px-4 py-20 flex justify-center"><LoadingSpinner message="Loading active auctions..." /></div> );
  
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
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
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

      <div className="mb-6 sm:mb-8">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mr-2 whitespace-nowrap">Filter by Category:</span>
          {PREDEFINED_CATEGORIES.map(category => (
            <button
              key={category}
              onClick={() => handleCategoryClick(category)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-900
                ${selectedCategory === category 
                  ? 'bg-indigo-600 text-white ring-indigo-400 dark:ring-indigo-600 shadow-md' 
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 ring-gray-300 dark:ring-gray-600 hover:ring-gray-400 dark:hover:ring-gray-500'
                }`}
            >
              {category}
            </button>
          ))}
          {selectedCategory && (
            <button
              onClick={() => setSelectedCategory(null)}
              className="px-2.5 py-1 text-xs font-medium rounded-full text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-700/50 flex items-center gap-1 focus:outline-none focus:ring-2 ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
              title="Clear filter"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M2.09 2.22a.75.75 0 0 1 1.06 0L8 6.94l4.85-4.72a.75.75 0 1 1 1.06 1.06L9.06 8l4.85 4.72a.75.75 0 1 1-1.06 1.06L8 9.06l-4.85 4.72a.75.75 0 0 1-1.06-1.06L6.94 8 2.09 3.28a.75.75 0 0 1 0-1.06Z" /></svg>
              Clear
            </button>
          )}
        </div>
      </div>

      {rows.length === 0 && !loading ? (
        <EmptyState
          message={selectedCategory ? `No active auctions found for "${selectedCategory}". Try a different category or clear the filter.` : "No active auctions available right now. Check back soon or list your own item!"}
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