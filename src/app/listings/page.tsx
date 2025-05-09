// src/app/listings/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { supabase, type Session } from '@/lib/supabaseClient';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import { formatCurrency } from '@/lib/formatUtils';

// ---------- Helper Functions ---------------------------------------
/**
 * Safely parses a JSON string (expected to be an array of photo URLs)
 * into a string array or returns null if input is invalid, null, or already an array.
 * @param photosInput - The input which can be a JSON string, an array of strings, null, or undefined.
 * @returns A string array of photo URLs or null.
 */
const parsePhotosJson = (photosInput: string | string[] | null | undefined): string[] | null => {
  if (photosInput === null || photosInput === undefined) {
    return null;
  }
  if (Array.isArray(photosInput)) {
    // Already an array, ensure it's string[]
    if (photosInput.every(item => typeof item === 'string')) {
      return photosInput as string[];
    }
    console.warn('Photos input is an array but not uniformly strings:', photosInput);
    return null; // Or handle as an error appropriately
  }
  if (typeof photosInput === 'string') {
    try {
      const parsed = JSON.parse(photosInput);
      if (Array.isArray(parsed) && parsed.every(item => typeof item === 'string')) {
        return parsed as string[];
      }
      console.warn('Parsed photos JSON string is not an array of strings:', parsed);
      return null;
    } catch (error) {
      console.error('Failed to parse photos JSON string:', photosInput, error);
      return null;
    }
  }
  console.warn('Unexpected type for photosInput, cannot parse:', typeof photosInput, photosInput);
  return null;
};


// ---------- Types --------------------------------------------------
type Listing = {
  id: string;
  title: string;
  min_price: number;
  photos: string[] | null; // Array of photo URLs (ensured by parsing)
  current_highest_bid?: number | null;
  end_time?: string | null;
  status: 'active' | 'closed' | 'cancelled' | string;
  created_at?: string;
};

type ListingTablePayload = Partial<{
  id: string;
  title: string;
  min_price: number;
  photos: string | string[] | null; // Raw photos from DB can be string or already array
  end_time: string | null;
  status: 'active' | 'closed' | 'cancelled' | string;
  created_at: string;
}> & { id?: string };


