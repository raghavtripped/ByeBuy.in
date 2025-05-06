// src/app/my-listings/page.tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image'; // <-- Import the Image component
import { supabase, type User } from '@/lib/supabaseClient';
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
  photos: string | null;
};
type ViewFilter = 'active' | 'past';

// --- Helpers ---
// Helper to extract storage path from Supabase public URL (for deletion)
const getStoragePathFromURL = (photoUrl: string): string | null => {
  try {
    const url = new URL(photoUrl);
    // Expecting path like /storage/v1/object/public/listing-images/user_id/file_name.ext
    const pathSegments = url.pathname.split('/');
    // Find the bucket name and join the rest
    const bucketIndex = pathSegments.indexOf('listing-images');
    if (bucketIndex !== -1 && bucketIndex + 1 < pathSegments.length) {
      return pathSegments.slice(bucketIndex + 1).join('/');
    }
    console.warn("Could not parse expected storage path:", photoUrl);
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
  const [deletingId, setDeletingId] = useState<string | null>(null); // Track which listing is being deleted
  const [deleteError, setDeleteError] = useState<string | null>(null); // Error message specific to deletion
  const [viewFilter, setViewFilter] = useState<ViewFilter>('active'); // 'active' or 'past'

  // --- Effects ---
  // Fetch user and their listings on component mount
  useEffect(() => {
    const fetchUserDataAndListings = async () => {
      setLoading(true);
      setError(null);
      setDeleteError(null);

      // 1. Get current authenticated user
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData?.user) {
        // If no user, redirect to login page
        router.push('/auth?redirect=/my-listings'); // Remember where user was going
        return;
      }
      setUser(userData.user);

      // 2. Fetch listings created by this user
      try {
          const { data, error: listingError } = await supabase
            .from('listings')
            // Select necessary fields for display and deletion logic
            .select('id, title, description, min_price, end_time, created_at, photos')
            .eq('seller_id', userData.user.id) // Filter by seller ID
            .order('created_at', { ascending: false }); // Show newest first

          if (listingError) throw listingError; // Propagate error

          setListings(data ?? []); // Update state with fetched listings or empty array
      } catch (err) {
          console.error("Error fetching listings:", err);
          setError(err instanceof Error ? err.message : "Failed to load your listings.");
          setListings([]);
      } finally {
          setLoading(false); // Loading finished
      }
    };

    fetchUserDataAndListings();
  }, [router]); // Dependency on router for redirection

  // --- Deletion Handler ---
  const handleDeleteListing = async (listingId: string, photoUrl: string | null) => {
    setDeletingId(listingId); // Indicate deletion in progress for this item
    setDeleteError(null); // Clear previous deletion errors

    // Confirm intent with user
    const listingTitle = listings.find(l => l.id === listingId)?.title ?? 'this listing';
    if (!window.confirm(`Are you sure you want to delete "${listingTitle}"? This action cannot be undone.`)) {
      setDeletingId(null); // Cancel deletion if user clicks 'Cancel'
      return;
    }

    try {
      // Check if any bids have been placed on the listing
      const { error: bidsErr, count } = await supabase
        .from('bids')
        .select('id', { count: 'exact', head: true }) // Efficiently count bids
        .eq('item_id', listingId);

      if (bidsErr) throw new Error(`Failed to check for bids: ${bidsErr.message}`);
      // Prevent deletion if bids exist (important business rule)
      if ((count ?? 0) > 0) {
        throw new Error('Cannot delete this listing because bids have already been placed on it.');
      }

      // Proceed with deletion: Delete the listing row from the database
      const { error: deleteDbErr } = await supabase
        .from('listings')
        .delete()
        .eq('id', listingId); // Target the specific listing

      if (deleteDbErr) throw new Error(`Database deletion failed: ${deleteDbErr.message}`);

      // If database deletion successful, attempt to delete the associated image from storage
      let storageCleanupError: string | null = null;
      if (photoUrl) {
        const storagePath = getStoragePathFromURL(photoUrl); // Get the path relative to the bucket
        if (storagePath) {
          console.log(`Attempting to delete storage object: ${storagePath}`);
          const { error: storageErr } = await supabase
            .storage
            .from('listing-images') // Ensure correct bucket name
            .remove([storagePath]); // Pass path in an array

          if (storageErr) {
             // Log storage error but don't throw; DB deletion is the primary goal
            console.error(`Storage deletion failed for ${storagePath}: ${storageErr.message}`);
            // Set a message to inform user about partial failure
            storageCleanupError = `Listing deleted, but failed to remove the associated image. Please report this if it persists. Error: ${storageErr.message}`;
          } else {
              console.log(`Successfully deleted storage object: ${storagePath}`);
          }
        } else {
            // If path couldn't be parsed, log warning
          console.warn(`Could not parse storage path from URL: ${photoUrl}`);
          storageCleanupError = 'Listing deleted, but could not parse the image path to remove the file from storage.';
        }
      }

      // Update the UI by removing the deleted listing from the state
      setListings(prev => prev.filter(l => l.id !== listingId));

      // If there was a storage cleanup issue, display it after success message
       if (storageCleanupError) {
           setDeleteError(storageCleanupError);
           // Optionally show an alert too, or rely on the banner
           // alert(storageCleanupError);
       } else {
           // Optional: Show a success confirmation briefly?
           // alert(`"${listingTitle}" deleted successfully.`);
       }

    } catch (err) {
      // Catch errors from bid check, DB delete, or thrown explicitly
      const msg = err instanceof Error ? err.message : 'An unknown error occurred during deletion.';
      console.error('handleDeleteListing error:', err);
      setDeleteError(msg); // Display error in the banner
      alert(`Error: ${msg}`); // Also show an immediate alert for critical failures
    } finally {
      // Always stop indicating deletion is in progress, whether success or fail
      setDeletingId(null);
    }
  };

  // --- Filtering Logic ---
  // Filter listings based on the selected 'active' or 'past' tab
  const filteredListings = useMemo(
    () =>
      listings.filter(listing => {
          const ended = isPast(listing.end_time);
          return viewFilter === 'active' ? !ended : ended;
      }),
    [listings, viewFilter], // Recalculate only when listings or filter change
  );

  // --- UI Helpers ---
  // Dynamically generate classes for the active/inactive filter tabs
  const tabClass = (tab: ViewFilter): string => {
      const baseClasses = 'px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800';
      const activeClasses = 'bg-indigo-600 text-white shadow-sm';
      const inactiveClasses = 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600';
      return `${baseClasses} ${viewFilter === tab ? activeClasses : inactiveClasses}`;
  };


  // --- Render Guards ---
  // Show loading spinner while initial data is fetching
  if (loading) {
    return (
      <section className="max-w-4xl mx-auto p-4 sm:p-8 text-center">
        <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-900 dark:text-gray-100">
          My Listings
        </h1>
        <LoadingSpinner message="Loading your listings..." />
      </section>
    );
   }

  // Show error message if fetching failed
  if (error) {
    return (
      <section className="max-w-4xl mx-auto p-4 sm:p-8 text-center">
        <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-900 dark:text-gray-100">
          My Listings
        </h1>
        <p className="text-red-600 dark:text-red-400">{`Error: ${error}`}</p>
      </section>
    );
  }

  // Should not happen if useEffect handles redirect, but good practice
  if (!user && !loading) {
    return (
      <section className="max-w-4xl mx-auto p-4 sm:p-8 text-center">
        <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-900 dark:text-gray-100">
          My Listings
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Please{' '}
          <Link href="/auth" className="text-indigo-600 hover:text-indigo-500 underline">
            log in
          </Link>{' '}
          to view your listings.
        </p>
      </section>
    );
  }

  // --- Main Render ---
  return (
    // Page container
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Header with Title and Filter Tabs */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 sm:mb-8 gap-4 pb-4 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
            My Listings
        </h1>
        {/* Filter tabs */}
        <div className="flex space-x-2 flex-shrink-0">
          <button className={tabClass('active')} onClick={() => setViewFilter('active')}>
            Active
          </button>
          <button className={tabClass('past')} onClick={() => setViewFilter('past')}>
            Past
          </button>
        </div>
      </header>

      {/* Deletion Error Banner */}
      {deleteError && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-600/50 rounded-md text-sm text-red-800 dark:text-red-200 flex items-start gap-2" role="alert">
             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 flex-shrink-0 mt-0.5"> <path fillRule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" /> </svg>
            <span>{deleteError}</span>
        </div>
      )}

      {/* Conditional Rendering: List or Empty State */}
      {filteredListings.length === 0 ? (
        // Display EmptyState component when no listings match the filter
        <EmptyState
          message={
            viewFilter === 'active'
              ? 'You have no active listings.'
              : 'You have no past listings.'
          }
          action={{ href: '/listings/new', text: 'List an Item' }}
        />
      ) : (
        // Display the list of listings
        <ul className="space-y-6">
          {/* Map through the filtered listings */}
          {filteredListings.map(listing => {
              const isListingBeingDeleted = deletingId === listing.id;
              const canDelete = viewFilter === 'active'; // Can only delete active listings (before bids)

              return (
                <li
                  key={listing.id}
                  className={`border border-gray-200 dark:border-gray-700 p-4 rounded-lg shadow-sm flex flex-col sm:flex-row gap-4 items-start bg-white dark:bg-gray-800 transition-opacity duration-300 ${isListingBeingDeleted ? 'opacity-50' : ''}`} // Fade out during deletion
                >
                  {/* Image Section */}
                  {listing.photos && (
                    <Link href={`/listings/${listing.id}`} className="flex-shrink-0 block w-full sm:w-auto">
                       {/* Image container with defined size */}
                      <div className="relative w-full h-32 sm:w-[120px] sm:h-[80px] bg-gray-100 dark:bg-gray-700 rounded overflow-hidden group transition-opacity duration-200 hover:opacity-90">
                        {/* Use Next.js Image component */}
                        <Image
                          src={listing.photos}
                          alt={`Cover image for ${listing.title}`}
                          width={120} // Match sm:w-[120px]
                          height={80} // Match sm:h-[80px]
                          className="w-full h-full object-cover" // Ensure image covers the container
                          priority={false} // Usually false for list items
                        />
                      </div>
                    </Link>
                  )}

                  {/* Details Section */}
                  <div className="flex-grow">
                    {/* Listing Title (Link) */}
                    <Link
                      href={`/listings/${listing.id}`}
                      className="text-lg font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 hover:underline block mb-1"
                    >
                      {listing.title}
                    </Link>
                    {/* Listing Description (Truncated) */}
                    <p className="text-gray-600 dark:text-gray-400 text-sm mb-2 line-clamp-2">
                      {listing.description}
                    </p>
                    {/* Meta Info (Price, End Time, Status) */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-700 dark:text-gray-300">
                      <span>
                        Min Price:{' '}
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {formatCurrency(listing.min_price)}
                        </span>
                      </span>
                      {listing.end_time && (
                        <span className="flex items-center gap-1">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 opacity-70"> <path fillRule="evenodd" d="M1 8a7 7 0 1 1 14 0A7 7 0 0 1 1 8Zm7.75-4.25a.75.75 0 0 0-1.5 0V8c0 .414.336.75.75.75h4.25a.75.75 0 0 0 0-1.5H8.5V3.75Z" clipRule="evenodd" /> </svg>
                          Ends:{' '}
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {new Date(listing.end_time).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                          </span>
                        </span>
                      )}
                      {/* Show 'Ended' badge only in the 'Past' view */}
                      {viewFilter === 'past' && (
                        <span className="inline-flex items-center rounded-full bg-red-100 dark:bg-red-800/50 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-200 ring-1 ring-inset ring-red-600/20 dark:ring-red-500/30">
                          Ended
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Delete Button Section */}
                   {/* Show delete button only for active listings */}
                  {canDelete && (
                      <div className="flex-shrink-0 mt-2 sm:mt-0 sm:ml-4 self-center sm:self-start">
                        <button
                          onClick={() => handleDeleteListing(listing.id, listing.photos)}
                          disabled={isListingBeingDeleted} // Disable while this specific item is deleting
                          title="Delete this listing (only possible if no bids are placed)"
                          className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {/* Show spinner or text */}
                            {isListingBeingDeleted ? (
                                <>
                                    <svg className="animate-spin -ml-0.5 mr-1.5 h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"> <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle> <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path> </svg>
                                    Deleting
                                </>
                            ) : (
                                'Delete'
                             )}
                        </button>
                      </div>
                   )}
                </li>
              );
          })}
        </ul>
      )}
    </div>
  );
}