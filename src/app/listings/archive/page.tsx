// src/app/listings/archive/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react'; // Added useCallback
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '@/lib/supabaseClient';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import { formatCurrency } from '@/lib/formatUtils';
import { formatRelativeTime } from '@/lib/timeUtils';

// --- Types ---

// Final display type for items in the state, with narrowed status
type ArchivedListingDisplay = {
  id: string;
  title: string;
  min_price: number;
  photos: string[] | null; // Expect array or null
  end_time: string | null;
  created_at?: string; // For reliable sorting fallback
  status: 'closed' | 'cancelled'; // Status must be one of these
  seller_email?: string | null;
  winning_bidder_id?: string | null;
  winner_email?: string | null;
  final_sale_price?: number | null;
};

// Type for raw data from the 'archived_listings_details' view during fetch/refetch
type ArchivedViewItem = {
  id: string;
  title: string;
  min_price: number;
  photos: string[] | null; // View provides TEXT[]
  end_time: string | null;
  created_at?: string;
  status: string; // Status from view could technically be other things if view def changes
  seller_email?: string | null;
  winning_bidder_id?: string | null;
  winner_email?: string | null;
  final_sale_price?: number | null;
};

// Type for the raw payload from realtime 'listings' table subscription
type ListingTableRecord = Partial<{ // Use Partial as UPDATE might only send changed fields
  id: string;
  title: string;
  min_price: number;
  photos: string[] | null; // DB has TEXT[]
  end_time: string | null;
  created_at: string;
  status: 'active' | 'closed' | 'cancelled' | string; // Status from base table
  seller_id: string;
  winning_bid_id: string | null;
  winning_bidder_id: string | null;
}> & { id?: string }; // ID might be missing in some cases (e.g., old part of DELETE)

