'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function BidHistoryPage() {
  const { id } = useParams();
  const [bids, setBids] = useState<any[]>([]);

  useEffect(() => {
    const getBids = async () => {
      const { data } = await supabase
        .from('bids')
        .select('id,bid_price,bidder_id,timestamp')
        .eq('item_id', id)
        .order('timestamp', { ascending: false });
      setBids(data || []);
    };
    getBids();

    const ch = supabase.channel('bids-feed')
      .on('postgres_changes',
        { event:'INSERT', schema:'public', table:'bids', filter:`item_id=eq.${id}` },
        () => getBids())
      .subscribe();

    return () => supabase.removeChannel(ch);
  }, [id]);

  const top = bids[0]?.bid_price ?? null;

  return (
    <main className="max-w-md mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold mb-4">
        📊 Live Bids (Listing {String(id).slice(0,6)}…)
      </h1>

      {bids.length === 0 ? (
        <p>No bids yet.</p>
      ) : (
        <ul className="space-y-3">
          {bids.map(b => (
            <li key={b.id}
                className={`border rounded p-3 ${b.bid_price===top?'bg-green-50':''}`}>
              <strong>₹{b.bid_price}</strong> &nbsp;
              <span className="text-xs text-gray-500">
                by {b.bidder_id.slice(0,6)}… &middot;&nbsp;
                {new Date(b.timestamp).toLocaleString()}
              </span>
              {b.bid_price===top && (
                <span className="ml-2 text-green-600 font-semibold">🔥 Highest</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
