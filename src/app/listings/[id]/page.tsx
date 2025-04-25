// src/app/listings/[id]/page.tsx

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase, Session, User } from '@/lib/supabaseClient';

// Types remain the same
type Listing = { id: string; title: string; description: string; min_price: number; photos: string | null; /* add end_time if needed here */ };
type Bid = { id: string; bid_price: number; bidder_id: string; timestamp: string };

export default function ListingDetails() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [listing, setListing] = useState<Listing | null>(null);
  const [bids,    setBids]    = useState<Bid[]>([]);
  const [price,   setPrice]   = useState('');
  const [user,    setUser]    = useState<User | null>(null);
  const [loading, setLoading] = useState(true); // Optional: Add loading state
  const [error,   setError]   = useState<string | null>(null); // Optional: Add error state

  /* ── fetch + realtime ── */
  useEffect(() => {
    // Reset states on ID change
    setLoading(true);
    setError(null);
    setListing(null);
    setBids([]);
    setPrice('');

    // Get current user
    supabase.auth.getUser().then(({ data }) => setUser(data.user));

    // Fetch listing and initial bids
    const load = async () => {
      try {
        const { data: lData, error: lError } = await supabase
          .from('listings')
          .select('*')
          .eq('id', id)
          .single();

        if (lError) throw lError;
        setListing(lData ?? null);

        const { data: bData, error: bError } = await supabase
          .from('bids')
          .select('*') // Select necessary fields: id, bid_price, bidder_id, timestamp
          .eq('item_id', id)
          .order('timestamp', { ascending: false });

        if (bError) throw bError;
        setBids(bData ?? []);

      } catch (err: any) {
        console.error("Error loading data:", err);
        setError(`Failed to load listing data: ${err.message}`);
        setListing(null); // Ensure listing is null on error
      } finally {
        setLoading(false);
      }
    };
    load();

    // Set up realtime subscription for bids on THIS item
    const bidsChannel = supabase
      .channel(`bids-listing-${id}`) // Unique channel name per listing
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'bids',
          filter: `item_id=eq.${id}` // Filter for bids related to this item_id
        },
        (payload) => {
          console.log('New bid received!', payload);
          // Option 1: Simple Refetch (like you had) - easiest, reliable
          // load();

          // Option 2: Optimistic Update (slightly more complex, faster UI feel)
           setBids((currentBids) => {
             // Check if bid already exists to prevent duplicates from potential race conditions
             if (currentBids.some(b => b.id === payload.new.id)) {
               return currentBids;
             }
             // Add the new bid to the top (assuming order is descending timestamp)
             return [payload.new as Bid, ...currentBids];
           });
        }
      )
      .subscribe((status, err) => {
         if (status === 'SUBSCRIBED') {
            console.log(`Realtime channel subscribed for bids on listing ${id}`);
         }
         if (status === 'CHANNEL_ERROR') {
           console.error(`Realtime channel error for listing ${id}:`, err);
           setError('Realtime connection error. Please refresh.');
         }
       });

    // Cleanup function
    return () => {
      console.log(`Unsubscribing from bids-listing-${id}`);
      supabase.removeChannel(bidsChannel);
    };
  }, [id]); // Re-run effect if listing ID changes

  /* ── bid submit ── */
  const placeBid = async () => {
    if (!user) return router.push('/auth');
    if (!listing) return; // Should not happen if loading is handled

    const amt = parseFloat(price);

    // Determine the minimum next bid
    const currentHighestBid = bids[0]?.bid_price || 0; // Get the highest bid (first element since sorted desc)
    const minBidRequired = Math.max(listing.min_price, currentHighestBid);

    if (isNaN(amt) || amt <= minBidRequired) {
      return alert(`Bid must be greater than ₹${minBidRequired.toFixed(2)}`);
    }

    // Optional: Add loading state for bid submission
    // setBidSubmitting(true);
    const { error: insertError } = await supabase.from('bids').insert({
      item_id: id,
      bidder_id: user.id, // Make sure user object is available and has id
      bid_price: amt,
    });
    // setBidSubmitting(false);


    if (!insertError) {
      setPrice(''); // Clear input on success
      // No need to manually refetch if realtime optimistic update is working
    } else {
      console.error("Bid insert error:", insertError);
      // Check for RLS error specifically
      if (insertError.message.includes('violates row-level security policy')) {
           alert("Bid failed: You cannot bid on your own listing.");
      } else {
          alert(`Bid failed: ${insertError.message}`);
      }
    }
  };

  // Handle Loading State
  if (loading) {
    return <p className="p-6 text-center">Loading listing details...</p>;
  }

  // Handle Error State
  if (error) {
     return <p className="p-6 text-center text-red-600">{error}</p>;
  }

  // Handle Listing Not Found
  if (!listing) {
    return <p className="p-6 text-center">Listing not found.</p>;
  }

  // --- Render Page ---
  return (
    <main className="max-w-xl mx-auto px-4 py-10 space-y-6">
      {/* Listing Image */}
      {listing.photos && (
          /* eslint-disable-next-line @next/next/no-img-element */
         <img
            src={listing.photos}
            alt={`Photo for ${listing.title}`} // Add meaningful alt text
            className="rounded mb-4 w-full h-auto object-cover" // Basic styling
         />
      )}

      {/* Listing Details */}
      <h1 className="text-3xl font-bold">{listing.title}</h1>
      <p className="text-gray-700">{listing.description}</p>
      <p className="text-lg font-semibold">
         Minimum Price: <span className="text-indigo-700">₹{listing.min_price.toFixed(2)}</span>
      </p>
      {/* You might want to add the end_time here */}
      {/* <p className="text-sm text-gray-600">Auction ends: {new Date(listing.end_time).toLocaleString()}</p> */}


      {/* Current Highest Bid Display */}
       <div className="bg-gray-100 p-4 rounded border border-gray-300">
         <h2 className="text-xl font-semibold mb-2">Current Highest Bid:</h2>
         {bids.length > 0 ? (
           <p className="text-2xl font-bold text-green-700">
             ₹{bids[0].bid_price.toFixed(2)}
             {/* Optionally show bidder later */}
             {/* <span className="text-sm font-normal text-gray-500"> by User {bids[0].bidder_id.substring(0, 6)}...</span> */}
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
              step="1" // Or set appropriate step based on your rules
              min="0" // Basic validation
            />
            <button
              onClick={placeBid}
              className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded font-medium transition duration-150 ease-in-out whitespace-nowrap"
              // disabled={bidSubmitting} // Optional: disable while submitting
            >
              {/* {bidSubmitting ? 'Placing...' : 'Place Bid'} */}
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

      {/* REMOVED: Link to separate bid history page */}
      {/*
      <button
        onClick={() => router.push(`/bid/${id}`)}
        className="underline text-indigo-600"
      >
        View live bid history →
      </button>
      */}

      {/* Bid History Section */}
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
                       {/* We don't display bidder ID publicly usually, maybe relative time */}
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