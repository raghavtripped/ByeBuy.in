// src/app/my-listings/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase, User } from '@/lib/supabaseClient';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import { formatCurrency } from '@/lib/formatUtils'; // Import currency formatter

// Keep SellerListing type
type SellerListing = {
  id: string;
  title: string;
  description: string;
  min_price: number;
  end_time: string | null;
  created_at: string;
  photos: string | null;
};

export default function MyListingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [listings, setListings] = useState<SellerListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
    setDeletingId(listingId); setDeleteError(null);

    if (!window.confirm(`Are you sure you want to delete the listing "${listings.find(l=>l.id===listingId)?.title ?? 'this listing'}"? This cannot be undone.`)) {
      setDeletingId(null); return;
    }

    try {
        // --- FIX: Correctly handle bid count check ---
        console.log(`Checking bids for listing: ${listingId}`);
        const { error: bidsError, count: bidCount } = await supabase
            .from('bids')
            .select('id', { count: 'exact', head: true }) // Request only the count
            .eq('item_id', listingId);

        if (bidsError) { throw new Error(`Failed to check for bids: ${bidsError.message}`); }

        console.log(`Bid check count for ${listingId}: ${bidCount ?? 0}`);
        if ((bidCount ?? 0) > 0) { // Use the destructured 'bidCount'
            throw new Error("Cannot delete listing: Bids have already been placed.");
        }
        // --- End FIX ---

        // Delete Listing Row
        console.log(`Deleting listing row: ${listingId}`);
        const { error: deleteListingError } = await supabase.from('listings').delete().eq('id', listingId);
        if (deleteListingError) { throw new Error(`Database deletion failed: ${deleteListingError.message}`); }
        console.log(`Listing row deleted: ${listingId}`);

        // Delete Image from Storage
        if (photoUrl) {
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

    } catch (error) {
        console.error("handleDeleteListing error:", error);
        if (error instanceof Error) { setDeleteError(error.message); alert(error.message); }
        else { setDeleteError("An unknown error occurred during deletion."); alert("An unknown error occurred during deletion."); }
    } finally {
        setDeletingId(null); // Clear loading state
    }
  };

  // ----- Render Logic -----
  if (loading) { /* ... LoadingSpinner ... */ return ( <div className="max-w-4xl mx-auto p-4 sm:p-8"><h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-800">My Listings</h1><LoadingSpinner /></div> ); }
  if (error) { /* ... Error display ... */ return ( <div className="max-w-4xl mx-auto p-4 sm:p-8"><h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-800">My Listings</h1><p className="text-center text-red-600">Error loading listings: {error}</p></div> ); }
  if (!user) { /* ... Login prompt ... */ return ( <div className="max-w-4xl mx-auto p-4 sm:p-8"><h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-800">My Listings</h1><p className="text-center text-gray-600">Please <Link href="/auth" className="text-indigo-600 underline">log in</Link> to view your listings.</p></div> ); }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-8">
      <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-800">My Listings</h1>
      {deleteError && ( <div className="mb-4 p-3 bg-red-100 text-red-700 border border-red-200 rounded text-sm"> Delete Error: {deleteError} </div> )}
      {listings.length === 0 && !loading ? (
        <EmptyState message="You haven't listed any items yet." action={{ href: '/listings/new', text: 'List an Item' }} />
      ) : (
        <ul className="space-y-6">
          {listings.map((listing) => (
            <li key={listing.id} className="border border-gray-200 p-4 rounded-lg shadow-sm flex flex-col sm:flex-row gap-4 items-start bg-white">
              {/* Image Link */}
              {listing.photos && ( <Link href={`/listings/${listing.id}`} className="flex-shrink-0 block"> <div className="w-full sm:w-[120px] h-[120px] sm:h-[80px] bg-gray-100 rounded overflow-hidden group"> {/* eslint-disable-next-line @next/next/no-img-element */} <img src={listing.photos} alt={`Cover image for ${listing.title}`} className="w-full h-full object-cover group-hover:opacity-90 transition-opacity" /> </div> </Link> )}
              {/* Details */}
              <div className="flex-grow">
                <Link href={`/listings/${listing.id}`} className="text-lg font-semibold text-indigo-600 hover:text-indigo-800 hover:underline block mb-1"> {listing.title} </Link>
                <p className="text-gray-600 text-sm mb-2 line-clamp-2">{listing.description}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-800">
                   <span>Min Price: <span className="font-medium">{formatCurrency(listing.min_price)}</span></span>
                   {listing.end_time && ( <span>Ends: <span className="font-medium">{new Date(listing.end_time).toLocaleString()}</span></span> )}
                </div>
              </div>
               {/* Delete Button */}
               <div className="flex-shrink-0 mt-2 sm:mt-0 sm:ml-4">
                  <button
                    onClick={() => handleDeleteListing(listing.id, listing.photos)}
                    disabled={deletingId === listing.id}
                    className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {deletingId === listing.id ? ( <> <svg className="animate-spin -ml-0.5 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Deleting... </> )
                    : ( 'Delete' )}
                  </button>
               </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}