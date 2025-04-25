// src/app/listings/page.tsx
'use client';

import { useEffect, useState } from 'react';
// Ensure Session is exported/imported correctly if needed, or remove if unused in this file
import { supabase, type Session } from '@/lib/supabaseClient';
import AddListingForm from './add-form'; // Make sure this component exists and path is correct

// Define the shape of your Listing data
type Listing = {
  id: string;
  title: string;
  description: string;
  min_price: number;
  photos: string | null;
  created_at?: string; // Optional: if you use it for ordering
};

export default function ListingsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [rows, setRows] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true); // Optional: add loading state
  const [error, setError] = useState<string | null>(null); // Optional: add error state

  /* ───────────────── Fetch + Realtime ──────────────── */
  useEffect(() => {
    setLoading(true);
    setError(null);

    // Check logged-in status to show/hide AddListingForm
    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    // Load initial listings
    const load = async () => {
      const { data, error: fetchError } = await supabase
        .from('listings')
        .select('*') // Select all columns you need
        .order('created_at', { ascending: false }); // Order by creation date

      if (fetchError) {
        console.error('Listing fetch error:', fetchError.message);
        setError(`Failed to load listings: ${fetchError.message}`);
        setRows([]); // Clear rows on error
      } else {
        setRows(data ?? []); // Set data, or empty array if null
      }
      setLoading(false); // Set loading false after fetch attempt
    };
    load();

    // Subscribe to new listings being inserted
    const listingsChannel = supabase
      .channel('public:listings') // Use Supabase standard channel naming convention
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'listings' },
        (payload) => {
          console.log('New listing received!', payload);
          // Add the new listing to the top of the list optimistically
           setRows((currentRows) => [payload.new as Listing, ...currentRows]);
          // Or refetch all if optimistic update is complex: load();
        }
      )
       .subscribe((status, err) => {
         if (status === 'SUBSCRIBED') {
           console.log('Realtime channel subscribed for new listings');
         }
         if (status === 'CHANNEL_ERROR') {
           console.error('Realtime channel error for listings:', err);
           // Maybe set an error state here too
         }
       });


    // Cleanup subscription on component unmount
    return () => {
      console.log('Unsubscribing from public:listings channel');
      supabase.removeChannel(listingsChannel);
      // Deprecated: supabase.removeAllChannels(); // Avoid unless necessary
    };
  }, []); // Empty dependency array means this runs once on mount


  /* ───────────────── Render Logic ──────────────── */

  // Display loading state
  if (loading) {
     return <div className="p-8 text-center">Loading listings...</div>;
  }

  // Display error state
  if (error) {
      return <div className="p-8 text-center text-red-600">Error: {error}</div>;
  }


  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-8 space-y-8"> {/* Added responsive padding */}

      {/* Conditionally render the form for adding new listings */}
      {session && <AddListingForm />}

      <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">🎯 Current Listings</h1>

      {/* Display message if no listings are found */}
      {rows.length === 0 ? (
        <p className="text-gray-600 text-center py-10">No listings available yet. Be the first to add one!</p>
      ) : (
        // Display the list of listings
        <ul className="space-y-6">
          {rows.map((l) => (
            // Each listing item
            <li key={l.id} className="border border-gray-200 p-4 rounded-lg shadow-sm flex flex-col sm:flex-row gap-4 items-start bg-white hover:shadow-md transition-shadow duration-200">
              {/* Listing Image (if available) */}
              {l.photos && (
                <div className="flex-shrink-0 w-full sm:w-[150px] h-[150px] sm:h-[100px] bg-gray-100 rounded overflow-hidden">
                   {/* FIX: Added eslint-disable comment for the next line */}
                   {/* eslint-disable-next-line @next/next/no-img-element */}
                   <img
                     src={l.photos}
                     alt={`Cover image for ${l.title}`} // Improved alt text
                     className="w-full h-full object-cover" // Make image cover the container
                   />
                </div>
              )}
              {/* Listing Details */}
              <div className="flex-grow">
                <a
                  href={`/listings/${l.id}`} // Use NextLink later for client-side nav
                  className="text-lg font-semibold text-indigo-600 hover:text-indigo-800 hover:underline block mb-1"
                >
                  {l.title}
                </a>
                 <p className="text-gray-700 text-sm mb-2 line-clamp-2">{l.description}</p> {/* Added line-clamp */}
                 <p className="text-gray-900 font-medium">
                   Minimum Price: <span className="font-bold">₹{l.min_price.toFixed(2)}</span>
                 </p>
                 {/* Optionally display creation time or end time */}
                 {/* {l.created_at && <p className="text-xs text-gray-500 mt-1">Listed: {new Date(l.created_at).toLocaleDateString()}</p>} */}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}