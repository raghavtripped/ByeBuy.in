'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image'; // Import Next.js Image component
import { supabase, type Session } from '@/lib/supabaseClient';
import LoadingSpinner from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import { formatCurrency } from '@/lib/formatUtils';
import { isPast } from '@/lib/timeUtils';

// ---------- Types --------------------------------------------------
type Listing = {
  id: string;
  title: string;
  description?: string; // <--- MADE OPTIONAL: Not used on this page, prevents TS error
  min_price: number;
  photos: string | null;
  created_at?: string; // Kept for type consistency
  current_highest_bid?: number | null;
  end_time?: string | null;
};

// ---------- Component ---------------------------------------------
export default function ListingsPage() {
  // --- State ---
  const [session, setSession] = useState<Session | null>(null);
  const [rows, setRows] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- Fetch initial data + Realtime Subscription ---
  useEffect(() => {
    // Check user session
    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    // Function to load listings
    const loadListings = async () => {
      setLoading(true);
      setError(null);
      try {
        // Fetch listings with highest bid using the view
        const { data, error: fetchError } = await supabase
          .from('listings_with_highest_bid') // Use the view
          .select(
            `id, title, min_price, photos, current_highest_bid, end_time` // Select only needed fields
          )
          .order('created_at', { ascending: false }); // Order by creation time

        if (fetchError) throw fetchError;
        setRows(data ?? []);
      } catch (err) {
        console.error("Error loading listings:", err);
        setError(err instanceof Error ? err.message : 'Failed to load listings.');
        setRows([]);
      } finally {
        setLoading(false);
      }
    };

    // Initial load
    loadListings();

    // --- Realtime channel for new listings ---
    const listingsChannel = supabase
      .channel('public:listings')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'listings' },
        async (payload) => {
          console.log('New listing detected:', payload.new);
          if (!payload?.new?.id) return;

          // Fetch the newly inserted listing with its highest bid info
          const { data, error } = await supabase
            .from('listings_with_highest_bid')
            .select('id, title, min_price, photos, current_highest_bid, end_time')
            .eq('id', payload.new.id)
            .single();

          if (error) {
            console.error("Error fetching new listing details:", error);
            return;
          }
          // Prepend the new listing to the list
          if (data) {
            setRows((currentRows) => [
              data as Listing,
              ...currentRows.filter((r) => r.id !== data.id), // Avoid potential duplicates
            ]);
          }
        }
      )
      .subscribe((status) => {
         if (status === 'SUBSCRIBED') {
           console.log('Realtime channel subscribed for new listings.');
         } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
           console.error(`Realtime channel error/timeout for listings: ${status}`);
           // Optionally handle reconnection or notify user
         }
       });

    // Cleanup function
    return () => {
      supabase.removeChannel(listingsChannel).then(() => console.log('Realtime channel for listings unsubscribed.'));
    };
  }, []); // Run only once on mount

  // --- Render Guards ---
  if (loading) {
    return (
      <div className="container mx-auto px-4 py-20 flex justify-center">
        <LoadingSpinner message="Loading listings..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8 text-center text-red-600 dark:text-red-400">
        <p className="font-medium">Error loading listings:</p>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  // --- Main JSX ---
  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Header Section */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 sm:mb-8 pb-4 border-b border-gray-200 dark:border-gray-700 gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
          🎯 Current Listings
        </h1>
        {/* Show 'Create Listing' button only if logged in */}
        {session && (
          <Link
            href="/listings/new"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800 transition-colors whitespace-nowrap"
          >
             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 mr-2">
                 <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
             </svg>
            Create Listing
          </Link>
        )}
      </header>

      {/* Listings Grid or Empty State */}
      {rows.length === 0 ? (
        <EmptyState
          message="No listings available right now."
          action={
            session
              ? { href: '/listings/new', text: 'Be the first to list an item!' }
              : { href: '/auth', text: 'Login to List an Item' }
          }
        />
      ) : (
        <ul
          role="list"
          className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" // Added xl:grid-cols-4
        >
          {/* Map over listings and render a card for each */}
          {rows.map((listing) => {
            const hasEnded = listing.end_time ? isPast(listing.end_time) : false;

            return (
              <li
                key={listing.id}
                // Apply subtle visual changes if the listing has ended
                data-ended={hasEnded} // Use data attribute for group styling
                className="group relative flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-1 group-data-[ended=true]:opacity-80 group-data-[ended=true]:hover:opacity-90"
              >
                 {/* "Ended" Badge - positioned absolutely */}
                 {hasEnded && (
                  <span className="absolute top-2.5 right-2.5 z-10 inline-flex items-center rounded-full bg-red-100 dark:bg-red-800/80 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-200 shadow-sm ring-1 ring-inset ring-red-600/20 dark:ring-red-500/30">
                    Ended
                  </span>
                )}

                {/* Link wraps the entire card content */}
                <Link href={`/listings/${listing.id}`} className="flex flex-col flex-grow">
                    {/* Image Section */}
                    <div className="aspect-video w-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                        {listing.photos ? (
                            <Image // Use Next.js Image for optimization
                                src={listing.photos}
                                alt={`Image for ${listing.title}`}
                                width={400} // Provide base width hint
                                height={225} // Provide base height hint (16:9)
                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                priority={false} // Only prioritize above-the-fold images if needed
                            />
                        ) : (
                            // Placeholder SVG if no image
                            <div className="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-500">
                                <svg className="h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                            </div>
                        )}
                    </div>

                    {/* Content Section */}
                    <div className="p-4 flex flex-col flex-grow">
                        {/* Title */}
                        <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2 line-clamp-2 leading-snug group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                            {listing.title}
                        </h3>

                        {/* Price & Bid Info (Pushed to bottom) */}
                        <div className="mt-auto pt-3 space-y-1 text-sm border-t border-gray-200 dark:border-gray-700">
                            {/* Minimum Price */}
                            <p className="text-gray-600 dark:text-gray-400">
                                Min:{' '}
                                <span className="font-semibold text-indigo-700 dark:text-indigo-400">
                                    {formatCurrency(listing.min_price)}
                                </span>
                            </p>
                            {/* Current Highest Bid or No Bids */}
                            {listing.current_highest_bid && listing.current_highest_bid > 0 ? (
                                <p className="text-gray-600 dark:text-gray-400">
                                    Top Bid:{' '}
                                    <span className="font-semibold text-green-700 dark:text-green-300">
                                        {formatCurrency(listing.current_highest_bid)}
                                    </span>
                                </p>
                            ) : (
                                <p className="text-gray-500 dark:text-gray-500 italic">
                                    No bids yet
                                </p>
                            )}
                        </div>
                    </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}