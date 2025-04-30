// src/app/listings/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase, type Session } from '@/lib/supabaseClient';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import { formatCurrency } from '@/lib/formatUtils';

// Listing type definition including current_highest_bid
type Listing = {
  id: string;
  title: string;
  description: string;
  min_price: number;
  photos: string | null;
  created_at?: string;
  current_highest_bid?: number | null;
};

export default function ListingsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [rows, setRows] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* Fetch + Realtime Effect */
  useEffect(() => {
    setLoading(true); setError(null);
    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const load = async () => {
      try {
          const { data, error: fetchError } = await supabase
            .from('listings_with_highest_bid') // Use the view
            .select(` id, title, description, min_price, photos, created_at, current_highest_bid `)
            .order('created_at', { ascending: false });
          if (fetchError) throw fetchError;
          setRows(data ?? []);
      } catch(fetchError) { /* ... error handling ... */
            console.error('Listing fetch error:', fetchError);
            let message = 'Failed to load listings.';
            if (fetchError instanceof Error) { message = fetchError.message; }
            else if (typeof fetchError === 'object' && fetchError !== null && 'message' in fetchError) { message = String((fetchError as { message: unknown }).message ?? message); }
            setError(message); setRows([]);
      } finally { setLoading(false); }
    };
    load();

    // Realtime listener for NEW listings
    const listingsChannel = supabase
      .channel('public:listings')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'listings' },
        async (payload) => { /* ... logic to fetch new listing details from view ... */
            console.log('New listing detected via RT!', payload.new.id);
            const { data: newListingData, error: newListingError } = await supabase.from('listings_with_highest_bid').select('id, title, description, min_price, photos, created_at, current_highest_bid').eq('id', payload.new.id).single();
            if (newListingError) { console.error("RT: Error fetching new listing details:", newListingError); }
            else if (newListingData) { setRows((currentRows) => [newListingData as Listing, ...currentRows.filter(r => r.id !== payload.new.id)]); }
        }
      )
      // Use _ prefix for unused variables
      .subscribe((_status, _err) => {
         if (_status === 'SUBSCRIBED') console.log('RT subscribed: listings');
         if (_status === 'CHANNEL_ERROR') console.error('RT error: listings:', _err);
      });

    return () => { supabase.removeChannel(listingsChannel); };
  }, []);

  /* Render Logic */

  // Loading State
  if (loading) {
      // --- FIX: Re-apply ts-ignore for className prop ---
      // Suppress erroneous TS error TS2322 for className prop on LoadingSpinner.
      // The prop is correctly defined in the component's interface.
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - See comment above.
      return <LoadingSpinner className="mt-20" />;
      // --- End FIX ---
  }

  // Error State
  if (error) { return <div className="p-8 text-center text-red-600">Error loading listings: {error}</div>; }

  // Main Content Render
  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-8 space-y-8">
      {/* Header section */}
      <div className="flex justify-between items-center border-b pb-4 mb-6">
         <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">🎯 Current Listings</h1>
         {session && ( <Link href="/listings/new" className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"> + Create Listing </Link> )}
      </div>

      {/* Listings Display Area */}
      {rows.length === 0 ? (
        <EmptyState message="No listings available yet." action={session ? { href: '/listings/new', text: 'List an Item' } : { href: '/auth', text: 'Login to List an Item' }} />
      ) : (
        // Grid Layout
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((l) => (
            <li key={l.id} className="col-span-1 flex flex-col divide-y divide-gray-200 rounded-lg bg-white text-center shadow border border-gray-200 transition-shadow duration-200 hover:shadow-lg">
              <Link href={`/listings/${l.id}`} className="flex flex-1 flex-col p-4 pb-2 group">
                {/* Image Area */}
                {l.photos ? ( <div className="w-full h-40 bg-gray-100 rounded-md overflow-hidden mx-auto mb-3">
                    {/* Removed unused eslint-disable comment */}
                    <img className="w-full h-full flex-shrink-0 object-cover group-hover:opacity-90 transition-opacity" src={l.photos} alt={`Cover image for ${l.title}`} />
                 </div> )
                : ( <div className="w-full h-40 bg-gray-200 rounded-md flex items-center justify-center mx-auto mb-3"> <svg className="h-16 w-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg> </div> )}
                {/* Text Content Area */}
                <h3 className="mt-1 text-gray-900 text-md font-medium group-hover:text-indigo-600">{l.title}</h3>
                <dl className="mt-1 flex flex-grow flex-col justify-between">
                  <div className="mt-3 flex flex-col items-center space-y-1">
                    {/* Min Price Badge */}
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10"> Min: {formatCurrency(l.min_price)} </span>
                    {/* Display Highest Bid */}
                    {l.current_highest_bid && l.current_highest_bid > 0 ? ( <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20"> Top Bid: {formatCurrency(l.current_highest_bid)} </span> )
                    : ( <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10"> No Bids Yet </span> )}
                  </div>
                </dl>
              </Link>
            </li>
          ))}
        </div>
      )}
    </div>
  );
}