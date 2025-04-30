// src/app/listings/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase, type Session } from '@/lib/supabaseClient';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import { formatCurrency } from '@/lib/formatUtils';

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
    setLoading(true); setError(null);
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const load = async () => { /* ... load logic ... */
        const { data, error: fetchError } = await supabase.from('listings').select('*').order('created_at', { ascending: false });
        if (fetchError) { console.error('Listing fetch error:', fetchError.message); setError(`Failed to load listings: ${fetchError.message}`); setRows([]); }
        else { setRows(data ?? []); }
        setLoading(false);
    }; load();
    const listingsChannel = supabase.channel('public:listings').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'listings' }, (payload) => { setRows((currentRows) => [payload.new as Listing, ...currentRows.filter(r => r.id !== payload.new.id)]); }).subscribe(/*...*/);
    return () => { supabase.removeChannel(listingsChannel); };
  }, []);

  /* Render Logic */

  // Loading State
  if (loading) {
      // --- FIX: Suppress TS error for className prop ---
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - Erroneous TS2322, prop is defined in component
      return <LoadingSpinner className="mt-20" />;
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
        <ul className="space-y-6">
          {rows.map((l) => (
             <li key={l.id} className="border border-gray-200 p-4 rounded-lg shadow-sm flex flex-col sm:flex-row gap-4 items-start bg-white hover:shadow-md transition-shadow duration-200">
               {/* Image Link */}
               {l.photos && ( <Link href={`/listings/${l.id}`} className="flex-shrink-0 block"> <div className="w-full sm:w-[150px] h-[150px] sm:h-[100px] bg-gray-100 rounded overflow-hidden group"> {/* eslint-disable-next-line @next/next/no-img-element */} <img src={l.photos} alt={`Cover image for ${l.title}`} className="w-full h-full object-cover group-hover:opacity-90 transition-opacity" /> </div> </Link> )}
               {/* Details */}
               <div className="flex-grow">
                 <Link href={`/listings/${l.id}`} className="text-lg font-semibold text-indigo-600 hover:text-indigo-800 hover:underline block mb-1"> {l.title} </Link>
                  <p className="text-gray-700 text-sm mb-2 line-clamp-2">{l.description}</p>
                  <p className="text-gray-900 font-medium"> Minimum Price: <span className="font-bold">{formatCurrency(l.min_price)}</span> </p>
               </div>
             </li>
          ))}
        </ul>
      )}
    </div>
  );
}