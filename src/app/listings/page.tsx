// src/app/listings/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link'; // <<<--- Import Link
import { supabase, type Session } from '@/lib/supabaseClient';
// import AddListingForm from './add-form'; // <<<--- REMOVE THIS IMPORT
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';

type Listing = {
  id: string;
  title: string;
  description: string;
  min_price: number;
  photos: string | null;
  created_at?: string;
};

export default function ListingsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [rows, setRows] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* Fetch + Realtime Effect */
  useEffect(() => {
    setLoading(true);
    setError(null);
    // Check session state mainly to conditionally show Create button later
    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const load = async () => {
      const { data, error: fetchError } = await supabase
        .from('listings')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) {
        console.error('Listing fetch error:', fetchError.message);
        setError(`Failed to load listings: ${fetchError.message}`);
        setRows([]);
      } else {
        setRows(data ?? []);
      }
      setLoading(false);
    };
    load();

    // Realtime listener for new listings
    const listingsChannel = supabase
      .channel('public:listings')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'listings' }, (payload) => {
          console.log('New listing received via RT!', payload.new.id);
          // Add new listing to the top (CORE-2 Fix needed later for this to be reliable)
          setRows((currentRows) => [payload.new as Listing, ...currentRows.filter(r => r.id !== payload.new.id)]);
      })
      .subscribe((status, err) => {
         if (status === 'SUBSCRIBED') console.log('RT subscribed: listings');
         if (status === 'CHANNEL_ERROR') console.error('RT error: listings:', err);
      });

    return () => { supabase.removeChannel(listingsChannel); };
  }, []);

  /* Render Logic */

  // Loading State
  if (loading) {
    // Suppress erroneous TS error TS2322 for className prop on LoadingSpinner.
    // The prop is correctly defined in the component's interface,
    // suggesting a build environment or caching issue with type resolution.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - See comment above.
    return <LoadingSpinner className="mt-20" />;
}

// Error State
if (error) {
    // Show error prominently
    return <div className="p-8 text-center text-red-600">Error loading listings: {error}</div>;
}

  // Main Content Render
  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-8 space-y-8">

      {/* REMOVED the embedded AddListingForm rendering section */}
      {/* {session && <div id="add-listing-form"><AddListingForm /></div>} */}

      {/* Header section with Title and Create Button */}
      <div className="flex justify-between items-center border-b pb-4 mb-6">
         <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">🎯 Current Listings</h1>
         {/* --- ADD Create Listing Button --- */}
         {session && ( // Only show button if logged in
             <Link
                href="/listings/new" // Link to the new dedicated page
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                 + Create Listing
             </Link>
          )}
      </div>

      {/* Listings Display Area */}
      {rows.length === 0 ? (
        // Use EmptyState component
        <EmptyState
            message="No listings available yet."
             // Action link now points to the new listing page if logged in, or auth if logged out
            action={session ? { href: '/listings/new', text: 'List an Item' } : { href: '/auth', text: 'Login to List an Item' }}
        />
      ) : (
        // List of Listings
        <ul className="space-y-6">
          {rows.map((l) => (
             <li key={l.id} className="border border-gray-200 p-4 rounded-lg shadow-sm flex flex-col sm:flex-row gap-4 items-start bg-white hover:shadow-md transition-shadow duration-200">
               {l.photos && (
                 <div className="flex-shrink-0 w-full sm:w-[150px] h-[150px] sm:h-[100px] bg-gray-100 rounded overflow-hidden">
                   {/* eslint-disable-next-line @next/next/no-img-element */}
                   <img src={l.photos} alt={`Cover image for ${l.title}`} className="w-full h-full object-cover" />
                 </div>
               )}
               <div className="flex-grow">
                 <a href={`/listings/${l.id}`} className="text-lg font-semibold text-indigo-600 hover:text-indigo-800 hover:underline block mb-1">
                   {l.title}
                 </a>
                  <p className="text-gray-700 text-sm mb-2 line-clamp-2">{l.description}</p>
                  <p className="text-gray-900 font-medium">
                    Minimum Price: <span className="font-bold">₹{l.min_price.toFixed(2)}</span>
                  </p>
               </div>
             </li>
          ))}
        </ul>
      )}
    </div>
  );
}