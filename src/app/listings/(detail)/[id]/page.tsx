// src/app/listings/(detail)/[id]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase, User } from '@/lib/supabaseClient';
import { formatRelativeTime, isPast } from '@/lib/timeUtils';
import LoadingSpinner from '@/components/LoadingSpinner';

// Listing type definition
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

// Bid type definition
type Bid = {
    id: string;
    bid_price: number;
    bidder_id: string;
    timestamp: string;
    bidder_email?: string | null;
};

export default function ListingDetails() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  // Existing State
  const [listing, setListing] = useState<Listing | null>(null);
  const [bids,    setBids]    = useState<Bid[]>([]);
  const [price,   setPrice]   = useState('');
  const [user,    setUser]    = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  // --- Add New State for Bid Status ---
  const [bidStatusMessage, setBidStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    // UUID Validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!id || !uuidRegex.test(id)) {
        console.error(`Invalid listing ID format detected: ${id}.`);
        setError("Listing not found."); setLoading(false); setListing(null); setBids([]); return;
    }

    // Reset state
    setLoading(true); setError(null); setListing(null); setBids([]); setPrice('');
    supabase.auth.getUser().then(({ data }) => setUser(data.user));

    // Load initial data
    const load = async () => {
      try {
        const { data: lData, error: lError } = await supabase.from('listings_with_seller_email').select(/*...*/).eq('id', id).single();
        if (lError) throw lError;
        setListing(lData as Listing ?? null);

        const { data: bData, error: bError } = await supabase.from('bids_with_bidder_email').select(/*...*/).eq('item_id', id).order('timestamp', { ascending: false });
        if (bError) throw bError;
        setBids(bData as Bid[] ?? []);
      } catch (err) { /* ... error handling ... */
         console.error("Error loading data:", err);
         let message = 'An unknown error occurred during loading';
         if (err instanceof Error) { message = err.message; }
         else if (typeof err === 'string') { message = err; }
         else if (err !== null && typeof err === 'object' && 'message' in err && typeof err.message === 'string') { message = err.message; }
         setError(message.includes('relation "listings_with_seller_email" does not exist') ? "Error loading data." : `Failed to load listing data: ${message}`);
         setListing(null);
      } finally { setLoading(false); }
    };
    load();

    // Realtime subscription for bids
    const bidsChannel = supabase
      .channel(`bids-listing-${id}`)
      .on('postgres_changes',{ event: 'INSERT', schema: 'public', table: 'bids', filter: `item_id=eq.${id}` },
        async (payload) => {
          console.log('New bid detected via RT!', payload.new.id);
          try { // Fetch details for new bid to get email
              const { data: newBidDetails, error: fetchError } = await supabase.from('bids_with_bidder_email').select('id, bid_price, bidder_id, timestamp, bidder_email').eq('id', payload.new.id).single();
              if (fetchError) throw fetchError;
              if (newBidDetails) { setBids((currentBids) => [newBidDetails as Bid, ...currentBids.filter(b => b.id !== newBidDetails.id)]); }
          } catch (e) { console.error("RT: Exception fetching new bid details:", e); }
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') { console.log(`RT subscribed: bids ${id}`); }
        if (status === 'CHANNEL_ERROR') { console.error(`RT error: bids ${id}`, err); setError('Realtime connection error.'); }
       });

    return () => { supabase.removeChannel(bidsChannel); };
  }, [id]);

  // --- Updated placeBid Function ---
  const placeBid = async () => {
    // Clear previous status message on new attempt
    setBidStatusMessage(null);

    if (!user) return router.push('/auth');
    if (!listing) return;
    if (listing.end_time && isPast(listing.end_time)) {
        const msg = "This auction has already ended.";
        setBidStatusMessage(`⚠️ ${msg}`); // Show status message too
        // alert(msg); // Keep alert or rely only on status message? Let's remove alert
        return;
    }
    const amt = parseFloat(price);
    const currentHighestBid = bids[0]?.bid_price || 0;
    const minBidRequired = Math.max(listing.min_price, currentHighestBid);
    if (isNaN(amt) || amt <= minBidRequired) {
        const msg = `Bid must be greater than ₹${minBidRequired.toFixed(2)}`;
        setBidStatusMessage(`⚠️ ${msg}`); // Show status message
        // return alert(msg); // Remove alert
        return;
    }

    const { error: insertError } = await supabase.from('bids').insert({ item_id: id, bidder_id: user.id, bid_price: amt });

    if (!insertError) {
        setPrice(''); // Clear input
        setBidStatusMessage('✅ Bid placed successfully!'); // Set success message
        // Realtime listener will handle updating the bid list display
    } else {
        console.error("Bid insert error:", insertError);
        let message = `Bid failed: ${insertError.message}`;
        if (insertError.message.includes('violates row-level security policy')) {
            message = "Bid failed: You cannot bid on your own listing.";
        }
        setBidStatusMessage(`❌ ${message}`); // Set error message
    }

    // Clear message after a delay
    setTimeout(() => {
        setBidStatusMessage(null);
    }, 3000); // Clear message after 3 seconds
  };
  // --- End Updated placeBid Function ---


  // Render Logic
  if (loading) { return ( <div className="max-w-xl mx-auto px-4 py-10"><LoadingSpinner /></div> ); }
  if (error) return <p className="p-6 text-center text-red-600">{error}</p>;
  if (!listing) return <p className="p-6 text-center">Listing not found.</p>;

  const timeString = formatRelativeTime(listing.end_time);
  const auctionEnded = listing.end_time ? isPast(listing.end_time) : false;
  const highestBid = bids.length > 0 ? bids[0] : null;

  return (
    <main className="max-w-xl mx-auto px-4 py-10 space-y-6">
        {/* ... Image ... */}
        {listing.photos && ( <> {/* eslint-disable-next-line @next/next/no-img-element */} <img src={listing.photos} alt={`Photo for ${listing.title}`} className="rounded mb-4 w-full h-auto object-cover" /> </> )}
        {/* ... Details Section ... */}
        <section className="space-y-2 border-b pb-4"> <h1 className="text-3xl font-bold text-gray-900">{listing.title}</h1> {listing.seller_email && ( <p className="text-sm text-gray-600"> Sold by: <span className="font-medium text-gray-800">{listing.seller_email}</span> </p> )} <p className="text-gray-700 pt-2">{listing.description}</p> <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm pt-2"> <p className="font-semibold"> Min Price: <span className="text-indigo-700 font-bold">₹{listing.min_price.toFixed(2)}</span> </p> {listing.upper_cap && listing.upper_cap > 0 && ( <p className="font-semibold"> Buy Now Price: <span className="text-purple-700 font-bold">₹{listing.upper_cap.toFixed(2)}</span> </p> )} </div> {timeString && ( <p className={`text-sm font-medium ${auctionEnded ? 'text-red-600' : 'text-gray-600'}`}> {timeString} </p> )} </section>
        {/* ... Rules Section ... */}
        {listing.rules && ( <section className="p-4 border rounded-md bg-gray-50 space-y-1"> <h3 className="text-sm font-semibold text-gray-700">Auction Rules:</h3> <p className="text-sm text-gray-600 whitespace-pre-wrap">{listing.rules}</p> </section> )}
        {/* ... Highest Bid Section ... */}
        <section className="bg-green-50 p-4 rounded border border-green-200"> <h2 className="text-xl font-semibold mb-1 text-green-800">Current Highest Bid:</h2> {highestBid ? ( <div> <p className="text-2xl font-bold text-green-700">₹{highestBid.bid_price.toFixed(2)}</p> {highestBid.bidder_email && ( <p className="text-xs text-gray-600 mt-1"> by <span className="font-medium">{highestBid.bidder_email}</span></p> )} </div> ) : ( <p className="text-lg text-gray-600">No bids yet. Be the first!</p> )} </section>

        {/* --- Bid Form Section (with Status Message) --- */}
        <section>
            {user && !auctionEnded && (
                <div className="p-4 border rounded bg-white shadow-sm">
                    <h3 className="text-lg font-semibold mb-3 text-gray-800">Place Your Bid</h3>
                    <div className="flex items-center space-x-3">
                        <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder={`Your bid ( > ₹${Math.max(listing.min_price, bids[0]?.bid_price || 0).toFixed(2)} )`} className="border px-3 py-2 rounded w-full focus:ring-indigo-500 focus:border-indigo-500" step="any" min="0" />
                        <button onClick={placeBid} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded font-medium transition duration-150 ease-in-out whitespace-nowrap">Place Bid</button>
                    </div>
                    {/* Display Status Message */}
                    {bidStatusMessage && (
                        <p className={`mt-3 text-sm ${bidStatusMessage.startsWith('✅') ? 'text-green-600' : bidStatusMessage.startsWith('⚠️') ? 'text-yellow-700' : 'text-red-600'}`}>
                            {bidStatusMessage}
                        </p>
                    )}
                </div>
            )}
            {user && auctionEnded && ( <div className="p-4 border rounded bg-gray-100 text-gray-600 text-center">This auction has ended.</div> )}
            {!user && ( <div className="p-4 border rounded bg-yellow-50 text-yellow-800 text-center"> Please <Link href="/auth" className="font-bold underline hover:text-yellow-900">log in</Link> to place a bid. </div> )}
        </section>
        {/* --- End Bid Form Section --- */}

        {/* ... Bid History Section ... */}
        <section className="pt-6 border-t"> <h2 className="text-2xl font-semibold mb-4 text-gray-800">Bid History</h2> {bids.length === 0 ? ( <p className="text-gray-600">No bids have been placed yet.</p> ) : ( <ul className="space-y-3 max-h-96 overflow-y-auto pr-2"> {bids.map((bid) => ( <li key={bid.id} className="p-3 border rounded bg-gray-50 flex justify-between items-center text-sm"> <div> <span className="font-semibold text-indigo-800">₹{bid.bid_price.toFixed(2)}</span> {bid.bidder_email && ( <span className="text-xs text-gray-500 ml-2">by {bid.bidder_email}</span> )} </div> <span className="text-xs text-gray-500"> {new Date(bid.timestamp).toLocaleString()} </span> </li> ))} </ul> )} </section>
    </main>
  );
}