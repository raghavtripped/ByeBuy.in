// src/app/listings/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { supabase, type Session } from '@/lib/supabaseClient';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState'; 
import { formatCurrency } from '@/lib/formatUtils';

// ---------- Predefined Categories/Tags for Filtering ----------
const PREDEFINED_CATEGORIES = [
  "Electronics & Gadgets",
  "Furniture & Dorm Essentials",
  "Textbooks & Study Materials",
  "Apparel & Accessories",
  "Sports & Hobby Gear",
];

// ---------- Helper Functions ---------------------------------------
const parsePhotosJson = (photosInput: string | string[] | null | undefined): string[] | null => {
  if (photosInput === null || photosInput === undefined) return null;
  if (Array.isArray(photosInput)) {
    return photosInput.every(item => typeof item === 'string') ? photosInput as string[] : null;
  }
  if (typeof photosInput === 'string') {
    try {
      const parsed = JSON.parse(photosInput);
      return (Array.isArray(parsed) && parsed.every(item => typeof item === 'string')) ? parsed as string[] : null;
    } catch (_error) {
      return null;
    }
  }
  return null;
};

// ---------- Types --------------------------------------------------
type Listing = {
  id: string;
  title: string;
  min_price: number;
  photos: string[] | null;
  current_highest_bid?: number | null;
  end_time?: string | null;
  status: 'active' | 'closed' | 'cancelled' | string;
  created_at?: string;
  tags?: string[] | null; // Now assuming this will be string[] directly if DB column is text[]
};

type ListingTablePayload = Partial<Omit<Listing, 'photos' | 'tags'> & {
    photos: string | string[] | null;
    tags: string[] | null; // If DB is text[], this would likely come as string[]
}> & { id?: string };


// ---------- Component ---------------------------------------------
export default function ListingsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [rows, setRows] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const fetchListings = useCallback(async (category: string | null) => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('listings_with_highest_bid')
        .select(`id, title, min_price, photos, current_highest_bid, end_time, status, created_at, tags`)
        .eq('status', 'active');

      if (category) {
        // MODIFIED TO USE ARRAY CONTAINS OPERATOR
        // This assumes 'tags' column in the view 'listings_with_highest_bid' is of type TEXT[]
        query = query.contains('tags', [category]); 
      }

      const { data, error: fetchError } = await query
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      const correctlyTypedData = (data ?? []).map(item => ({
          ...item,
          photos: parsePhotosJson(item.photos as string | string[] | null),
          // If 'tags' comes directly as string[] from a TEXT[] DB column, no parsing needed here.
          // If it's still a JSON string from a TEXT column that the view passes through, parsing is needed.
          // Given the error, assume it's treated as array-like by PostgREST or is actual array.
          tags: Array.isArray(item.tags) ? item.tags as string[] : parsePhotosJson(item.tags as string | string[] | null),
          status: item.status as Listing['status']
      })) as Listing[];
      setRows(correctlyTypedData);

    } catch (err) {
      console.error("Detailed error in listings/page.tsx fetchListings:", JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
      setError(err instanceof Error ? err.message : 'Failed to load active listings (unknown error structure).');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);


  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    fetchListings(selectedCategory);

    const listingsSubscription = supabase
      .channel('public-listings-active-page-v12') // Increment channel name
      .on<ListingTablePayload>(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'listings' },
        (_payload) => {
            console.log('RT change detected on listings, refetching with filter:', selectedCategory);
            fetchListings(selectedCategory);
        }
      )
      .subscribe((status, err) => {
         if (status === 'SUBSCRIBED') { console.log('RT channel subscribed for active listings.'); }
         else if (status === 'CHANNEL_ERROR') { console.error(`RT channel error:`, err); }
         else if (status === 'TIMED_OUT') { console.warn(`RT channel timed out.`); }
       });

    return () => {
      if (listingsSubscription) {
          supabase.removeChannel(listingsSubscription).then(() => console.log('RT channel for active listings unsubscribed.'));
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

  const emptyStateAction = session
    ? { href: '/listings/new', text: 'List an Item' }
    : { href: '/auth', text: 'Login to List an Item' };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 sm:mb-8 pb-4 border-b border-gray-200 dark:border-gray-700 gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
          🎯 Active Auctions
        </h1>
        {session && ( <Link href="/listings/new" className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800 transition-colors whitespace-nowrap"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 mr-2"><path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" /></svg>Create Listing</Link> )}
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
          {rows.map((listing) => {
            const thumbnailUrl = (listing.photos && listing.photos.length > 0) ? listing.photos[0] : null;
            return (
              <li
                key={listing.id}
                className="group relative flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-1"
              >
                <Link href={`/listings/${listing.id}`} className="flex flex-col flex-grow">
                    <div className="aspect-video w-full bg-gray-100 dark:bg-gray-700 overflow-hidden relative rounded-t-lg">
                        {thumbnailUrl ? (
                            <Image
                                src={thumbnailUrl}
                                alt={`Cover image for ${listing.title}`}
                                fill
                                style={{ objectFit: 'cover' }}
                                className="transition-transform duration-300 group-hover:scale-105"
                                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
                                priority={false}
                                onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder-image.svg'; }}
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-500">
                                <svg className="h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            </div>
                        )}
                    </div>
                    <div className="p-4 flex flex-col flex-grow">
                        <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2 line-clamp-2 leading-snug group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{listing.title}</h3>
                        <div className="mt-auto pt-3 space-y-1 text-sm border-t border-gray-200 dark:border-gray-700">
                            <p className="text-gray-600 dark:text-gray-400">Min Bid:{' '}<span className="font-semibold text-indigo-700 dark:text-indigo-400">{formatCurrency(listing.min_price)}</span></p>
                            {listing.current_highest_bid && listing.current_highest_bid > 0 ? ( <p className="text-gray-600 dark:text-gray-400">Top Bid:{' '}<span className="font-semibold text-green-700 dark:text-green-300">{formatCurrency(listing.current_highest_bid)}</span></p> ) : ( <p className="text-gray-500 dark:text-gray-500 italic">No bids yet</p> )}
                        </div>
                    </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}