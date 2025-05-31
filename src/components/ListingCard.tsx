// src/components/ListingCard.tsx
import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { formatCurrency } from '@/lib/formatUtils';
import { formatRelativeTime, isPast } from '@/lib/timeUtils';

export type ListingCardItem = {
  id: string;
  title: string;
  min_price: number;
  photos: string[] | null;
  current_highest_bid?: number | null;
  end_time?: string | null;
  status: 'active' | 'closed' | 'cancelled' | string;
};

interface ListingCardProps {
  listing: ListingCardItem;
  className?: string; // <--- ADDED THIS LINE
}

export default function ListingCard({ listing, className = '' }: ListingCardProps) {
  const thumbnailUrl = (listing.photos && listing.photos.length > 0) ? listing.photos[0] : null;
  const isEffectivelyEnded = listing.status !== 'active' || (listing.end_time && isPast(listing.end_time));

  return (
    <li className={`group relative flex flex-col bg-white dark:bg-bye-dark-bg-secondary rounded-lg shadow border border-gray-200 dark:border-bye-dark-border-primary overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-1 ${className}`}>
      <Link href={`/listings/${listing.id}`} className="flex flex-col flex-grow">
        <div className="aspect-video w-full bg-gray-100 dark:bg-bye-dark-bg-hover overflow-hidden relative rounded-t-lg">
          {thumbnailUrl ? (
            <Image
              src={thumbnailUrl}
              alt={`Cover image for ${listing.title}`}
              fill
              style={{ objectFit: 'cover' }}
              className="transition-transform duration-300 group-hover:scale-105"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
              priority={false}
              onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder-image.svg'; }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400 dark:text-bye-dark-text-secondary opacity-50">
              <svg className="h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            </div>
          )}
        </div>
        <div className="p-4 flex flex-col flex-grow">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-bye-dark-text-primary mb-1.5 line-clamp-2 leading-snug group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
            {listing.title}
          </h3>
          <div className="mt-auto pt-2 space-y-1 text-sm border-t border-gray-100 dark:border-bye-dark-border-primary opacity-80 dark:opacity-100">
            <p className="text-gray-600 dark:text-bye-dark-text-secondary">
              Min Bid:{' '}
              <span className="font-semibold text-indigo-700 dark:text-indigo-400">
                {formatCurrency(listing.min_price)}
              </span>
            </p>
            {listing.status === 'active' && listing.current_highest_bid && listing.current_highest_bid > 0 ? (
              <p className="text-gray-600 dark:text-bye-dark-text-secondary">
                Top Bid:{' '}
                <span className="font-semibold text-green-700 dark:text-green-400">
                  {formatCurrency(listing.current_highest_bid)}
                </span>
              </p>
            ) : listing.status === 'active' ? (
              <p className="text-gray-500 dark:text-bye-dark-text-secondary opacity-75 italic">No bids yet</p>
            ) : null}
            {listing.end_time && listing.status === 'active' && !isEffectivelyEnded && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                Ends {formatRelativeTime(listing.end_time)}
              </p>
            )}
            {isEffectivelyEnded && listing.status !== 'active' && (
              <p className={`text-xs font-medium mt-0.5 ${
                listing.status === 'closed' ? 'text-green-600 dark:text-green-400' 
                : listing.status === 'cancelled' ? 'text-yellow-600 dark:text-yellow-500' 
                : 'text-gray-500 dark:text-bye-dark-text-secondary opacity-75'
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