'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function BidHistory() {
  const { id } = useParams();
  const [bids, setBids] = useState<any[]>([]);

  useEffect(() => {
    async function fetchBids() {
      const { data } = await supabase
        .from('bids')
        .select('*')
        .eq('item_id', id)
        .order('timestamp', { ascending: false });
      setBids(data || []);
    }

    fetchBids();

    const ch = supabase
      .channel('bids-history')
      .on(
        'postgres_changes',
        { event: 'INSERT', table: 'bids', schema: 'public' },
        (payload) => {
          if (payload.new.item_id === id) fetchBids();
        }
      )
      .subscribe();

    return () => supabase.removeChannel(ch);
  }, [id]);

  const highestBid = bids[0]?.bid_price ?? null;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">
        📊 Live Bids for Listing ID {String(id).slice(0, 6)}…
      </h1>

      {bids.length === 0 ? (
        <p>No bids yet.</p>
      ) : (
        <ul className="space-y-4">
          {bids.map((b) => (
            <li
              key={b.id}
              className={`p-4 border rounded ${
                b.bid_price === highestBid ? 'bg-green-50' : ''
              }`}
            >
              <strong>₹{b.bid_price}</strong> —{' '}
              {new Date(b.timestamp).toLocaleString()}
              {b.bid_price === highestBid && (
                <span className="text-green-600 font-semibold ml-2">
                  🔥 Highest bid
                </span>
              )}
              <div className="text-xs text-gray-600">
                Bidder {b.bidder_id.slice(0, 8)}…
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
