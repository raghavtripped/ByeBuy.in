// src/app/listings/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { supabase, type Session } from '@/lib/supabaseClient'; // Session from here
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'; // <<< --- CORRECTED IMPORT ---
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import { formatCurrency } from '@/lib/formatUtils';

// ---------- Types --------------------------------------------------
type Listing = {
  id: string;
  title: string;
  min_price: number;
  photos: string | null;
  current_highest_bid?: number | null;
  end_time?: string | null; 
  status: 'active' | 'closed' | 'cancelled' | string;
  created_at?: string; 
};

// ---------- Component ---------------------------------------------
export default function ListingsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [rows, setRows] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Using useCallback for the realtime handler to stabilize its reference
  // unless its own dependencies (like 'rows' if it reads from it) change.
  const handleRealtimeChange = useCallback(async (payload: RealtimePostgresChangesPayload<Listing>) => {
    console.log('Active Listings Page: Realtime event received', payload.eventType);

    const newRecord = payload.new as Listing | undefined; // Use 'as undefined' for clarity
    const oldRecord = payload.old as Partial<Listing> | undefined;

    const fetchFullItemDetails = async (itemId: string) => {
      const { data, error: fetchItemError } = await supabase
        .from('listings_with_highest_bid')
        .select('id, title, min_price, photos, current_highest_bid, end_time, status, created_at')
        .eq('id', itemId)
        .eq('status', 'active')
        .single();
      if (fetchItemError) {
        console.error(`Error fetching details for item ${itemId} in realtime handler:`, fetchItemError);
        return null;
      }
      return data as Listing | null;
    };
    
    const sortByCreatedAtDesc = (a: Listing, b: Listing) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();

    setRows((currentRows) => { // Use functional update for setRows
      let updatedList = [...currentRows];
      switch (payload.eventType) {
        case 'INSERT':
          if (newRecord && 'id' in newRecord && newRecord.status === 'active') {
            // Fetch full details for the new item before adding
            // This is an async operation inside a sync update, which is complex.
            // Consider fetching outside and then setting, or simplify.
            // For now, let's assume direct add, then potential update if needed.
            // To avoid race conditions, it might be better to just add the basic newRecord
            // and let another mechanism (or a subsequent UPDATE event) fill in details like current_highest_bid.
            // Or, trigger a re-fetch of that specific item.
            // For simplicity of this fix, we'll just add what we have.
            if (!updatedList.some(r => r.id === newRecord.id)) {
                 updatedList.unshift(newRecord); // Add new active item
            }
          }
          break;

        case 'UPDATE':
          if (newRecord && 'id' in newRecord) {
            const existingItemIndex = updatedList.findIndex(r => r.id === newRecord.id);
            if (newRecord.status === 'active') {
              // Item is or became active
              if (existingItemIndex !== -1) {
                updatedList[existingItemIndex] = newRecord; // Update existing active item
              } else {
                updatedList.unshift(newRecord); // Add newly active item
              }
            } else {
              // Item is no longer active
              if (existingItemIndex !== -1) {
                updatedList.splice(existingItemIndex, 1); // Remove from active list
              }
            }
          }
          break;

        case 'DELETE':
          if (oldRecord && 'id' in oldRecord && oldRecord.id) {
            updatedList = updatedList.filter((r) => r.id !== oldRecord.id);
          }
          break;
      }
      return updatedList.sort(sortByCreatedAtDesc);
    });
  }, []); // Empty dependency array for useCallback: handleRealtimeChange is stable.
            // It uses setRows functional update, so it doesn't need `rows` from closure.

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const loadListings = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: fetchError } = await supabase
          .from('listings_with_highest_bid')
          .select(`id, title, min_price, photos, current_highest_bid, end_time, status, created_at`)
          .eq('status', 'active')
          .order('created_at', { ascending: false });
        if (fetchError) throw fetchError;
        setRows((data as Listing[]) ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load active listings.');
        setRows([]);
      } finally {
        setLoading(false);
      }
    };
    loadListings();

    const listingsChannel = supabase
      .channel('public-listings-active-page-v3') // New channel name
      .on<Listing>( // Specify the type for the payload
        'postgres_changes',
        { event: '*', schema: 'public', table: 'listings' },
        handleRealtimeChange 
      )
      .subscribe((status) => {
         if (status === 'SUBSCRIBED') console.log('RT channel subscribed for active listings.');
         else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.error(`RT channel error: ${status}`);
       });
      
    return () => {
      supabase.removeChannel(listingsChannel).then(() => console.log('RT channel for active listings unsubscribed.'));
    };
  }, [handleRealtimeChange]); // Depend on the memoized handler

  // --- Render Guards ---
  if (loading) { /* ... as before ... */ }
  if (error) { /* ... as before ... */ }

  // --- Main JSX ---
  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 sm:mb-8 pb-4 border-b border-gray-200 dark:border-gray-700 gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
          🎯 Active Auctions
        </h1>
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

      {rows.length === 0 ? (
        <EmptyState
          message="No active auctions available right now. Check back soon or list your own item!"
          action={ session ? { href: '/listings/new', text: 'List an Item' } : { href: '/auth', text: 'Login to List an Item' } }
        />
      ) : (
        <ul
          role="list"
          // className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:gdrive-cols-4" // OLD TYPO
          className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" // <<< --- CORRECTED TYPO ---
        >
          {rows.map((listing) => {
            return (
              <li
                key={listing.id}
                className="group relative flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-1"
              >
                <Link href={`/listings/${listing.id}`} className="flex flex-col flex-grow">
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
// Fill in loading/error JSX from your previous version.