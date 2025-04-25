// src/app/listings/page.tsx
'use client';

import { useEffect, useState } from 'react';
// Ensure Session is exported/imported correctly if needed, or remove if unused
import { supabase, type Session } from '@/lib/supabaseClient';
import AddListingForm from './add-form';

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
      // Use the state from the GOOD_COMMIT here
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

    // Use the state from the GOOD_COMMIT here
    const listingsChannel = supabase
      .channel('public:listings')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'listings' },
        (payload) => {
          console.log('New listing received!', payload);
          setRows((currentRows) => [payload.new as Listing, ...currentRows]);
          // Or load();
        }
      )
      .subscribe((status, err) => {
         if (status === 'SUBSCRIBED') console.log('Realtime channel subscribed for new listings');
         if (status === 'CHANNEL_ERROR') console.error('Realtime channel error for listings:', err);
      });

    return () => {
      console.log('Unsubscribing from public:listings channel');
      supabase.removeChannel(listingsChannel);
    };
  }, []);

  /* ───────────────── Render Logic ──────────────── */
  if (loading) return <div className="p-8 text-center">Loading listings...</div>;
  if (error) return <div className="p-8 text-center text-red-600">Error: {error}</div>;

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-8 space-y-8">
      {session && <AddListingForm />}
      <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">🎯 Current Listings</h1>

      {rows.length === 0 ? (
        <p className="text-gray-600 text-center py-10">No listings available yet. Be the first to add one!</p>
      ) : (
        <ul className="space-y-6">
          {rows.map((l) => (
            // This li structure should be from the GOOD_COMMIT state
             <li key={l.id} className="border border-gray-200 p-4 rounded-lg shadow-sm flex flex-col sm:flex-row gap-4 items-start bg-white hover:shadow-md transition-shadow duration-200">
               {l.photos && (
                 <div className="flex-shrink-0 w-full sm:w-[150px] h-[150px] sm:h-[100px] bg-gray-100 rounded overflow-hidden">
                   {/* FIX: Added eslint-disable comment for the next line */}
                   {/* eslint-disable-next-line @next/next/no-img-element */}
                   <img
                     src={l.photos}
                     alt={`Cover image for ${l.title}`} // Use the alt text from GOOD_COMMIT state
                     className="w-full h-full object-cover" // Use the classes from GOOD_COMMIT state
                   />
                 </div>
               )}
               <div className="flex-grow">
                 <a
                   href={`/listings/${l.id}`}
                   className="text-lg font-semibold text-indigo-600 hover:text-indigo-800 hover:underline block mb-1" // Use classes from GOOD_COMMIT state
                 >
                   {l.title}
                 </a>
                  <p className="text-gray-700 text-sm mb-2 line-clamp-2">{l.description}</p> {/* Use classes/structure from GOOD_COMMIT state */}
                  <p className="text-gray-900 font-medium">
                    Minimum Price: <span className="font-bold">₹{l.min_price.toFixed(2)}</span>
                  </p>
                  {/* {l.created_at && <p className="text-xs text-gray-500 mt-1">Listed: {new Date(l.created_at).toLocaleDateString()}</p>} */}
               </div>
             </li>
          ))}
        </ul>
      )}
    </div>
  );
}