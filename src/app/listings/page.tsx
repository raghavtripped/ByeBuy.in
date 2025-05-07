// src/app/listings/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { supabase, type Session } from '@/lib/supabaseClient';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import { formatCurrency } from '@/lib/formatUtils';
// isPast is no longer directly needed for the "Ended" badge on this page

// ---------- Types --------------------------------------------------
type Listing = {
  id: string;
  title: string;
  min_price: number;
  photos: string | null;
  current_highest_bid?: number | null;
  end_time?: string | null; 
  status: 'active' | 'closed' | 'cancelled' | string; // Crucial for filtering, allow string for general Supabase payloads
  created_at?: string; // For sorting realtime updates
};

// ---------- Component ---------------------------------------------
export default function ListingsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [rows, setRows] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const loadListings = async () => {
      setLoading(true);
      setError(null);
      try {
        // Fetch only listings with status = 'active'
        const { data, error: fetchError } = await supabase
          .from('listings_with_highest_bid') // Assumes this view correctly provides necessary fields including 'status'
          .select(
            `id, title, min_price, photos, current_highest_bid, end_time, status, created_at` // Ensure 'status' and 'created_at' are selected
          )
          .eq('status', 'active') // <<< --- CRITICAL: Only fetch active listings ---
          .order('created_at', { ascending: false });

        if (fetchError) throw fetchError;
        setRows((data as Listing[]) ?? []); // Ensure type assertion
      } catch (err) {
        console.error("Error loading active listings:", err);
        setError(err instanceof Error ? err.message : 'Failed to load active listings.');
        setRows([]);
      } finally {
        setLoading(false);
      }
    };
    loadListings();

    // --- Realtime Subscription for the listings table ---
    const listingsChannel = supabase
      .channel('public-listings-active-page') // Use a unique channel name for this page
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'listings' }, // Listen to INSERT, UPDATE, DELETE
        async (payload) => {
          console.log('Active Listings Page: Realtime event received', payload);

          const newRecord = payload.new as Listing;
          const oldRecord = payload.old as Listing;

          switch (payload.eventType) {
            case 'INSERT':
              // If a new 'active' listing is inserted, fetch its full details and add it
              if (newRecord?.status === 'active') {
                const { data: newItemData, error: newItemError } = await supabase
                  .from('listings_with_highest_bid')
                  .select('id, title, min_price, photos, current_highest_bid, end_time, status, created_at')
                  .eq('id', newRecord.id)
                  .eq('status', 'active') // Ensure it's still active
                  .single();
                if (!newItemError && newItemData) {
                  setRows((currentRows) => 
                    [newItemData as Listing, ...currentRows.filter((r) => r.id !== newItemData.id)]
                    .sort((a,b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()) // Re-sort
                  );
                }
              }
              break;

            case 'UPDATE':
              // If an existing listing on this page (was 'active') is updated...
              if (oldRecord?.id) {
                const wasActive = rows.some(r => r.id === oldRecord.id); // Check if it was in our current 'active' list

                if (wasActive && newRecord?.status !== 'active') {
                  // Item is no longer active, remove it from this page
                  setRows((currentRows) => currentRows.filter((r) => r.id !== newRecord.id));
                } else if (!wasActive && newRecord?.status === 'active') {
                  // Item became active (e.g., admin re-opened), fetch details and add it
                  const { data: reactivatedItemData, error: itemError } = await supabase
                    .from('listings_with_highest_bid')
                    .select('id, title, min_price, photos, current_highest_bid, end_time, status, created_at')
                    .eq('id', newRecord.id)
                    .eq('status', 'active')
                    .single();
                  if (!itemError && reactivatedItemData) {
                     setRows((currentRows) => 
                        [reactivatedItemData as Listing, ...currentRows.filter((r) => r.id !== reactivatedItemData.id)]
                        .sort((a,b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
                    );
                  }
                } else if (wasActive && newRecord?.status === 'active') {
                  // Item was active and is still active, but other details might have changed (e.g. highest bid)
                  // Re-fetch and update the specific item to get latest bid info etc.
                  const { data: updatedItemData, error: updatedItemError } = await supabase
                    .from('listings_with_highest_bid')
                    .select('id, title, min_price, photos, current_highest_bid, end_time, status, created_at')
                    .eq('id', newRecord.id)
                    .eq('status', 'active')
                    .single();
                  if (!updatedItemError && updatedItemData) {
                    setRows(currentRows => currentRows.map(r => r.id === updatedItemData.id ? updatedItemData as Listing : r)
                                                      .sort((a,b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
                    );
                  }
                }
              }
              break;

            case 'DELETE':
              // If an item is deleted, remove it if it was on this page
              if (oldRecord?.id) {
                setRows((currentRows) => currentRows.filter((r) => r.id !== oldRecord.id));
              }
              break;
            default:
              // console.log('Unhandled realtime event type:', payload.eventType);
              break;
          }
        }
      )
      .subscribe((status) => {
         if (status === 'SUBSCRIBED') {
           console.log('Realtime channel subscribed for active listings page.');
         } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
           console.error(`Realtime channel error/timeout for active listings: ${status}`);
         }
       });
      
    // Cleanup function
    return () => {
      supabase.removeChannel(listingsChannel).then(() => console.log('Realtime channel for active listings unsubscribed.'));
    };
  }, [rows]); // Add `rows` to dependency array if setRows uses currentRows for updates, to avoid stale closures. Better yet, use functional updates for setRows if complex logic is needed. For this case, it's mostly direct sets.

  // --- Render Guards ---
  if (loading) {
    return (
      <div className="container mx-auto px-4 py-20 flex justify-center">
        <LoadingSpinner message="Loading active auctions..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8 text-center text-red-600 dark:text-red-400">
        <p className="font-medium">Error loading auctions:</p>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  // --- Main JSX ---
  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Header Section */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 sm:mb-8 pb-4 border-b border-gray-200 dark:border-gray-700 gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
          🎯 Active Auctions {/* Updated Title */}
        </h1>
        {/* Show 'Create Listing' button only if logged in */}
        {session && (
          <Link
            href="/listings/new"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800 transition-colors whitespace-nowrap"
          >
             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 mr-2">
                 <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
             </svg>
            Create Listing
          </Link>
        )}
      </header>

      {/* Listings Grid or Empty State */}
      {rows.length === 0 ? (
        <EmptyState
          message="No active auctions available right now. Check back soon or list your own item!"
          action={
            session
              ? { href: '/listings/new', text: 'List an Item' }
              : { href: '/auth', text: 'Login to List an Item' }
          }
        />
      ) : (
        <ul
          role="list"
          className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {rows.map((listing) => {
            // No 'hasEnded' check or "Ended" badge needed here, as all listings are 'active'.
            return (
              <li
                key={listing.id}
                className="group relative flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-1"
              >
                <Link href={`/listings/${listing.id}`} className="flex flex-col flex-grow">
                    {/* Image Section */}
                    <div className="aspect-video w-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                        {listing.photos ? (
                            <Image 
                                src={listing.photos}
                                alt={`Image for ${listing.title}`}
                                width={400} 
                                height={225} 
                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                priority={false} 
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-500">
                                <svg className="h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                            </div>
                        )}
                    </div>

                    {/* Content Section */}
                    <div className="p-4 flex flex-col flex-grow">
                        <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2 line-clamp-2 leading-snug group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                            {listing.title}
                        </h3>
                        <div className="mt-auto pt-3 space-y-1 text-sm border-t border-gray-200 dark:border-gray-700">
                            <p className="text-gray-600 dark:text-gray-400">
                                Min Bid:{' '}
                                <span className="font-semibold text-indigo-700 dark:text-indigo-400">
                                    {formatCurrency(listing.min_price)}
                                </span>
                            </p>
                            {listing.current_highest_bid && listing.current_highest_bid > 0 ? (
                                <p className="text-gray-600 dark:text-gray-400">
                                    Top Bid:{' '}
                                    <span className="font-semibold text-green-700 dark:text-green-300">
                                        {formatCurrency(listing.current_highest_bid)}
                                    </span>
                                </p>
                            ) : (
                                <p className="text-gray-500 dark:text-gray-500 italic">
                                    No bids yet
                                </p>
                            )}
                            {/* Optionally display end time for active items */}
                            {/* {listing.end_time && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 pt-1">
                                    Ends: {new Date(listing.end_time).toLocaleDateString([], { dateStyle: 'short', timeStyle: 'short' })}
                                </p>
                            )} */}
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