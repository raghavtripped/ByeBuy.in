'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import AddListingForm from './add-form';

type Listing = {
  id: string;
  title: string;
  description: string;
  min_price: number;
  photos: string | null;
};

export default function ListingsPage() {
  const [session, setSession]   = useState<any>(null);
  const [items, setItems]       = useState<Listing[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const fetchListings = async () => {
      const { data } = await supabase.from('listings')
        .select('*')
        .order('created_at', { ascending: false });
      setItems(data || []);
    };
    fetchListings();

    /* realtime insert listener */
    const ch = supabase.channel('listings-rt')
      .on('postgres_changes',
        { event:'INSERT', schema:'public', table:'listings' },
        () => fetchListings())
      .subscribe();

    return () => supabase.removeChannel(ch);
  }, []);

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      {session && <AddListingForm />}

      <h1 className="text-2xl font-bold mb-6">🎯 Listings</h1>

      {items.length === 0 ? (
        <p>No listings yet.</p>
      ) : (
        <ul className="grid md:grid-cols-2 gap-6">
          {items.map(l => (
            <li key={l.id} className="border rounded-lg p-4 space-y-2">
              {l.photos && (
                <img src={l.photos}
                     alt={l.title}
                     className="h-40 w-full object-cover rounded" />
              )}
              <h2 className="text-lg font-semibold">{l.title}</h2>
              <p className="text-sm text-gray-600 line-clamp-2">
                {l.description}
              </p>
              <p className="text-sm">Min ₹{l.min_price}</p>

              <Link href={`/listings/${l.id}`}
                    className="inline-block mt-2 text-indigo-600 underline">
                View / Bid →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
