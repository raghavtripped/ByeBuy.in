// src/app/my-bids/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase, User } from '@/lib/supabaseClient';

// Type for the combined data we'll display
type MyBidDisplayItem = {
  listingId: string;
  listingTitle: string;
  listingEndTime: string | null;
  userHighestBid: number; // The highest bid placed by the current user on this item
  currentHighestBid: number; // The overall highest bid currently on this item
  isUserWinning: boolean; // Is the current user the highest bidder?
  listingPhoto: string | null;
};

// FIX 1: Removed unused AssociatedListing type
// type AssociatedListing = {
//     id: string;
//     title: string;
//     end_time: string | null;
//     photos: string | null;
// };

// Type for the bid data we fetch
type BidInfo = {
    id: string;
    item_id: string;
    bidder_id: string;
    bid_price: number;
};


export default function MyBidsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [bidItems, setBidItems] = useState<MyBidDisplayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMyBids = async () => {
      setLoading(true);
      setError(null);
      setBidItems([]); // Reset on fetch

      // 1. Get User
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData?.user) {
        console.error('User not logged in:', userError?.message);
        router.push('/auth');
        return;
      }
      const currentUser = userData.user;
      setUser(currentUser);

      try {
        // 2. Fetch all bids placed by the current user
        const { data: userBidsData, error: userBidsError } = await supabase
          .from('bids')
          .select('id, item_id, bidder_id, bid_price')
          .eq('bidder_id', currentUser.id);

        if (userBidsError) throw userBidsError;
        if (!userBidsData || userBidsData.length === 0) {
          setLoading(false);
          return; // Exit early if no bids placed
        }

        // 3. Get unique listing IDs the user has bid on
        const listingIds = [...new Set(userBidsData.map(bid => bid.item_id))];

        if (listingIds.length === 0) {
            setLoading(false);
            return; // Should not happen if userBidsData is not empty, but safe check
        }

        // 4. Fetch details for these listings
        const { data: listingsData, error: listingsError } = await supabase
          .from('listings')
          .select('id, title, end_time, photos') // Select necessary listing details
          .in('id', listingIds);

        if (listingsError) throw listingsError;

        // 5. Fetch *all* bids for these specific listings
        const { data: allBidsData, error: allBidsError } = await supabase
            .from('bids')
            .select('id, item_id, bidder_id, bid_price')
            .in('item_id', listingIds)
            .order('bid_price', { ascending: false }); // Order highest first (can simplify finding max)

        if (allBidsError) throw allBidsError;

        // 6. Process and combine the data
        const processedItems: MyBidDisplayItem[] = [];
        // Use inferred type for listingsMap or define a local type if preferred
        const listingsMap = new Map(listingsData?.map(l => [l.id, l]));
        const allBidsMap = new Map<string, BidInfo[]>();

        allBidsData?.forEach(bid => {
            if (!allBidsMap.has(bid.item_id)) {
                allBidsMap.set(bid.item_id, []);
            }
            allBidsMap.get(bid.item_id)?.push(bid);
        });


        for (const listingId of listingIds) {
          const listing = listingsMap.get(listingId);
          if (!listing) continue;

          const userBidsForItem = userBidsData.filter(bid => bid.item_id === listingId);
          const userHighestBid = Math.max(...userBidsForItem.map(bid => bid.bid_price), 0);

          const bidsForThisItem = allBidsMap.get(listingId) ?? [];
          let currentHighestBid = 0;
          let highestBidderId = '';
          // Simplified finding highest bid since we ordered the query
          if (bidsForThisItem.length > 0) {
              currentHighestBid = bidsForThisItem[0].bid_price; // Highest is first due to order()
              highestBidderId = bidsForThisItem[0].bidder_id;
          }


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
        setBidItems(processedItems);

      } catch (err) {
        console.error("Error fetching bid data:", err);
        let message = "Failed to load your bids.";
        if (err instanceof Error) {
          message = err.message;
        } else if (typeof err === 'object' && err !== null && 'message' in err) {
          message = String((err as { message: unknown }).message ?? message);
        }
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    fetchMyBids();
  }, [router]);

  // ----- Render Logic -----

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-4 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-800">My Bids</h1>
        <p className="text-center text-gray-600">Loading your bid information...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-4 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-800">My Bids</h1>
        <p className="text-center text-red-600">Error loading bids: {error}</p>
      </div>
    );
  }

  if (!user) {
     return (
       <div className="max-w-4xl mx-auto p-4 sm:p-8">
         <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-800">My Bids</h1>
         <p className="text-center text-gray-600">
           Please <Link href="/auth" className="text-indigo-600 underline">log in</Link> to view your bids.
         </p>
       </div>
     );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-8">
      <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-800">My Bids</h1>

      {bidItems.length === 0 ? (
         <div className="text-center py-10 px-6 bg-white rounded-lg shadow-sm border border-gray-200">
           {/* FIX 2: Disable rule for this line */}
           {/* eslint-disable-next-line react/no-unescaped-entities */}
           <p className="text-gray-600 mb-4">You haven't placed any bids yet.</p>
           <Link
             href="/listings"
             className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-md transition duration-150 ease-in-out"
           >
             Browse Listings
           </Link>
        </div>
      ) : (
        <ul className="space-y-6">
          {bidItems.map((item) => (
            <li key={item.listingId} className="border border-gray-200 p-4 rounded-lg shadow-sm flex flex-col sm:flex-row gap-4 items-start bg-white hover:shadow-md transition-shadow duration-200">
               {item.listingPhoto && (
                <div className="flex-shrink-0 w-full sm:w-[120px] h-[120px] sm:h-[80px] bg-gray-100 rounded overflow-hidden">
                   {/* eslint-disable-next-line @next/next/no-img-element */}
                   <img
                     src={item.listingPhoto}
                     alt={`Cover image for ${item.listingTitle}`}
                     className="w-full h-full object-cover"
                   />
                </div>
              )}
              <div className="flex-grow">
                <Link href={`/listings/${item.listingId}`} className="text-lg font-semibold text-indigo-600 hover:text-indigo-800 hover:underline block mb-2">
                  {item.listingTitle}
                </Link>
                <div className="space-y-1 text-sm">
                    <p>Your Highest Bid: <span className="font-medium text-blue-700">₹{item.userHighestBid.toFixed(2)}</span></p>
                    <p>Current Highest Bid: <span className="font-medium text-green-700">₹{item.currentHighestBid.toFixed(2)}</span></p>
                    <div>
                        Status: {item.isUserWinning ? (
                             <span className="font-medium text-green-600 bg-green-100 px-2 py-0.5 rounded-full text-xs">🎉 Winning</span>
                          ) : (
                             // Corrected typo: Losisng -> Losing
                             <span className="font-medium text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full text-xs"> Losing</span>
                          )
                        }
                    </div>
                     {item.listingEndTime && (
                        <p className="text-xs text-gray-500 pt-1">Auction Ends: {new Date(item.listingEndTime).toLocaleString()}</p>
                     )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}