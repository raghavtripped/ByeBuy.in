// src/app/listings/[id]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
// Using User type from Supabase directly
import { supabase } from '@/lib/supabaseClient';
import type { User } from '@supabase/supabase-js';

// Type definitions from the 'good' commit state
type Listing = {
  id: string;
  title: string;
  description: string;
  min_price: number;
  photos: string | null;
  // Add end_time here if you need it from the listing table
  // end_time?: string;
};

type Bid = {
  id: string;
  bid_price: number;
  bidder_id: string;
  timestamp: string; // Supabase timestamp comes as string
};

// Renamed component to match filename convention (optional but good practice)
export default function ListingDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [listing, setListing] = useState<Listing | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [price, setPrice] = useState('');
  const [user, setUser] = useState<User | null>(null);
  // Added loading/error states from the 'HEAD' version as they are good additions
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* ─ fetch once + realtime ─ */
  useEffect(() => {
    // Added state resets from 'HEAD'
    setLoading(true);
    setError(null);
    setListing(null);
    setBids([]);
    setPrice('');

    supabase.auth.getUser().then(({ data }) => setUser(data.user));

    // Using the 'load' function logic from the 'good' commit state (parent of 402c2b2)
    // Combined with try/catch and loading/error handling from 'HEAD'
    const load = async () => {
       try {
         const { data: lData, error: lError } = await supabase
           .from('listings')
           .select('*') // Select columns needed for Listing type
           .eq('id', id)
           .single();

         if (lError) throw lError; // Throw error to be caught below
         setListing(lData ?? null);

         const { data: bData, error: bError } = await supabase
           .from('bids')
           .select('id, bid_price, bidder_id, timestamp') // Select columns needed for Bid type
           .eq('item_id', id)
           .order('timestamp', { ascending: false });

         if (bError) throw bError; // Throw error
         setBids(bData ?? []);

       } catch (err) { // Error handling from 'HEAD'
         console.error("Error loading data:", err);
         let message = 'An unknown error occurred';
         if (err instanceof Error) {
           message = err.message;
         } else if (typeof err === 'string') {
           message = err;
         } else if (err && typeof err === 'object' && 'message' in err) {
            message = String((err as any).message); // Fallback
         }
         setError(`Failed to load listing data: ${message}`);
         setListing(null); // Ensure listing is null on error
       } finally {
          setLoading(false); // Set loading false after attempt
       }
    };
    load(); // Initial load

    // Using the realtime subscription logic from the 'good' commit state (parent of 402c2b2)
    // which refetches on change, but using the channel naming from 'HEAD'
    // Also added subscribe status/error logging from 'HEAD'
    const bidsChannel = supabase // Renamed 'ch' to 'bidsChannel' for clarity
      .channel(`bids-listing-${id}`) // Unique channel name per listing from 'HEAD'
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bids', filter: `item_id=eq.${id}` },
        (payload) => { // Changed from () => load() to use optimistic update from 'HEAD' for better UX
            console.log('New bid received!', payload);
            setBids((currentBids) => {
              if (currentBids.some(b => b.id === payload.new.id)) {
                return currentBids; // Avoid duplicates
              }
              // Cast payload to Bid type
              const newBid: Bid = {
                  id: payload.new.id,
                  bid_price: payload.new.bid_price,
                  bidder_id: payload.new.bidder_id,
                  timestamp: payload.new.timestamp,
              };
              return [newBid, ...currentBids]; // Add to front
            });
        }
      )
      .subscribe((status, err) => { // Added status/error handling from 'HEAD'
         if (status === 'SUBSCRIBED') {
            console.log(`Realtime channel subscribed for bids on listing ${id}`);
         }
         if (status === 'CHANNEL_ERROR') {
           console.error(`Realtime channel error for listing ${id}:`, err);
           let message = 'An unknown channel error occurred';
           if (err instanceof Error) message = err.message;
           setError(`Realtime connection error: ${message}. Please refresh.`);
         }
       });

    // Cleanup function using the correct channel variable name
    return () => {
      console.log(`Unsubscribing from bids-listing-${id}`);
      supabase.removeChannel(bidsChannel); // Use the correct variable
    };
  }, [id]); // Dependency array remains [id]

  /* ─ submit bid ─ */
  // Using the placeBid logic from the 'good' commit state (parent of 402c2b2)
  // But incorporating the better RLS error check from 'HEAD'
  const placeBid = async () => {
    if (!user) {
      router.push('/auth'); // Redirect if not logged in
      return;
    }
    if (!listing) return; // Should not happen if loading/error handled

    const amt = parseFloat(price);
    // Correctly calculate floor based on listing.min_price and current highest bid
    const currentHighestBid = bids[0]?.bid_price ?? 0; // Use ?? 0 for null safety
    const floor = Math.max(listing.min_price, currentHighestBid);

    if (isNaN(amt) || amt <= floor) {
      alert(`Bid must be greater than ₹${floor.toFixed(2)}`); // Use toFixed(2) for currency
      return;
    }

    const { error: insertError } = await supabase.from('bids').insert({
      item_id: id,
      bidder_id: user.id, // Assumes user object has id
      bid_price: amt,
    });

    if (!insertError) {
        setPrice(''); // Clear input on success
        // Optimistic update via realtime listener should handle UI change
    } else {
        // Incorporate specific RLS check from 'HEAD'
        console.error("Bid insert error:", insertError);
        if (insertError.message.includes('violates row-level security policy')) {
             alert("Bid failed: You cannot bid on your own listing.");
        } else {
            alert(`Bid failed: ${insertError.message}`); // General error
        }
    }
  };

  // Using loading/error/notFound checks from 'HEAD'
  if (loading) return <p className="p-6 text-center">Loading listing details...</p>;
  if (error) return <p className="p-6 text-center text-red-600">{error}</p>;
  if (!listing) return <p className="p-6 text-center">Listing not found.</p>;

  // Using the JSX structure from the 'HEAD' version, as it correctly integrates
  // the highest bid display and bid history list, removing the redundant button.
  return (
    <main className="max-w-xl mx-auto px-4 py-10 space-y-6">
      {/* Listing Image */}
      {listing.photos && (
         <img
            src={listing.photos}
            alt={`Photo for ${listing.title}`} // Use meaningful alt text
            className="rounded mb-4 w-full h-auto object-cover" // Basic styling
         />
      )}

      {/* Listing Details */}
      <h1 className="text-3xl font-bold">{listing.title}</h1>
      <p className="text-gray-700">{listing.description}</p>
      <p className="text-lg font-semibold">
         Minimum Price: <span className="text-indigo-700">₹{listing.min_price.toFixed(2)}</span>
      </p>
      {/* Add end_time display if available on listing object */}
      {/* {listing.end_time && <p className="text-sm text-gray-600">Auction ends: {new Date(listing.end_time).toLocaleString()}</p>} */}


      {/* Current Highest Bid Display (from 'HEAD') */}
       <div className="bg-gray-100 p-4 rounded border border-gray-300">
         <h2 className="text-xl font-semibold mb-2">Current Highest Bid:</h2>
         {bids.length > 0 ? (
           <p className="text-2xl font-bold text-green-700">
             ₹{bids[0].bid_price.toFixed(2)}
             {/* Optionally show bidder info later if needed */}
           </p>
         ) : (
           <p className="text-lg text-gray-600">No bids yet. Be the first!</p>
         )}
       </div>


      {/* Bid Form (Only if logged in) (from 'HEAD') */}
      {user && (
        <div className="mt-6 p-4 border rounded bg-white shadow-sm">
          <h3 className="text-lg font-semibold mb-3">Place Your Bid</h3>
          <div className="flex items-center space-x-3">
            <input
              type="number"
              value={price}
              onChange={e => setPrice(e.target.value)}
              // Use the correct calculation for placeholder
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
      {/* Show login prompt if not logged in (from 'HEAD') */}
      {!user && (
         <div className="mt-6 p-4 border rounded bg-yellow-50 text-yellow-800">
             Please <a href="/auth" className="font-bold underline">log in</a> to place a bid.
         </div>
      )}

      {/* Removed the redundant button linking to /bid/[id] */}

      {/* Bid History Section (from 'HEAD') */}
      <div className="mt-8 pt-6 border-t">
         <h2 className="text-2xl font-semibold mb-4">Bid History</h2>
         {bids.length === 0 ? (
            <p className="text-gray-600">No bids have been placed yet.</p>
         ) : (
            <ul className="space-y-3 max-h-96 overflow-y-auto pr-2"> {/* Added scroll */}
               {bids.map((bid) => (
                  <li key={bid.id} className="p-3 border rounded bg-gray-50 flex justify-between items-center">
                     <div>
                       <span className="font-semibold text-lg text-indigo-800">
                          ₹{bid.bid_price.toFixed(2)}
                       </span>
                       {/* Usually don't show bidder ID publicly */}
                     </div>
                     <span className="text-xs text-gray-500">
                        {/* Format timestamp nicely */}
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