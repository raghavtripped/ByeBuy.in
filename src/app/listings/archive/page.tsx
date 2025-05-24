// src/app/listings/archive/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '@/lib/supabaseClient';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import { formatCurrency } from '@/lib/formatUtils';
import { formatRelativeTime } from '@/lib/timeUtils';

/* -------------------------------------------------------------------------- */
/*  Helper – parse photo JSON                                                 */
/* -------------------------------------------------------------------------- */
const parsePhotosJson = (photosInput: string | string[] | null | undefined): string[] | null => {
  if (photosInput == null) return null;
  if (Array.isArray(photosInput)) {
    return photosInput.every((i) => typeof i === 'string') ? photosInput : null;
  }
  if (typeof photosInput === 'string') {
    try {
      const parsed = JSON.parse(photosInput);
      return Array.isArray(parsed) && parsed.every((i) => typeof i === 'string') ? parsed : null;
    } catch (error) {
      console.error('Failed to parse photos JSON string:', photosInput, error);
      return null;
    }
  }
  console.warn('Unexpected type for photosInput, cannot parse:', typeof photosInput, photosInput);
  return null;
};

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */
export type ArchivedListingDisplay = {
  id: string;
  title: string;
  min_price: number;
  photos: string[] | null;
  end_time: string | null;
  created_at?: string;
  status: 'closed' | 'cancelled';
  seller_email?: string | null;
  winning_bidder_id?: string | null;
  winner_email?: string | null;
  final_sale_price?: number | null;
};

type ArchivedViewItem = {
  id: string;
  title: string;
  min_price: number;
  photos_jsonb: string[] | null;
  end_time: string | null;
  created_at?: string;
  status: string;
  seller_email?: string | null;
  winning_bidder_id?: string | null;
  winner_email?: string | null;
  final_sale_price?: number | null;
};