// ---------- Component ---------------------------------------------
export default function ListingsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [rows, setRows] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- Realtime Handler ---
  const handleRealtimeChange = useCallback(async (payload: RealtimePostgresChangesPayload<ListingTablePayload>) => {
    const logId = (payload.new && 'id' in payload.new && payload.new.id)
                  ? payload.new.id
                  : (payload.old && 'id' in payload.old && payload.old.id)
                    ? payload.old.id
                    : 'UNKNOWN_ID';
    console.log('Active Listings Page: Realtime event received', payload.eventType, logId);

    const newRecord = payload.new && 'id' in payload.new && payload.new.id ? payload.new : undefined;
    const oldRecord = payload.old && 'id' in payload.old && payload.old.id ? payload.old : undefined;

    const sortByCreatedAtDesc = (a: Listing, b: Listing) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();

    const fetchFullItemDetails = async (itemId: string): Promise<Listing | null> => {
         const { data: itemData, error: itemError } = await supabase
            .from('listings_with_highest_bid')
            .select(`id, title, min_price, photos, current_highest_bid, end_time, status, created_at`)
            .eq('id', itemId)
            .eq('status', 'active')
            .maybeSingle();

         if (itemError || !itemData) {
             console.error(`RT: Failed fetch full details for active listing ${itemId}`, itemError);
             return null;
         }
         // Parse photos here
         return {
            ...itemData,
            photos: parsePhotosJson(itemData.photos as string | string[] | null)
         } as Listing;
    }

    setRows((currentRows) => {
      let updatedList = [...currentRows];
      let requiresSort = false;

      switch (payload.eventType) {
        case 'INSERT':
          if (newRecord?.id && newRecord.status === 'active') {
             fetchFullItemDetails(newRecord.id).then(detailedItem => {
                if(detailedItem) {
                    setRows(prev => {
                         if (!prev.some(r => r.id === detailedItem.id)) {
                            return [detailedItem, ...prev].sort(sortByCreatedAtDesc);
                         }
                         return prev;
                    });
                }
             });
          }
          break;

        case 'UPDATE':
          if (newRecord?.id) {
            if (newRecord.status === 'active') {
              fetchFullItemDetails(newRecord.id).then(detailedItem => {
                  if(detailedItem) {
                      setRows(prev => {
                          const currentIdx = prev.findIndex(r => r.id === detailedItem.id);
                          if(currentIdx !== -1) {
                              const newList = [...prev];
                              newList[currentIdx] = detailedItem;
                              return newList;
                          } else {
                               return [detailedItem, ...prev].sort(sortByCreatedAtDesc);
                          }
                      });
                  } else {
                      setRows(prev => prev.filter(r => r.id !== newRecord.id));
                  }
              });
            } else {
              const existingItemIndex = updatedList.findIndex(r => r.id === newRecord.id);
              if (existingItemIndex !== -1) {
                updatedList.splice(existingItemIndex, 1);
                // No sort needed here if only removing, but if other ops need it, keep the flag
                // For now, directly return the filtered list to avoid re-sorting an already sorted list
                return updatedList.filter(r => r.id !== newRecord.id);
              }
            }
          }
          break;

        case 'DELETE':
          if (oldRecord?.id) {
            const itemExists = updatedList.some(r => r.id === oldRecord.id);
            if (itemExists) {
                // Directly return the filtered list
                return updatedList.filter((r) => r.id !== oldRecord.id);
            }
          }
          break;
        default:
          return currentRows; // Return current rows if no changes applied
      }
      // If INSERT or UPDATE happened with async fetch, those internal setRows will handle sorting.
      // This return is primarily for synchronous DELETE or status change to inactive in UPDATE.
      // If only DELETE, list remains sorted. If status change, list remains sorted.
      // So, explicit sort here might be redundant if async paths handle their own sort.
      // Let's ensure only structural changes that don't self-sort trigger a re-sort.
      // The current DELETE and status change to inactive effectively just filter.
      // The INSERT and active UPDATE paths handle their own sorting.
      return updatedList; // No sort needed here as specific cases handle it or preserve order.
    });
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const loadListings = async () => {
      setLoading(true); setError(null);
      try {
        const { data, error: fetchError } = await supabase
          .from('listings_with_highest_bid')
          .select(`id, title, min_price, photos, current_highest_bid, end_time, status, created_at`)
          .eq('status', 'active')
          .order('created_at', { ascending: false });

        if (fetchError) throw fetchError;

        const correctlyTypedData = (data ?? []).map(item => ({
            ...item,
            photos: parsePhotosJson(item.photos as string | string[] | null) // Parse photos here
        })) as Listing[];
        setRows(correctlyTypedData);

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load active listings.');
        setRows([]);
      } finally { setLoading(false); }
    };
    loadListings();

    const listingsSubscription = supabase
      .channel('public-listings-active-page-v7')
      .on<ListingTablePayload>(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'listings' },
        handleRealtimeChange
      )
      .subscribe((status, err) => {
         if (status === 'SUBSCRIBED') { console.log('RT channel subscribed for active listings.'); }
         else if (status === 'CHANNEL_ERROR') { console.error(`RT channel error:`, err); }
         else if (status === 'TIMED_OUT') { console.warn(`RT channel timed out.`); }
         else { console.log(`RT channel status: ${status}`); }
       });

    return () => {
      if (listingsSubscription) {
          supabase.removeChannel(listingsSubscription).then(() => console.log('RT channel for active listings unsubscribed.'));
      } else { console.log("No active RT channel to unsubscribe for listings page."); }
    };
  }, [handleRealtimeChange]);


  if (loading) return ( <div className="container mx-auto px-4 py-20 flex justify-center"><LoadingSpinner message="Loading active auctions..." /></div> );
  if (error) return ( <div className="container mx-auto px-4 py-8 text-center text-red-600 dark:text-red-400"><p className="font-medium">Error loading auctions:</p><p className="text-sm">{error}</p></div> );

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

      {rows.length === 0 ? (
        <EmptyState
          message="No active auctions available right now. Check back soon or list your own item!"
          action={emptyStateAction}
        />
      ) : (
        <ul
          role="list"
          className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {rows.map((listing) => {
            // Ensure listing.photos is an array and has items before accessing photos[0]
            const thumbnailUrl = (listing.photos && listing.photos.length > 0) ? listing.photos[0] : null;

            return (
              <li
                key={listing.id}
                className="group relative flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-1"
              >
                <Link href={`/listings/${listing.id}`} className="flex flex-col flex-grow">
                    {/* === MODIFIED IMAGE CONTAINER AND IMAGE COMPONENT START === */}
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
                    {/* === MODIFIED IMAGE CONTAINER AND IMAGE COMPONENT END === */}
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