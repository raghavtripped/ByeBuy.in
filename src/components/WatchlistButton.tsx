// src/components/WatchlistButton.tsx
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useWatchlistStore } from '@/stores/watchlistStore';
import type { PostgrestError } from '@supabase/supabase-js';

const showNotification = (type: 'success' | 'error', message: string) => {
  if (typeof window !== 'undefined') {
    if (type === 'success') alert(`Success: ${message}`);
    else alert(`Error: ${message}`);
  }
  console.log(`WatchlistButton Notification (${type}): ${message}`);
};

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

// MODIFIED: SupabaseMutationResponse data type changed from any to unknown
type SupabaseMutationResponse = { data?: unknown | null; error: PostgrestError | null; status?: number };


export default function WatchlistButton({ 
  listingId, 
  userId, 
  size = 'md', 
  className = '' 
}: WatchlistButtonProps) {
  const isInitiallyWatched = useWatchlistStore(state => state.isWatched(listingId));
  const addToWatchlistLocal = useWatchlistStore(state => state.addToWatchlistLocal);
  const removeFromWatchlistLocal = useWatchlistStore(state => state.removeFromWatchlistLocal);

  const [isWatched, setIsWatched] = useState(isInitiallyWatched);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setIsWatched(isInitiallyWatched);
  }, [isInitiallyWatched]);

  const handleToggleWatchlist = async () => {
    console.log(`WatchlistButton: (${listingId}) handleToggleWatchlist - START`);
    if (!userId) {
      showNotification('error', 'Please log in to add items to your watchlist.');
      console.log(`WatchlistButton: (${listingId}) No user ID, exiting.`);
      return;
    }
    if (isLoading) {
      console.log(`WatchlistButton: (${listingId}) Already loading, exiting.`);
      return;
    }

    const originallyWatched = isWatched;

    try {
      setIsLoading(true);
      console.log(`WatchlistButton: (${listingId}) setIsLoading(true) done.`);

      const newOptimisticIsWatched = !originallyWatched;
      setIsWatched(newOptimisticIsWatched);
      console.log(`WatchlistButton: (${listingId}) Optimistically set isWatched to ${newOptimisticIsWatched}.`);

      if (newOptimisticIsWatched) {
        addToWatchlistLocal(listingId);
        console.log(`WatchlistButton: (${listingId}) Called addToWatchlistLocal.`);
      } else {
        removeFromWatchlistLocal(listingId);
        console.log(`WatchlistButton: (${listingId}) Called removeFromWatchlistLocal.`);
      }

      const SUPABASE_OPERATION_TIMEOUT = 10000;

      if (newOptimisticIsWatched) {
        console.log(`WatchlistButton: (${listingId}) PRE-INSERT block for user ${userId}`);
        const insertOperation = supabase
          .from('watched_listings')
          .insert({ user_id: userId, listing_id: listingId });
        console.log(`WatchlistButton: (${listingId}) Insert operation configured.`);

        const timeoutPromise = new Promise<Error>((_, reject) => 
          setTimeout(() => reject(new Error(`Supabase INSERT timed out after ${SUPABASE_OPERATION_TIMEOUT/1000} seconds`)), SUPABASE_OPERATION_TIMEOUT)
        );
        console.log(`WatchlistButton: (${listingId}) Timeout promise for INSERT created.`);
        
        const result = await Promise.race([insertOperation, timeoutPromise]);
        console.log(`WatchlistButton: (${listingId}) Promise.race for INSERT completed. Result:`, result);
        
        if (result instanceof Error) throw result;
        const insertError = (result as SupabaseMutationResponse).error; 
        
        console.log(`WatchlistButton: (${listingId}) Supabase INSERT result - error:`, insertError);
        if (insertError) {
          if (insertError.code === '23505') {
            console.warn(`WatchlistButton: (${listingId}) DB unique violation on insert. Syncing.`);
            if (!isWatched) setIsWatched(true); 
            if (!useWatchlistStore.getState().isWatched(listingId)) addToWatchlistLocal(listingId);
          } else {
            throw insertError; 
          }
        } else {
          console.log(`WatchlistButton: (${listingId}) Supabase INSERT successful.`);
        }
      } else { 
        console.log(`WatchlistButton: (${listingId}) PRE-DELETE block for user ${userId}`);
        const deleteOperation = supabase
          .from('watched_listings')
          .delete()
          .eq('user_id', userId)
          .eq('listing_id', listingId);
        console.log(`WatchlistButton: (${listingId}) Delete operation configured.`);
        
        const timeoutPromise = new Promise<Error>((_, reject) => 
            setTimeout(() => reject(new Error(`Supabase DELETE timed out after ${SUPABASE_OPERATION_TIMEOUT/1000} seconds`)), SUPABASE_OPERATION_TIMEOUT)
        );
        console.log(`WatchlistButton: (${listingId}) Timeout promise for DELETE created.`);
        
        const result = await Promise.race([deleteOperation, timeoutPromise]);
        console.log(`WatchlistButton: (${listingId}) Promise.race for DELETE completed. Result:`, result);

        if (result instanceof Error) throw result;
        const deleteError = (result as SupabaseMutationResponse).error;

        console.log(`WatchlistButton: (${listingId}) Supabase DELETE result - error:`, deleteError);
        if (deleteError) throw deleteError;
        console.log(`WatchlistButton: (${listingId}) Supabase DELETE successful.`);
      }
    } catch (error: unknown) {
      console.error(`WatchlistButton: (${listingId}) CATCH block. Error:`, error);
      
      setIsWatched(originallyWatched);
      if (originallyWatched) {
        if (!useWatchlistStore.getState().isWatched(listingId)) addToWatchlistLocal(listingId);
      } else {
        if (useWatchlistStore.getState().isWatched(listingId)) removeFromWatchlistLocal(listingId);
      }
      console.log(`WatchlistButton: (${listingId}) Reverted UI and store to original pre-click state: ${originallyWatched}`);

      let message = 'Failed to update watchlist';
      if (error instanceof Error) {
        message = error.message; 
      } else if (typeof error === 'string') {
        message = error;
      // MODIFIED: More specific type check for error object with message property
      } else if (error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
          message = (error as {message: string}).message;
      }
      
      showNotification('error', `Update failed: ${message}`);
    } finally {
      setIsLoading(false);
      console.log(`WatchlistButton: (${listingId}) FINALLY block - setIsLoading(false).`);
    }
    console.log(`WatchlistButton: (${listingId}) handleToggleWatchlist - END`);
  };

  let iconSizeClass = "w-5 h-5";
  if (size === 'sm') iconSizeClass = "w-4 h-4";
  if (size === 'lg') iconSizeClass = "w-6 h-6";

  return (
    <button
      onClick={handleToggleWatchlist}
      disabled={isLoading || !userId}
      className={`p-1.5 rounded-full transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 dark:focus:ring-offset-gray-800
                  ${isWatched
                    ? 'text-yellow-400 hover:text-yellow-500 dark:text-yellow-300 dark:hover:text-yellow-400'
                    : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'
                  }
                  ${isLoading ? 'opacity-50 cursor-wait' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}
                  ${!userId && 'cursor-not-allowed opacity-60'}
                  ${className}`}
      aria-label={isWatched ? "Remove from watchlist" : "Add to watchlist"}
      title={isWatched ? "Remove from watchlist" : "Add to watchlist"}
    >
      {isLoading ? (
        <svg className={`animate-spin ${iconSizeClass} text-gray-500 dark:text-gray-400`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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