// --- Component ---
export default function ArchivedListingsPage() {
  const [archivedRows, setArchivedRows] = useState<ArchivedListingDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- Sorting Helper ---
  // Sorts by end_time descending (most recent first), uses created_at as fallback
  const sortArchived = useCallback((rows: ArchivedListingDisplay[]) => {
    return [...rows].sort((a, b) =>
        (new Date(b.end_time || b.created_at || 0).getTime()) -
        (new Date(a.end_time || a.created_at || 0).getTime())
    );
  }, []); // No dependencies, purely functional

  // --- Fetch Full Item Details Helper ---
  // Fetches complete data for a specific item ID from the view
  const fetchArchivedItemDetails = useCallback(async (itemId: string): Promise<ArchivedListingDisplay | null> => {
    const { data: itemData, error: itemError } = await supabase
      .from('archived_listings_details') // Query the optimized view
      .select(`id, title, min_price, photos, end_time, created_at, status, seller_email, winning_bidder_id, winner_email, final_sale_price`)
      .eq('id', itemId)
      .maybeSingle(); // Expect 0 or 1 row

    if (itemError) {
        console.error(`RT: Failed to fetch details for archived item ${itemId}`, itemError);
        return null;
    }
    if (!itemData) {
        // Item might have been deleted or status changed back from archived state
        console.log(`RT: Item ${itemId} not found in archived_listings_details view.`);
        return null;
    }

    // Validate and type the fetched item before returning
    if (itemData.status === 'closed' || itemData.status === 'cancelled') {
        return {
            ...itemData,
            photos: itemData.photos as string[] | null, // Ensure photos array type
            status: itemData.status as 'closed' | 'cancelled' // Narrow status type
        };
    }

    // If status isn't closed/cancelled (shouldn't happen with view's WHERE clause), ignore it
    console.warn(`RT: Item ${itemId} fetched but status is not 'closed' or 'cancelled': ${itemData.status}`);
    return null;
  }, []); // No dependencies

  // --- Realtime Update Handler ---
  const handleRealtimeUpdate = useCallback(async (payload: RealtimePostgresChangesPayload<ListingTableRecord>) => {
      const newRecord = payload.new && 'id' in payload.new ? payload.new : undefined;
      const oldRecord = payload.old && 'id' in payload.old ? payload.old : undefined;
      const recordId = newRecord?.id || oldRecord?.id;

      if (!recordId) {
          console.warn('Archive Page RT: Received event without an ID.', payload);
          return; // Cannot process without an ID
      }

      console.log('Archive Page RT:', payload.eventType, recordId, newRecord?.status);

      switch (payload.eventType) {
          case 'INSERT':
              // If a listing is somehow INSERTED directly as 'closed' or 'cancelled'
              if (newRecord?.status === 'closed' || newRecord?.status === 'cancelled') {
                  const detailedItem = await fetchArchivedItemDetails(recordId);
                  if (detailedItem) {
                      setArchivedRows(prev => {
                          // Add only if not already present (handles potential race conditions)
                          if (!prev.some(item => item.id === detailedItem.id)) {
                             return sortArchived([detailedItem, ...prev]);
                          }
                          return prev;
                      });
                  }
              }
              break;

          case 'UPDATE':
              // If a listing's status changes (most common case: active -> closed)
              if (newRecord?.status === 'closed' || newRecord?.status === 'cancelled') {
                  // Item entered or was updated within the archived state
                  const detailedItem = await fetchArchivedItemDetails(recordId);
                  if (detailedItem) {
                      setArchivedRows(prev => {
                          const existingIdx = prev.findIndex(i => i.id === detailedItem.id);
                          if (existingIdx !== -1) { // Update existing item
                              const updated = [...prev]; updated[existingIdx] = detailedItem; return sortArchived(updated);
                          } else { // Add new item to archive
                              return sortArchived([detailedItem, ...prev]);
                          }
                      });
                  }
              } else {
                  // Item status changed *out* of an archived state (e.g., admin reopened)
                  // Remove it from our archive list
                  setArchivedRows(prev => prev.filter(item => item.id !== recordId));
              }
              break;

          case 'DELETE':
              // If an archived listing is deleted entirely
              setArchivedRows(prev => prev.filter(item => item.id !== recordId));
              break;
      }
  // Include fetchArchivedItemDetails and sortArchived in dependencies as they are used inside
  }, [fetchArchivedItemDetails, sortArchived]);

  // --- Initial Load & Subscription Effect ---
  useEffect(() => {
    let isMounted = true;
    let archiveChannel: ReturnType<typeof supabase.channel> | null = null;

    const loadArchivedListings = async () => {
      if (!isMounted) return;
      setLoading(true); setError(null);
      try {
        const { data, error: fetchError } = await supabase
          .from('archived_listings_details')
          .select(`id, title, min_price, photos, end_time, created_at, status, seller_email, winning_bidder_id, winner_email, final_sale_price`)
          .order('end_time', { ascending: false });

        if (fetchError) throw fetchError;

        const rawDataFromView: ArchivedViewItem[] = (data || []) as ArchivedViewItem[];
        const validArchived = rawDataFromView
            .filter((item): item is ArchivedViewItem & { status: 'closed' | 'cancelled' } =>
                item.status === 'closed' || item.status === 'cancelled'
            )
            .map((item): ArchivedListingDisplay => ({
                ...item,
                photos: item.photos as string[] | null,
            }));

        if (isMounted) setArchivedRows(sortArchived(validArchived)); // Sort initial load

      } catch (err) {
        console.error("Error loading archived listings:", err);
        if (isMounted) setError(err instanceof Error ? err.message : 'Failed to load archived listings.');
        if (isMounted) setArchivedRows([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadArchivedListings(); // Initial fetch

    // Setup Realtime Subscription
    archiveChannel = supabase.channel('public-listings-archive-page-v13'); // Unique name
    archiveChannel
      .on<ListingTableRecord>(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'listings' },
        handleRealtimeUpdate // Use the memoized handler
      )
      .subscribe((status, err) => {
        if (!isMounted) return; // Check mount status in callback
        if (status === 'SUBSCRIBED') console.log('Archive page realtime subscribed');
        else if (status === 'CHANNEL_ERROR') console.error(`Archive RT channel error:`, err);
        else if (status === 'TIMED_OUT') console.warn(`Archive RT channel timed out.`);
        else console.log('Archive page realtime status:', status);
       });

    // Cleanup function
    return () => {
      isMounted = false;
      if (archiveChannel) {
        supabase.removeChannel(archiveChannel)
          .then(() => console.log('Archive channel unsubscribed'))
          .catch(err => console.error("Error unsubscribing archive channel:", err));
      }
    };
    // Include handlers in dependency array
  }, [handleRealtimeUpdate, sortArchived, fetchArchivedItemDetails]);

  // --- Render Guards ---
  if (loading) return (<div className="flex justify-center py-20"><LoadingSpinner message="Loading auction archive..." /></div>);
  if (error) return (<div className="p-6 text-center text-red-600 dark:text-red-400">{error}</div>);

  // --- Main JSX ---
  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
      <header className="mb-6 sm:mb-8 pb-4 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">📦 Auction Archive</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Browse auctions that have ended or been cancelled.</p>
      </header>

      {archivedRows.length === 0 ? (
        <EmptyState message="No archived auctions found yet." />
      ) : (
        <ul role="list" className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {archivedRows.map((listing) => {
            // Determine outcome text and styling
            let outcomeText = 'Status Unknown';
            let outcomeColorClasses = 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 ring-gray-500/20 dark:ring-gray-500/30';
            if (listing.status === 'closed') {
                if (listing.winning_bidder_id) {
                    outcomeText = 'Sold';
                    if (listing.final_sale_price !== null && listing.final_sale_price !== undefined) { outcomeText += ` for ${formatCurrency(listing.final_sale_price)}`; }
                    outcomeColorClasses = 'bg-green-100 dark:bg-green-800/50 text-green-700 dark:text-green-200 ring-green-600/20 dark:ring-green-500/30';
                } else { outcomeText = 'Ended (No Winner)'; outcomeColorClasses = 'bg-yellow-100 dark:bg-yellow-800/50 text-yellow-700 dark:text-yellow-200 ring-yellow-600/20 dark:ring-yellow-500/30'; }
            } else if (listing.status === 'cancelled') { outcomeText = 'Cancelled'; outcomeColorClasses = 'bg-red-100 dark:bg-red-800/50 text-red-700 dark:text-red-200 ring-red-600/20 dark:ring-red-500/30'; }

            // Get thumbnail URL
            const thumbnailUrl = (listing.photos && listing.photos.length > 0) ? listing.photos[0] : null;

            return (
              <li key={listing.id} className="group relative flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-shadow hover:shadow-md">
                <Link href={`/listings/${listing.id}`} className="flex flex-col flex-grow">
                  {/* Image */}
                  <div className="aspect-video w-full bg-gray-100 dark:bg-gray-600 overflow-hidden">
                    {thumbnailUrl ? (
                      <Image src={thumbnailUrl} alt={`Image for ${listing.title}`} width={400} height={225} className="w-full h-full object-cover group-hover:opacity-90 transition-opacity" priority={false} onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder-image.svg'; }} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-500"><svg className="h-16 w-16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>
                    )}
                  </div>
                  {/* Content */}
                  <div className="p-4 flex flex-col flex-grow">
                    <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1 line-clamp-2 leading-snug group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{listing.title}</h3>
                    <p className={`inline-block px-2.5 py-1 text-xs font-medium rounded-full mb-2 self-start ${outcomeColorClasses} ring-1 ring-inset ring-current/20`}>{outcomeText}</p>
                    <div className="mt-auto pt-2 space-y-1 text-sm border-t border-gray-200 dark:border-gray-700">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Original Min. Bid: {formatCurrency(listing.min_price)}</p>
                      {listing.winner_email && listing.status === 'closed' && ( <p className="text-xs text-gray-500 dark:text-gray-400">Winner: <span className="font-medium text-gray-700 dark:text-gray-300">{listing.winner_email}</span></p> )}
                      {listing.seller_email && ( <p className="text-xs text-gray-500 dark:text-gray-400">Sold by: <span className="font-medium text-gray-700 dark:text-gray-300">{listing.seller_email}</span></p> )}
                      {listing.end_time && ( <p className="text-xs text-gray-500 dark:text-gray-400">{listing.status === 'closed' ? 'Closed: ' : listing.status === 'cancelled' ? 'Cancelled: ' : 'Ended: '}{formatRelativeTime(listing.end_time)}</p> )}
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