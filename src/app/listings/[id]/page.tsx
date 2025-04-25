// src/app/listings/[id]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
// Removed 'Session' as it was unused
import { supabase, User } from '@/lib/supabaseClient';

type Listing = { id: string; title: string; description: string; min_price: number; photos: string | null; /* add end_time if needed here */ };
type Bid = { id: string; bid_price: number; bidder_id: string; timestamp: string };

export default function ListingDetails() { // Component name matches convention
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [listing, setListing] = useState<Listing | null>(null);
  const [bids,    setBids]    = useState<Bid[]>([]);
  const [price,   setPrice]   = useState('');
  const [user,    setUser]    = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setListing(null);
    setBids([]);
    setPrice('');
    supabase.auth.getUser().then(({ data }) => setUser(data.user));

    const load = async () => {
      try {
        // Fetch listing data
        const { data: lData, error: lError } = await supabase
          .from('listings')
          .select('*')
          .eq('id', id)
          .single();

        if (lError) throw lError;
        setListing(lData ?? null);

        // Fetch bids data
        const { data: bData, error: bError } = await supabase
          .from('bids')
          .select('*') // Select necessary fields: id, bid_price, bidder_id, timestamp
          .eq('item_id', id)
          .order('timestamp', { ascending: false });

        if (bError) throw bError;
        setBids(bData ?? []);

      } catch (err) {
         console.error("Error loading data:", err);
         let message = 'An unknown error occurred during loading';
         if (err instanceof Error) {
           message = err.message;
         } else if (typeof err === 'string') {
           message = err;
         } else if (err !== null && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
           message = err.message;
         }
         setError(`Failed to load listing data: ${message}`);
         setListing(null);
      } finally {
        setLoading(false);
      }
    };
    load();

    // Realtime subscription
    const bidsChannel = supabase
      .channel(`bids-listing-${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bids', filter: `item_id=eq.${id}` },
        (payload) => {
          console.log('New bid received!', payload);
          setBids((currentBids) => {
            if (currentBids.some(b => b.id === payload.new.id)) {
              return currentBids;
            }
             const newBid: Bid = {
                 id: payload.new.id,
                 bid_price: payload.new.bid_price,
                 bidder_id: payload.new.bidder_id,
                 timestamp: payload.new.timestamp,
             };
            return [newBid, ...currentBids];
          });
        }
      )
      .subscribe((status, err) => { // Error handler for subscribe itself
         if (status === 'SUBSCRIBED') {
            console.log(`Realtime channel subscribed for bids on listing ${id}`);
         }
         if (status === 'CHANNEL_ERROR') {
           console.error(`Realtime channel error for listing ${id}:`, err);
           // FIX: Cast 'err' to 'unknown' before checking properties
           let message = 'An unknown channel error occurred';
           const unknownErr = err as unknown; // Cast err to unknown

           if (unknownErr instanceof Error) {
               message = unknownErr.message; // Access message after instanceof check
           // Check if it's an object, has a message property, and that property is a string
           } else if (unknownErr !== null && typeof unknownErr === 'object' && 'message' in unknownErr && typeof (unknownErr as { message: unknown }).message === 'string') {
               message = (unknownErr as { message: string }).message; // Access message after checks
           }
           setError(`Realtime connection error: ${message}. Please refresh.`);
         }
       });

    // Cleanup
    return () => {
      console.log(`Unsubscribing from bids-listing-${id}`);
      supabase.removeChannel(bidsChannel);
    };
  }, [id]);

  const placeBid = async () => {
    // Function logic remains the same
    if (!user) return router.push('/auth');
    if (!listing) return;

    const amt = parseFloat(price);
    const currentHighestBid = bids[0]?.bid_price || 0;
    const minBidRequired = Math.max(listing.min_price, currentHighestBid);

    if (isNaN(amt) || amt <= minBidRequired) {
      return alert(`Bid must be greater than ₹${minBidRequired.toFixed(2)}`);
    }

    const { error: insertError } = await supabase.from('bids').insert({
      item_id: id,
      bidder_id: user.id,
      bid_price: amt,
    });

    if (!insertError) {
      setPrice('');
    } else {
      console.error("Bid insert error:", insertError);
      if (insertError.message.includes('violates row-level security policy')) {
           alert("Bid failed: You cannot bid on your own listing.");
      } else {
          alert(`Bid failed: ${insertError.message}`);
      }
    }
  };

  // --- Render Logic ---
  if (loading) return <p className="p-6 text-center">Loading listing details...</p>;
  if (error) return <p className="p-6 text-center text-red-600">{error}</p>;
  if (!listing) return <p className="p-6 text-center">Listing not found.</p>;

  return (
    <main className="max-w-xl mx-auto px-4 py-10 space-y-6">
      {/* Listing Image */}
      {listing.photos && (
         <>
         {/* eslint-disable-next-line @next/next/no-img-element */}
         <img
            src={listing.photos}
            alt={`Photo for ${listing.title}`}
            className="rounded mb-4 w-full h-auto object-cover"
         />
         </>
      )}

      {/* Listing Details */}
      <h1 className="text-3xl font-bold">{listing.title}</h1>
      <p className="text-gray-700">{listing.description}</p>
      <p className="text-lg font-semibold">
         Minimum Price: <span className="text-indigo-700">₹{listing.min_price.toFixed(2)}</span>
      </p>
      {/* {listing.end_time && <p className="text-sm text-gray-600">Auction ends: {new Date(listing.end_time).toLocaleString()}</p>} */}

      {/* Current Highest Bid Display */}
       <div className="bg-gray-100 p-4 rounded border border-gray-300">
         <h2 className="text-xl font-semibold mb-2">Current Highest Bid:</h2>
         {bids.length > 0 ? (
           <p className="text-2xl font-bold text-green-700">
             ₹{bids[0].bid_price.toFixed(2)}
           </p>
         ) : (
           <p className="text-lg text-gray-600">No bids yet. Be the first!</p>
         )}
       </div>

      {/* Bid Form (Only if logged in) */}
      {user && (
        <div className="mt-6 p-4 border rounded bg-white shadow-sm">
          <h3 className="text-lg font-semibold mb-3">Place Your Bid</h3>
          <div className="flex items-center space-x-3">
            <input
              type="number"
              value={price}
              onChange={e => setPrice(e.target.value)}
              placeholder={`Your bid ( > ₹${Math.max(listing.min_price, bids[0]?.bid_price || 0).toFixed(2)} )`}
              className="border px-3 py-2 rounded w-full focus:ring-indigo-500 focus:border-indigo-500"
              step="1"
              min="0"
            />
            <button
              onClick={placeBid}
              className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded font-medium transition duration-150 ease-in-out whitespace-nowrap"
            >
              Place Bid
            </button>
          </div>
        </div>
      )}
      {!user && (
         <div className="mt-6 p-4 border rounded bg-yellow-50 text-yellow-800">
             Please <a href="/auth" className="font-bold underline">log in</a> to place a bid.
         </div>
      )}

      {/* Bid History Section */}
      <div className="mt-8 pt-6 border-t">
         <h2 className="text-2xl font-semibold mb-4">Bid History</h2>
         {bids.length === 0 ? (
            <p className="text-gray-600">No bids have been placed yet.</p>
         ) : (
            <ul className="space-y-3 max-h-96 overflow-y-auto pr-2">
               {bids.map((bid) => (
                  <li key={bid.id} className="p-3 border rounded bg-gray-50 flex justify-between items-center">
                     <div>
                       <span className="font-semibold text-lg text-indigo-800">
                          ₹{bid.bid_price.toFixed(2)}
                       </span>
                     </div>
                     <span className="text-xs text-gray-500">
                        {new Date(bid.timestamp).toLocaleString()}
                     </span>
                  </li>
               ))}
            </ul>
         )}
      </div>
    </main>
  );
}