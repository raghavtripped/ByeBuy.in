'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function ListingDetails() {
  const { id } = useParams();
  const router = useRouter();

  const [listing, setListing] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [bidAmount, setBidAmount] = useState('');
  const [bids, setBids] = useState<any[]>([]);

  /* ---------- fetch listing + bids ---------- */
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    supabase.auth.getUser().then(({ data }) => setUser(data.user));

    const fetchListing = async () => {
      const { data } = await supabase
        .from('listings')
        .select('*')
        .eq('id', id)
        .single();
      setListing(data);
    };

    const fetchBids = async () => {
      const { data } = await supabase
        .from('bids')
        .select('*')
        .eq('item_id', id)
        .order('timestamp', { ascending: false });
      setBids(data || []);
    };

    if (id) {
      fetchListing();
      fetchBids();

      const ch = supabase
        .channel('bids-live')
        .on(
          'postgres_changes',
          { event: 'INSERT', table: 'bids', schema: 'public' },
          (payload) => {
            if (payload.new.item_id === id) fetchBids();
          }
        )
        .subscribe();

      return () => supabase.removeChannel(ch);
    }
  }, [id]);

  /* ---------- bid submit ---------- */
  const handleBid = async () => {
    if (!session || !user) {
      router.push('/auth');
      return;
    }

    const amt = parseFloat(bidAmount);
    if (isNaN(amt) || amt <= 0) {
      alert('Enter a valid amount');
      return;
    }

    const highest = bids[0]?.bid_price ?? listing.min_price;
    if (amt <= highest) {
      alert(`Bid must be higher than ₹${highest}`);
      return;
    }

    const { error } = await supabase.from('bids').insert([
      {
        item_id: id,
        bidder_id: user.id,
        bid_price: amt,
      },
    ]);

    if (error) alert(error.message);
    else setBidAmount('');
  };

  const highestBid = bids[0]?.bid_price ?? null;

  if (!listing) return <p className="p-8">Loading…</p>;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 space-y-8">
      {/* listing card */}
      <section className="border p-6 rounded-lg">
        {listing.photos && (
          <img
            src={listing.photos}
            alt={listing.title}
            className="mb-4 w-full h-60 object-cover rounded"
          />
        )}
        <h1 className="text-2xl font-bold mb-2">{listing.title}</h1>
        <p className="mb-2">{listing.description}</p>
        <p className="text-sm text-gray-600">
          Min Price: ₹{listing.min_price}
        </p>
        <p className="text-sm text-gray-600">
          Ends at: {new Date(listing.end_time).toLocaleString()}
        </p>
      </section>

      {/* bid form */}
      <section className="border p-6 rounded-lg space-y-4">
        <h2 className="text-xl font-semibold">💰 Place a Bid</h2>
        <div className="flex gap-4">
          <input
            className="flex-1 border px-3 py-2 rounded"
            type="number"
            value={bidAmount}
            onChange={(e) => setBidAmount(e.target.value)}
            placeholder="Your bid (₹)"
          />
          <button
            onClick={handleBid}
            className="bg-indigo-600 text-white px-4 py-2 rounded"
          >
            Submit
          </button>
        </div>
      </section>

      {/* bid list */}
      <section className="border p-6 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">📜 All Bids</h2>
        {bids.length === 0 ? (
          <p>No bids yet.</p>
        ) : (
          <ul className="space-y-3">
            {bids.map((b) => (
              <li
                key={b.id}
                className={`p-3 border rounded ${
                  b.bid_price === highestBid ? 'bg-green-50' : ''
                }`}
              >
                <span className="font-medium">₹{b.bid_price}</span> by{' '}
                {b.bidder_id.slice(0, 6)}… —{' '}
                {new Date(b.timestamp).toLocaleString()}
                {b.bid_price === highestBid && (
                  <span className="text-green-600 font-semibold ml-2">
                    🔥 Highest
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
