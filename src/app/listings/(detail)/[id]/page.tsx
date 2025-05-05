'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase, type User } from '@/lib/supabaseClient';
import {
  formatRelativeTime,
  isPast,
  formatCountdown,
} from '@/lib/timeUtils';
import { formatCurrency } from '@/lib/formatUtils';
import LoadingSpinner from '@/components/LoadingSpinner';

/* ---------- Types ------------------------------------------------- */
type Listing = {
  id: string;
  title: string;
  description: string;
  min_price: number;
  photos: string | null;
  end_time?: string | null;
  upper_cap?: number | null;
  rules?: string | null;
  seller_email?: string | null;
  seller_id?: string;
};

type Bid = {
  id: string;
  bid_price: number;
  bidder_id: string;
  timestamp: string;
  bidder_email?: string | null;
};

/* ---------- Component -------------------------------------------- */
export default function ListingDetails() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [listing, setListing] = useState<Listing | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [price, setPrice] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bidStatusMessage, setBidStatusMessage] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<string | null>(null);

  /* ---------- Load listing + realtime bids ------------------------ */
  useEffect(() => {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!id || !uuidRegex.test(id)) {
      setError('Listing not found.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setListing(null);
    setBids([]);
    setPrice('');

    supabase.auth.getUser().then(({ data }) => setUser(data.user));

    const load = async () => {
      try {
        const { data: lData, error: lError } = await supabase
          .from('listings_with_seller_email')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (lError) throw lError;

        setListing(lData ?? null);

        if (lData) {
          const { data: bData, error: bError } = await supabase
            .from('bids_with_bidder_email')
            .select('*')
            .eq('item_id', id)
            .order('timestamp', { ascending: false });
          if (bError) throw bError;

          setBids(bData ?? []);
        } else {
          setError('Listing not found.');
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Failed to load listing.';
        setError(`Failed to load listing: ${msg}`);
      } finally {
        setLoading(false);
      }
    };

    load();

    /* ----- realtime channel -------------------------------------- */
    const channel = supabase.channel(`bids-listing-${id}`);

    channel
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bids', filter: `item_id=eq.${id}` },
        async (payload) => {
          if (!payload.new?.id) return;
          const { data: newBid, error } = await supabase
            .from('bids_with_bidder_email')
            .select('*')
            .eq('id', payload.new.id)
            .single();
          if (!error && newBid) {
            setBids((cur) => [newBid as Bid, ...cur.filter((b) => b.id !== newBid.id)]);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  /* ---------- Countdown timer ------------------------------------ */
  useEffect(() => {
    if (!listing?.end_time || isPast(listing.end_time)) {
      setCountdown(null);
      return;
    }

    const updateTimer = () => {
      const remaining = formatCountdown(listing.end_time!);
      setCountdown(remaining);
    };

    updateTimer();
    const interval = window.setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [listing]);

  /* ---------- Bid action ----------------------------------------- */
  const placeBid = async () => {
    setBidStatusMessage(null);
    if (!user) return router.push('/auth');

    if (!listing) return;
    if (listing.end_time && isPast(listing.end_time)) {
      setBidStatusMessage('⚠️ This auction has already ended.');
      return;
    }

    const amt = parseInt(price, 10);
    if (isNaN(amt) || amt <= 0) {
      setBidStatusMessage('⚠️ Enter a valid whole-number bid.');
      return;
    }

    const currentTop = bids[0]?.bid_price ?? 0;
    const minBid = Math.max(listing.min_price, currentTop);
    if (amt <= minBid) {
      setBidStatusMessage(`⚠️ Bid must exceed ${formatCurrency(minBid)}`);
      return;
    }

    const { error } = await supabase
      .from('bids')
      .insert({ item_id: id, bidder_id: user.id, bid_price: amt });

    if (error) {
      setBidStatusMessage(`❌ Bid failed: ${error.message}`);
    } else {
      setPrice('');
      setBidStatusMessage('✅ Bid placed!');
      setTimeout(() => setBidStatusMessage(null), 3000);
    }
  };

  /* ---------- Render guards -------------------------------------- */
  if (loading)
    return (
      <div className="max-w-xl mx-auto px-4 py-10">
        <LoadingSpinner />
      </div>
    );
  if (error) return <p className="p-6 text-center text-red-600 dark:text-red-400">{error}</p>;
  if (!listing) return <p className="p-6 text-center text-gray-700 dark:text-gray-300">Listing not found.</p>;

  const auctionEnded = listing.end_time ? isPast(listing.end_time) : false;
  const timeLabel =
    countdown !== null ? `Ends in ${countdown}` : formatRelativeTime(listing.end_time);

  const highestBid = bids[0] ?? null;

  /* ---------- JSX ------------------------------------------------ */
  return (
    <main className="max-w-xl mx-auto px-4 py-10 space-y-6">
      {/* image */}
      {listing.photos && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={listing.photos}
          alt={`Photo for ${listing.title}`}
          className="rounded mb-4 w-full h-auto object-cover"
        />
      )}

      {/* details */}
      <section className="space-y-2 border-b pb-4">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{listing.title}</h1>

        {listing.seller_email && (
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Sold by:{' '}
            <span className="font-medium text-gray-800 dark:text-white">
              {listing.seller_email}
            </span>
          </p>
        )}

        <p className="text-gray-700 dark:text-gray-300 pt-2">{listing.description}</p>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm pt-2">
          <p className="font-semibold text-gray-900 dark:text-white">
            Min Price:{' '}
            <span className="text-indigo-700 dark:text-indigo-500 font-bold">
              {formatCurrency(listing.min_price)}
            </span>
          </p>
          {listing.upper_cap && listing.upper_cap > 0 && (
            <p className="font-semibold text-gray-900 dark:text-white">
              Buy&nbsp;Now:{' '}
              <span className="text-purple-700 dark:text-purple-500 font-bold">
                {formatCurrency(listing.upper_cap)}
              </span>
            </p>
          )}
        </div>

        {listing.end_time && (
          <p
            className={`text-sm font-medium ${
              auctionEnded ? 'text-red-600' : 'text-gray-600 dark:text-gray-300'
            }`}
          >
            {timeLabel}
          </p>
        )}
      </section>

      {/* highest bid */}
      <section className="bg-green-50 p-4 rounded border border-green-200">
        <h2 className="text-xl font-semibold mb-1 text-green-800 dark:text-green-300">
          Current Highest Bid
        </h2>

        {highestBid ? (
          <>
            <p className="text-2xl font-bold text-green-700 dark:text-green-400">
              {formatCurrency(highestBid.bid_price)}
            </p>
            {highestBid.bidder_email && (
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                by <span className="font-medium">{highestBid.bidder_email}</span>
              </p>
            )}
          </>
        ) : (
          <p className="text-lg text-gray-600 dark:text-gray-400">
            No bids yet. Be the first!
          </p>
        )}
      </section>

      {/* bid form */}
      <section>
        {user && !auctionEnded && (
          <div className="p-4 border rounded bg-white shadow-sm">
            <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-white">
              Place Your Bid
            </h3>

            <div className="flex items-center space-x-3">
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder={`Your bid ( > ${formatCurrency(
                  Math.max(listing.min_price, bids[0]?.bid_price ?? 0),
                )} )`}
                className="border px-3 py-2 rounded w-full focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                step="1"
                min="0"
              />
              <button
                onClick={placeBid}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded font-medium transition"
              >
                Place Bid
              </button>
            </div>

            {bidStatusMessage && (
              <p className="mt-3 text-sm text-red-600 dark:text-red-400">
                {bidStatusMessage}
              </p>
            )}
          </div>
        )}

        {user && auctionEnded && (
          <div className="p-4 border rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-center">
            This auction has ended.
          </div>
        )}

        {!user && (
          <div className="p-4 border rounded bg-yellow-50 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-400 text-center">
            Please{' '}
            <Link href="/auth" className="font-bold underline hover:text-yellow-900">
              log in
            </Link>{' '}
            to place a bid.
          </div>
        )}
      </section>

      {/* bid history */}
      <section className="pt-6 border-t">
        <h2 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-white">
          Bid History
        </h2>

        {bids.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400">No bids have been placed yet.</p>
        ) : (
          <ul className="space-y-3 max-h-96 overflow-y-auto pr-2">
            {bids.map((bid) => (
              <li
                key={bid.id}
                className="p-3 border rounded bg-gray-50 dark:bg-gray-800 flex justify-between items-center text-sm"
              >
                <div>
                  <span className="font-semibold text-indigo-800 dark:text-indigo-400">
                    {formatCurrency(bid.bid_price)}
                  </span>
                  {bid.bidder_email && (
                    <span className="text-xs text-gray-500 dark:text-gray-300 ml-2">
                      by {bid.bidder_email}
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {new Date(bid.timestamp).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
