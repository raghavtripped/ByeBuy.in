// src/app/my-listings/page.tsx
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { supabase, type User } from '@/lib/supabaseClient';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import { formatCurrency } from '@/lib/formatUtils';
import { isPast } from '@/lib/timeUtils';

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
    if (photosInput.every(item => typeof item === 'string')) {
      return photosInput as string[];
    }
    console.warn('Photos input is an array but not uniformly strings:', photosInput);
    return null;
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

/**
 * Extracts the storage path from a Supabase storage URL.
 * Assumes a standard Supabase URL structure like:
 * https://<project_ref>.supabase.co/storage/v1/object/public/<bucket_name>/<path_to_file>
 * @param photoUrl The full URL of the photo in Supabase storage.
 * @returns The path including bucket name (e.g., "bucket_name/folder/image.jpg") or null if parsing fails.
 */
const getStoragePathFromURL = (photoUrl: string): string | null => {
  try {
    const url = new URL(photoUrl);
    const pathSegments = url.pathname.split('/'); // e.g., ['', 'storage', 'v1', 'object', 'public', 'bucket_name', 'file.jpg']
    
    // Find the 'public' segment, the path after it is what we need (bucket_name/path/to/file)
    const publicSegmentIndex = pathSegments.indexOf('public');
    
    if (publicSegmentIndex !== -1 && publicSegmentIndex + 1 < pathSegments.length) {
      // Slice from the segment after 'public' to the end, and join them back.
      return pathSegments.slice(publicSegmentIndex + 1).join('/');
    }
    
    console.warn("Could not parse Supabase storage path from URL (expected '/public/' segment not found or path is too short):", photoUrl);
    return null;
  } catch (e) {
    console.error("Error parsing storage URL:", e, photoUrl);
    return null;
  }
};

// --- Types ---
type SellerListing = {
  id: string;
  title: string;
  description: string;
  min_price: number;
  end_time: string | null;
  created_at: string;
  photos: string[] | null; // Parsed: array of strings or null
  status: 'active' | 'closed' | 'cancelled' | string;
};

type ViewFilter = 'active' | 'past';

// Type for Realtime Payload from 'listings' table
type SellerListingPayload = Partial<Omit<SellerListing, 'photos'>> & {
  id: string; // ID is expected for operations
  photos?: string | string[] | null; // Raw from DB/realtime: can be string or array before parsing
};

