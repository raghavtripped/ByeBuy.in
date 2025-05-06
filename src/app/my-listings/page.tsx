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
// Defines the structure of listing data specific to this page's needs
type SellerListing = {
  id: string;
  title: string;
  description: string; // Used for display
  min_price: number;
  end_time: string | null; // TIMESTAMPTZ can be null initially? Though required in form.
  created_at: string; // Used for ordering
  photos: string | null; // URL for the image
};
// Type for the filter state ('active' or 'past' listings)
type ViewFilter = 'active' | 'past';

// --- Helpers ---
// Helper function to extract the relative storage path from a Supabase public URL
// Required for deleting the corresponding storage object when a listing is deleted.
const getStoragePathFromURL = (photoUrl: string): string | null => {
  try {
    const url = new URL(photoUrl);
    // Example URL: https://<project_ref>.supabase.co/storage/v1/object/public/listing-images/<user_id>/<file_name.ext>
    // We want the part after the bucket name: <user_id>/<file_name.ext>
    const pathSegments = url.pathname.split('/');
    const bucketName = 'listing-images'; // Make sure this matches your bucket name
    const bucketIndex = pathSegments.indexOf(bucketName);

    // Check if bucket name exists and there's a path after it
    if (bucketIndex !== -1 && bucketIndex + 1 < pathSegments.length) {
      // Join the segments after the bucket name to get the relative path
      return pathSegments.slice(bucketIndex + 1).join('/');
    }

    // Log a warning if the expected path structure isn't found
    console.warn("Could not parse expected storage path from URL:", photoUrl);
    return null; // Return null if parsing fails

  } catch (e) {
    // Catch errors during URL parsing (e.g., invalid URL format)
    console.error("Error parsing storage URL:", e);
    return null;
  }
};

