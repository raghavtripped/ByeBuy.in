// src/app/my-listings/page.tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase, User } from '@/lib/supabaseClient';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import { formatCurrency } from '@/lib/formatUtils';
import { isPast } from '@/lib/timeUtils';

// Type definition
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

export default function MyListingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [listings, setListings] = useState<SellerListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [viewFilter, setViewFilter] = useState<ViewFilter>('active');

  // Fetch User Data and Listings
  useEffect(() => {
    const fetchUserDataAndListings = async () => {
      setLoading(true); setError(null); setDeleteError(null);
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData?.user) { router.push('/auth'); return; }
      setUser(userData.user);
      try {
        const { data: listingData, error: listingError } = await supabase
          .from('listings')
          .select('id, title, description, min_price, end_time, created_at, photos')
          .eq('seller_id', userData.user.id)
          .order('created_at', { ascending: false });
        if (listingError) throw listingError;
        setListings(listingData ?? []);
      } catch (err) { /* ... error handling ... */
            console.error('Error fetching listings:', err);
            let message = 'Failed to fetch your listings.';
            if (err instanceof Error) { message = err.message; }
            else if (typeof err === 'object' && err !== null && 'message' in err) { message = String((err as { message: unknown }).message ?? message); }
            setError(message); setListings([]);
       } finally { setLoading(false); }
    };
    fetchUserDataAndListings();
  }, [router]);

  // Handle Delete Listing Function
  const handleDeleteListing = async (listingId: string, photoUrl: string | null) => {
    setDeletingId(listingId);
    setDeleteError(null);



    // Confirmation Check
    if (!window.confirm(`Are you sure you want to delete the listing "${listings.find(l=>l.id===listingId)?.title ?? 'this listing'}"? This cannot be undone.`)) {
      console.log(`DEBUG: Deletion cancelled by user for ID: ${listingId}.`);
      setDeletingId(null);
      return;
    }

    console.log(`DEBUG: Deletion confirmed for ID: ${listingId}. Proceeding with checks...`);

    try {
        // Check for existing bids
        console.log(`Checking bids for listing: ${listingId}`);
        const { error: bidsError, count: bidCount } = await supabase
            .from('bids')
            .select('id', { count: 'exact', head: true })
            .eq('item_id', listingId);

        if (bidsError) { throw new Error(`Failed to check for bids: ${bidsError.message}`); }

        console.log(`Bid check count for ${listingId}: ${bidCount ?? 0}`);
        if ((bidCount ?? 0) > 0) { throw new Error("Cannot delete listing: Bids have already been placed."); }

        // Delete Listing Row
        console.log(`Deleting listing row: ${listingId}`);
        const { error: deleteListingError } = await supabase.from('listings').delete().eq('id', listingId);
        if (deleteListingError) { throw new Error(`Database deletion failed: ${deleteListingError.message}`); }
        console.log(`Listing row deleted: ${listingId}`);

        // Delete Image from Storage
        if (photoUrl) { /* ... storage delete logic ... */
             try {
                 const url = new URL(photoUrl);
                 const pathParts = url.pathname.split('/listing-images/');
                 if (pathParts.length > 1 && pathParts[1]) {
                     const filePath = pathParts[1];
                     console.log(`Attempting to delete storage object: listing-images/${filePath}`);
                     const { error: deleteStorageError } = await supabase.storage.from('listing-images').remove([filePath]);
                     if (deleteStorageError) { console.error(`Storage deletion failed for path ${filePath}: ${deleteStorageError.message}`); setDeleteError(`Listing deleted, but failed to remove image: ${deleteStorageError.message}`); }
                     else { console.log(`Storage object deleted: ${filePath}`); }
                 } else { console.warn(`Could not parse file path from URL: ${photoUrl}`); setDeleteError("Listing deleted, but could not parse image path for removal."); }
             } catch (parseError) { console.error(`Error parsing photo URL for deletion: ${parseError}`); setDeleteError("Listing deleted, but failed to parse image URL for removal."); }
         }

        // Update Frontend State
        setListings(currentListings => currentListings.filter(l => l.id !== listingId));
        console.log(`Listing removed from UI state: ${listingId}`);

    } catch (error) { /* ... error handling ... */
        console.error("handleDeleteListing error:", error);
        if (error instanceof Error) { setDeleteError(error.message); alert(error.message); }
        else { setDeleteError("An unknown error occurred during deletion."); alert("An unknown error occurred during deletion."); }
    } finally {
        setDeletingId(null); // Clear loading state
    }
  };

  // Filter Listings based on viewFilter
  const filteredListings = useMemo(() => { /* ... same filtering logic ... */
      return listings.filter(listing => {
          if (!listing.end_time) return viewFilter === 'active';
          const hasEnded = isPast(listing.end_time);
          return viewFilter === 'active' ? !hasEnded : hasEnded;
      });
   }, [listings, viewFilter]);

  // Helper function to get button classes
  const getButtonClass = (filter: ViewFilter) => { /* ... same button class logic ... */
      const baseClass = "px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-150";
      const activeClass = "bg-indigo-600 text-white shadow-sm";
      const inactiveClass = "bg-white text-gray-700 hover:bg-gray-50 border border-gray-300";
      return `${baseClass} ${viewFilter === filter ? activeClass : inactiveClass}`;
   };

  // ----- Render Logic -----
  if (loading) { /* ... */ }
  if (error) { /* ... */ }
  if (!user) { /* ... */ }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
         <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">My Listings</h1>
         {/* Filter Tabs/Buttons */}
         <div className="flex space-x-2">
             <button onClick={() => setViewFilter('active')} className={getButtonClass('active')}> Active </button>
             <button onClick={() => setViewFilter('past')} className={getButtonClass('past')}> Past </button>
         </div>
      </div>

      {deleteError && ( <div className="mb-4 p-3 bg-red-100 text-red-700 border border-red-200 rounded text-sm"> Delete Error: {deleteError} </div> )}

      {filteredListings.length === 0 && !loading ? (
        <EmptyState message={viewFilter === 'active' ? "You have no active listings." : "You have no past listings."} action={{ href: '/listings/new', text: 'List an Item' }} />
      ) : (
        <ul className="space-y-6">
          {filteredListings.map((listing) => (
            <li key={listing.id} className="border border-gray-200 p-4 rounded-lg shadow-sm flex flex-col sm:flex-row gap-4 items-start bg-white">
              {/* Image Link */}
              {listing.photos && ( <Link href={`/listings/${listing.id}`} className="flex-shrink-0 block"> <div className="w-full sm:w-[120px] h-[120px] sm:h-[80px] bg-gray-100 rounded overflow-hidden group">
                  <img src={listing.photos} alt={`Cover image for ${listing.title}`} className="w-full h-full object-cover group-hover:opacity-90 transition-opacity" />
               </div> </Link> )}
              {/* Details */}
              <div className="flex-grow">
                <Link href={`/listings/${listing.id}`} className="text-lg font-semibold text-indigo-600 hover:text-indigo-800 hover:underline block mb-1"> {listing.title} </Link>
                <p className="text-gray-600 text-sm mb-2 line-clamp-2">{listing.description}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-800">
                   <span>Min Price: <span className="font-medium">{formatCurrency(listing.min_price)}</span></span>
                   {listing.end_time && ( <span>Ends: <span className="font-medium">{new Date(listing.end_time).toLocaleString()}</span></span> )}
                   {viewFilter === 'past' && ( <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/20"> Ended </span> )}
                </div>
              </div>
               {/* Delete Button */}
               <div className="flex-shrink-0 mt-2 sm:mt-0 sm:ml-4">
                  <button
                    onClick={() => handleDeleteListing(listing.id, listing.photos)}
                    disabled={deletingId === listing.id || viewFilter === 'past'}
                    title={viewFilter === 'past' ? "Cannot delete ended listings" : undefined}
                    className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {deletingId === listing.id ? ( <> {/* ... spinner ... */} Deleting... </> ) : ( 'Delete' )}
                  </button>
               </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}