// src/app/listings/(detail)/[id]/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react'; // Add useCallback back if needed for future optimization, safe to keep
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase, User } from '@/lib/supabaseClient';
// --- FIX: Combine imports from timeUtils ---
import { formatRelativeTime, isPast, formatCountdown } from '@/lib/timeUtils';
import { formatCurrency } from '@/lib/formatUtils';
import LoadingSpinner from '@/components/LoadingSpinner';

// Type Definitions
type Listing = {
    id: string; title: string; description: string; min_price: number; photos: string | null;
    end_time?: string | null; upper_cap?: number | null; rules?: string | null; seller_email?: string | null; seller_id?: string;
};
type Bid = {
    id: string; bid_price: number; bidder_id: string; timestamp: string; bidder_email?: string | null;
};

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
  const [countdown, setCountdown] = useState<string | null>(null); // State for live timer string

  /* ----------------------------- data loading useEffect ---------------------------- */
  useEffect(() => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!id || !uuidRegex.test(id)) { setError("Listing not found."); setLoading(false); return; }

    setLoading(true); setError(null); setListing(null); setBids([]); setPrice('');
    supabase.auth.getUser().then(({ data }) => setUser(data.user));

    const load = async () => { /* ... same load logic ... */
        try {
            const { data: lData, error: lError } = await supabase.from('listings_with_seller_email').select(/*...*/).eq('id', id).maybeSingle();
            if (lError) throw lError;
            setListing(lData ?? null);
            if (lData) {
                const { data: bData, error: bError } = await supabase.from('bids_with_bidder_email').select(/*...*/).eq('item_id', id).order('timestamp', { ascending: false });
                if (bError) throw bError;
                setBids(bData ?? []);
            } else { setError("Listing not found."); setBids([]); }
        } catch (err) { /* ... error handling ... */
            console.error("Error loading data:", err);
            let message = 'An unknown error occurred loading data';
            if (err instanceof Error) { message = err.message; }
            setError(`Failed to load listing: ${message}`); setListing(null);
        } finally { setLoading(false); }
    };
    load();

    // Realtime subscription
    const channelName = `bids-listing-${id}`;
    const bidsChannel = supabase.channel(channelName);
    bidsChannel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bids', filter: `item_id=eq.${id}` },
        async (payload) => { /* ... RT callback logic ... */
            if (payload.new?.id) {
                try {
                    const { data: newBidDetails, error: fetchError } = await supabase.from('bids_with_bidder_email').select(/*...*/).eq('id', payload.new.id).single();
                    if (fetchError) throw fetchError;
                    if (newBidDetails) { setBids((currentBids) => [ newBidDetails as Bid, ...currentBids.filter(b => b.id !== newBidDetails.id) ]); }
                } catch (e) { console.error("RT: Exception fetching new bid details:", e); }
            }
        }
    ).subscribe((status, err) => { /* ... subscribe callback ... */
        if (status === 'SUBSCRIBED') { console.log(`RT subscribed: bids ${id}`); }
        if (status === 'CHANNEL_ERROR') { console.error(`RT error: bids ${id}`, err); setError('Realtime connection error.'); }
    });
    return () => { supabase.removeChannel(bidsChannel); };
  }, [id]);

  /* ----------------------------- Timer useEffect ---------------------------- */
  useEffect(() => {
    if (!listing || !listing.end_time || isPast(listing.end_time)) {
        setCountdown(null); return;
    }
    let intervalId: number | undefined = undefined;
    const updateTimer = () => {
        const remaining = formatCountdown(listing.end_time);
        setCountdown(remaining);
        if (remaining === null && intervalId) { // Check intervalId exists before clearing
            clearInterval(intervalId);
            console.log(`Timer stopped for listing ${listing.id} as it ended.`);
        }
    };
    updateTimer(); // Initial call
    intervalId = window.setInterval(updateTimer, 1000); // Use window.setInterval for clarity on type
    console.log(`Timer started for listing ${listing.id}, interval ID: ${intervalId}`);
    return () => {
        if (intervalId) { // Check intervalId exists before clearing
            console.log(`Clearing timer interval ID: ${intervalId} for listing ${listing.id}`);
            clearInterval(intervalId);
        }
    };
  }, [listing, listing?.end_time]); // Dependencies


  /* ------------------------------ placeBid Function ------------------------------ */
  const placeBid = async () => {
    setBidStatusMessage(null);
    if (!user) return router.push('/auth');
    if (!listing) { console.error("placeBid: listing is null"); return; }
    if (listing.end_time && isPast(listing.end_time)) { const msg = "This auction has already ended."; setBidStatusMessage(`⚠️ ${msg}`); return; }
    const amt = parseInt(price, 10);
    if (isNaN(amt) || !Number.isInteger(amt) || amt <= 0) { setBidStatusMessage(`⚠️ Please enter a valid whole number bid amount.`); return; }
    const currentHighestBid = bids[0]?.bid_price ?? 0;
    const minBidRequired = Math.max(listing.min_price, currentHighestBid);
    if (amt <= minBidRequired) { const msg = `Bid must be greater than ${formatCurrency(minBidRequired)}`; setBidStatusMessage(`⚠️ ${msg}`); return; }
    if (listing.upper_cap && listing.upper_cap > 0) {
        if (amt > listing.upper_cap) { const msg = `Bid cannot exceed the Buy Now price of ${formatCurrency(listing.upper_cap)}.`; setBidStatusMessage(`⚠️ ${msg}`); return; }
        if (amt === listing.upper_cap) { const msg = `Bidding ${formatCurrency(listing.upper_cap)} triggers the Buy Now option (feature coming soon!). Please use the Buy Now button when available or place a lower bid.`; setBidStatusMessage(`⚠️ ${msg}`); return; }
    }
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
  /* --------------------------------------------------------------------------------- */


  /* ------------------------------ Render Logic ------------------------------------- */
  if (loading) { return ( <div className="max-w-xl mx-auto px-4 py-10"><LoadingSpinner /></div> ); }
  if (error) return <p className="p-6 text-center text-red-600">{error}</p>;
  if (!listing) return <p className="p-6 text-center">Listing not found.</p>;

  // --- FIX: Restore timeString calculation ---
  const timeString = formatRelativeTime(listing.end_time); // Used as fallback
  const auctionEnded = listing.end_time ? isPast(listing.end_time) : false;
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
             <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm pt-2"> <p className="font-semibold"> Min Price: <span className="text-indigo-700 font-bold">{formatCurrency(listing.min_price)}</span> </p> {listing.upper_cap && listing.upper_cap > 0 && ( <p className="font-semibold"> Buy Now Price: <span className="text-purple-700 font-bold">{formatCurrency(listing.upper_cap)}</span> </p> )} </div>
             {/* --- FIX: Use timeString as fallback --- */}
             {listing.end_time && (
                 <p className={`text-sm font-medium ${auctionEnded ? 'text-red-600' : 'text-gray-600'}`}>
                     {countdown !== null ? `Ends in ${countdown}` : timeString} {/* Display countdown or static relative time */}
                 </p>
             )}
        </section>
        {/* Rules Section */}
        {listing.rules && ( <section className="p-4 border rounded-md bg-gray-50 space-y-1"> <h3 className="text-sm font-semibold text-gray-700">Auction Rules:</h3> <p className="text-sm text-gray-600 whitespace-pre-wrap">{listing.rules}</p> </section> )}
        {/* Highest Bid Section */}
        <section className="bg-green-50 p-4 rounded border border-green-200"> <h2 className="text-xl font-semibold mb-1 text-green-800">Current Highest Bid:</h2> {highestBid ? ( <div> <p className="text-2xl font-bold text-green-700">{formatCurrency(highestBid.bid_price)}</p> {highestBid.bidder_email && ( <p className="text-xs text-gray-600 mt-1"> by <span className="font-medium">{highestBid.bidder_email}</span></p> )} </div> ) : ( <p className="text-lg text-gray-600">No bids yet. Be the first!</p> )} </section>
        {/* Bid Form Section */}
        <section> {user && !auctionEnded && ( <div className="p-4 border rounded bg-white shadow-sm"> <h3 className="text-lg font-semibold mb-3 text-gray-800">Place Your Bid</h3> <div className="flex items-center space-x-3"> <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder={`Your bid ( > ${formatCurrency(Math.max(listing.min_price, bids[0]?.bid_price ?? 0))} )`} className="border px-3 py-2 rounded w-full focus:ring-indigo-500 focus:border-indigo-500" step="1" min="0" /> <button onClick={placeBid} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded font-medium transition duration-150 ease-in-out whitespace-nowrap">Place Bid</button> </div> {bidStatusMessage && ( <p className={`mt-3 text-sm ${bidStatusMessage.startsWith('✅') ? 'text-green-600' : bidStatusMessage.startsWith('⚠️') ? 'text-yellow-700' : 'text-red-600'}`}> {bidStatusMessage} </p> )} </div> )} {user && auctionEnded && ( <div className="p-4 border rounded bg-gray-100 text-gray-600 text-center">This auction has ended.</div> )} {!user && ( <div className="p-4 border rounded bg-yellow-50 text-yellow-800 text-center"> Please <Link href="/auth" className="font-bold underline hover:text-yellow-900">log in</Link> to place a bid. </div> )} </section>
        {/* Bid History Section */}
        <section className="pt-6 border-t"> <h2 className="text-2xl font-semibold mb-4 text-gray-800">Bid History</h2> {bids.length === 0 ? ( <p className="text-gray-600">No bids have been placed yet.</p> ) : ( <ul className="space-y-3 max-h-96 overflow-y-auto pr-2"> {bids.map((bid) => ( <li key={bid.id} className="p-3 border rounded bg-gray-50 flex justify-between items-center text-sm"> <div> <span className="font-semibold text-indigo-800">{formatCurrency(bid.bid_price)}</span> {bid.bidder_email && ( <span className="text-xs text-gray-500 ml-2">by {bid.bidder_email}</span> )} </div> <span className="text-xs text-gray-500"> {new Date(bid.timestamp).toLocaleString()} </span> </li> ))} </ul> )} </section>
    </main>
  );
}