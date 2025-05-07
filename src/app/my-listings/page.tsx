// src/app/my-listings/page.tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { supabase, type User } from '@/lib/supabaseClient';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import { formatCurrency } from '@/lib/formatUtils';
import { isPast } from '@/lib/timeUtils';

// --- Types ---
type SellerListing = {
  id: string;
  title: string;
  description: string;
  min_price: number;
  end_time: string | null;
  created_at: string;
  photos: string[] | null; // Corrected: array of strings or null
  status: 'active' | 'closed' | 'cancelled' | string; // Status from DB
};

type ViewFilter = 'active' | 'past';

// Type for Realtime Payload from 'listings' table
// All fields from SellerListing are optional in the payload, but 'id' is expected.
type SellerListingPayload = Partial<SellerListing> & { id: string };


// --- Helpers ---
const getStoragePathFromURL = (photoUrl: string): string | null => {
  try {
    const url = new URL(photoUrl);
    const pathSegments = url.pathname.split('/');
    const bucketName = 'listing-images'; // Ensure this matches your bucket
    const bucketIndex = pathSegments.indexOf(bucketName);
    if (bucketIndex !== -1 && bucketIndex + 1 < pathSegments.length) {
      return pathSegments.slice(bucketIndex + 1).join('/');
    }
    console.warn("Could not parse expected storage path from URL:", photoUrl);
    return null;
  } catch (e) {
    console.error("Error parsing storage URL:", e);
    return null;
  }
};

