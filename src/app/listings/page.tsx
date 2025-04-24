'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type BidRow = { bid_price: number; bidder_id: string; timestamp: string };

export default function ListingDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [listing, setListing] = useState<any>(null);
  const [bids, setBids] = useState<BidRow[]>([]);
  const [amount, setAmount] = useState('');
  const [session, setSession] = useState<any>(null);
  const [user, setUser] = useState<any>(null);

  /* ───────────────────────────────────── fetch listing + bids ─── */
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    supabase.auth.getUser().then(({ data }) => setUser(data.user));

    const getListing = async () => {
      const { data } = await supabase
        .from('listings')
        .select('*')
        .eq('id', id)
        .single();
      setListing(data);
    };

    const getBids = async () => {
      const { data } = await supabase
        .from('bids')
        .select('bid_price,bidder_id,timestamp')
        .eq('item_id', id)
        .order('timestamp', { ascending: false });
      setBids(data ?? []);
    };

    if (id) {
      getListing();
      getBids();

      // realtime listener
      const ch = supabase
        .channel('bids-live')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'bids', filter: `item_id=eq.${id}` },
          () => getBids()
        )
        .subscribe();

        return () => {
          // either version is fine – both are sync
          ch.unsubscribe();          //   preferred – v2 API
          // OR: void supabase.removeChannel(ch);
        };
    }
  }, [id]);

  /* ───────────────────────────────────── submit bid ─── */
  const placeBid = async () => {
    if (!session || !user) {
      router.push('/auth');
      return;
    }
    const bid_price = parseFloat(amount);
    const highest = bids[0]?.bid_price ?? 0;
    const minRequired = Math.max(listing.min_price, highest);

    if (isNaN(bid_price) || bid_price <= minRequired) {
      alert(`Bid must be higher than ₹${minRequired}`);
      return;
    }

    const { error } = await supabase.from('bids').insert({
      item_id: id,
      bidder_id: user.id,
      bid_price,
    });

    if (error) alert(error.message);
    else setAmount('');
  };

  const topBid = bids[0]?.bid_price ?? null;

  /* ───────────────────────────────────── render ─── */
  if (!listing) return <p className="p-6">Loading…</p>;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">{listing.title}</h1>
      <p>{listing.description}</p>
      <p className="font-semibold">Min Price : ₹{listing.min_price}</p>
      {listing.photos && (
        /* simple thumb */
        <img src={listing.photos} alt="" className="max-w-xs rounded" />
      )}

      {/* ── Bid form ── */}
      <div className="space-x-2">
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Your bid (₹)"
          className="border px-3 py-1 rounded w-40"
        />
        <button onClick={placeBid} className="px-4 py-1 bg-indigo-600 text-white rounded">
          Place Bid
        </button>
      </div>

      {topBid && (
        <div className="p-3 bg-green-50 border border-green-200 rounded">
          🔥 Highest bid so far: <strong>₹{topBid}</strong>
        </div>
      )}

      <a
        href={`/bid/${id}`}
        className="text-sm text-indigo-600 underline inline-block mt-4"
      >
        View full bid history →
      </a>
    </div>
  );
}
