// src/components/WatchlistButton.tsx
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useWatchlistStore } from '@/stores/watchlistStore';
import type { PostgrestError } from '@supabase/supabase-js';
import { useNotifications } from '@/hooks/useNotifications'; // Add this import

const StarIconFilled = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
    <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401Z" clipRule="evenodd" />
  </svg>
);

const StarIconOutline = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 20" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.652 0l-4.725 2.885a.562.562 0 0 1-.84-.61l1.285-5.385a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
  </svg>
);

interface WatchlistButtonProps {
  listingId: string;
  userId: string | undefined;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

type SupabaseMutationResponse = { data?: unknown | null; error: PostgrestError | null; status?: number };

export default function WatchlistButton({ 
  listingId, 
  userId, 
  size = 'md', 
  className = '' 
}: WatchlistButtonProps) {
  const { showNotification } = useNotifications(); // Add notifications hook
  const isInitiallyWatched = useWatchlistStore(state => state.isWatched(listingId));
  const addToWatchlistLocal = useWatchlistStore(state => state.addToWatchlistLocal);
  const removeFromWatchlistLocal = useWatchlistStore(state => state.removeFromWatchlistLocal);

  const [isWatched, setIsWatched] = useState(isInitiallyWatched);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setIsWatched(isInitiallyWatched);
  }, [isInitiallyWatched]);

  const handleToggleWatchlist = async () => {
    if (!userId) {
      showNotification({ 
        type: 'error', 
        message: 'Please log in to add items to your watchlist.'
      });
      return;
    }
    if (isLoading) return;

    const originallyWatched = isWatched;
    setIsLoading(true);
    const newOptimisticIsWatched = !originallyWatched;
    setIsWatched(newOptimisticIsWatched);

    if (newOptimisticIsWatched) {
      addToWatchlistLocal(listingId);
    } else {
      removeFromWatchlistLocal(listingId);
    }

    const SUPABASE_OPERATION_TIMEOUT = 10000;

    try {
      if (newOptimisticIsWatched) {
        const insertOperation = supabase
          .from('watched_listings')
          .insert({ user_id: userId, listing_id: listingId });
        
        const timeoutPromise = new Promise<Error>((_, reject) => 
          setTimeout(() => reject(new Error(`Supabase INSERT timed out`)), SUPABASE_OPERATION_TIMEOUT)
        );
        
        const result = await Promise.race([insertOperation, timeoutPromise]);
        
        if (result instanceof Error) throw result;
        const insertError = (result as SupabaseMutationResponse).error; 
        
        if (insertError) {
          if (insertError.code === '23505') { // Unique violation
            if (!isWatched) setIsWatched(true); 
            if (!useWatchlistStore.getState().isWatched(listingId)) addToWatchlistLocal(listingId);
          } else {
            throw insertError; 
          }
        }
      } else { 
        const deleteOperation = supabase
          .from('watched_listings')
          .delete()
          .eq('user_id', userId)
          .eq('listing_id', listingId);
        
        const timeoutPromise = new Promise<Error>((_, reject) => 
            setTimeout(() => reject(new Error(`Supabase DELETE timed out`)), SUPABASE_OPERATION_TIMEOUT)
        );
        
        const result = await Promise.race([deleteOperation, timeoutPromise]);

        if (result instanceof Error) throw result;
        const deleteError = (result as SupabaseMutationResponse).error;

        if (deleteError) throw deleteError;
      }
    } catch (error: unknown) {
      setIsWatched(originallyWatched); // Revert optimistic update
      if (originallyWatched) {
        if (!useWatchlistStore.getState().isWatched(listingId)) addToWatchlistLocal(listingId);
      } else {
        if (useWatchlistStore.getState().isWatched(listingId)) removeFromWatchlistLocal(listingId);
      }

      let message = 'Failed to update watchlist';
      if (error instanceof Error) message = error.message; 
      else if (typeof error === 'string') message = error;
      else if (error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
          message = (error as {message: string}).message;
      }
      showNotification({
        type: 'error',
        message: `Update failed: ${message}`
      });
    } finally {
      setIsLoading(false);
    }
  };

  let iconSizeClass = "w-5 h-5";
  if (size === 'sm') iconSizeClass = "w-4 h-4";
  if (size === 'lg') iconSizeClass = "w-6 h-6";

  return (
    <button
      onClick={handleToggleWatchlist}
      disabled={isLoading || !userId}
      // Updated dark mode colors and focus ring offset
      className={`p-1.5 rounded-full transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:ring-offset-1 dark:focus:ring-offset-bye-dark-bg-secondary
                  ${isWatched
                    ? 'text-yellow-400 hover:text-yellow-500 dark:text-yellow-300 dark:hover:text-yellow-400' // Watched state (yellow)
                    : 'text-gray-400 hover:text-gray-600 dark:text-bye-dark-text-secondary dark:hover:text-bye-dark-text-primary' // Not watched state
                  }
                  ${isLoading ? 'opacity-50 cursor-wait' : 'hover:bg-gray-100 dark:hover:bg-bye-dark-bg-hover'}
                  ${!userId && 'cursor-not-allowed opacity-60'}
                  ${className}`}
      aria-label={isWatched ? "Remove from watchlist" : "Add to watchlist"}
      title={isWatched ? "Remove from watchlist" : "Add to watchlist"}
    >
      {isLoading ? (
        // Updated loading spinner color for dark mode
        <svg className={`animate-spin ${iconSizeClass} text-gray-500 dark:text-bye-dark-text-secondary`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      ) : isWatched ? (
        <StarIconFilled className={iconSizeClass} />
      ) : (
        <StarIconOutline className={iconSizeClass} />
      )}
    </button>
  );
}