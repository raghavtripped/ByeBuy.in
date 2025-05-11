// src/components/ListingCard.tsx
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { formatCurrency } from '@/lib/formatUtils';
import WatchlistButton from '@/components/WatchlistButton'; // Import WatchlistButton
import { User } from '@/lib/supabaseClient'; // Import User type if needed for currentUser prop
import { formatRelativeTime, isPast } from '@/lib/timeUtils'; // For optional time display on card

// Define a consistent Listing type for the card
// This should match the fields you fetch for both /listings and /my-watchlist
export type ListingCardItem = {
  id: string;
  title: string;
  min_price: number;
  photos: string[] | null;
  current_highest_bid?: number | null;
  end_time?: string | null; // Make optional if not always present or needed
  status: 'active' | 'closed' | 'cancelled' | string; // Keep flexible
  // Add any other fields your card might display, e.g., tags for category
  // tags?: string[] | null; 
};

interface ListingCardProps {
  listing: ListingCardItem;
  currentUser: User | null; // Pass the current user to the card
  // Add any other props the card might need, e.g., for different contexts
}

export default function ListingCard({ listing, currentUser }: ListingCardProps) {
  const thumbnailUrl = (listing.photos && listing.photos.length > 0) ? listing.photos[0] : null;
  const isEffectivelyEnded = listing.status !== 'active' || (listing.end_time && isPast(listing.end_time));


  return (
    <li className="group relative flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-1">
      <div className="absolute top-2 right-2 z-10">
        {/* WatchlistButton positioned on the card */}
        {currentUser !== undefined && listing && ( // Check if currentUser state is determined
          <WatchlistButton listingId={listing.id} userId={currentUser?.id} size="sm" />
        )}
      </div>
      <Link href={`/listings/${listing.id}`} className="flex flex-col flex-grow">
        <div className="aspect-video w-full bg-gray-100 dark:bg-gray-700 overflow-hidden relative rounded-t-lg">
          {thumbnailUrl ? (
            <Image
              src={thumbnailUrl}
              alt={`Cover image for ${listing.title}`}
              fill
              style={{ objectFit: 'cover' }}
              className="transition-transform duration-300 group-hover:scale-105"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
              priority={false} // Generally false for list items, true for LCP hero images
              onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder-image.svg'; }} // Fallback
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-500">
              <svg className="h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            </div>
          )}
        </div>
        <div className="p-4 flex flex-col flex-grow">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1.5 line-clamp-2 leading-snug group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
            {listing.title}
          </h3>
          <div className="mt-auto pt-2 space-y-1 text-sm border-t border-gray-100 dark:border-gray-700/50">
            <p className="text-gray-600 dark:text-gray-400">
              Min Bid:{' '}
              <span className="font-semibold text-indigo-700 dark:text-indigo-400">
                {formatCurrency(listing.min_price)}
              </span>
            </p>
            {listing.status === 'active' && listing.current_highest_bid && listing.current_highest_bid > 0 ? (
              <p className="text-gray-600 dark:text-gray-400">
                Top Bid:{' '}
                <span className="font-semibold text-green-700 dark:text-green-300">
                  {formatCurrency(listing.current_highest_bid)}
                </span>
              </p>
            ) : listing.status === 'active' ? (
              <p className="text-gray-500 dark:text-gray-500 italic">No bids yet</p>
            ) : null}
            {/* Optional: Display status or end time more prominently if needed */}
            {listing.end_time && listing.status === 'active' && !isEffectivelyEnded && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                Ends {formatRelativeTime(listing.end_time)}
              </p>
            )}
            {isEffectivelyEnded && listing.status !== 'active' && (
              <p className={`text-xs font-medium mt-0.5 ${
                listing.status === 'closed' ? 'text-green-600 dark:text-green-400' 
                : listing.status === 'cancelled' ? 'text-yellow-600 dark:text-yellow-400' 
                : 'text-gray-500 dark:text-gray-400'
              }`}>
                Status: {listing.status.charAt(0).toUpperCase() + listing.status.slice(1)}
              </p>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}