// src/app/listings/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { supabase, type Session } from '@/lib/supabaseClient';
import AddListingForm from './add-form';
// --- Import reusable components ---
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';

type Listing = {
  id: string;
  title: string;
  description: string;
  min_price: number;
  photos: string | null;
  created_at?: string; // Keep if used for ordering
};

export default function ListingsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [rows, setRows] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* ───────────────── Fetch + Realtime ──────────────── */
  useEffect(() => {
    setLoading(true);
    setError(null);
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

    const listingsChannel = supabase
      .channel('public:listings')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'listings' },
        (payload) => {
          console.log('New listing received!', payload);
          // Optimistic update: Add new listing to the top
          setRows((currentRows) => [payload.new as Listing, ...currentRows.filter(r => r.id !== payload.new.id)]);
        }
      )
      .subscribe((status, err) => {
         if (status === 'SUBSCRIBED') console.log('Realtime channel subscribed for new listings');
         if (status === 'CHANNEL_ERROR') console.error('Realtime channel error for listings:', err);
         // Add error handling for UI if needed
      });

    return () => {
      console.log('Unsubscribing from public:listings channel');
      supabase.removeChannel(listingsChannel);
    };
  }, []);

  /* ───────────────── Render Logic ──────────────── */

  // --- Use LoadingSpinner component ---
  if (loading) {
      return (
        <div className="max-w-3xl mx-auto p-4 sm:p-8 space-y-8">
           {/* Still show form potentially if session is known */}
           {session && <AddListingForm />}
           <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">🎯 Current Listings</h1>
           <LoadingSpinner message="Loading listings..." />
        </div>
      );
  }

  // Display error state
  if (error) {
      return (
        <div className="max-w-3xl mx-auto p-4 sm:p-8 space-y-8">
            {session && <AddListingForm />}
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">🎯 Current Listings</h1>
            <p className="p-8 text-center text-red-600">Error: {error}</p>
        </div>
       );
  }

  // Main render
  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-8 space-y-8">
      {/* Add form section - maybe add an ID here if needed for the EmptyState link */}
      {session && <div id="add-listing-form"><AddListingForm /></div>}

      <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">🎯 Current Listings</h1>

      {rows.length === 0 ? (
        // --- Use EmptyState component ---
        <EmptyState
            message="No listings available yet."
            // Link assumes the AddListingForm or its container has id="add-listing-form"
            // If form only appears when logged in, this link might only work then.
            // Alternatively, link just to '/listings' and user scrolls.
            action={{ href: '#add-listing-form', text: 'List an Item' }}
        />
      ) : (
        <ul className="space-y-6">
          {rows.map((l) => (
             <li key={l.id} className="border border-gray-200 p-4 rounded-lg shadow-sm flex flex-col sm:flex-row gap-4 items-start bg-white hover:shadow-md transition-shadow duration-200">
               {l.photos && (
                 <div className="flex-shrink-0 w-full sm:w-[150px] h-[150px] sm:h-[100px] bg-gray-100 rounded overflow-hidden">
                   {/* eslint-disable-next-line @next/next/no-img-element */}
                   <img
                     src={l.photos}
                     alt={`Cover image for ${l.title}`}
                     className="w-full h-full object-cover"
                   />
                 </div>
               )}
               <div className="flex-grow">
                 <a
                   href={`/listings/${l.id}`} // Consider using <Link> later
                   className="text-lg font-semibold text-indigo-600 hover:text-indigo-800 hover:underline block mb-1"
                 >
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