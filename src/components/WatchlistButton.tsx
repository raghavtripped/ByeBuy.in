'use client';

import React, { useState } from 'react';
import { HeartIcon } from '@heroicons/react/24/outline';
import { HeartIcon as HeartIconSolid } from '@heroicons/react/24/solid';
import { PostgrestError } from '@supabase/postgrest-js';
import { supabase } from '@/lib/supabaseClient';
import { useWatchlistStore, type WatchlistState } from '@/stores/watchlistStore';

interface WatchlistButtonProps {
  listingId: string;
  currentUser: { id: string } | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function WatchlistButton({
  listingId,
  currentUser,
  size = 'md',
  className = '',
}: WatchlistButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { isWatched, addToWatchlistLocal, removeFromWatchlistLocal } = useWatchlistStore(
    (state: WatchlistState) => state.actions
  );

  const isItemWatched = isWatched(listingId);

  const handleToggleWatchlist = async () => {
    if (!currentUser) {
      // TODO: Show login modal or notification
      console.error('User must be logged in to watch items');
      return;
    }

    setIsLoading(true);
    const previousState = isItemWatched;

    try {
      // Optimistic update
      if (isItemWatched) {
        removeFromWatchlistLocal(listingId);
      } else {
        addToWatchlistLocal(listingId);
      }

      // Persist to database
      if (!isItemWatched) {
        const { error } = await supabase
          .from('watched_listings')
          .insert([{ user_id: currentUser.id, listing_id: listingId }]);
        
        // If we get a conflict error, it means the item is already in the watchlist
        if (error?.code === '23505') { // PostgreSQL unique violation code
          // Keep the optimistic update since the item is actually in the watchlist
          return;
        }
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('watched_listings')
          .delete()
          .match({ user_id: currentUser.id, listing_id: listingId });
        if (error) throw error;
      }
    } catch (error: unknown) {
      // Revert optimistic update on error
      if (previousState) {
        addToWatchlistLocal(listingId);
      } else {
        removeFromWatchlistLocal(listingId);
      }
      const errorMessage = error instanceof PostgrestError ? error.message : 'Failed to update watchlist';
      console.error('Error toggling watchlist:', errorMessage);
      // TODO: Show error notification
    } finally {
      setIsLoading(false);
    }
  };

  const sizeClasses = {
    sm: 'w-5 h-5',
    md: 'w-6 h-6',
    lg: 'w-7 h-7',
  }[size];

  return (
    <button
      onClick={handleToggleWatchlist}
      disabled={isLoading}
      className={`relative inline-flex items-center justify-center p-2 rounded-full 
        hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors
        disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      aria-label={isItemWatched ? 'Remove from watchlist' : 'Add to watchlist'}
    >
      {isItemWatched ? (
        <HeartIconSolid className={`${sizeClasses} text-red-500`} />
      ) : (
        <HeartIcon className={`${sizeClasses} text-gray-600 dark:text-gray-400`} />
      )}
    </button>
  );
} 