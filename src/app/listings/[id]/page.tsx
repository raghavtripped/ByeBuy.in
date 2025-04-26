// src/app/listings/[id]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link'; // <--- ADD THIS IMPORT
import { supabase, User } from '@/lib/supabaseClient';

// ... rest of the code remains the same ...

// --- Update Listing type ---
type Listing = {
    id: string;
    title: string;
    description: string;
    min_price: number;
    photos: string | null;
    end_time?: string | null; // Optional end_time
    // --- NEW Optional Fields ---
    upper_cap?: number | null; // Optional Buy Now price
    rules?: string | null;     // Optional Rules
};

type Bid = { id: string; bid_price: number; bidder_id: string; timestamp: string };

export default function ListingDetails() {
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
        // --- Update select query ---
        const { data: lData, error: lError } = await supabase
          .from('listings')
          .select('id, title, description, min_price, photos, end_time, upper_cap, rules') // Add upper_cap, rules
          .eq('id', id)
          .single();

        if (lError) throw lError;
        setListing(lData ?? null);

        // Fetch bids data (no change needed here)
        const { data: bData, error: bError } = await supabase
          .from('bids')
          .select('*')
          .eq('item_id', id)
          .order('timestamp', { ascending: false });

        if (bError) throw bError;
        setBids(bData ?? []);

      } catch (err) {
         // Error handling remains the same
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

    // Realtime subscription (no change needed here)
    const bidsChannel = supabase
      .channel(`bids-listing-${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bids', filter: `item_id=eq.${id}` },
        (payload) => {
          console.log('New bid received!', payload);
          setBids((currentBids) => {
            if (currentBids.some(b => b.id === payload.new.id)) return currentBids;
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
      .subscribe((status, err) => {
         if (status === 'SUBSCRIBED') {
            console.log(`Realtime channel subscribed for bids on listing ${id}`);
         }
         if (status === 'CHANNEL_ERROR') {
           console.error(`Realtime channel error for listing ${id}:`, err);
           let message = 'An unknown channel error occurred';
           const unknownErr = err as unknown;
           if (unknownErr instanceof Error) { message = unknownErr.message; }
           else if (unknownErr !== null && typeof unknownErr === 'object' && 'message' in unknownErr && typeof (unknownErr as { message: unknown }).message === 'string') {
               message = (unknownErr as { message: string }).message;
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
    // placeBid logic remains the same
    if (!user) return router.push('/auth');
    if (!listing) return;
    const amt = parseFloat(price);
    const currentHighestBid = bids[0]?.bid_price || 0;
    const minBidRequired = Math.max(listing.min_price, currentHighestBid);
    if (isNaN(amt) || amt <= minBidRequired) {
      return alert(`Bid must be greater than ₹${minBidRequired.toFixed(2)}`);
    }
    // Add check for upper_cap here later if implementing Buy Now functionality
    // if (listing.upper_cap && amt >= listing.upper_cap) { /* Handle Buy Now */ }

    const { error: insertError } = await supabase.from('bids').insert({ item_id: id, bidder_id: user.id, bid_price: amt });
    if (!insertError) { setPrice(''); }
    else {
      console.error("Bid insert error:", insertError);
      if (insertError.message.includes('violates row-level security policy')) { alert("Bid failed: You cannot bid on your own listing."); }
      else { alert(`Bid failed: ${insertError.message}`); }
    }
  };

  // Render Logic
  if (loading) return <p className="p-6 text-center">Loading listing details...</p>;
  if (error) return <p className="p-6 text-center text-red-600">{error}</p>;
  if (!listing) return <p className="p-6 text-center">Listing not found.</p>;

  return (
    <main className="max-w-xl mx-auto px-4 py-10 space-y-6">
      {/* Listing Image */}
      {listing.photos && (
         <>
         {/* eslint-disable-next-line @next/next/no-img-element */}
         <img src={listing.photos} alt={`Photo for ${listing.title}`} className="rounded mb-4 w-full h-auto object-cover" />
         </>
      )}

      {/* --- Listing Details --- */}
      <section className="space-y-2">
          <h1 className="text-3xl font-bold text-gray-900">{listing.title}</h1>
          <p className="text-gray-700">{listing.description}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <p className="font-semibold">
                 Minimum Price: <span className="text-indigo-700 font-bold">₹{listing.min_price.toFixed(2)}</span>
              </p>
              {/* --- Conditionally display Upper Cap --- */}
              {listing.upper_cap && listing.upper_cap > 0 && (
                   <p className="font-semibold">
                     Buy Now Price: <span className="text-purple-700 font-bold">₹{listing.upper_cap.toFixed(2)}</span>
                  </p>
              )}
          </div>
          {listing.end_time && (
              <p className="text-xs text-gray-500">
                  Auction ends: {new Date(listing.end_time).toLocaleString()}
              </p>
          )}
      </section>

       {/* --- Conditionally display Rules --- */}
       {listing.rules && (
           <section className="p-4 border rounded-md bg-gray-50 space-y-1">
                <h3 className="text-sm font-semibold text-gray-700">Auction Rules:</h3>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{listing.rules}</p> {/* Use pre-wrap to respect newlines */}
           </section>
       )}


      {/* --- Current Highest Bid Display --- */}
       <section className="bg-green-50 p-4 rounded border border-green-200">
         <h2 className="text-xl font-semibold mb-1 text-green-800">Current Highest Bid:</h2>
         {bids.length > 0 ? (
           <p className="text-2xl font-bold text-green-700">
             ₹{bids[0].bid_price.toFixed(2)}
           </p>
         ) : (
           <p className="text-lg text-gray-600">No bids yet. Be the first!</p>
         )}
       </section>


      {/* --- Bid Form --- */}
      <section>
          {user && (
            <div className="p-4 border rounded bg-white shadow-sm">
              <h3 className="text-lg font-semibold mb-3 text-gray-800">Place Your Bid</h3>
              <div className="flex items-center space-x-3">
                <input
                  type="number"
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                  placeholder={`Your bid ( > ₹${Math.max(listing.min_price, bids[0]?.bid_price || 0).toFixed(2)} )`}
                  className="border px-3 py-2 rounded w-full focus:ring-indigo-500 focus:border-indigo-500"
                  step="any" // Allow decimals
                  min="0"
                />
                <button
                  onClick={placeBid}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded font-medium transition duration-150 ease-in-out whitespace-nowrap"
                >
                  Place Bid
                </button>
              </div>
            </div>
          )}
          {!user && (
             <div className="p-4 border rounded bg-yellow-50 text-yellow-800 text-center">
                 Please <Link href="/auth" className="font-bold underline hover:text-yellow-900">log in</Link> to place a bid.
             </div>
          )}
      </section>


      {/* --- Bid History Section --- */}
      <section className="pt-6 border-t">
         <h2 className="text-2xl font-semibold mb-4 text-gray-800">Bid History</h2>
         {bids.length === 0 ? (
            <p className="text-gray-600">No bids have been placed yet.</p>
         ) : (
            <ul className="space-y-3 max-h-96 overflow-y-auto pr-2">
               {bids.map((bid) => (
                  <li key={bid.id} className="p-3 border rounded bg-gray-50 flex justify-between items-center text-sm">
                     <span className="font-semibold text-indigo-800">
                        ₹{bid.bid_price.toFixed(2)}
                     </span>
                     <span className="text-xs text-gray-500">
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