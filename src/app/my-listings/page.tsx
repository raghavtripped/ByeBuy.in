// src/app/my-listings/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase, User } from '@/lib/supabaseClient'; // Import Supabase client and User type

// Define the shape of the listing data we expect for this page
type SellerListing = {
  id: string;
  title: string;
  description: string;
  min_price: number;
  end_time: string | null; // Supabase timestamptz can be null
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

      // 1. Get the current user
      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (userError || !userData?.user) {
        console.error('User not logged in or error fetching user:', userError?.message);
        router.push('/auth');
        return; // Stop execution if no user
      }

      setUser(userData.user);

      // 2. Fetch listings created by this user
      try {
        const { data: listingData, error: listingError } = await supabase
          .from('listings')
          .select('id, title, description, min_price, end_time, created_at, photos') // Select needed columns
          .eq('seller_id', userData.user.id) // Filter by the logged-in user's ID
          .order('created_at', { ascending: false }); // Show newest first

        if (listingError) {
          throw listingError; // Throw error to be caught below
        }

        setListings(listingData ?? []); // Set listings or empty array

      } catch (err) { // Apply refined error handling
        console.error('Error fetching listings:', err);
        let message = 'Failed to fetch your listings.';
        if (err instanceof Error) {
            message = err.message;
        } else if (err !== null && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
            message = (err as { message: string }).message;
        } else if (typeof err === 'string') {
            message = err;
        }
        setError(message);
        setListings([]); // Clear listings on error
      } finally {
        setLoading(false); // Set loading false after attempts
      }
    };

    fetchUserDataAndListings();

  }, [router]); // Add router to dependency array

  // ----- Render Logic -----

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-4 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-800">My Listings</h1>
        <p className="text-center text-gray-600">Loading your listings...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-4 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-800">My Listings</h1>
        <p className="text-center text-red-600">Error loading listings: {error}</p>
      </div>
    );
  }

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


  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-8">
      <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-800">My Listings</h1>

      {listings.length === 0 ? (
        <div className="text-center py-10 px-6 bg-white rounded-lg shadow-sm border border-gray-200">
           {/* Ensuring this line is correct */}
           <p className="text-gray-600 mb-4">You haven't listed any items yet.</p>
           <Link
             href="/listings#add-listing-form"
             className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-md transition duration-150 ease-in-out"
           >
             List an Item
           </Link>
        </div>
      ) : (
        <ul className="space-y-6">
          {listings.map((listing) => (
            <li key={listing.id} className="border border-gray-200 p-4 rounded-lg shadow-sm flex flex-col sm:flex-row gap-4 items-start bg-white hover:shadow-md transition-shadow duration-200">
              {listing.photos && (
                <div className="flex-shrink-0 w-full sm:w-[120px] h-[120px] sm:h-[80px] bg-gray-100 rounded overflow-hidden">
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
                     <span>Ends: <span className="font-medium">{new Date(listing.end_time).toLocaleString()}</span></span>
                   )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}