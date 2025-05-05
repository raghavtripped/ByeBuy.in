// src/app/listings/(detail)/[id]/page.tsx
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

// ---------- Types -------------------------------------------------
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

// ---------- Component --------------------------------------------
export default function ListingDetails() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  // --- State ---
  const [listing, setListing] = useState<Listing | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [price, setPrice] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bidStatusMessage, setBidStatusMessage] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<string | null>(null);

  // --- Load listing + realtime bids ---
  useEffect(() => {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!id || !uuidRegex.test(id)) {
      setError('Invalid listing ID format.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setListing(null);
    setBids([]);
    setPrice('');

    supabase.auth.getUser().then(({ data }) => setUser(data.user));

    const loadData = async () => {
      try {
        // Fetch listing details (including seller email)
        const { data: lData, error: lError } = await supabase
          .from('listings_with_seller_email') // Use the view
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (lError) throw lError;
        if (!lData) {
          setError('Listing not found.');
          setLoading(false);
          return;
        }
        setListing(lData);

        // Fetch bids for this listing (including bidder email)
        const { data: bData, error: bError } = await supabase
          .from('bids_with_bidder_email') // Use the view
          .select('*')
          .eq('item_id', id)
          .order('timestamp', { ascending: false });

        if (bError) throw bError;
        setBids(bData ?? []);

      } catch (err) {
        console.error("Data loading error:", err);
        const msg = err instanceof Error ? err.message : 'Failed to load listing data.';
        setError(`Error: ${msg}`);
      } finally {
        setLoading(false);
      }
    };

    loadData();

    // --- Realtime bids channel ---
    const channel = supabase.channel(`listing-bids-${id}`);
    channel
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bids', filter: `item_id=eq.${id}` },
        async (payload) => {
          console.log('New bid received via realtime:', payload.new);
          if (!payload.new?.id) return;
          // Fetch the new bid with email to maintain consistency
          const { data: newBid, error } = await supabase
            .from('bids_with_bidder_email')
            .select('*')
            .eq('id', payload.new.id)
            .single();
          if (!error && newBid) {
            // Prepend the new bid, ensuring no duplicates if received close together
            setBids((currentBids) => [newBid as Bid, ...currentBids.filter((b) => b.id !== newBid.id)]);
          } else if (error) {
              console.error("Error fetching new bid details:", error);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`Realtime channel subscribed for listing ${id}`);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error(`Realtime channel error/timeout for listing ${id}: ${status}`);
          // Optionally: add retry logic or user notification here
        }
      });

    // Cleanup subscription on component unmount
    return () => {
      supabase.removeChannel(channel).then(() => console.log(`Realtime channel unsubscribed for listing ${id}`));
    };
  }, [id]); // Re-run if listing ID changes

  // --- Countdown timer ---
  useEffect(() => {
    if (!listing?.end_time || isPast(listing.end_time)) {
      setCountdown(null); // Clear countdown if no end time or already past
      return;
    }

    const updateTimer = () => {
      const remaining = formatCountdown(listing.end_time!);
      setCountdown(remaining);
      // If the countdown reaches zero (or goes slightly past due to intervals), clear it
      if (remaining === null) {
          clearInterval(interval);
      }
    };

    updateTimer(); // Initial call
    const interval = window.setInterval(updateTimer, 1000); // Update every second

    return () => clearInterval(interval); // Cleanup interval on unmount or listing change
  }, [listing]); // Re-run if listing data changes (specifically end_time)


  // --- Bid action ---
  const placeBid = async () => {
    setBidStatusMessage(null); // Clear previous messages
    if (!user) return router.push('/auth'); // Redirect if not logged in
    if (!listing) return; // Should not happen if component rendered

    // Prevent bidding if auction ended
    if (listing.end_time && isPast(listing.end_time)) {
      setBidStatusMessage('⚠️ Auction has ended.');
      return;
    }

    // Prevent seller bidding
    if (user.id === listing.seller_id) {
        setBidStatusMessage('⚠️ You cannot bid on your own item.');
        return;
    }

    // Validate bid amount
    const amt = parseInt(price, 10);
    if (isNaN(amt) || amt <= 0) {
      setBidStatusMessage('⚠️ Enter a valid positive whole number bid.');
      return;
    }

    // Validate against minimum required bid
    const currentTop = bids[0]?.bid_price ?? 0;
    const minRequiredBid = Math.max(listing.min_price, currentTop);
    if (amt <= minRequiredBid) {
      setBidStatusMessage(`⚠️ Bid must be higher than ${formatCurrency(minRequiredBid)}.`);
      return;
    }

    // Validate against upper cap (if exists)
    if (listing.upper_cap && amt >= listing.upper_cap) {
      setBidStatusMessage(`⚠️ Bid cannot meet or exceed the Buy Now price (${formatCurrency(listing.upper_cap)}). Consider using Buy Now feature (if implemented).`);
      return;
    }

    // --- Execute Bid Insertion ---
    try {
        const { error: insertError } = await supabase
        .from('bids')
        .insert({ item_id: id, bidder_id: user.id, bid_price: amt });

        if (insertError) throw insertError; // Let catch block handle DB errors

        // Success!
        setPrice(''); // Clear input field
        setBidStatusMessage('✅ Bid placed successfully!');
        // Optional: Clear message after a few seconds
        setTimeout(() => setBidStatusMessage(null), 4000);

    } catch(error) {
        console.error("Bid placement failed:", error);
        // Provide more specific feedback if possible (e.g., from RLS)
        let userMessage = '❌ Bid failed.';
        if (error instanceof Error) {
            // Check for common Supabase errors or RLS violations if you have specific error codes/messages
            if (error.message.includes("check constraint") || error.message.includes("row level security")) {
                userMessage = '❌ Bid failed. Check auction rules or minimum bid.';
            } else {
                userMessage = `❌ Bid failed: ${error.message}`;
            }
        }
        setBidStatusMessage(userMessage);
    }
  };

  // --- Render Guards ---
  if (loading) return <div className="flex justify-center py-20"><LoadingSpinner message="Loading listing details..." /></div>;
  if (error) return <p className="p-6 text-center text-red-600 dark:text-red-400 font-medium">{error}</p>;
  if (!listing) return <p className="p-6 text-center text-gray-700 dark:text-gray-300">Listing details could not be loaded.</p>;

  // --- Derived State for Rendering ---
  const auctionEnded = listing.end_time ? isPast(listing.end_time) : false;
  const timeDisplay = auctionEnded
    ? `Ended ${formatRelativeTime(listing.end_time)}`
    : countdown !== null
      ? `Ends in: ${countdown}`
      : `Ends ${formatRelativeTime(listing.end_time)}`; // Fallback relative time if countdown isn't running

  const highestBid = bids[0] ?? null; // Get the most recent bid (highest due to ordering)

  // --- JSX ---
  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8">
      {/* --- Top Section: Image + Title + Seller + Time --- */}
      <section className="flex flex-col md:flex-row gap-6 md:gap-8 items-start">
        {/* Image */}
        {listing.photos && (
            <div className="w-full md:w-1/2 flex-shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={listing.photos}
                    alt={`Photo for ${listing.title}`}
                    className="rounded-lg shadow-md w-full h-auto object-cover aspect-square" // Added aspect ratio
                />
            </div>
        )}

        {/* Details Column */}
        <div className={`w-full ${listing.photos ? 'md:w-1/2' : ''} space-y-4`}>
            {/* Title */}
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100 break-words">
                {listing.title}
            </h1>

            {/* Seller Info */}
            {listing.seller_email && (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                    Sold by:{' '}
                    <span className="font-medium text-gray-800 dark:text-gray-200">
                    {listing.seller_email}
                    </span>
                </p>
            )}

             {/* --- Price Info & Highest Bid Block --- */}
            <div className="flex flex-col sm:flex-row gap-4 pt-2">
                {/* Left Side: Min/Buy Now Prices */}
                <div className="flex-1 space-y-2 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-md border border-gray-200 dark:border-gray-700">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Minimum Bid:
                    </p>
                    <p className="text-xl font-bold text-indigo-700 dark:text-indigo-400">
                        {formatCurrency(listing.min_price)}
                    </p>
                    {listing.upper_cap && listing.upper_cap > 0 && (
                        <div className="pt-1">
                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Buy Now Price:
                            </p>
                             <p className="text-xl font-bold text-purple-700 dark:text-purple-400">
                                {formatCurrency(listing.upper_cap)}
                            </p>
                        </div>
                    )}
                </div>

                {/* Right Side: Current Highest Bid */}
                <div className="flex-1 space-y-1 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-md border border-gray-200 dark:border-gray-700">
                     <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Current Highest Bid:
                    </h3>
                    {highestBid ? (
                        <>
                            <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                                {formatCurrency(highestBid.bid_price)}
                            </p>
                            {highestBid.bidder_email && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 pt-1">
                                    by <span className="font-medium text-gray-700 dark:text-gray-300">{highestBid.bidder_email}</span>
                                </p>
                            )}
                        </>
                    ) : (
                        <p className="text-lg text-gray-500 dark:text-gray-400 pt-2">
                            No bids yet.
                        </p>
                    )}
                </div>
            </div>


            {/* Time Remaining/Ended */}
            {listing.end_time && (
                <p className={`text-sm font-medium pt-2 ${
                    auctionEnded ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-300'
                }`}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 inline-block mr-1 align-text-bottom">
                        <path fillRule="evenodd" d="M8 1.75a.75.75 0 0 1 .75.75v5.5a.75.75 0 0 1-1.5 0V2.5A.75.75 0 0 1 8 1.75ZM8 14a.75.75 0 0 1 .75.75v.01a.75.75 0 0 1-1.5 0v-.01A.75.75 0 0 1 8 14ZM4.21 3.97a.75.75 0 0 1 1.06 0l.74.745a.75.75 0 1 1-1.06 1.06l-.745-.74a.75.75 0 0 1 0-1.06Zm6.52 0a.75.75 0 0 1 0 1.06l-.74.745a.75.75 0 1 1-1.06-1.06l.74-.74a.75.75 0 0 1 1.06 0ZM1.75 8a.75.75 0 0 1 .75-.75h.01a.75.75 0 0 1 0 1.5H2.5a.75.75 0 0 1-.75-.75Zm11.5 0a.75.75 0 0 1 .75-.75h.01a.75.75 0 0 1 0 1.5h-.01a.75.75 0 0 1-.75-.75ZM4.21 10.97a.75.75 0 0 1 0 1.06l-.745.74a.75.75 0 1 1-1.06-1.06l.74-.74a.75.75 0 0 1 1.06 0Zm6.52 0a.75.75 0 0 1 1.06 0l.74.74a.75.75 0 1 1-1.06 1.06l-.74-.74a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                         <path d="M8 4.75a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0V5.5a.75.75 0 0 1 .75-.75Z" /> {/* Clock icon */}
                    </svg>
                    {timeDisplay}
                </p>
            )}
        </div>
      </section>

      {/* --- Description --- */}
      <section>
          <h3 className="text-lg font-semibold mb-2 text-gray-800 dark:text-gray-200">Description</h3>
          <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800">
              <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {listing.description || <span className="text-gray-500 italic">No description provided.</span>}
              </p>
          </div>
      </section>

      {/* --- Rules --- */}
      {listing.rules && (
        <section>
            <h3 className="text-lg font-semibold mb-2 text-gray-800 dark:text-gray-200">Auction Rules</h3>
            <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-800/50">
                <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                    {listing.rules}
                </p>
            </div>
        </section>
      )}


      {/* --- Bid Form / Login Prompt / Auction Ended / Seller Prompt --- */}
      <section>
        {/* Case 1: User logged in, not seller, auction active */}
        {user && user.id !== listing.seller_id && !auctionEnded && (
          <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 shadow-sm">
            <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-white">
              Place Your Bid
            </h3>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="flex-grow">
                  <label htmlFor="bidAmount" className="sr-only">Bid Amount</label>
                  <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 dark:text-gray-400 pointer-events-none">₹</span>
                      <input
                          id="bidAmount"
                          type="number"
                          value={price}
                          onChange={(e) => setPrice(e.target.value)}
                           placeholder={`Bid > ${formatCurrency(Math.max(listing.min_price, highestBid?.bid_price ?? 0))}${listing.upper_cap ? ` (Max: ${formatCurrency(listing.upper_cap - 1)})` : ''}`}
                          className="pl-7 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md w-full focus:ring-indigo-500 focus:border-indigo-500 text-sm dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500" // Dark placeholder adjusted
                          step="1"
                          min="1" // Sensible minimum step
                      />
                  </div>
              </div>
              <button
                onClick={placeBid}
                className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white px-6 py-2 rounded-md font-medium transition whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
              >
                Place Bid
              </button>
            </div>
            {/* Bid Status Message */}
            {bidStatusMessage && (
              <p className={`mt-3 text-sm font-medium ${bidStatusMessage.startsWith('✅') ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {bidStatusMessage}
              </p>
            )}
          </div>
        )}

        {/* Case 2: User is the seller, auction active */}
        {user && user.id === listing.seller_id && !auctionEnded && (
             <div className="p-3 border border-yellow-300 dark:border-yellow-700 rounded-md bg-yellow-50 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 text-center text-sm">
                You cannot place bids on your own listing.
            </div>
        )}

        {/* Case 3: Auction has ended */}
        {auctionEnded && (
          <div className="p-3 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-center text-sm font-medium">
            This auction has ended.
          </div>
        )}

        {/* Case 4: User not logged in */}
        {!user && (
          <div className="p-3 border border-blue-200 dark:border-blue-700 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 text-center text-sm">
            Please{' '}
            <Link href="/auth" className="font-bold underline hover:text-blue-900 dark:hover:text-blue-200">
              log in
            </Link>{' '}
            to place a bid.
          </div>
        )}
      </section>


      {/* --- Bid History --- */}
      <section className="pt-8 border-t border-gray-200 dark:border-gray-700">
        <h2 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-white">
          Bid History ({bids.length})
        </h2>

        {bids.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400">No bids have been placed yet.</p>
        ) : (
          <ul className="space-y-3 max-h-[400px] overflow-y-auto pr-2 -mr-2"> {/* Adjusted max height & padding */}
            {bids.map((bid, index) => (
              <li
                key={bid.id}
                className={`p-3 border rounded-md flex justify-between items-center text-sm ${
                    index === 0 ? 'bg-green-50 dark:bg-green-900/40 border-green-200 dark:border-green-700' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                }`} // Highlight highest bid
              >
                {/* Left side: Bid Amount + Bidder */}
                <div>
                  <span className={`font-semibold ${index === 0 ? 'text-green-800 dark:text-green-300' : 'text-indigo-800 dark:text-indigo-400'}`}>
                    {formatCurrency(bid.bid_price)}
                  </span>
                  {bid.bidder_email && (
                    <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                      by {bid.bidder_email}
                    </span>
                  )}
                </div>
                {/* Right side: Timestamp */}
                <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 ml-4">
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