// src/app/listings/archive/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image'; 
import { supabase } from '@/lib/supabaseClient';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import { formatCurrency } from '@/lib/formatUtils';
import { formatRelativeTime } from '@/lib/timeUtils';

type ListingRecord = {
  id: string;
  title: string;
  min_price: number;
  photos: string | null;
  end_time: string | null;
  status: 'active' | 'closed' | 'cancelled' | string;
  seller_email?: string | null; 
  winning_bidder_id?: string | null; 
  created_at?: string; 
};

type ArchivedListingDisplay = ListingRecord & {
  status: 'closed' | 'cancelled';
};

export default function ArchivedListingsPage() {
  const [archivedRows, setArchivedRows] = useState<ArchivedListingDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadArchivedListings = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: fetchError } = await supabase
          .from('listings') 
          .select(
            `id, title, min_price, photos, end_time, status, seller_id, winning_bidder_id, created_at`
          )
          .in('status', ['closed', 'cancelled'])
          .order('end_time', { ascending: false }); 

        if (fetchError) throw fetchError;
        const validArchivedListings = (data as ListingRecord[] ?? [])
            .filter(item => item.status === 'closed' || item.status === 'cancelled')
            .map(item => ({ ...item, status: item.status as 'closed' | 'cancelled' })); 

        setArchivedRows(validArchivedListings);

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load archived listings.');
        setArchivedRows([]);
      } finally {
        setLoading(false);
      }
    };
    loadArchivedListings();

    const archiveChannel = supabase
      .channel('public-listings-archive-page-v7') 
      .on<ListingRecord>(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'listings' },
        (payload: RealtimePostgresChangesPayload<ListingRecord>) => {
          // Safe logging of ID
          let logId: string | undefined | null = null;
          if (payload.new && 'id' in payload.new) { // Check if payload.new is not null/undefined and has 'id'
            logId = payload.new.id;
          } else if (payload.old && 'id' in payload.old) { // Check if payload.old is not null/undefined and has 'id'
            logId = payload.old.id;
          }
          console.log('Archive Page: Realtime event', payload.eventType, logId); // <<< CORRECTED LINE
          
          const newRecord = payload.new as ListingRecord | undefined;
          const oldRecord = payload.old as Partial<ListingRecord> | undefined;

          const sortArchived = (rows: ArchivedListingDisplay[]) => {
            return rows.sort((a, b) => 
                (new Date(b.end_time || b.created_at || 0).getTime()) - 
                (new Date(a.end_time || a.created_at || 0).getTime())
            );
          };
          
          setArchivedRows(prevRows => { // Use functional update for setArchivedRows
            let currentList = [...prevRows];
            switch (payload.eventType) {
              case 'INSERT':
                if (newRecord && (newRecord.status === 'closed' || newRecord.status === 'cancelled')) {
                  if ('id' in newRecord) {
                    const newItemForArchive = { ...newRecord, status: newRecord.status as 'closed' | 'cancelled' };
                    if (!currentList.some(item => item.id === newItemForArchive.id)) {
                        currentList.unshift(newItemForArchive);
                    }
                  }
                }
                break;

              case 'UPDATE':
                if (newRecord && 'id' in newRecord) {
                  const isNowArchived = newRecord.status === 'closed' || newRecord.status === 'cancelled';
                  const existingItemIndex = currentList.findIndex(item => item.id === newRecord.id);

                  if (isNowArchived) {
                    const itemForArchive = { ...newRecord, status: newRecord.status as 'closed' | 'cancelled' };
                    if (existingItemIndex !== -1) { 
                      currentList[existingItemIndex] = itemForArchive; 
                    } else { 
                      currentList.push(itemForArchive);
                    }
                  } else { 
                    if (existingItemIndex !== -1) { 
                      currentList.splice(existingItemIndex, 1); 
                    }
                  }
                }
                break;
              
              case 'DELETE':
                if (oldRecord && 'id' in oldRecord && oldRecord.id) {
                  if (oldRecord.status === 'closed' || oldRecord.status === 'cancelled') {
                      currentList = currentList.filter(item => item.id !== oldRecord.id);
                  }
                }
                break;
            }
            return sortArchived(currentList);
          });
        }
      )
      .subscribe(status => { 
          if (status === 'SUBSCRIBED') console.log('Archive page realtime subscribed');
          else console.log('Archive page realtime status:', status);
       });

    return () => { 
        if (archiveChannel) {
            supabase.removeChannel(archiveChannel).then(() => console.log('Archive channel unsubscribed'));
        }
    };
  }, []); 

  if (loading) {
    return (<div className="flex justify-center py-20"><LoadingSpinner message="Loading auction archive..." /></div>);
  }
  if (error) {
    return (<div className="p-6 text-center text-red-600 dark:text-red-400">{error}</div>);
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
      <header className="mb-6 sm:mb-8 pb-4 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
          📦 Auction Archive
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Browse auctions that have ended or been cancelled.
        </p>
      </header>

      {archivedRows.length === 0 ? (
        <EmptyState
          message="No archived auctions found yet."
        />
      ) : (
        <ul
          role="list"
          className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {archivedRows.map((listing) => {
            let outcomeText = 'Status Unknown';
            let outcomeColorClasses = 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 ring-gray-500/20 dark:ring-gray-500/30';
            
            if (listing.status === 'closed') {
                if (listing.winning_bidder_id) {
                    outcomeText = 'Sold'; 
                    outcomeColorClasses = 'bg-green-100 dark:bg-green-800/50 text-green-700 dark:text-green-200 ring-green-600/20 dark:ring-green-500/30';
                } else {
                    outcomeText = 'Ended (No Winner)';
                    outcomeColorClasses = 'bg-yellow-100 dark:bg-yellow-800/50 text-yellow-700 dark:text-yellow-200 ring-yellow-600/20 dark:ring-yellow-500/30';
                }
            } else if (listing.status === 'cancelled') {
                outcomeText = 'Cancelled';
                outcomeColorClasses = 'bg-red-100 dark:bg-red-800/50 text-red-700 dark:text-red-200 ring-red-600/20 dark:ring-red-500/30';
            }

            return (
              <li
                key={listing.id}
                className="group relative flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-shadow hover:shadow-md"
              >
                <Link href={`/listings/${listing.id}`} className="flex flex-col flex-grow">
                    <div className="aspect-video w-full bg-gray-100 dark:bg-gray-600 overflow-hidden">
                        {listing.photos ? (
                            <Image 
                                src={listing.photos}
                                alt={`Image for ${listing.title}`}
                                width={400} 
                                height={225} 
                                className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
                                priority={false}
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-500">
                                <svg className="h-16 w-16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                            </div>
                        )}
                    </div>
                    <div className="p-4 flex flex-col flex-grow">
                        <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1 line-clamp-2 leading-snug group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                            {listing.title}
                        </h3>
                        <p className={`inline-block px-2.5 py-1 text-xs font-medium rounded-full mb-2 ${outcomeColorClasses} ring-1 ring-inset ring-current/20`}>
                            {outcomeText}
                        </p>
                        <div className="mt-auto pt-2 space-y-1 text-sm border-t border-gray-200 dark:border-gray-700">
                           <p className="text-xs text-gray-500 dark:text-gray-400">
                                Original Min. Bid: {formatCurrency(listing.min_price)}
                           </p>
                           {listing.end_time && (
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {listing.status === 'closed' ? 'Auction Closed: ' : 
                                     listing.status === 'cancelled' ? 'Cancelled: ' : 'Ended: '}
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