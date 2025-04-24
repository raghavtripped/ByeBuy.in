'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Listing = {
  id: string;
  title: string;
  description: string;
  min_price: number;
  photos: string | null;
};

export default function ListingsPage() {
  const [listings, setListings] = useState<Listing[]>([]);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('listings')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error) setListings(data as Listing[]);
      else console.error(error.message);
    })();
  }, []);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">🎯 Listings</h1>

      {listings.length === 0 && <p>No listings yet.</p>}

      <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {listings.map((l) => (
          <li
            key={l.id}
            className="border rounded-lg p-4 hover:shadow transition"
          >
            {l.photos && (
              <img
                src={l.photos}
                alt={l.title}
                className="mb-3 h-40 w-full object-cover rounded"
              />
            )}

            <h2 className="font-semibold">{l.title}</h2>
            <p className="text-sm line-clamp-2 mb-2">{l.description}</p>

            <div className="text-sm text-gray-600 mb-3">
              Min Price: ₹{l.min_price}
            </div>

            <Link
              href={`/listings/${l.id}`}
              className="inline-block bg-indigo-600 text-white px-3 py-1 rounded text-sm"
            >
              View / Bid →
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