type ListingTableRecord = Partial<{
  id: string;
  title: string;
  min_price: number;
  photos_jsonb: string[] | null;
  end_time: string | null;
  created_at: string;
  status: 'active' | 'closed' | 'cancelled' | string;
  seller_id: string;
  winning_bid_id: string | null;
  winning_bidder_id: string | null;
}> & { id?: string };

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */
export default function ArchivedListingsPage() {
  const [archivedRows, setArchivedRows] = useState<ArchivedListingDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* ----- helpers -------------------------------------------------------- */
  const sortArchived = useCallback(
    (rows: ArchivedListingDisplay[]) =>
      [...rows].sort((a, b) => new Date(b.end_time || b.created_at || 0).getTime() - new Date(a.end_time || a.created_at || 0).getTime()),
    []
  );

  const fetchArchivedItemDetails = useCallback(async (itemId: string): Promise<ArchivedListingDisplay | null> => {
    const { data: itemData, error: itemError } = await supabase
      .from('archived_listings_details')
      .select(
        'id, title, min_price, photos_jsonb, end_time, created_at, status, seller_email, winning_bidder_id, winner_email, final_sale_price'
      )
      .eq('id', itemId)
      .maybeSingle();

    if (itemError) {
      console.error(`RT: Failed to fetch details for archived item ${itemId}`, itemError);
      return null;
    }
    if (!itemData) {
      console.log(`RT: Item ${itemId} not found in archived_listings_details view.`);
      return null;
    }

    if (itemData.status === 'closed' || itemData.status === 'cancelled') {
      return {
        ...itemData,
        photos: parsePhotosJson(itemData.photos_jsonb),
        status: itemData.status as 'closed' | 'cancelled',
      };
    }

    console.warn(`RT: Item ${itemId} fetched but status is not 'closed' or 'cancelled': ${itemData.status}`);
    return null;
  }, []);

  const handleRealtimeUpdate = useCallback(
    async (payload: RealtimePostgresChangesPayload<ListingTableRecord>) => {
      const newRecord = payload.new && 'id' in payload.new ? payload.new : undefined;
      const oldRecord = payload.old && 'id' in payload.old ? payload.old : undefined;
      const recordId = newRecord?.id || oldRecord?.id;

      if (!recordId) {
        console.warn('Archive Page RT: Received event without an ID.', payload);
        return;
      }
      console.log('Archive Page RT:', payload.eventType, recordId, newRecord?.status);

      switch (payload.eventType) {
        case 'INSERT':
          if (newRecord?.status === 'closed' || newRecord?.status === 'cancelled') {
            const detailedItem = await fetchArchivedItemDetails(recordId);
            if (detailedItem) {
              setArchivedRows((prev) => {
                if (!prev.some((item) => item.id === detailedItem.id)) {
                  return sortArchived([detailedItem, ...prev]);
                }
                return prev;
              });
            }
          }
          break;
        case 'UPDATE':
          if (newRecord?.status === 'closed' || newRecord?.status === 'cancelled') {
            const detailedItem = await fetchArchivedItemDetails(recordId);
            if (detailedItem) {
              setArchivedRows((prev) => {
                const existingIdx = prev.findIndex((i) => i.id === detailedItem.id);
                if (existingIdx !== -1) {
                  const updated = [...prev];
                  updated[existingIdx] = detailedItem;
                  return sortArchived(updated);
                }
                return sortArchived([detailedItem, ...prev]);
              });
            }
          } else {
            setArchivedRows((prev) => prev.filter((item) => item.id !== recordId));
          }
          break;
        case 'DELETE':
          setArchivedRows((prev) => prev.filter((item) => item.id !== recordId));
          break;
      }
    },
    [fetchArchivedItemDetails, sortArchived]
  );

  /* ----- initial load + RT -------------------------------------------- */
  useEffect(() => {
    let isMounted = true;
    let archiveChannel: ReturnType<typeof supabase.channel> | null = null;

    const loadArchivedListings = async () => {
      if (!isMounted) return;
      setLoading(true);
      setError(null);

      try {
        const { data, error: fetchError } = await supabase
          .from('archived_listings_details')
          .select(
            'id, title, min_price, photos_jsonb, end_time, created_at, status, seller_email, winning_bidder_id, winner_email, final_sale_price'
          )
          .order('end_time', { ascending: false });

        if (fetchError) throw fetchError;

        const rawData = (data || []) as ArchivedViewItem[];

        const validArchived = rawData
          .filter((item): item is ArchivedViewItem & { status: 'closed' | 'cancelled' } => item.status === 'closed' || item.status === 'cancelled')
          .map((item): ArchivedListingDisplay => ({
            ...item,
            photos: parsePhotosJson(item.photos_jsonb),
          }));

        if (isMounted) setArchivedRows(sortArchived(validArchived));
      } catch (err) {
        console.error('Error loading archived listings:', err);
        if (isMounted) setError(err instanceof Error ? err.message : 'Failed to load archived listings.');
        if (isMounted) setArchivedRows([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadArchivedListings();

    archiveChannel = supabase.channel('public-listings-archive-page-v13');
    archiveChannel
      .on<ListingTableRecord>('postgres_changes', { event: '*', schema: 'public', table: 'listings' }, handleRealtimeUpdate)
      .subscribe((status, err) => {
        if (!isMounted) return;
        if (status === 'SUBSCRIBED') console.log('Archive page realtime subscribed');
        else if (status === 'CHANNEL_ERROR') console.error('Archive RT channel error:', err);
        else if (status === 'TIMED_OUT') console.warn('Archive RT channel timed out.');
      });

    return () => {
      isMounted = false;
      if (archiveChannel) {
        supabase
          .removeChannel(archiveChannel)
          .then(() => console.log('Archive channel unsubscribed'))
          .catch((err) => console.error('Error unsubscribing archive channel:', err));
      }
    };
  }, [handleRealtimeUpdate, sortArchived, fetchArchivedItemDetails]);

  /* -------------------------------------------------------------------- */
  /*  Render guards                                                       */
  /* -------------------------------------------------------------------- */
  if (loading)
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner message="Loading auction archive" />
      </div>
    );

  if (error)
    return (
      <div className="p-6 text-center text-red-600 dark:text-red-300">
        {error}
      </div>
    );

  /* -------------------------------------------------------------------- */
  /*  JSX                                                                 */
  /* -------------------------------------------------------------------- */
  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
      <header className="mb-6 sm:mb-8 pb-4 border-b border-gray-200 dark:border-bye-dark-border-primary">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-bye-dark-text-primary tracking-tight">📦 Auction Archive</h1>
        <p className="text-sm text-gray-600 dark:text-bye-dark-text-secondary mt-1">Browse auctions that have ended or been cancelled.</p>
      </header>

      {archivedRows.length === 0 ? (
        <EmptyState message="No archived auctions found yet." />
      ) : (
        <ul role="list" className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {archivedRows.map((listing) => {
            /* ----- badge colour classes --------------------------------*/
            let outcomeText = 'Status Unknown';
            let outcomeColorClasses =
              'bg-gray-100 dark:bg-bye-dark-bg-hover text-gray-700 dark:text-bye-dark-text-secondary ring-gray-500/20 dark:ring-bye-dark-border-primary/30';

            if (listing.status === 'closed') {
              if (listing.winning_bidder_id) {
                outcomeText = 'Sold';
                if (listing.final_sale_price != null) outcomeText += ` for ${formatCurrency(listing.final_sale_price)}`;
                outcomeColorClasses = 'bg-green-100 dark:bg-green-900/25 text-green-700 dark:text-green-300 ring-green-600/20 dark:ring-green-500/30';
              } else {
                outcomeText = 'Ended (No Winner)';
                outcomeColorClasses = 'bg-yellow-100 dark:bg-yellow-900/25 text-yellow-700 dark:text-yellow-300 ring-yellow-600/20 dark:ring-yellow-500/30';
              }
            } else if (listing.status === 'cancelled') {
              outcomeText = 'Cancelled';
              outcomeColorClasses = 'bg-red-100 dark:bg-red-900/25 text-red-700 dark:text-red-300 ring-red-600/20 dark:ring-red-500/30';
            }

            const thumbnailUrl = listing.photos && listing.photos.length > 0 ? listing.photos[0] : null;

            return (
              <li key={listing.id} className="group relative flex flex-col bg-white dark:bg-bye-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-bye-dark-border-primary overflow-hidden transition-shadow hover:shadow-md">
                <Link href={`/listings/${listing.id}`} className="flex flex-col flex-grow">
                  {/* image  */}
                  <div className="aspect-video w-full bg-gray-100 dark:bg-bye-dark-bg-hover overflow-hidden relative rounded-t-lg">
                    {thumbnailUrl ? (
                      <Image
                        src={thumbnailUrl}
                        alt={`Cover image for ${listing.title}`}
                        fill
                        style={{ objectFit: 'cover' }}
                        className="transition-transform duration-300 group-hover:scale-105"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
                        priority={false}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/placeholder-image.svg';
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400 dark:text-bye-dark-text-secondary/60">
                        <svg className="h-16 w-16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2L15.586 12.414a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* body */}
                  <div className="p-4 flex flex-col flex-grow">
                    <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-bye-dark-text-primary mb-1 line-clamp-2 leading-snug group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {listing.title}
                    </h3>

                    <p className={`inline-block px-2.5 py-1 text-xs font-medium rounded-full mb-2 self-start ${outcomeColorClasses} ring-1 ring-inset ring-current/20`}>
                      {outcomeText}
                    </p>

                    <div className="mt-auto pt-2 space-y-1 text-sm border-t border-gray-200 dark:border-bye-dark-border-primary/70">
                      <p className="text-xs text-gray-500 dark:text-bye-dark-text-secondary">Original Min. Bid: {formatCurrency(listing.min_price)}</p>

                      {listing.winner_email && listing.status === 'closed' && (
                        <p className="text-xs text-gray-500 dark:text-bye-dark-text-secondary">
                          Winner: <span className="font-medium text-gray-700 dark:text-bye-dark-text-primary">{listing.winner_email}</span>
                        </p>
                      )}

                      {listing.seller_email && (
                        <p className="text-xs text-gray-500 dark:text-bye-dark-text-secondary">
                          Sold by: <span className="font-medium text-gray-700 dark:text-bye-dark-text-primary">{listing.seller_email}</span>
                        </p>
                      )}

                      {listing.end_time && (
                        <p className="text-xs text-gray-500 dark:text-bye-dark-text-secondary">
                          {listing.status === 'closed' ? 'Closed: ' : listing.status === 'cancelled' ? 'Cancelled: ' : 'Ended: '}
                          {formatRelativeTime(listing.end_time)}
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
