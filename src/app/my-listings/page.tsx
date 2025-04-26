// src/app/my-listings/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase, User } from '@/lib/supabaseClient';
// --- Import reusable components ---
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';

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

  useEffect(() => {
    const fetchUserDataAndListings = async () => {
      setLoading(true);
      setError(null);

      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (userError || !userData?.user) {
        console.error('User not logged in or error fetching user:', userError?.message);
        router.push('/auth');
        return;
      }

      setUser(userData.user);

      try {
        const { data: listingData, error: listingError } = await supabase
          .from('listings') // Still query base table here, view not needed yet
          .select('id, title, description, min_price, end_time, created_at, photos')
          .eq('seller_id', userData.user.id)
          .order('created_at', { ascending: false });

        if (listingError) throw listingError;
        setListings(listingData ?? []);

      } catch (err) {
        console.error('Error fetching listings:', err);
        let message = 'Failed to fetch your listings.';
        if (err instanceof Error) { message = err.message; }
        else if (typeof err === 'object' && err !== null && 'message' in err) { message = String((err as { message: unknown }).message ?? message); }
        else if (typeof err === 'string') { message = err; }
        setError(message);
        setListings([]);
      } finally {
        setLoading(false);
      }
    };

    fetchUserDataAndListings();

  }, [router]);

  // --- Render Logic ---

  // Loading state using component
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-4 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-800">My Listings</h1>
        <LoadingSpinner message="Loading your listings..." /> {/* Use component */}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-4 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-800">My Listings</h1>
        <p className="text-center text-red-600">Error loading listings: {error}</p>
      </div>
    );
  }

  // Not logged in state
  if (!user) {
     return (
       <div className="max-w-4xl mx-auto p-4 sm:p-8">
         <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-800">My Listings</h1>
         <p className="text-center text-gray-600">
           Please <Link href="/auth" className="text-indigo-600 underline">log in</Link> to view your listings.
         </p>
       </div>
     );
  }

  // Main content render
  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-8">
      <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-800">My Listings</h1>

      {listings.length === 0 ? (
        // --- Use EmptyState component ---
        <EmptyState
            message="You haven't listed any items yet."
            action={{ href: '/listings#add-listing-form', text: 'List an Item' }}
            // Removed the explicit eslint-disable comment as it's handled within EmptyState if needed
        />
      ) : (
        // Display list of listings
        <ul className="space-y-6">
          {listings.map((listing) => (
            <li key={listing.id} className="border border-gray-200 p-4 rounded-lg shadow-sm flex flex-col sm:flex-row gap-4 items-start bg-white hover:shadow-md transition-shadow duration-200">
              {listing.photos && (
                <div className="flex-shrink-0 w-full sm:w-[120px] h-[120px] sm:h-[80px] bg-gray-100 rounded overflow-hidden">
                   {/* We will replace this with <Image> later */}
                   {/* eslint-disable-next-line @next/next/no-img-element */}
                   <img
                     src={listing.photos}
                     alt={`Cover image for ${listing.title}`}
                     className="w-full h-full object-cover"
                   />
                </div>
              )}
              <div className="flex-grow">
                <Link href={`/listings/${listing.id}`} className="text-lg font-semibold text-indigo-600 hover:text-indigo-800 hover:underline block mb-1">
                  {listing.title}
                </Link>
                <p className="text-gray-600 text-sm mb-2 line-clamp-2">{listing.description}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-800">
                   <span>Min Price: <span className="font-medium">₹{listing.min_price.toFixed(2)}</span></span>
                   {listing.end_time && (
                     // Consider using formatRelativeTime here too eventually
                     <span>Ends: <span className="font-medium">{new Date(listing.end_time).toLocaleString()}</span></span>
                   )}
                   {/* Placeholder for highest bid */}
                   {/* <span>Highest Bid: ₹XXX</span> */}
                </div>
              </div>
              {/* Placeholder for Delete/Edit buttons */}
              {/* <div className="flex-shrink-0 self-center sm:self-start"> ... </div> */}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}