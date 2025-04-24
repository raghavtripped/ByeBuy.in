'use client';

import { useEffect, useState } from 'react';
import { supabase, type Session } from '@/lib/supabaseClient';
import AddListingForm from './add-form';

type Listing = {
  id: string;
  title: string;
  description: string;
  min_price: number;
  photos: string | null;
};

export default function ListingsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [rows,    setRows]    = useState<Listing[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const load = async () => {
      const { data, error } = await supabase
        .from('listings')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error) setRows(data ?? []);
    };
    load();

    const ch = supabase
      .channel('listings-feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'listings' },
        () => load()
      )
      .subscribe();

    return () => { ch.unsubscribe(); };      // sync → fixes TS-2345
  }, []);

  return (
    <div className="max-w-3xl mx-auto p-8 space-y-8">
      {session && <AddListingForm />}

      <h1 className="text-2xl font-bold">🎯 Listings</h1>

      {rows.length === 0 ? (
        <p>No listings yet.</p>
      ) : (
        <ul className="space-y-6">
          {rows.map((l) => (
            <li key={l.id} className="border p-4 rounded">
              {l.photos && (
                <img src={l.photos} alt="" className="max-w-[150px] mb-2 rounded" />
              )}
              <a
                href={`/listings/${l.id}`}
                className="text-indigo-600 font-medium underline"
              >
                {l.title}
              </a>
              : {l.description} — ₹{l.min_price}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