// --- Component ---
export default function MyListingsPage() {
  const router = useRouter();

  // --- State ---
  const [user, setUser] = useState<User | null>(null); // Authenticated user object
  const [listings, setListings] = useState<SellerListing[]>([]); // Array of user's listings
  const [loading, setLoading] = useState(true); // Indicates initial data loading
  const [error, setError] = useState<string | null>(null); // Stores general fetching errors
  const [deletingId, setDeletingId] = useState<string | null>(null); // Tracks the ID of the listing currently being deleted (for UI feedback)
  const [deleteError, setDeleteError] = useState<string | null>(null); // Stores errors specific to the deletion process
  const [viewFilter, setViewFilter] = useState<ViewFilter>('active'); // Controls which listings ('active' or 'past') are displayed

  // --- Effects ---
  // Fetch user authentication status and their listings when the component mounts
  useEffect(() => {
    const fetchUserDataAndListings = async () => {
      setLoading(true); // Start loading indicator
      setError(null); // Clear previous errors
      setDeleteError(null); // Clear previous deletion errors

      // 1. Get the current authenticated user from Supabase Auth
      const { data: userData, error: userError } = await supabase.auth.getUser();

      // Handle authentication errors or non-logged-in users
      if (userError || !userData?.user) {
        console.log("User not authenticated, redirecting to login.");
        // Redirect to login page, passing the current path to return after login
        router.push('/auth?redirect=/my-listings');
        // No need to setLoading(false) here as the component will unmount/redirect
        return;
      }
      // Store the authenticated user object
      setUser(userData.user);

      // 2. Fetch listings created by this specific user
      try {
          const { data, error: listingError } = await supabase
            .from('listings') // Query the 'listings' table
            // Select fields needed for display and deletion logic
            .select('id, title, description, min_price, end_time, created_at, photos')
            .eq('seller_id', userData.user.id) // Filter by the current user's ID
            .order('created_at', { ascending: false }); // Order by creation date, newest first

          // Handle potential errors during listing fetch
          if (listingError) {
              throw listingError; // Let the catch block handle it
          }

          // Update state with the fetched listings (or an empty array if none found)
          setListings(data ?? []);
          console.log(`Fetched ${data?.length ?? 0} listings for user ${userData.user.id}`);

      } catch (err) {
          // Catch and log errors from the listings fetch
          console.error("Error fetching user listings:", err);
          // Set user-friendly error message
          setError(err instanceof Error ? err.message : "Failed to load your listings.");
          setListings([]); // Ensure listings array is empty on error
      } finally {
          // Mark loading as complete, regardless of success or error
          setLoading(false);
      }
    };

    // Execute the fetch function
    fetchUserDataAndListings();

    // Dependency array includes 'router' because it's used for redirection
  }, [router]);

  // --- Deletion Handler ---
  // Function to handle the deletion of a listing
  const handleDeleteListing = async (listingId: string, photoUrl: string | null) => {
    setDeletingId(listingId); // Set state to indicate deletion is in progress for this item's UI
    setDeleteError(null); // Clear any previous deletion errors

    // Get listing title for confirmation message
    const listingTitle = listings.find(l => l.id === listingId)?.title ?? 'this listing';
    // Confirm user's intent using a browser confirmation dialog
    if (!window.confirm(`Are you sure you want to delete "${listingTitle}"? This action cannot be undone.`)) {
      setDeletingId(null); // Reset deleting state if user cancels
      return; // Stop the deletion process
    }

    console.log(`Attempting to delete listing ID: ${listingId}`);
    try {
      // --- Pre-deletion Check: Ensure no bids exist ---
      console.log(`Checking bids for listing ${listingId}...`);
      const { error: bidsErr, count } = await supabase
        .from('bids')
        .select('id', { count: 'exact', head: true }) // Use 'head: true' for efficiency - only counts, doesn't return data
        .eq('item_id', listingId);

      // Handle errors during the bid check
      if (bidsErr) {
          throw new Error(`Failed to check for existing bids: ${bidsErr.message}`);
      }
      console.log(`Found ${count ?? 0} bids for listing ${listingId}.`);

      // --- Business Rule: Prevent deletion if bids exist ---
      if ((count ?? 0) > 0) {
        throw new Error('Cannot delete this listing because bids have already been placed on it.');
      }

      // --- Step 1: Delete Listing from Database ---
      console.log(`Deleting listing ${listingId} from database...`);
      const { error: deleteDbErr } = await supabase
        .from('listings')
        .delete()
        .eq('id', listingId); // Specify the row to delete by ID

      // Handle errors during database deletion
      if (deleteDbErr) {
          throw new Error(`Database deletion failed: ${deleteDbErr.message}`);
      }
      console.log(`Listing ${listingId} deleted successfully from database.`);


      // --- Step 2: Delete Associated Image from Storage (if exists) ---
      let storageCleanupError: string | null = null; // Variable to track storage errors separately
      if (photoUrl) {
        const storagePath = getStoragePathFromURL(photoUrl); // Extract the relative path
        if (storagePath) {
          console.log(`Attempting to delete storage object: ${storagePath}`);
          // Perform the storage removal
          const { error: storageErr } = await supabase
            .storage
            .from('listing-images') // Ensure this matches the bucket name exactly
            .remove([storagePath]); // API expects an array of paths

          // Handle storage deletion errors (log but don't necessarily stop the process)
          if (storageErr) {
            console.error(`Storage deletion failed for path ${storagePath}: ${storageErr.message}`);
            // Prepare an error message for the user about the partial failure
            storageCleanupError = `Listing deleted from database, but failed to remove the associated image from storage. Error: ${storageErr.message}`;
          } else {
              console.log(`Successfully deleted storage object: ${storagePath}`);
          }
        } else {
            // If the path couldn't be parsed from the URL
          console.warn(`Could not parse storage path from photo URL: ${photoUrl}`);
          storageCleanupError = 'Listing deleted, but could not determine the image path to remove the file from storage.';
        }
      } else {
          console.log(`No photo URL provided for listing ${listingId}, skipping storage deletion.`);
      }

      // --- Step 3: Update UI State ---
      // Remove the deleted listing from the local state array to update the UI immediately
      setListings(prevListings => prevListings.filter(l => l.id !== listingId));
      console.log(`Listing ${listingId} removed from UI state.`);

      // If there was a storage error, set it to be displayed in the banner
       if (storageCleanupError) {
           setDeleteError(storageCleanupError);
           // Consider if an additional alert is needed for storage errors
           // alert(storageCleanupError);
       } else {
           // Optional: Provide a brief success confirmation (e.g., using a toast notification library later)
           // console.log(`Listing "${listingTitle}" successfully deleted.`);
       }

    } catch (err) {
      // Catch errors from bid check, DB delete, or explicitly thrown errors
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred during deletion.';
      console.error('handleDeleteListing encountered an error:', err);
      // Set the error message to be displayed in the dedicated banner
      setDeleteError(errorMessage);
      // Also show an immediate alert for critical failures (like preventing deletion due to bids)
      alert(`Error: ${errorMessage}`);
    } finally {
      // Ensure the 'deleting' state is reset for the specific item, regardless of success or failure
      setDeletingId(null);
    }
  };

  // --- Filtering Logic ---
  // Memoized calculation to filter listings based on the current 'viewFilter' state
  const filteredListings = useMemo(
    () =>
      listings.filter(listing => {
          // Determine if the listing's end time is in the past
          const hasEnded = isPast(listing.end_time);
          // Return true if the listing matches the filter criteria
          return viewFilter === 'active' ? !hasEnded : hasEnded;
      }),
    [listings, viewFilter], // Recalculate only if the listings array or the filter selection changes
  );

  // --- UI Helper Function ---
  // Generates Tailwind classes for the filter tabs based on active state
  const tabClass = (tab: ViewFilter): string => {
      // Base classes common to both states
      const baseClasses = 'px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800';
      // Classes for the active tab
      const activeClasses = 'bg-indigo-600 text-white shadow-sm';
      // Classes for inactive tabs
      const inactiveClasses = 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600';
      // Combine base classes with active or inactive classes based on the current filter
      return `${baseClasses} ${viewFilter === tab ? activeClasses : inactiveClasses}`;
  };

  // --- Render Guards ---
  // Display a loading spinner while the initial data fetch is in progress
  if (loading) {
    return (
      <section className="max-w-4xl mx-auto p-4 sm:p-8 text-center">
        <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-900 dark:text-gray-100 tracking-tight">
          My Listings
        </h1>
        <LoadingSpinner message="Loading your listings..." />
      </section>
    );
   }

  // Display an error message if the initial data fetch failed
  if (error) {
    return (
      <section className="max-w-4xl mx-auto p-4 sm:p-8 text-center">
        <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-900 dark:text-gray-100 tracking-tight">
          My Listings
        </h1>
        {/* Display the specific error message */}
        <p className="text-red-600 dark:text-red-400">{`Error: ${error}`}</p>
      </section>
    );
  }

  // Although useEffect handles redirection, this is a fallback safeguard.
  // If loading is finished but user is still null, show login prompt.
  if (!user && !loading) {
    return (
      <section className="max-w-4xl mx-auto p-4 sm:p-8 text-center">
        <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-900 dark:text-gray-100 tracking-tight">
          My Listings
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Please{' '}
          {/* Link to the authentication page */}
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
    // Container for the page content
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Page Header: Title and Filter Tabs */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 sm:mb-8 gap-4 pb-4 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
            My Listings
        </h1>
        {/* Filter Tabs Container */}
        <div className="flex space-x-2 flex-shrink-0">
          {/* Active Filter Button */}
          <button className={tabClass('active')} onClick={() => setViewFilter('active')}>
            Active
          </button>
          {/* Past Filter Button */}
          <button className={tabClass('past')} onClick={() => setViewFilter('past')}>
            Past
          </button>
        </div>
      </header>

      {/* Deletion Error Banner: Displayed if a deletion error occurs */}
      {deleteError && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-600/50 rounded-md text-sm text-red-800 dark:text-red-200 flex items-start gap-2" role="alert">
             {/* Error Icon */}
             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 flex-shrink-0 mt-0.5"> <path fillRule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" /> </svg>
            {/* Deletion error message text */}
            <span>{deleteError}</span>
        </div>
      )}

      {/* Conditional Rendering: Display Listings List or Empty State */}
      {filteredListings.length === 0 ? (
        // If no listings match the current filter, show the EmptyState component
        <EmptyState
          message={
            // Tailor message based on the active filter
            viewFilter === 'active'
              ? 'You have no active listings.'
              : 'You have no past listings.'
          }
          // Provide a relevant call to action
          action={{ href: '/listings/new', text: 'List an Item' }}
        />
      ) : (
        // If listings exist for the filter, display them as an unordered list
        <ul className="space-y-6"> {/* Vertical spacing between list items */}
          {/* Map through the filtered listings array */}
          {filteredListings.map(listing => {
              // Check if the current listing is the one being deleted (for UI feedback)
              const isListingBeingDeleted = deletingId === listing.id;
              // Determine if the delete button should be enabled (only for 'active' listings)
              const canDelete = viewFilter === 'active';

              return (
                // List Item container for each listing
                <li
                  key={listing.id} // Unique key for React rendering
                  // Base styling + transition for opacity change during deletion
                  className={`border border-gray-200 dark:border-gray-700 p-4 rounded-lg shadow-sm flex flex-col sm:flex-row gap-4 items-start bg-white dark:bg-gray-800 transition-opacity duration-300 ${isListingBeingDeleted ? 'opacity-50 pointer-events-none' : ''}`} // Fade out and disable interactions during deletion
                >
                  {/* Image Section (Conditional) */}
                  {listing.photos && ( // Only render if a photo URL exists
                    <Link href={`/listings/${listing.id}`} className="flex-shrink-0 block w-full sm:w-auto" aria-label={`View details for ${listing.title}`}>
                       {/* Image container: relative positioning for potential overlays, defined size */}
                      <div className="relative w-full h-32 sm:w-[120px] sm:h-[80px] bg-gray-100 dark:bg-gray-700 rounded overflow-hidden group transition-opacity duration-200 hover:opacity-90">
                        {/* Use Next.js Image component for optimization */}
                        <Image
                          src={listing.photos}
                          alt={`Cover image for ${listing.title}`} // Descriptive alt text
                          width={120} // Provide width hint (matches sm:w-[120px])
                          height={80} // Provide height hint (matches sm:h-[80px])
                          style={{ objectFit: 'cover' }} // Ensure image covers the container area
                          className="w-full h-full" // Make image fill container
                          priority={false} // Images in a list are usually not priority
                        />
                      </div>
                    </Link>
                  )}

                  {/* Details Section */}
                  <div className="flex-grow">
                    {/* Listing Title (as a Link) */}
                    <Link
                      href={`/listings/${listing.id}`}
                      className="text-lg font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 hover:underline block mb-1 break-words" // Allow long titles to wrap
                    >
                      {listing.title}
                    </Link>
                    {/* Listing Description (Truncated using line-clamp) */}
                    <p className="text-gray-600 dark:text-gray-400 text-sm mb-2 line-clamp-2"> {/* Limits description to 2 lines */}
                      {listing.description}
                    </p>
                    {/* Meta Information (Price, End Time, Status Badge) */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-700 dark:text-gray-300">
                      {/* Minimum Price Display */}
                      <span>
                        Min Price:{' '}
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {formatCurrency(listing.min_price)}
                        </span>
                      </span>
                      {/* End Time Display (formatted) */}
                      {listing.end_time && (
                        <span className="flex items-center gap-1"> {/* Align icon and text */}
                          {/* Clock Icon */}
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 opacity-70"> <path fillRule="evenodd" d="M1 8a7 7 0 1 1 14 0A7 7 0 0 1 1 8Zm7.75-4.25a.75.75 0 0 0-1.5 0V8c0 .414.336.75.75.75h4.25a.75.75 0 0 0 0-1.5H8.5V3.75Z" clipRule="evenodd" /> </svg>
                          Ends:{' '}
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {/* Format date/time concisely */}
                            {new Date(listing.end_time).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                          </span>
                        </span>
                      )}
                      {/* 'Ended' Badge (shown only in 'Past' view) */}
                      {viewFilter === 'past' && (
                        <span className="inline-flex items-center rounded-full bg-red-100 dark:bg-red-800/50 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-200 ring-1 ring-inset ring-red-600/20 dark:ring-red-500/30">
                          Ended
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Delete Button Section */}
                   {/* Conditionally render the delete button only if 'canDelete' is true */}
                  {canDelete && (
                      // Container for the button, controlling alignment and spacing
                      <div className="flex-shrink-0 mt-2 sm:mt-0 sm:ml-4 self-center sm:self-start"> {/* Aligns button nicely */}
                        <button
                          onClick={() => handleDeleteListing(listing.id, listing.photos)}
                          // Disable button if this specific listing is currently being deleted
                          disabled={isListingBeingDeleted}
                          title="Delete this listing (only possible if no bids are placed)" // Tooltip
                          // Styling for the delete button (red, small, rounded)
                          className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {/* Show spinner or text based on deletion state */}
                            {isListingBeingDeleted ? (
                                <>
                                    {/* Inline SVG spinner */}
                                    <svg className="animate-spin -ml-0.5 mr-1.5 h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"> <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle> <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path> </svg>
                                    Deleting
                                </>
                            ) : (
                                'Delete' // Default button text
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