// --- Component ---
export default function MyListingsPage() {
  const router = useRouter();

  // --- State ---
  const [user, setUser] = useState<User | null>(null);
  const [listings, setListings] = useState<SellerListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [viewFilter, setViewFilter] = useState<ViewFilter>('active');
  const [finalizingId, setFinalizingId] = useState<string | null>(null);
  const [finalizeMessage, setFinalizeMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);


  // --- Effects ---
  useEffect(() => {
    let isMounted = true;
    let userListingsChannel: ReturnType<typeof supabase.channel> | null = null;

    const fetchUserDataAndListings = async (currentUser: User) => {
      if (!isMounted) return;
      setLoading(true); setError(null); setDeleteError(null); setFinalizeMessage(null);

      try {
        const { data, error: listingError } = await supabase
          .from('listings')
          .select('id, title, description, min_price, end_time, created_at, photos, status')
          .eq('seller_id', currentUser.id)
          .order('created_at', { ascending: false });

        if (listingError) throw listingError;
        
        const typedListings = (data ?? []).map(item => ({
            ...item,
            photos: item.photos as string[] | null, // Ensure photos is string[] | null
            status: item.status as SellerListing['status']
        })) as SellerListing[];

        if (isMounted) setListings(typedListings);

      } catch (err) {
        console.error("Error fetching user listings:", err);
        if (isMounted) setError(err instanceof Error ? err.message : "Failed to load your listings.");
        if (isMounted) setListings([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    const handleRealtimeUpdate = (payload: RealtimePostgresChangesPayload<SellerListingPayload>) => {
        if (!isMounted) return;
        
        const newRecordRaw = payload.new;
        const oldRecordRaw = payload.old;

        const newRecord = (newRecordRaw && 'id' in newRecordRaw && typeof newRecordRaw.id === 'string') 
                          ? newRecordRaw as SellerListingPayload 
                          : undefined;
        const oldRecord = (oldRecordRaw && 'id' in oldRecordRaw && typeof oldRecordRaw.id === 'string') 
                          ? oldRecordRaw as SellerListingPayload 
                          : undefined;
        
        const logId = newRecord?.id || oldRecord?.id || 'UNKNOWN_ID_IN_PAYLOAD';
        console.log('MyListingsPage: Realtime event', payload.eventType, logId);

        setListings(currentListings => {
          let updatedList = [...currentListings];
          switch (payload.eventType) {
            case 'INSERT':
              // For INSERT, we expect a more complete record. Adjust if your backend sends partial inserts.
              if (newRecord?.id && newRecord.title && newRecord.status && newRecord.created_at && newRecord.min_price !== undefined) {
                const correctlyTypedNew: SellerListing = {
                    id: newRecord.id,
                    title: newRecord.title,
                    description: newRecord.description || '', // Default for optional field
                    min_price: newRecord.min_price,
                    end_time: newRecord.end_time || null,    // Default for optional field
                    created_at: newRecord.created_at,
                    photos: newRecord.photos ?? null, // Default photos to null if not in payload
                    status: newRecord.status as SellerListing['status'],
                };
                if (!updatedList.some(l => l.id === correctlyTypedNew.id)) {
                  updatedList.unshift(correctlyTypedNew);
                }
              }
              break;
            case 'UPDATE':
              if (newRecord?.id) {
                 const index = updatedList.findIndex(l => l.id === newRecord.id);
                 if (index !== -1) {
                   const existingListing = updatedList[index];
                   // Merge existing with new, ensuring types are maintained
                   updatedList[index] = {
                     ...existingListing,
                     ...newRecord,
                     photos: newRecord.photos !== undefined ? newRecord.photos : existingListing.photos,
                     status: (newRecord.status || existingListing.status) as SellerListing['status'],
                   };
                 } else {
                    // Optional: if an UPDATE comes for a listing not in local state,
                    // you might treat it as an INSERT if it has enough data.
                    // For now, we only update existing.
                    console.warn(`Realtime UPDATE for unknown listing ID: ${newRecord.id}`);
                 }
               }
              break;
            case 'DELETE':
              if (oldRecord?.id) {
                updatedList = updatedList.filter(l => l.id !== oldRecord.id);
              }
              break;
          }
          return updatedList.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        });
    };

    supabase.auth.getUser().then(({ data: userData, error: userError }) => {
        if (!isMounted) return;
        if (userError || !userData?.user) {
            router.push('/auth?redirect=/my-listings');
            return;
        }
        const currentAuthUser = userData.user;
        setUser(currentAuthUser);
        fetchUserDataAndListings(currentAuthUser);

        if (currentAuthUser?.id) {
          userListingsChannel = supabase
            .channel(`my-listings-channel-${currentAuthUser.id}`)
            .on<SellerListingPayload>(
              'postgres_changes',
              { event: '*', schema: 'public', table: 'listings', filter: `seller_id=eq.${currentAuthUser.id}` },
              handleRealtimeUpdate
            )
            .subscribe(status => {
                if (!isMounted) return;
                if (status === 'SUBSCRIBED') console.log(`Realtime subscribed for My Listings (user: ${currentAuthUser.id})`);
                else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.error(`Realtime channel error/timeout for My Listings: ${status}`);
            });
        }
    });

    return () => {
      isMounted = false;
      if (userListingsChannel) {
        supabase.removeChannel(userListingsChannel)
          .then(() => console.log('MyListingsPage: Realtime channel unsubscribed.'))
          .catch(err => console.error("Error unsubscribing channel:", err));
      }
    };
  }, [router]);

  const handleFinalizeAuction = async (listingId: string) => {
    setFinalizingId(listingId);
    setFinalizeMessage(null);
    const listingTitle = listings.find(l => l.id === listingId)?.title ?? 'this auction';

    if (!window.confirm(`Are you sure you want to finalize "${listingTitle}"? This will close the auction and determine a winner if applicable.`)) {
      setFinalizingId(null);
      return;
    }
    try {
      const { data, error: rpcError } = await supabase.rpc('finalize_auction_outcome', {
        auction_id_to_close: listingId,
      });
      if (rpcError) throw rpcError;
      if (data && Array.isArray(data) && data.length > 0) {
        const result = data[0];
        if (result.outcome_status === 'error') {
            throw new Error(result.message || 'Failed to finalize auction due to an error.');
        }
        setListings(prevListings =>
          prevListings.map(l =>
            l.id === listingId
              ? { ...l, status: (result.outcome_status.startsWith('closed') ? 'closed' : l.status) as SellerListing['status'] }
              : l
          )
        );
        setFinalizeMessage({type: 'success', text: result.message || 'Auction finalized successfully.'});
      } else {
        throw new Error('Received an unexpected or no response from the finalization process.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error occurred during finalization.';
      setFinalizeMessage({type: 'error', text: `Finalization failed: ${msg}`});
    } finally {
      setFinalizingId(null);
      setTimeout(() => setFinalizeMessage(null), 7000);
    }
  };

  const handleDeleteListing = async (listingId: string, currentPhotos: string[] | null) => {
    setDeletingId(listingId);
    setDeleteError(null);
    const listingTitle = listings.find(l => l.id === listingId)?.title ?? 'this listing';
    if (!window.confirm(`Delete "${listingTitle}"? This cannot be undone.`)) {
      setDeletingId(null);
      return;
    }
    try {
      const { error: bidsErr, count } = await supabase.from('bids').select('id', { count: 'exact', head: true }).eq('item_id', listingId);
      if (bidsErr) throw new Error(`Bid check failed: ${bidsErr.message}`);
      if ((count ?? 0) > 0) throw new Error('Cannot delete: bids already placed.');
      
      const { error: delErr } = await supabase.from('listings').delete().eq('id', listingId);
      if (delErr) throw new Error(`Database deletion failed: ${delErr.message}`);
      
      let storageCleanupError: string | null = null;
      const firstPhotoUrl = (currentPhotos && currentPhotos.length > 0 && currentPhotos[0]) ? currentPhotos[0] : null;
      if (firstPhotoUrl) {
        const storagePath = getStoragePathFromURL(firstPhotoUrl);
        if (storagePath) {
          // Consider looping through all photos in `currentPhotos` for full cleanup
          const { error: storageErr } = await supabase.storage.from('listing-images').remove([storagePath]);
          if (storageErr) storageCleanupError = `Listing deleted, but failed to remove primary image: ${storageErr.message}`;
        } else {
          storageCleanupError = 'Listing deleted, but could not parse primary image path for removal.';
        }
      }
      if (storageCleanupError) setDeleteError(storageCleanupError);
      // UI update is handled by realtime subscription
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown deletion error.';
      setDeleteError(msg);
      alert(msg); // Consider replacing alert with a less disruptive notification
    } finally {
      setDeletingId(null);
      setTimeout(() => setDeleteError(null), 7000);
    }
  };

  const filteredListings = useMemo(() => {
    return listings.filter(listing => {
      if (viewFilter === 'active') {
        // Active means status is 'active' AND end_time has not passed
        return listing.status === 'active' && !isPast(listing.end_time);
      }
      if (viewFilter === 'past') {
        // Past includes closed, cancelled, or active items whose end_time has passed
        return listing.status === 'closed' || listing.status === 'cancelled' || (listing.status === 'active' && isPast(listing.end_time));
      }
      return false;
    });
  }, [listings, viewFilter]);

  const tabClass = (tab: ViewFilter): string => {
      const baseClasses = 'px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800';
      const activeClasses = 'bg-indigo-600 text-white shadow-sm';
      const inactiveClasses = 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600';
      return `${baseClasses} ${viewFilter === tab ? activeClasses : inactiveClasses}`;
  };

  // --- Render Guards ---
  if (loading && !user) return (<section className="max-w-4xl mx-auto p-4 sm:p-8 text-center"><LoadingSpinner message="Loading..." /></section>);
  if (!user && !loading) return (<section className="max-w-4xl mx-auto p-4 sm:p-8 text-center"><h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-900 dark:text-gray-100 tracking-tight">My Listings</h1><p className="text-gray-600 dark:text-gray-400">Please log in to view your listings.</p><Link href="/auth?redirect=/my-listings" className="mt-4 inline-block text-indigo-600 hover:underline">Go to Login</Link></section>);
  if (loading && user) return (<section className="max-w-4xl mx-auto p-4 sm:p-8"><h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-900 dark:text-gray-100 tracking-tight">My Listings</h1><LoadingSpinner message="Loading your listings..." /></section>);
  if (error) return (<section className="max-w-4xl mx-auto p-4 sm:p-8 text-center"><h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-900 dark:text-gray-100 tracking-tight">My Listings</h1><p className="text-red-600 dark:text-red-400">{`Error: ${error}`}</p></section>);

  // --- Main Render ---
  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 sm:mb-8 gap-4 pb-4 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">My Listings</h1>
        <div className="flex space-x-2 flex-shrink-0">
          <button className={tabClass('active')} onClick={() => setViewFilter('active')}>Active</button>
          <button className={tabClass('past')} onClick={() => setViewFilter('past')}>Past / Needs Finalizing</button>
        </div>
      </header>

      {finalizeMessage && (
         <div className={`mb-4 p-3 rounded-md border text-sm flex items-start gap-2 ${finalizeMessage.type === 'error' ? 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-600/50 text-red-800 dark:text-red-200' : 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-600/50 text-green-800 dark:text-green-200'}`} role="alert">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 flex-shrink-0 mt-0.5">
                {finalizeMessage.type === 'error' ? 
                    <path fillRule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" /> :
                    <path fillRule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm3.84-8.41a.75.75 0 1 1-1.06-1.06L7.94 8.37 6.72 7.15a.75.75 0 0 0-1.06 1.06l1.75 1.75a.75.75 0 0 0 1.06 0l4.37-4.37Z" clipRule="evenodd" />
                }
            </svg>
            <span>{finalizeMessage.text}</span>
        </div>
      )}
      {deleteError && (
         <div className={`mb-4 p-3 rounded-md border text-sm flex items-start gap-2 bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-600/50 text-red-800 dark:text-red-200`} role="alert">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 flex-shrink-0 mt-0.5">
                <path fillRule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
            </svg>
            <span>{deleteError}</span>
        </div>
      )}

      {filteredListings.length === 0 ? (
        <EmptyState message={ viewFilter === 'active' ? 'You have no active listings.' : 'You have no past listings or listings needing finalization.' } action={{ href: '/listings/new', text: 'List an Item' }} />
      ) : (
        <ul className="space-y-6">
          {filteredListings.map((listing: SellerListing) => { // Explicitly type listing
              const isListingBeingDeleted = deletingId === listing.id;
              const isListingBeingFinalized = finalizingId === listing.id;
              
              const needsFinalizing = listing.status === 'active' && isPast(listing.end_time);
              const canDelete = listing.status === 'active' && !needsFinalizing; // Can only delete active, non-ended listings
              const canFinalize = needsFinalizing;

              let statusBadgeText = listing.status.charAt(0).toUpperCase() + listing.status.slice(1);
              let statusBadgeColorClasses = '';
              if (needsFinalizing) { statusBadgeText = 'Needs Finalizing'; statusBadgeColorClasses = 'bg-blue-100 text-blue-800 dark:bg-blue-700/50 dark:text-blue-200 ring-blue-600/20 dark:ring-blue-500/30'; }
              else if (listing.status === 'closed') { statusBadgeColorClasses = 'bg-green-100 text-green-800 dark:bg-green-700/50 dark:text-green-200 ring-green-600/20 dark:ring-green-500/30'; }
              else if (listing.status === 'cancelled') { statusBadgeColorClasses = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-700/50 dark:text-yellow-200 ring-yellow-600/20 dark:ring-yellow-500/30'; }

              const thumbnailUrl = (listing.photos && listing.photos.length > 0 && listing.photos[0])
                                 ? listing.photos[0]
                                 : null;

              return (
                <li key={listing.id} className={`border border-gray-200 dark:border-gray-700 p-4 rounded-lg shadow-sm flex flex-col sm:flex-row gap-4 items-start bg-white dark:bg-gray-800 transition-opacity duration-300 ${(isListingBeingDeleted || isListingBeingFinalized) ? 'opacity-50 pointer-events-none' : ''}`}>
                  {thumbnailUrl ? (
                    <Link href={`/listings/${listing.id}`} className="flex-shrink-0 block w-full sm:w-auto" aria-label={`View details for ${listing.title}`}>
                      <div className="relative w-full h-32 sm:w-[120px] sm:h-[80px] bg-gray-100 dark:bg-gray-700 rounded overflow-hidden group transition-opacity duration-200 hover:opacity-90">
                        <Image
                          src={thumbnailUrl} alt={`Cover image for ${listing.title}`}
                          width={120} height={80} style={{ objectFit: 'cover' }}
                          className="w-full h-full" priority={false}
                          onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder-image.svg'; }} // Ensure /public/placeholder-image.svg exists
                        />
                      </div>
                    </Link>
                  ) : ( 
                    <div className="flex-shrink-0 w-full sm:w-[120px] h-[80px] bg-gray-200 dark:bg-gray-700 rounded flex items-center justify-center">
                        <svg className="h-10 w-10 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    </div>
                  )}
                  
                  <div className="flex-grow">
                    <Link href={`/listings/${listing.id}`} className="text-lg font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 hover:underline block mb-1 break-words">
                      {listing.title}
                    </Link>
                    <p className="text-gray-600 dark:text-gray-400 text-sm mb-2 line-clamp-2">
                      {listing.description}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-700 dark:text-gray-300">
                      <span>Min Price:{' '}<span className="font-medium text-gray-900 dark:text-gray-100">{formatCurrency(listing.min_price)}</span></span>
                      {listing.end_time && (
                        <span className="flex items-center gap-1">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 opacity-70"> <path fillRule="evenodd" d="M1 8a7 7 0 1 1 14 0A7 7 0 0 1 1 8Zm7.75-4.25a.75.75 0 0 0-1.5 0V8c0 .414.336.75.75.75h4.25a.75.75 0 0 0 0-1.5H8.5V3.75Z" clipRule="evenodd" /> </svg>
                          {needsFinalizing ? 'Ended: ' : listing.status === 'closed' ? 'Closed: ' : 'Ends: '}
                          <span className="font-medium text-gray-900 dark:text-gray-100">{new Date(listing.end_time).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                        </span>
                      )}
                      {statusBadgeColorClasses && (<span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeColorClasses} ring-1 ring-inset ring-current/20`}>{statusBadgeText}</span>)}
                    </div>
                  </div>

                  <div className="flex-shrink-0 mt-3 sm:mt-0 sm:ml-4 self-center sm:self-start space-y-2 sm:space-y-0 sm:space-x-2 flex flex-col sm:flex-row items-center">
                    {canFinalize && (
                      <button onClick={() => handleFinalizeAuction(listing.id)} disabled={isListingBeingFinalized || isListingBeingDeleted} title="Manually close this auction and determine winner." className="w-full sm:w-auto inline-flex items-center justify-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed">
                        {isListingBeingFinalized ? (
                           <>
                             <svg className="animate-spin -ml-0.5 mr-1.5 h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                               <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                               <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" className="opacity-75" />
                             </svg>
                             Finalizing...
                           </>
                        ) : 'Finalize Auction'}
                      </button>
                    )}
                    {canDelete && ( 
                      <button onClick={() => handleDeleteListing(listing.id, listing.photos)} disabled={isListingBeingDeleted || isListingBeingFinalized} title="Delete this listing (only if no bids)" className="w-full sm:w-auto inline-flex items-center justify-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed">
                        {isListingBeingDeleted ? (
                          <>
                            <svg className="animate-spin -ml-0.5 mr-1.5 h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                               <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                               <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" className="opacity-75" />
                            </svg>
                            Deleting…
                          </>
                        ) : 'Delete'}
                      </button>
                    )}
                  </div>
                </li>
              );
          })}
        </ul>
      )}
    </div>
  );
}