// src/app/page.tsx
'use client'; // <-- This is important, copied from listings/page.tsx

// ---------- Imports (copied from listings/page.tsx) -----------------
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image'; // This will overwrite the simpler Image import from the original page.tsx
import { supabase, type Session } from '@/lib/supabaseClient';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import { formatCurrency } from '@/lib/formatUtils';

// ---------- Types (copied from listings/page.tsx) --------------------
type Listing = {
  id: string;
  title: string;
  min_price: number;
  photos: string[] | null;
  current_highest_bid?: number | null;
  end_time?: string | null;
  status: 'active' | 'closed' | 'cancelled' | string;
  created_at?: string;
};

type ListingTablePayload = Partial<{
  id: string;
  title: string;
  min_price: number;
  photos: string[] | null;
  end_time: string | null;
  status: 'active' | 'closed' | 'cancelled' | string;
  created_at: string;
}> & { id?: string };

// ---------- Component (Logic copied from ListingsPage, renamed to Home) ---
export default function Home() { // <-- Renamed from ListingsPage to Home
  const [session, setSession] = useState<Session | null>(null);
  const [rows, setRows] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- Realtime Handler (copied from listings/page.tsx) ---
  const handleRealtimeChange = useCallback(async (payload: RealtimePostgresChangesPayload<ListingTablePayload>) => {
    const logId = (payload.new && 'id' in payload.new && payload.new.id)
                  ? payload.new.id
                  : (payload.old && 'id' in payload.old && payload.old.id)
                    ? payload.old.id
                    : 'UNKNOWN_ID';
    console.log('Homepage (Active Listings): Realtime event received', payload.eventType, logId); // <-- Log message updated for clarity

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
             console.error(`RT (Homepage): Failed fetch full details for active listing ${itemId}`, itemError); // <-- Log message updated
             return null;
         }
         return { ...itemData, photos: itemData.photos as string[] | null } as Listing;
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
            const existingItemIndex = updatedList.findIndex(r => r.id === newRecord.id);
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
              if (existingItemIndex !== -1) {
                updatedList.splice(existingItemIndex, 1);
                requiresSort = true;
              }
            }
          }
          break;

        case 'DELETE':
          if (oldRecord?.id) {
            const initialLength = updatedList.length;
            updatedList = updatedList.filter((r) => r.id !== oldRecord.id);
            if(updatedList.length !== initialLength) requiresSort = true;
          }
          break;
        default:
          break;
      }
      return requiresSort ? updatedList.sort(sortByCreatedAtDesc) : updatedList;
    });
  }, []);

  // --- Initial Load & Realtime Subscription (copied from listings/page.tsx) ---
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
            photos: item.photos as string[] | null
        })) as Listing[];
        setRows(correctlyTypedData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load active auctions.'); // Message slightly updated
        setRows([]);
      } finally { setLoading(false); }
    };
    loadListings();

    const listingsSubscription = supabase
      .channel('public-listings-homepage-v7') // <-- Channel name can be unique if desired, e.g., for debugging
      .on<ListingTablePayload>(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'listings' },
        handleRealtimeChange
      )
      .subscribe((status, err) => {
         if (status === 'SUBSCRIBED') { console.log('RT channel subscribed for homepage active listings.'); } // <-- Log message updated
         else if (status === 'CHANNEL_ERROR') { console.error(`RT channel error (Homepage):`, err); } // <-- Log message updated
         else if (status === 'TIMED_OUT') { console.warn(`RT channel timed out (Homepage).`); } // <-- Log message updated
         else { console.log(`RT channel status (Homepage): ${status}`); } // <-- Log message updated
       });

    return () => {
      if (listingsSubscription) {
          supabase.removeChannel(listingsSubscription).then(() => console.log('RT channel for homepage unsubscribed.')); // <-- Log message updated
      } else { console.log("No active RT channel to unsubscribe for homepage."); } // <-- Log message updated
    };
  }, [handleRealtimeChange]);

  // --- Render Guards (copied from listings/page.tsx) ---
  if (loading) return ( <div className="container mx-auto px-4 py-20 flex justify-center"><LoadingSpinner message="Loading active auctions..." /></div> );
  if (error) return ( <div className="container mx-auto px-4 py-8 text-center text-red-600 dark:text-red-400"><p className="font-medium">Error loading auctions:</p><p className="text-sm">{error}</p></div> );

  const emptyStateAction = session
    ? { href: '/listings/new', text: 'List an Item' }
    : { href: '/auth', text: 'Login to List an Item' };

  // --- Main JSX (copied from listings/page.tsx) ---
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
            const thumbnailUrl = (listing.photos && listing.photos.length > 0) ? listing.photos[0] : null;

            return (
              <li
                key={listing.id}
                className="group relative flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-1"
              >
                <Link href={`/listings/${listing.id}`} className="flex flex-col flex-grow">
                    <div className="aspect-video w-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                        {thumbnailUrl ? (
                            <Image
                                src={thumbnailUrl}
                                alt={`Image for ${listing.title}`}
                                width={400} height={225}
                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
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