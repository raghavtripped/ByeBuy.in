// src/components/ListingCard.tsx
import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { formatCurrency } from '@/lib/formatUtils';
import { formatRelativeTime, isPast } from '@/lib/timeUtils';
import { 
  ClockIcon, 
  FireIcon, 
  SparklesIcon, 
  TrophyIcon} from '@heroicons/react/24/outline';
import { 
  ClockIcon as ClockIconSolid 
} from '@heroicons/react/24/solid';
import WatchlistButton from '@/components/WatchlistButton';
import { useAuth } from '@/hooks/useAuth';

export type ListingCardItem = {
  id: string;
  title: string;
  min_price: number;
  photos: string[] | null;
  current_highest_bid?: number | null;
  end_time?: string | null;
  status: 'active' | 'closed' | 'cancelled' | string;
  bid_count: number;
};

interface ListingCardProps {
  listing: ListingCardItem;
  className?: string;
}

export default function ListingCard({ listing, className = '' }: ListingCardProps) {
  const { user } = useAuth();
  const thumbnailUrl = (listing.photos && listing.photos.length > 0) ? listing.photos[0] : null;
  const isEffectivelyEnded = listing.status !== 'active' || (listing.end_time && isPast(listing.end_time));
  const hasActiveBids = listing.current_highest_bid && listing.current_highest_bid > 0;
  const isEndingSoon = listing.end_time && !isEffectivelyEnded && 
    new Date(listing.end_time).getTime() - Date.now() < 24 * 60 * 60 * 1000; // Less than 24 hours

  return (
    <>
      {/* Desktop View - Hidden on Mobile */}
      <div className={`group relative hidden md:block ${className}`}>
        {/* Glow effect on hover */}
        <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl blur opacity-0 group-hover:opacity-20 transition-all duration-300"></div>
        
        <div className="relative bg-white dark:bg-bye-dark-bg-secondary rounded-2xl shadow-lg hover:shadow-2xl overflow-hidden transition-all duration-300 transform group-hover:-translate-y-1 border border-gray-100 dark:border-bye-dark-border-primary">
          {/* Watchlist Button - Moved outside Link and positioned absolutely */}
          <div className="absolute top-3 right-3 z-20">
            <WatchlistButton
              listingId={listing.id}
              currentUser={user}
              size="sm"
              className="bg-white/90 dark:bg-bye-dark-bg-secondary/90 backdrop-blur-sm hover:bg-white dark:hover:bg-bye-dark-bg-secondary"
            />
          </div>

          <Link href={`/listings/${listing.id}`} className="block" scroll={true}>
            {/* Image Section with Overlays */}
            <div className="relative aspect-[4/3] overflow-hidden">
              {thumbnailUrl ? (
                <Image
                  src={thumbnailUrl}
                  alt={`Cover image for ${listing.title}`}
                  fill
                  style={{ objectFit: 'cover' }}
                  className="transition-all duration-500 group-hover:scale-110"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
                  priority={true}
                  quality={85}
                  onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder-image.svg'; }}
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-bye-dark-bg-hover dark:to-bye-dark-bg-secondary flex items-center justify-center">
                  <div className="text-center">
                    <SparklesIcon className="h-12 w-12 text-gray-400 dark:text-bye-dark-text-secondary mx-auto mb-2" />
                    <p className="text-xs text-gray-500 dark:text-bye-dark-text-secondary">No Image</p>
                  </div>
                </div>
              )}

              {/* Gradient Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

              {/* Status Badges */}
              <div className="absolute top-3 left-3 flex gap-2">
                {isEndingSoon && !isEffectivelyEnded && (
                  <div className="flex items-center gap-1 bg-orange-500/90 backdrop-blur-sm text-white px-2 py-1 rounded-full text-xs font-bold animate-pulse">
                    <ClockIconSolid className="w-3 h-3" />
                    ENDING SOON
                  </div>
                )}
                {listing.status === 'closed' && (
                  <div className="flex items-center gap-1 bg-green-500/90 backdrop-blur-sm text-white px-2 py-1 rounded-full text-xs font-bold shadow-lg">
                    <TrophyIcon className="w-3 h-3" />
                    SOLD
                  </div>
                )}
              </div>

              {/* Bottom overlay with time remaining */}
              {listing.end_time && listing.status === 'active' && !isEffectivelyEnded && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <div className="flex items-center justify-between text-white text-sm">
                    <div className="flex items-center gap-1">
                      <ClockIcon className="w-4 h-4" />
                      <span className="font-medium"> {formatRelativeTime(listing.end_time)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Content Section */}
            <div className="p-5">
              {/* Title */}
              <h3 className="text-xl font-bold text-gray-900 dark:text-bye-dark-text-primary mb-3 line-clamp-2 leading-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors duration-200">
                {listing.title}
              </h3>

              {/* Price Section */}
              <div className="space-y-3 mb-4">
                {/* Min Price / Current Bid - Updated styling */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-bye-dark-text-secondary mb-1">
                      Min Bid
                    </p>
                    <p className="text-sm text-gray-700 dark:text-bye-dark-text-primary">
                      {formatCurrency(listing.min_price)}
                    </p>
                  </div>
                  
                  {hasActiveBids && (
                    <div className="text-right">
                      <p className="text-xs text-gray-500 dark:text-bye-dark-text-secondary mb-1">Current Bid</p>
                      <p className="text-xl font-bold text-green-600 dark:text-green-400">
                        {formatCurrency(listing.current_highest_bid!)}
                      </p>
                    </div>
                  )}
                </div>

                {/* Enhanced Bid Progress Bar - WITHOUT redundant text */}
                {hasActiveBids && (
                  <div className="w-full bg-gray-200 dark:bg-bye-dark-bg-hover rounded-full h-2 overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full transition-all duration-500 relative"
                      style={{ 
                        width: `${Math.min(100, (listing.current_highest_bid! / (listing.min_price * 2)) * 100)}%` 
                      }}
                    >
                      <div className="absolute inset-0 bg-white/20 rounded-full animate-pulse"></div>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer Info */}
              <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-bye-dark-border-primary">
                {/* Status/Time - Updated */}
                <div className="flex items-center gap-2">
                  {listing.status === 'active' && !isEffectivelyEnded ? (
                    <div className="flex items-center gap-1">
                      <ClockIcon className="w-3 h-3" />
                      <span className="text-xs font-medium text-red-600 dark:text-red-400">
                        {listing.end_time ? ` ${formatRelativeTime(listing.end_time)}` : ''}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <div className={`w-2 h-2 rounded-full ${
                        listing.status === 'closed' 
                          ? 'bg-gray-400' 
                          : listing.status === 'cancelled' 
                          ? 'bg-yellow-400' 
                          : 'bg-gray-300'
                      }`}></div>
                      <span className={`text-xs font-medium ${
                        listing.status === 'closed' 
                          ? 'text-gray-600 dark:text-bye-dark-text-secondary' 
                          : listing.status === 'cancelled' 
                          ? 'text-yellow-600 dark:text-yellow-500' 
                          : 'text-gray-500 dark:text-bye-dark-text-secondary'
                      }`}>
                        {listing.status === 'closed' ? 'Ended' : 
                         listing.status === 'cancelled' ? 'Cancelled' : 
                         listing.status.charAt(0).toUpperCase() + listing.status.slice(1)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Bid Status */}
                <div className="text-right">
                  {listing.status === 'active' && !hasActiveBids && (
                    <div className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400">
                      <SparklesIcon className="w-3 h-3" />
                      <span className="text-xs font-medium">Be first to bid</span>
                    </div>
                  )}
                  {hasActiveBids && (
                    <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                      <FireIcon className="w-3 h-3" />
                      <span className="text-xs font-medium">
                        {listing.bid_count} bid{listing.bid_count === 1 ? '' : 's'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Link>

          {/* Hover Overlay for Additional Actions */}
          <div className="absolute inset-0 bg-gradient-to-t from-indigo-900/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none">
            <div className="absolute bottom-4 left-4 right-4 pointer-events-auto opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-4 group-hover:translate-y-0">
              {listing.status === 'active' && !isEffectivelyEnded && (
                <Link
                  href={`/listings/${listing.id}`}
                  scroll={true}
                  className="block w-full active:scale-[0.98] transition-transform duration-150"
                  onClick={(e) => {
                    // Prevent the parent hover link from triggering twice
                    e.stopPropagation();
                  }}
                >
                  <span
                    className="w-full inline-block bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-4 py-2 rounded-lg font-medium text-sm text-center hover:from-indigo-600 hover:to-purple-700 transition-all duration-200 shadow-lg"
                  >
                    Place Bid
                  </span>
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile View - Vertical Card */}
      <div className={`block md:hidden ${className}`}>
        <div className="relative">
          {/* Watchlist Button for Mobile - Moved outside Link */}
          <div className="absolute top-2 right-2 z-20">
            <WatchlistButton
              listingId={listing.id}
              currentUser={user}
              size="sm"
              className="bg-white/90 dark:bg-bye-dark-bg-secondary/90 backdrop-blur-sm hover:bg-white dark:hover:bg-bye-dark-bg-secondary"
            />
          </div>

          <Link 
            href={`/listings/${listing.id}`} 
            className="block active:scale-[0.98] transition-transform duration-150"
            scroll={true}
          >
            <div className="bg-white dark:bg-bye-dark-bg-secondary rounded-xl shadow-md border border-gray-100 dark:border-bye-dark-border-primary overflow-hidden">
              {/* Image Section - Shorter aspect ratio */}
              <div className="relative aspect-[2/1] overflow-hidden">
                {thumbnailUrl ? (
                  <Image
                    src={thumbnailUrl}
                    alt={`Cover image for ${listing.title}`}
                    fill
                    style={{ objectFit: 'cover' }}
                    sizes="(max-width: 640px) 100vw, 50vw"
                    priority={false}
                    quality={75}
                    onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder-image.svg'; }}
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-bye-dark-bg-hover dark:to-bye-dark-bg-secondary flex items-center justify-center">
                    <div className="text-center">
                      <SparklesIcon className="h-8 w-8 text-gray-400 dark:text-bye-dark-text-secondary mx-auto mb-1" />
                      <p className="text-xs text-gray-500 dark:text-bye-dark-text-secondary">No Image</p>
                    </div>
                  </div>
                )}

                {/* Status Badges */}
                <div className="absolute top-2 left-2 flex gap-1">
                  {isEndingSoon && !isEffectivelyEnded && (
                    <div className="flex items-center gap-1 bg-orange-500/90 backdrop-blur-sm text-white px-2 py-1 rounded-full text-xs font-bold animate-pulse">
                      <ClockIconSolid className="w-3 h-3" />
                      ENDING SOON
                    </div>
                  )}
                  {listing.status === 'closed' && (
                    <div className="flex items-center gap-1 bg-green-500/90 backdrop-blur-sm text-white px-2 py-1 rounded-full text-xs font-bold">
                      <TrophyIcon className="w-3 h-3" />
                      SOLD
                    </div>
                  )}
                </div>
              </div>

              {/* Content Section - Reduced padding */}
              <div className="p-3">
                {/* Title - Slightly smaller text */}
                <h3 className="text-base font-bold text-gray-900 dark:text-bye-dark-text-primary line-clamp-2 mb-2 leading-snug active:text-indigo-600 dark:active:text-indigo-400 transition-colors">
                  {listing.title}
                </h3>

                {/* Price Section - Tighter spacing */}
                <div className="mb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500 dark:text-bye-dark-text-secondary mb-0.5">
                        Min Bid
                      </p>
                      <p className="text-sm text-gray-700 dark:text-bye-dark-text-primary">
                        {formatCurrency(listing.min_price)}
                      </p>
                    </div>
                    
                    {hasActiveBids && (
                      <div className="text-right">
                        <p className="text-xs text-gray-500 dark:text-bye-dark-text-secondary mb-0.5">Current Bid</p>
                        <p className="text-lg font-bold text-green-600 dark:text-green-400">
                          {formatCurrency(listing.current_highest_bid!)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Progress Bar - Slightly thinner */}
                {hasActiveBids && (
                  <div className="w-full bg-gray-200 dark:bg-bye-dark-bg-hover rounded-full h-1 overflow-hidden mb-2">
                    <div 
                      className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, (listing.current_highest_bid! / (listing.min_price * 2)) * 100)}%` }}
                    ></div>
                  </div>
                )}

                {/* Combined Time/Status & Bids - Single line */}
                <div className="flex items-center justify-between mb-2 text-xs">
                  {listing.status === 'active' && !isEffectivelyEnded ? (
                    <div className="flex items-center gap-1">
                      <ClockIcon className="w-3 h-3" />
                      <span className="text-red-600 dark:text-red-400">
                        {formatRelativeTime(listing.end_time!)}
                      </span>
                    </div>
                  ) : (
                    <span className={`text-xs ${
                      listing.status === 'closed' 
                        ? 'text-gray-500 dark:text-bye-dark-text-secondary'
                        : 'text-yellow-600 dark:text-yellow-500'
                    }`}>
                      {listing.status === 'closed' ? 'Ended' : 'Cancelled'}
                    </span>
                  )}

                  {hasActiveBids && (
                    <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                      <FireIcon className="w-3 h-3" />
                      <span className="font-medium">{listing.bid_count} bid{listing.bid_count === 1 ? '' : 's'}</span>
                    </div>
                  )}
                </div>

                {/* Action Buttons - Reduced height */}
                <div className="flex gap-2">
                  {listing.status === 'active' && !isEffectivelyEnded ? (
                    <Link 
                      href={`/listings/${listing.id}`}
                      className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white py-2 rounded-lg font-medium text-xs active:scale-[0.98] transition-transform duration-150 shadow-sm text-center"
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      Place Bid
                    </Link>
                  ) : (
                    <Link 
                      href={`/listings/${listing.id}`}
                      className="w-full bg-gray-100 dark:bg-bye-dark-bg-hover text-gray-700 dark:text-bye-dark-text-primary py-2 rounded-lg font-medium text-xs active:scale-[0.98] transition-transform duration-150 text-center"
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      View Details
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </>
  );
}