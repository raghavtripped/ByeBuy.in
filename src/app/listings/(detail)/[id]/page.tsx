// src/app/listings/(detail)/[id]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase, User } from '@/lib/supabaseClient';
import { formatRelativeTime, isPast } from '@/lib/timeUtils';
import { formatCurrency } from '@/lib/formatUtils';
import LoadingSpinner from '@/components/LoadingSpinner';

// --- CORRECTED/ALIGNED Type Definitions ---
// Ensure these fields EXACTLY match what's selected and used below
type Listing = {
    id: string;
    title: string;
    description: string;
    min_price: number; // Used in placeBid, JSX
    photos: string | null; // Used in JSX
    end_time?: string | null; // Used in placeBid, JSX, formatRelativeTime, isPast
    upper_cap?: number | null; // Used in JSX
    rules?: string | null; // Used in JSX
    seller_email?: string | null; // Used in JSX
    // seller_id might be useful if email is null, keep if selected
    seller_id?: string;
};

type Bid = {
    id: string;
    bid_price: number; // Used in placeBid, JSX
    bidder_id: string; // Used in placeBid check (implicitly via RLS)
    timestamp: string; // Used in JSX date formatting
    bidder_email?: string | null; // Used in JSX
    // item_id is implicitly used in queries/filters
};
// --- END Type Definitions ---

