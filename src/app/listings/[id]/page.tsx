'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function ListingDetails() {
  const { id } = useParams();
  const router  = useRouter();
  const [listing, setListing] = useState<any>(null);
  const [bids, setBids]       = useState<any[]>([]);
  const [price, setPrice]     = useState('');
  const [user, setUser]       = useState<any>(null);

  /* --- initial fetch + realtime channel --- */
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));

    const fetchAll = async () => {
      const { data: l } = await supabase.from('listings').select('*')
        .eq('id', id).single();
      setListing(l || null);

      const { data: b } = await supabase.from('bids')
        .select('*').eq('item_id', id).order('timestamp', { ascending: false });
      setBids(b || []);
    };
    fetchAll();

    const ch = supabase.channel('bids-rt')
      .on('postgres_changes',
        { event:'INSERT', schema:'public', table:'bids', filter:`item_id=eq.${id}` },
        () => fetchAll())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [id]);

  /* --- bid submit --- */
  const placeBid = async () => {
    if (!user) return router.push('/auth');
    const amt = parseFloat(price);
    const min = Math.max(listing.min_price, bids[0]?.bid_price || 0);
    if (isNaN(amt) || amt <= min)
      return alert(`Bid must be > ₹${min}`);

    const { error } = await supabase.from('bids').insert({
      item_id: id, bidder_id: user.id, bid_price: amt,
    });
    if (error) alert(error.message);
    else setPrice('');
  };

  return (
    <main className="max-w-xl mx-auto px-4 py-10 space-y-6">
      {!listing ? <p>Loading...</p> : (
        <>
          {listing.photos && (
            <img src={listing.photos} className="rounded mb-4" />
          )}
          <h1 className="text-2xl font-bold">{listing.title}</h1>
          <p>{listing.description}</p>
          <p className="text-sm text-gray-600">
            Min Price ₹{listing.min_price}
          </p>

          {/* bid form */}
          <div className="space-x-2 mt-4">
            <input
              type="number"
              value={price}
              onChange={e => setPrice(e.target.value)}
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

          {/* bids list */}
          <h2 className="mt-8 text-xl font-semibold">Bids</h2>
          {bids.length === 0 ? (
            <p>No bids yet.</p>
          ) : (
            <ul className="space-y-2">
              {bids.map(b => (
                <li key={b.id} className="border rounded p-2">
                  ₹{b.bid_price} – {b.bidder_id.slice(0,6)}…<br/>
                  <span className="text-xs text-gray-500">
                    {new Date(b.timestamp).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <button
            onClick={() => router.push(`/bid/${id}`)}
            className="mt-6 underline text-indigo-600"
          >
            View live bid history →
          </button>
        </>
      )}
    </main>
  );
}
