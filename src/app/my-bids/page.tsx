// src/app/my-bids/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase, User } from '@/lib/supabaseClient';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import { formatCurrency } from '@/lib/formatUtils';

// --- FIX: Restore Correct Type Definition ---
type MyBidDisplayItem = {
  listingId: string;
  listingTitle: string;
  listingEndTime: string | null;
  userHighestBid: number;
  currentHighestBid: number;
  isUserWinning: boolean;
  listingPhoto: string | null;
};
// --- End FIX ---

// Type for fetched bid info (used internally)
type BidInfo = { id: string; item_id: string; bidder_id: string; bid_price: number; };

export default function MyBidsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [bidItems, setBidItems] = useState<MyBidDisplayItem[]>([]); // State uses the correct type
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch My Bids (existing logic is correct)
  useEffect(() => {
      const fetchMyBids = async () => {
          setLoading(true); setError(null); setBidItems([]);
          const { data: userData, error: userError } = await supabase.auth.getUser();
          if (userError || !userData?.user) { router.push('/auth'); return; }
          const currentUser = userData.user; setUser(currentUser);
          try {
              // Fetch user's bids
              const { data: userBidsData, error: userBidsError } = await supabase.from('bids').select('id, item_id, bidder_id, bid_price').eq('bidder_id', currentUser.id);
              if (userBidsError) throw userBidsError;
              if (!userBidsData || userBidsData.length === 0) { setLoading(false); return; }

              // Get unique listing IDs
              const listingIds = [...new Set(userBidsData.map(bid => bid.item_id))];
              if (listingIds.length === 0) { setLoading(false); return; }

              // Fetch listing details
              const { data: listingsData, error: listingsError } = await supabase.from('listings').select('id, title, end_time, photos').in('id', listingIds);
              if (listingsError) throw listingsError;

              // Fetch all bids for those listings
              const { data: allBidsData, error: allBidsError } = await supabase.from('bids').select('id, item_id, bidder_id, bid_price').in('item_id', listingIds).order('bid_price', { ascending: false });
              if (allBidsError) throw allBidsError;

              // Process and combine data (logic remains correct)
              const processedItems: MyBidDisplayItem[] = [];
              const listingsMap = new Map(listingsData?.map(l => [l.id, l]));
              const allBidsMap = new Map<string, BidInfo[]>();
              allBidsData?.forEach(bid => { if (!allBidsMap.has(bid.item_id)) { allBidsMap.set(bid.item_id, []); } allBidsMap.get(bid.item_id)?.push(bid); });

              for (const listingId of listingIds) {
                  const listing = listingsMap.get(listingId); if (!listing) continue;
                  const userBidsForItem = userBidsData.filter(bid => bid.item_id === listingId);
                  const userHighestBid = Math.max(...userBidsForItem.map(bid => bid.bid_price), 0);
                  const bidsForThisItem = allBidsMap.get(listingId) ?? [];
                  let currentHighestBid = 0; let highestBidderId = '';
                  if (bidsForThisItem.length > 0) { currentHighestBid = bidsForThisItem[0].bid_price; highestBidderId = bidsForThisItem[0].bidder_id; }
                  // Ensure the object pushed matches the MyBidDisplayItem type
                  processedItems.push({
                      listingId: listing.id,
                      listingTitle: listing.title,
                      listingEndTime: listing.end_time,
                      userHighestBid: userHighestBid,
                      currentHighestBid: currentHighestBid,
                      isUserWinning: currentHighestBid > 0 && highestBidderId === currentUser.id,
                      listingPhoto: listing.photos,
                  });
              }
              processedItems.sort((a, b) => a.listingTitle.localeCompare(b.listingTitle));
              setBidItems(processedItems); // Set state with correctly typed array

          } catch (err) { /* ... error handling ... */
                console.error("Error fetching bid data:", err);
                let message = "Failed to load your bids.";
                if (err instanceof Error) { message = err.message; }
                else if (typeof err === 'object' && err !== null && 'message' in err) { message = String((err as { message: unknown }).message ?? message); }
                setError(message);
           } finally { setLoading(false); }
      };
      fetchMyBids();
   }, [router]);

  // Render Logic
  if (loading) { return ( <div className="max-w-4xl mx-auto p-4 sm:p-8"><h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-800">My Bids</h1><LoadingSpinner /></div> ); }
  if (error) { return ( <div className="max-w-4xl mx-auto p-4 sm:p-8"><h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-800">My Bids</h1><p className="text-center text-red-600">Error loading bids: {error}</p></div> ); }
  if (!user) { return ( <div className="max-w-4xl mx-auto p-4 sm:p-8"><h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-800">My Bids</h1><p className="text-center text-gray-600">Please <Link href="/auth" className="text-indigo-600 underline">log in</Link> to view your bids.</p></div> ); }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-8">
      <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-800">My Bids</h1>
      {bidItems.length === 0 ? (
         <EmptyState message="You haven't placed any bids yet." action={{ href: '/listings', text: 'Browse Listings' }} />
      ) : (
        <ul className="space-y-6">
          {bidItems.map((item) => { // item is now correctly typed as MyBidDisplayItem
            // Optional Debug Log (can be removed after testing)
            console.log(`DEBUG: Rendering bid item ${item.listingId}:`, { userBid: item.userHighestBid, userBidType: typeof item.userHighestBid, currentBid: item.currentHighestBid, currentBidType: typeof item.currentHighestBid });
            return (
                <li key={item.listingId} className="border border-gray-200 p-4 rounded-lg shadow-sm flex flex-col sm:flex-row gap-4 items-start bg-white hover:shadow-md transition-shadow duration-200">
                   {/* Image Link */}
                  {item.listingPhoto && ( <Link href={`/listings/${item.listingId}`} className="flex-shrink-0 block"> <div className="w-full sm:w-[120px] h-[120px] sm:h-[80px] bg-gray-100 rounded overflow-hidden group"> {/* eslint-disable-next-line @next/next/no-img-element */} <img src={item.listingPhoto} alt={`Cover image for ${item.listingTitle}`} className="w-full h-full object-cover group-hover:opacity-90 transition-opacity" /> </div> </Link> )}
                  {/* Details */}
                  <div className="flex-grow">
                    <Link href={`/listings/${item.listingId}`} className="text-lg font-semibold text-indigo-600 hover:text-indigo-800 hover:underline block mb-2"> {item.listingTitle} </Link>
                    <div className="space-y-1 text-sm">
                        {/* Currency formatting applied */}
                        <p>Your Highest Bid: <span className="font-medium text-blue-700">{formatCurrency(item.userHighestBid)}</span></p>
                        <p>Current Highest Bid: <span className="font-medium text-green-700">{formatCurrency(item.currentHighestBid)}</span></p>
                        <div> Status: {item.isUserWinning ? ( <span className="font-medium text-green-600 bg-green-100 px-2 py-0.5 rounded-full text-xs">🎉 Winning</span> ) : ( <span className="font-medium text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full text-xs"> Losing</span> )} </div>
                        {item.listingEndTime && ( <p className="text-xs text-gray-500 pt-1">Auction Ends: {new Date(item.listingEndTime).toLocaleString()}</p> )}
                    </div>
                  </div>
                </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}