export default function ListingDetails() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  // State variables
  const [listing, setListing] = useState<Listing | null>(null);
  const [bids,    setBids]    = useState<Bid[]>([]);
  const [price,   setPrice]   = useState('');
  const [user,    setUser]    = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [bidStatusMessage, setBidStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    // UUID Validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!id || !uuidRegex.test(id)) { setError("Listing not found."); setLoading(false); return; }

    // Reset state
    setLoading(true); setError(null); setListing(null); setBids([]); setPrice('');
    supabase.auth.getUser().then(({ data }) => setUser(data.user));

    // Load initial data
    const load = async () => {
        try {
            // Select all fields defined in the Listing type that come from the view
            const { data: lData, error: lError } = await supabase
              .from('listings_with_seller_email') // Query the view
              .select(`
                  id, title, description, min_price, photos, end_time,
                  upper_cap, rules, seller_email, seller_id
               `) // Ensure all needed fields are selected
              .eq('id', id)
              .maybeSingle(); // Use maybeSingle for better null handling if not found

            if (lError) throw lError;
            // No need to cast if select matches type well
            setListing(lData ?? null);

            // Only fetch bids if listing was found
            if (lData) {
                // Select all fields defined in the Bid type that come from the view
                const { data: bData, error: bError } = await supabase
                  .from('bids_with_bidder_email') // Query the view
                  .select(`
                      id, bid_price, bidder_id, timestamp, bidder_email
                   `) // Ensure all needed fields are selected
                  .eq('item_id', id)
                  .order('timestamp', { ascending: false }); // Latest first is important

                if (bError) throw bError;
                setBids(bData ?? []);
            } else {
                // If listing wasn't found by ID, set error
                setError("Listing not found.");
                setBids([]); // Ensure bids are empty
            }

        } catch (err) { /* ... error handling ... */
             console.error("Error loading data:", err);
             let message = 'An unknown error occurred loading data';
             if (err instanceof Error) { message = err.message; }
             else if (typeof err === 'string') { message = err; }
             setError(`Failed to load listing: ${message}`);
             setListing(null); // Ensure listing is null on error
        } finally {
            setLoading(false);
        }
    };
    load();

    // --- FIX: Correct Realtime subscription calls ---
    const channelName = `bids-listing-${id}`; // Define channel name
    const bidsChannel = supabase.channel(channelName); // Provide channel name

    bidsChannel.on(
        'postgres_changes', // Argument 1: type
        { // Argument 2: filter object
            event: 'INSERT', // Listen only to inserts for simplicity now
            schema: 'public',
            table: 'bids',
            filter: `item_id=eq.${id}`
        },
        // Argument 3: callback function
        async (payload) => {
            console.log('New bid detected via RT!', payload.new?.id); // Use optional chaining
            // Refetch the specific new bid with email details
            if (payload.new?.id) {
                try {
                    const { data: newBidDetails, error: fetchError } = await supabase
                        .from('bids_with_bidder_email')
                        .select('id, bid_price, bidder_id, timestamp, bidder_email')
                        .eq('id', payload.new.id)
                        .single();
                    if (fetchError) throw fetchError;
                    if (newBidDetails) {
                        // Prepend new bid to state, ensure no duplicates
                        setBids((currentBids) => [
                            newBidDetails as Bid,
                            ...currentBids.filter(b => b.id !== newBidDetails.id)
                        ]);
                    }
                } catch (e) { console.error("RT: Exception fetching new bid details:", e); }
            }
        }
      )
      .subscribe((status, err) => { // Subscribe callback
        if (status === 'SUBSCRIBED') { console.log(`RT subscribed: bids ${id}`); }
        if (status === 'CHANNEL_ERROR') { console.error(`RT error: bids ${id}`, err); setError('Realtime connection error.'); }
       });
    // --- End FIX ---

    // Cleanup function
    return () => { supabase.removeChannel(bidsChannel); };

  }, [id]); // Dependency array

  // placeBid function
  const placeBid = async () => {
    setBidStatusMessage(null);
    // --- FIX: Add null check for listing before accessing properties ---
    if (!user) return router.push('/auth');
    if (!listing) { console.error("placeBid: listing is null"); return; } // Should not happen if UI is correct

    if (listing.end_time && isPast(listing.end_time)) { const msg = "This auction has already ended."; setBidStatusMessage(`⚠️ ${msg}`); return; }
    const amt = parseFloat(price);
    // --- FIX: Add null check for bids[0] before accessing property ---
    const currentHighestBid = bids[0]?.bid_price ?? 0; // Use nullish coalescing
    const minBidRequired = Math.max(listing.min_price, currentHighestBid);
    if (isNaN(amt) || amt <= minBidRequired) { const msg = `Bid must be greater than ${formatCurrency(minBidRequired)}`; setBidStatusMessage(`⚠️ ${msg}`); return; }
    const { error: insertError } = await supabase.from('bids').insert({ item_id: id, bidder_id: user.id, bid_price: amt });
    if (!insertError) { setPrice(''); setBidStatusMessage('✅ Bid placed successfully!'); }
    else { /* ... error handling ... */
        console.error("Bid insert error:", insertError);
        let message = `Bid failed: ${insertError.message}`;
        if (insertError.message.includes('violates row-level security policy')) { message = "Bid failed: You cannot bid on your own listing."; }
        setBidStatusMessage(`❌ ${message}`);
    }
    setTimeout(() => { setBidStatusMessage(null); }, 3000);
  };

  // Render Logic
  if (loading) { return ( <div className="max-w-xl mx-auto px-4 py-10"><LoadingSpinner /></div> ); }
  // --- FIX: Ensure error check happens AFTER loading is false ---
  if (error) return <p className="p-6 text-center text-red-600">{error}</p>;
  // --- FIX: Add null check before accessing listing properties ---
  if (!listing) return <p className="p-6 text-center">Listing not found.</p>;

  // Prepare display variables (safe now due to check above)
  const timeString = formatRelativeTime(listing.end_time);
  const auctionEnded = listing.end_time ? isPast(listing.end_time) : false;
  // --- FIX: Add null check for bids[0] ---
  const highestBid = bids[0] ?? null;

  return (
    <main className="max-w-xl mx-auto px-4 py-10 space-y-6">
        {/* Image */}
        {listing.photos && ( <> {/* eslint-disable-next-line @next/next/no-img-element */} <img src={listing.photos} alt={`Photo for ${listing.title}`} className="rounded mb-4 w-full h-auto object-cover" /> </> )}
        {/* Details Section */}
        <section className="space-y-2 border-b pb-4">
             <h1 className="text-3xl font-bold text-gray-900">{listing.title}</h1>
             {listing.seller_email && ( <p className="text-sm text-gray-600"> Sold by: <span className="font-medium text-gray-800">{listing.seller_email}</span> </p> )}
             <p className="text-gray-700 pt-2">{listing.description}</p>
             <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm pt-2">
                 <p className="font-semibold"> Min Price: <span className="text-indigo-700 font-bold">{formatCurrency(listing.min_price)}</span> </p>
                 {listing.upper_cap && listing.upper_cap > 0 && ( <p className="font-semibold"> Buy Now Price: <span className="text-purple-700 font-bold">{formatCurrency(listing.upper_cap)}</span> </p> )}
             </div>
             {timeString && ( <p className={`text-sm font-medium ${auctionEnded ? 'text-red-600' : 'text-gray-600'}`}> {timeString} </p> )}
        </section>
        {/* Rules Section */}
        {listing.rules && ( <section className="p-4 border rounded-md bg-gray-50 space-y-1"> <h3 className="text-sm font-semibold text-gray-700">Auction Rules:</h3> <p className="text-sm text-gray-600 whitespace-pre-wrap">{listing.rules}</p> </section> )}
        {/* Highest Bid Section */}
        <section className="bg-green-50 p-4 rounded border border-green-200">
             <h2 className="text-xl font-semibold mb-1 text-green-800">Current Highest Bid:</h2>
             {/* --- FIX: Check highestBid object before accessing properties --- */}
             {highestBid ? ( <div>
                 <p className="text-2xl font-bold text-green-700">{formatCurrency(highestBid.bid_price)}</p>
                 {highestBid.bidder_email && ( <p className="text-xs text-gray-600 mt-1"> by <span className="font-medium">{highestBid.bidder_email}</span></p> )}
              </div> )
             : ( <p className="text-lg text-gray-600">No bids yet. Be the first!</p> )}
        </section>
        {/* Bid Form Section */}
        <section>
            {user && !auctionEnded && (
                <div className="p-4 border rounded bg-white shadow-sm">
                    <h3 className="text-lg font-semibold mb-3 text-gray-800">Place Your Bid</h3>
                    <div className="flex items-center space-x-3">
                        {/* --- FIX: Add null check for bids[0] --- */}
                        <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder={`Your bid ( > ${formatCurrency(Math.max(listing.min_price, bids[0]?.bid_price ?? 0))} )`} className="border px-3 py-2 rounded w-full focus:ring-indigo-500 focus:border-indigo-500" step="any" min="0" />
                        <button onClick={placeBid} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded font-medium transition duration-150 ease-in-out whitespace-nowrap">Place Bid</button>
                    </div>
                    {bidStatusMessage && ( <p className={`mt-3 text-sm ${bidStatusMessage.startsWith('✅') ? 'text-green-600' : bidStatusMessage.startsWith('⚠️') ? 'text-yellow-700' : 'text-red-600'}`}> {bidStatusMessage} </p> )}
                </div>
            )}
            {user && auctionEnded && ( <div className="p-4 border rounded bg-gray-100 text-gray-600 text-center">This auction has ended.</div> )}
            {!user && ( <div className="p-4 border rounded bg-yellow-50 text-yellow-800 text-center"> Please <Link href="/auth" className="font-bold underline hover:text-yellow-900">log in</Link> to place a bid. </div> )}
        </section>
        {/* Bid History Section */}
        <section className="pt-6 border-t">
             <h2 className="text-2xl font-semibold mb-4 text-gray-800">Bid History</h2>
             {bids.length === 0 ? ( <p className="text-gray-600">No bids have been placed yet.</p> )
             : ( <ul className="space-y-3 max-h-96 overflow-y-auto pr-2"> {bids.map((bid) => (
                 <li key={bid.id} className="p-3 border rounded bg-gray-50 flex justify-between items-center text-sm">
                     <div>
                         <span className="font-semibold text-indigo-800">{formatCurrency(bid.bid_price)}</span>
                         {bid.bidder_email && ( <span className="text-xs text-gray-500 ml-2">by {bid.bidder_email}</span> )}
                     </div>
                     <span className="text-xs text-gray-500"> {new Date(bid.timestamp).toLocaleString()} </span>
                 </li> ))}
                 </ul>
             )}
        </section>
    </main>
  );
}