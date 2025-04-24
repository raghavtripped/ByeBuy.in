'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import type { User } from '@supabase/supabase-js';

type Listing = {
  id: string;
  title: string;
  description: string;
  min_price: number;
  photos: string | null;
};

type Bid = {
  id: string;
  bid_price: number;
  bidder_id: string;
  timestamp: string;
};

export default function ListingDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const router             = useRouter();

  const [listing, setListing] = useState<Listing | null>(null);
  const [bids,    setBids]    = useState<Bid[]>([]);
  const [price,   setPrice]   = useState('');
  const [user,    setUser]    = useState<User | null>(null);   // ← keep only user

  /* ───────── fetch once + realtime ───────── */
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));

    const load = async () => {
      const { data: l } = await supabase
        .from('listings')
        .select('*')
        .eq('id', id)
        .single();
      setListing(l ?? null);

      const { data: b } = await supabase
        .from('bids')
        .select('*')
        .eq('item_id', id)
        .order('timestamp', { ascending: false });
      setBids(b ?? []);
    };
    load();

    const ch = supabase
      .channel('bids-stream')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bids', filter: `item_id=eq.${id}` },
        () => load()
      )
      .subscribe();

    return () => { ch.unsubscribe(); };          // sync cleanup → no TS 2345
  }, [id]);

  /* ───────── submit bid ───────── */
  const placeBid = async () => {
    if (!user) {
      router.push('/auth');
      return;
    }
    const amt   = parseFloat(price);
    const floor = Math.max(listing!.min_price, bids[0]?.bid_price ?? 0);
    if (isNaN(amt) || amt <= floor) {
      alert(`Bid must be higher than ₹${floor}`);
      return;
    }

    const { error } = await supabase.from('bids').insert({
      item_id: id,
      bidder_id: user.id,
      bid_price: amt,
    });
    if (!error) setPrice('');
    else alert(error.message);
  };

  if (!listing) return <p className="p-6">Loading…</p>;

  return (
    <main className="max-w-xl mx-auto px-4 py-10 space-y-6">
      {listing.photos && (
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={listing.photos} alt="" className="rounded mb-4" />
      )}

      <h1 className="text-2xl font-bold">{listing.title}</h1>
      <p>{listing.description}</p>
      <p className="text-sm text-gray-600">Min Price ₹{listing.min_price}</p>

      {/* bid form */}
      <div className="space-x-2 mt-4">
        <input
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Your bid ₹"
          className="border px-3 py-2 rounded w-40"
        />
        <button
          onClick={placeBid}
          className="bg-green-600 text-white px-4 py-2 rounded"
        >
          Place Bid
        </button>
      </div>

      <button
        onClick={() => router.push(`/bid/${id}`)}
        className="underline text-indigo-600"
      >
        View live bid history →
      </button>
    </main>
  );
}
