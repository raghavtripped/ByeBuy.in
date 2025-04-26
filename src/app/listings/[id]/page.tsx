// src/app/listings/[id]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase, User } from '@/lib/supabaseClient';
import { formatRelativeTime, isPast } from '@/lib/timeUtils';

// Listing type remains the same
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
};

// --- Update Bid type to include bidder_email ---
type Bid = {
    id: string;
    bid_price: number;
    bidder_id: string; // Still useful internally or if email is null
    timestamp: string;
    bidder_email?: string | null; // Add the bidder's email (optional)
};

export default function ListingDetails() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [listing, setListing] = useState<Listing | null>(null);
  const [bids,    setBids]    = useState<Bid[]>([]); // State now holds Bid objects with email
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
        // Fetch listing data (uses listings_with_seller_email view)
        const { data: lData, error: lError } = await supabase
          .from('listings_with_seller_email')
          .select(` id, title, description, min_price, photos, end_time, upper_cap, rules, seller_email `)
          .eq('id', id)
          .single();

        if (lError) throw lError;
        setListing(lData as Listing ?? null);

        // --- Fetch bids data using the NEW VIEW ---
        const { data: bData, error: bError } = await supabase
          .from('bids_with_bidder_email') // <<<--- QUERY THE BIDS VIEW
          .select(` id, bid_price, bidder_id, timestamp, bidder_email `) // <<<--- SELECT email
          .eq('item_id', id)
          .order('timestamp', { ascending: false }); // Keep latest bid first for display

        if (bError) throw bError;
        // Cast result to Bid[] which now includes optional bidder_email
        setBids(bData as Bid[] ?? []);

      } catch (err) { /* ... error handling ... */
         console.error("Error loading data:", err);
         let message = 'An unknown error occurred during loading';
         if (err instanceof Error) { message = err.message; }
         else if (typeof err === 'string') { message = err; }
         else if (err !== null && typeof err === 'object' && 'message' in err && typeof err.message === 'string') { message = err.message; }
         setError(`Failed to load listing data: ${message}`);
         setListing(null);
      } finally { setLoading(false); }
    };
    load();

    // --- Realtime subscription needs to fetch from the VIEW now too ---
    const bidsChannel = supabase
      .channel(`bids-listing-${id}`) // Keep channel name consistent
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bids', filter: `item_id=eq.${id}` },
        async (payload) => { // Make the callback async to fetch details
          console.log('New bid detected via RT!', payload.new.id);
          // When a new bid comes in, we need its email. Fetch the full bid details from the view.
          try {
              const { data: newBidDetails, error: fetchError } = await supabase
                  .from('bids_with_bidder_email')
                  .select('id, bid_price, bidder_id, timestamp, bidder_email')
                  .eq('id', payload.new.id)
                  .single();

              if (fetchError) {
                  console.error("RT: Error fetching new bid details:", fetchError);
                  // Optionally refetch all bids as a fallback: load();
                  return;
              }

              if (newBidDetails) {
                  console.log("RT: Adding new bid with email:", newBidDetails);
                  // Add the new bid (with email) to the top of the list
                  setBids((currentBids) => [newBidDetails as Bid, ...currentBids.filter(b => b.id !== newBidDetails.id)]);
              }
          } catch (e) {
              console.error("RT: Exception fetching new bid details:", e);
              // Optionally refetch all bids as a fallback: load();
          }
        }
      )
      .subscribe((status, err) => { /* ... error handling ... */
        if (status === 'SUBSCRIBED') { console.log(`RT subscribed: bids ${id}`); }
        if (status === 'CHANNEL_ERROR') { console.error(`RT error: bids ${id}`, err); setError('Realtime connection error.'); }
       });

    // Cleanup
    return () => { supabase.removeChannel(bidsChannel); };
  }, [id]);

  const placeBid = async () => { /* ... placeBid logic remains the same ... */
    if (!user) return router.push('/auth');
    if (!listing) return;
    if (listing.end_time && isPast(listing.end_time)) { alert("This auction has already ended."); return; }
    const amt = parseFloat(price);
    const currentHighestBid = bids[0]?.bid_price || 0;
    const minBidRequired = Math.max(listing.min_price, currentHighestBid);
    if (isNaN(amt) || amt <= minBidRequired) { return alert(`Bid must be greater than ₹${minBidRequired.toFixed(2)}`); }
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

  const timeString = formatRelativeTime(listing.end_time);
  const auctionEnded = listing.end_time ? isPast(listing.end_time) : false;

  // Find the highest bid object to get the bidder email for the top display
  const highestBid = bids.length > 0 ? bids[0] : null; // Assumes bids are sorted descending by timestamp

  return (
    <main className="max-w-xl mx-auto px-4 py-10 space-y-6">
      {/* Listing Image */}
      {listing.photos && ( /* ... image jsx ... */ <> {/* eslint-disable-next-line @next/next/no-img-element */} <img src={listing.photos} alt={`Photo for ${listing.title}`} className="rounded mb-4 w-full h-auto object-cover" /> </> )}

      {/* Listing Details */}
      <section className="space-y-2 border-b pb-4">
          <h1 className="text-3xl font-bold text-gray-900">{listing.title}</h1>
          {listing.seller_email && ( <p className="text-sm text-gray-600"> Sold by: <span className="font-medium text-gray-800">{listing.seller_email}</span> </p> )}
          <p className="text-gray-700 pt-2">{listing.description}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm pt-2">
              <p className="font-semibold"> Min Price: <span className="text-indigo-700 font-bold">₹{listing.min_price.toFixed(2)}</span> </p>
              {listing.upper_cap && listing.upper_cap > 0 && ( <p className="font-semibold"> Buy Now Price: <span className="text-purple-700 font-bold">₹{listing.upper_cap.toFixed(2)}</span> </p> )}
          </div>
          {timeString && ( <p className={`text-sm font-medium ${auctionEnded ? 'text-red-600' : 'text-gray-600'}`}> {timeString} </p> )}
      </section>

       {/* Rules Section */}
       {listing.rules && ( /* ... rules jsx ... */ <section className="p-4 border rounded-md bg-gray-50 space-y-1"> <h3 className="text-sm font-semibold text-gray-700">Auction Rules:</h3> <p className="text-sm text-gray-600 whitespace-pre-wrap">{listing.rules}</p> </section> )}

      {/* --- Current Highest Bid Display (with bidder email) --- */}
       <section className="bg-green-50 p-4 rounded border border-green-200">
            <h2 className="text-xl font-semibold mb-1 text-green-800">Current Highest Bid:</h2>
            {highestBid ? (
              <div>
                 <p className="text-2xl font-bold text-green-700">₹{highestBid.bid_price.toFixed(2)}</p>
                 {/* Display bidder email if available */}
                 {highestBid.bidder_email && (
                     <p className="text-xs text-gray-600 mt-1"> by <span className="font-medium">{highestBid.bidder_email}</span></p>
                 )}
              </div>
            ) : (
                 <p className="text-lg text-gray-600">No bids yet. Be the first!</p>
            )}
       </section>

      {/* Bid Form */}
      <section>
          {user && !auctionEnded && ( /* ... bid form jsx ... */ <div className="p-4 border rounded bg-white shadow-sm"> <h3 className="text-lg font-semibold mb-3 text-gray-800">Place Your Bid</h3> <div className="flex items-center space-x-3"> <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder={`Your bid ( > ₹${Math.max(listing.min_price, bids[0]?.bid_price || 0).toFixed(2)} )`} className="border px-3 py-2 rounded w-full focus:ring-indigo-500 focus:border-indigo-500" step="any" min="0" /> <button onClick={placeBid} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded font-medium transition duration-150 ease-in-out whitespace-nowrap">Place Bid</button> </div> </div> )}
          {user && auctionEnded && ( <div className="p-4 border rounded bg-gray-100 text-gray-600 text-center">This auction has ended.</div> )}
          {!user && ( <div className="p-4 border rounded bg-yellow-50 text-yellow-800 text-center"> Please <Link href="/auth" className="font-bold underline hover:text-yellow-900">log in</Link> to place a bid. </div> )}
      </section>

      {/* --- Bid History Section (with bidder email) --- */}
      <section className="pt-6 border-t">
            <h2 className="text-2xl font-semibold mb-4 text-gray-800">Bid History</h2>
            {bids.length === 0 ? ( <p className="text-gray-600">No bids have been placed yet.</p> )
            : (
                 <ul className="space-y-3 max-h-96 overflow-y-auto pr-2">
                  {bids.map((bid) => ( // Use the bid object which now contains bidder_email
                     <li key={bid.id} className="p-3 border rounded bg-gray-50 flex justify-between items-center text-sm">
                        <div>
                           <span className="font-semibold text-indigo-800">₹{bid.bid_price.toFixed(2)}</span>
                           {/* Display bidder email if available */}
                           {bid.bidder_email && (
                                <span className="text-xs text-gray-500 ml-2">by {bid.bidder_email}</span>
                            )}
                        </div>
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