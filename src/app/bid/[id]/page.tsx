'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type BidRow = { bid_price: number; bidder_id: string; timestamp: string };

export default function BidHistoryPage() {
  const { id } = useParams<{ id: string }>();
  const [bids, setBids] = useState<BidRow[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('bids')
        .select('bid_price,bidder_id,timestamp')
        .eq('item_id', id)
        .order('timestamp', { ascending: false });
      setBids(data ?? []);
    };
    load();

    const ch = supabase
      .channel('bids-feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bids', filter: `item_id=eq.${id}` },
        () => load()
      )
      .subscribe();

      return () => {
        // either version is fine – both are sync
        ch.unsubscribe();          //   preferred – v2 API
        // OR: void supabase.removeChannel(ch);
      };
  }, [id]);

  const top = bids[0]?.bid_price ?? null;

  return (
    <div className="max-w-lg mx-auto p-6">
      <h2 className="text-xl font-bold mb-4">📊 Live bids for {id}</h2>
      {bids.length === 0 ? (
        <p>No bids yet.</p>
      ) : (
        <ul className="space-y-3">
          {bids.map((b, i) => (
            <li
              key={i}
              className={`p-3 rounded border ${
                b.bid_price === top ? 'bg-green-50 border-green-300' : 'bg-gray-50'
              }`}
            >
              <div className="font-semibold">₹{b.bid_price}</div>
              <div className="text-sm text-gray-500">
                by {b.bidder_id.slice(0, 6)}… •{' '}
                {new Date(b.timestamp).toLocaleString()}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