// --- Component ---
export default function MyListingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [listings, setListings] = useState<SellerListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [viewFilter, setViewFilter] = useState<ViewFilter>('active');
  const [finalizingId, setFinalizingId] = useState<string | null>(null);
  const [finalizeMessage, setFinalizeMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  const fetchUserDataAndListings = useCallback(async (currentUser: User) => {
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
          photos: parsePhotosJson(item.photos as string | string[] | null), // Use parser
          status: item.status as SellerListing['status']
      })) as SellerListing[];

      setListings(typedListings);

    } catch (err) {
      console.error("Error fetching user listings:", err);
      setError(err instanceof Error ? err.message : "Failed to load your listings.");
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, []); // No unstable dependencies

  const handleRealtimeUpdate = useCallback((payload: RealtimePostgresChangesPayload<SellerListingPayload>) => {
      const newRecordRaw = payload.new;
      const oldRecordRaw = payload.old;

      // Ensure records have an ID for processing
      const newRecord = (newRecordRaw && 'id' in newRecordRaw && typeof newRecordRaw.id === 'string') 
                        ? newRecordRaw
                        : undefined;
      const oldRecord = (oldRecordRaw && 'id' in oldRecordRaw && typeof oldRecordRaw.id === 'string') 
                        ? oldRecordRaw
                        : undefined;
      
      const recordId = newRecord?.id || oldRecord?.id;
      if (!recordId) {
        console.warn('MyListingsPage: Realtime event received without a valid ID.', payload);
        return;
      }
      console.log('MyListingsPage: Realtime event', payload.eventType, recordId);

      setListings(currentListings => {
        let updatedList = [...currentListings];
        switch (payload.eventType) {
          case 'INSERT':
            // Ensure all required fields for SellerListing are present or have defaults
            if (newRecord && newRecord.title && newRecord.status && newRecord.created_at && newRecord.min_price !== undefined) {
              const correctlyTypedNew: SellerListing = {
                  id: newRecord.id, // id is guaranteed by earlier check
                  title: newRecord.title,
                  description: newRecord.description || '',
                  min_price: newRecord.min_price,
                  end_time: newRecord.end_time || null,
                  created_at: newRecord.created_at,
                  photos: parsePhotosJson(newRecord.photos), // Use parser
                  status: newRecord.status as SellerListing['status'],
              };
              if (!updatedList.some(l => l.id === correctlyTypedNew.id)) {
                updatedList.unshift(correctlyTypedNew);
              }
            } else {
                console.warn('MyListingsPage: Realtime INSERT missing required fields.', newRecord);
            }
            break;
          case 'UPDATE':
            if (newRecord) { // newRecord.id is guaranteed by recordId check
               const index = updatedList.findIndex(l => l.id === newRecord.id);
               if (index !== -1) {
                 const existingListing = updatedList[index];
                 // Merge existing with new, ensuring types and defaults are maintained
                 updatedList[index] = {
                   ...existingListing, // Start with existing
                   ...newRecord,       // Override with new values
                   photos: newRecord.photos !== undefined ? parsePhotosJson(newRecord.photos) : existingListing.photos, // Parse if present
                   status: (newRecord.status || existingListing.status) as SellerListing['status'], // Ensure status is valid
                   // Ensure all SellerListing properties are present if newRecord is partial
                   title: newRecord.title ?? existingListing.title,
                   description: newRecord.description ?? existingListing.description,
                   min_price: newRecord.min_price ?? existingListing.min_price,
                   end_time: newRecord.end_time !== undefined ? newRecord.end_time : existingListing.end_time,
                   created_at: newRecord.created_at ?? existingListing.created_at,
                 };
               } else {
                  // Optional: If an UPDATE comes for a listing not in local state,
                  // and if newRecord contains enough data, you could treat it as an INSERT.
                  // For now, we only update existing or log a warning.
                  console.warn(`MyListingsPage: Realtime UPDATE for unknown listing ID: ${newRecord.id}`);
               }
             }
            break;
          case 'DELETE':
            if (oldRecord?.id) { // oldRecord.id is guaranteed if recordId was derived from it
              updatedList = updatedList.filter(l => l.id !== oldRecord.id);
            }
            break;
        }
        // Always re-sort as created_at might change or new items added
        return updatedList.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      });
  }, []); // No unstable dependencies

  useEffect(() => {
    let isMounted = true;
    let userListingsChannel: ReturnType<typeof supabase.channel> | null = null;

    const setupAuthAndData = async () => {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (!isMounted) return;

        if (userError || !userData?.user) {
            console.log('User not authenticated, redirecting to login for MyListingsPage.');
            router.push('/auth?redirect=/my-listings');
            setLoading(false); // Stop loading as we are redirecting
            return;
        }
        
        const currentAuthUser = userData.user;
        setUser(currentAuthUser);
        await fetchUserDataAndListings(currentAuthUser); // fetchUserDataAndListings sets its own loading

        if (currentAuthUser?.id && isMounted) { // Double check isMounted before subscribe
          userListingsChannel = supabase
            .channel(`my-listings-channel-${currentAuthUser.id}`) // Unique channel per user
            .on<SellerListingPayload>(
              'postgres_changes',
              { event: '*', schema: 'public', table: 'listings', filter: `seller_id=eq.${currentAuthUser.id}` },
              handleRealtimeUpdate
            )
            .subscribe((status, err) => {
                if (!isMounted) return;
                if (status === 'SUBSCRIBED') {
                    console.log(`Realtime subscribed for My Listings (user: ${currentAuthUser.id})`);
                } else if (status === 'CHANNEL_ERROR') {
                    console.error(`Realtime channel error for My Listings (user: ${currentAuthUser.id}):`, err);
                } else if (status === 'TIMED_OUT') {
                    console.warn(`Realtime channel timed out for My Listings (user: ${currentAuthUser.id})`);
                }
            });
        }
    };

    setupAuthAndData();

    return () => {
      isMounted = false;
      if (userListingsChannel) {
        supabase.removeChannel(userListingsChannel)
          .then(() => console.log('MyListingsPage: Realtime channel unsubscribed.'))
          .catch(err => console.error("Error unsubscribing MyListingsPage channel:", err));
      }
    };
  }, [router, fetchUserDataAndListings, handleRealtimeUpdate]);

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
        // Update local state optimistically or based on result
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
      setTimeout(() => setFinalizeMessage(null), 7000); // Clear message after some time
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
      // Check for bids before deleting
      const { error: bidsErr, count } = await supabase.from('bids').select('id', { count: 'exact', head: true }).eq('item_id', listingId);
      if (bidsErr) throw new Error(`Bid check failed: ${bidsErr.message}`);
      if ((count ?? 0) > 0) throw new Error('Cannot delete: bids have already been placed on this listing.');
      
      // Delete from 'listings' table
      const { error: delErr } = await supabase.from('listings').delete().eq('id', listingId);
      if (delErr) throw new Error(`Database deletion failed: ${delErr.message}`);
      
      // Delete associated images from storage
      let storageCleanupError: string | null = null;
      if (currentPhotos && currentPhotos.length > 0) {
        const photoPathsToRemove = currentPhotos
          .map(url => getStoragePathFromURL(url)) // Get storage paths
          .filter(path => path !== null) as string[]; // Filter out any nulls (parsing errors)

        if (photoPathsToRemove.length > 0) {
          console.log('Attempting to remove photos from storage:', photoPathsToRemove);
          const { error: storageErr } = await supabase.storage.from('listing-images').remove(photoPathsToRemove); // Ensure bucket name matches
          if (storageErr) {
            storageCleanupError = `Listing deleted, but failed to remove images: ${storageErr.message}. Paths: ${photoPathsToRemove.join(', ')}`;
            console.error("Storage cleanup error:", storageErr);
          }
        }
      }
      if (storageCleanupError) {
        setDeleteError(storageCleanupError); // Show persistent error for storage cleanup failure
      }
      // UI update is handled by realtime subscription for the listing itself
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown deletion error.';
      setDeleteError(msg); // Show error from bids check or DB delete
      alert(msg); // Or use a more sophisticated notification
    } finally {
      setDeletingId(null);
      // Don't auto-clear deleteError if it's a storage cleanup issue as it's informative
      if (!(deleteError && deleteError.includes("failed to remove images"))) {
        setTimeout(() => setDeleteError(null), 7000);
      }
    }
  };

  const filteredListings = useMemo(() => {
    return listings.filter(listing => {
      if (viewFilter === 'active') {
        return listing.status === 'active' && !isPast(listing.end_time);
      }
      if (viewFilter === 'past') {
        return listing.status === 'closed' || listing.status === 'cancelled' || (listing.status === 'active' && isPast(listing.end_time));
      }
      return false; // Should not happen
    });
  }, [listings, viewFilter]);

  const tabClass = (tab: ViewFilter): string => {
      const baseClasses = 'px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800';
      const activeClasses = 'bg-indigo-600 text-white shadow-sm';
      const inactiveClasses = 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600';
      return `${baseClasses} ${viewFilter === tab ? activeClasses : inactiveClasses}`;
  };

  if (loading && !user) return (<section className="max-w-4xl mx-auto p-4 sm:p-8 text-center"><LoadingSpinner message="Authenticating..." /></section>);
  if (!user && !loading) return (<section className="max-w-4xl mx-auto p-4 sm:p-8 text-center"><h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-900 dark:text-gray-100 tracking-tight">My Listings</h1><p className="text-gray-600 dark:text-gray-400">Please log in to view your listings.</p><Link href="/auth?redirect=/my-listings" className="mt-4 inline-block text-indigo-600 hover:underline">Go to Login</Link></section>);
  if (loading && user) return (<section className="max-w-4xl mx-auto p-4 sm:p-8"><h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-900 dark:text-gray-100 tracking-tight">My Listings</h1><LoadingSpinner message="Loading your listings..." /></section>);
  if (error) return (<section className="max-w-4xl mx-auto p-4 sm:p-8 text-center"><h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-900 dark:text-gray-100 tracking-tight">My Listings</h1><p className="text-red-600 dark:text-red-400">{`Error: ${error}`}</p></section>);

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
          {filteredListings.map((listing: SellerListing) => {
              const isListingBeingDeleted = deletingId === listing.id;
              const isListingBeingFinalized = finalizingId === listing.id;
              const needsFinalizing = listing.status === 'active' && isPast(listing.end_time);
              const canDelete = listing.status === 'active' && !needsFinalizing;
              const canFinalize = needsFinalizing;

              let statusBadgeText = listing.status.charAt(0).toUpperCase() + listing.status.slice(1);
              let statusBadgeColorClasses = 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'; // Default
              if (listing.status === 'active') { statusBadgeColorClasses = 'bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-200 ring-teal-600/20 dark:ring-teal-500/30';}
              if (needsFinalizing) { statusBadgeText = 'Needs Finalizing'; statusBadgeColorClasses = 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200 ring-blue-600/20 dark:ring-blue-500/30'; }
              else if (listing.status === 'closed') { statusBadgeColorClasses = 'bg-green-100 text-green-800 dark:bg-green-900/60 dark:text-green-200 ring-green-600/20 dark:ring-green-500/30'; }
              else if (listing.status === 'cancelled') { statusBadgeColorClasses = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/60 dark:text-yellow-200 ring-yellow-600/20 dark:ring-yellow-500/30'; }
              
              const thumbnailUrl = (listing.photos && listing.photos.length > 0 && listing.photos[0])
                                 ? listing.photos[0]
                                 : null;

              return (
                <li key={listing.id} className={`border border-gray-200 dark:border-gray-700 p-4 rounded-lg shadow-sm flex flex-col sm:flex-row gap-4 items-start bg-white dark:bg-gray-800 transition-opacity duration-300 ${(isListingBeingDeleted || isListingBeingFinalized) ? 'opacity-50 pointer-events-none' : ''}`}>
                  <div className="flex-shrink-0 w-full sm:w-[120px] h-[80px] bg-gray-100 dark:bg-gray-700 rounded overflow-hidden group relative">
                    {thumbnailUrl ? (
                      <Link href={`/listings/${listing.id}`} aria-label={`View details for ${listing.title}`}>
                        <Image
                          src={thumbnailUrl}
                          alt={`Cover image for ${listing.title}`}
                          width={120}
                          height={80}
                          style={{ objectFit: 'cover' }}
                          className="w-full h-full transition-transform duration-300 group-hover:scale-105"
                          priority={false}
                          onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder-image.svg'; }}
                        />
                      </Link>
                    ) : ( 
                      <Link href={`/listings/${listing.id}`} className="w-full h-full flex items-center justify-center" aria-label={`View details for ${listing.title}`}>
                        <svg className="h-10 w-10 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      </Link>
                    )}
                  </div>
                  
                  <div className="flex-grow min-w-0"> {/* Added min-w-0 for flex child text wrapping */}
                    <Link href={`/listings/${listing.id}`} className="text-lg font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 hover:underline block mb-1 break-words">
                      {listing.title}
                    </Link>
                    <p className="text-gray-600 dark:text-gray-400 text-sm mb-2 line-clamp-2 break-words">
                      {listing.description}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-700 dark:text-gray-300">
                      <span>Min Price:{' '}<span className="font-medium text-gray-900 dark:text-gray-100">{formatCurrency(listing.min_price)}</span></span>
                      {listing.end_time && (
                        <span className="flex items-center gap-1">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 opacity-70 flex-shrink-0"> <path fillRule="evenodd" d="M1 8a7 7 0 1 1 14 0A7 7 0 0 1 1 8Zm7.75-4.25a.75.75 0 0 0-1.5 0V8c0 .414.336.75.75.75h4.25a.75.75 0 0 0 0-1.5H8.5V3.75Z" clipRule="evenodd" /> </svg>
                          {needsFinalizing ? 'Ended: ' : listing.status === 'closed' ? 'Closed: ' : 'Ends: '}
                          <span className="font-medium text-gray-900 dark:text-gray-100">{new Date(listing.end_time).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                        </span>
                      )}
                      {statusBadgeColorClasses && (<span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeColorClasses} ring-1 ring-inset ring-current/20`}>{statusBadgeText}</span>)}
                    </div>
                  </div>

                  <div className="flex-shrink-0 mt-3 sm:mt-0 sm:ml-4 self-center sm:self-start space-y-2 sm:space-x-0 sm:flex sm:flex-col sm:space-y-2 md:flex-row md:space-y-0 md:space-x-2 items-center">
                    {canFinalize && (
                      <button onClick={() => handleFinalizeAuction(listing.id)} disabled={isListingBeingFinalized || isListingBeingDeleted} title="Manually close this auction and determine winner." className="w-full sm:w-auto md:w-auto inline-flex items-center justify-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed">
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
                     <Link href={`/listings/${listing.id}/edit`} className="w-full sm:w-auto md:w-auto inline-flex items-center justify-center px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-xs font-medium rounded-md shadow-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-disabled={isListingBeingDeleted || isListingBeingFinalized || listing.status === 'closed' || listing.status === 'cancelled'}
                        onClick={(e) => { if (isListingBeingDeleted || isListingBeingFinalized || listing.status === 'closed' || listing.status === 'cancelled') e.preventDefault(); }}
                        style={{ pointerEvents: (isListingBeingDeleted || isListingBeingFinalized || listing.status === 'closed' || listing.status === 'cancelled') ? 'none' : 'auto' }}
                     >
                      Edit
                    </Link>
                    {canDelete && ( 
                      <button onClick={() => handleDeleteListing(listing.id, listing.photos)} disabled={isListingBeingDeleted || isListingBeingFinalized} title="Delete this listing (only if no bids)" className="w-full sm:w-auto md:w-auto inline-flex items-center justify-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed">
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