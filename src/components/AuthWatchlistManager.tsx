// src/components/AuthWatchlistManager.tsx
'use client';

import { useEffect, useCallback } from 'react'; // Added useCallback
import { supabase, User } from '@/lib/supabaseClient';
import { useWatchlistStore } from '@/stores/watchlistStore';

export default function AuthWatchlistManager() {
  // Use selectors for actions. Zustand selectors are memoized.
  const fetchWatchedListings = useWatchlistStore(state => state.fetchWatchedListings);
  const clearWatchlist = useWatchlistStore(state => state.clearWatchlist);

  // useCallback to memoize these functions so they have stable references
  // ONLY if they were causing issues in the dependency array.
  // Often, Zustand action references are stable by default.
  // Let's test without useCallback first, then add if needed.

  useEffect(() => {
    console.log('AuthWM: Main effect is running/re-running.');

    const getInitialUserAndWatchlist = async () => {
      console.log('AuthWM: getInitialUserAndWatchlist - START');
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          console.error("AuthWM: Error getting session:", sessionError.message);
          clearWatchlist(); return;
        }
        const currentUser = session?.user ?? null;
        console.log('AuthWM: getInitialUserAndWatchlist - User ID:', currentUser?.id);
        if (currentUser) {
          await fetchWatchedListings(currentUser);
        } else {
          clearWatchlist();
        }
        console.log('AuthWM: getInitialUserAndWatchlist - END');
      } catch (e) {
        console.error("AuthWM: CATCH in getInitialUserAndWatchlist", e);
        clearWatchlist();
      }
    };

    getInitialUserAndWatchlist(); // Run once on mount

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('AuthWM: onAuthStateChange event:', event, 'Session user ID:', session?.user?.id);
        const currentUser = session?.user ?? null;

        if (event === 'SIGNED_IN' && currentUser) {
          console.log('AuthWM: SIGNED_IN - fetching watchlist');
          await fetchWatchedListings(currentUser);
        } else if (event === 'SIGNED_OUT') {
          console.log('AuthWM: SIGNED_OUT - clearing watchlist');
          clearWatchlist();
        } else if (event === 'USER_UPDATED' && currentUser) {
          console.log('AuthWM: USER_UPDATED - fetching watchlist');
          await fetchWatchedListings(currentUser);
        } else if (event === 'INITIAL_SESSION') {
            // This is often handled by getInitialUserAndWatchlist above,
            // but explicit handling here ensures coverage.
            if (currentUser) {
                console.log('AuthWM: INITIAL_SESSION (user) - fetching watchlist');
                await fetchWatchedListings(currentUser);
            } else {
                console.log('AuthWM: INITIAL_SESSION (no user) - clearing watchlist');
                clearWatchlist();
            }
        }
      }
    );

    return () => {
      console.log('AuthWM: Cleaning up auth listener.');
      authListener?.subscription?.unsubscribe();
    };
  // Crucial: The functions from Zustand store actions should be stable.
  // If they are not, this will cause an infinite loop.
  }, [fetchWatchedListings, clearWatchlist]); // Add them back to dependency array

  return null;
}