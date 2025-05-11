// src/components/AuthWatchlistManager.tsx
'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient'; // User type will be inferred from store actions
import { useWatchlistStore } from '@/stores/watchlistStore';
// REMOVED: import type { User } from '@supabase/supabase-js'; // This import is not needed here

export default function AuthWatchlistManager() {
  const fetchWatchedListings = useWatchlistStore(state => state.fetchWatchedListings);
  const clearWatchlist = useWatchlistStore(state => state.clearWatchlist);

  useEffect(() => {
    // console.log('AuthWM: Main effect is running/re-running.');

    const getInitialUserAndWatchlist = async () => {
      // console.log('AuthWM: getInitialUserAndWatchlist - START');
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          console.error("AuthWM: Error getting session:", sessionError.message);
          clearWatchlist(); return;
        }
        const currentUser = session?.user ?? null; // currentUser will be of type User | null from Supabase
        // console.log('AuthWM: getInitialUserAndWatchlist - User ID:', currentUser?.id);
        if (currentUser) {
          await fetchWatchedListings(currentUser); // fetchWatchedListings in store expects User | null
        } else {
          clearWatchlist();
        }
        // console.log('AuthWM: getInitialUserAndWatchlist - END');
      } catch (e: unknown) {
        console.error("AuthWM: CATCH in getInitialUserAndWatchlist", e instanceof Error ? e.message : String(e));
        clearWatchlist();
      }
    };

    getInitialUserAndWatchlist();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // console.log('AuthWM: onAuthStateChange event:', event, 'Session user ID:', session?.user?.id);
        const currentUser = session?.user ?? null; // currentUser will be of type User | null

        if (event === 'SIGNED_IN' && currentUser) {
          // console.log('AuthWM: SIGNED_IN - fetching watchlist');
          await fetchWatchedListings(currentUser);
        } else if (event === 'SIGNED_OUT') {
          // console.log('AuthWM: SIGNED_OUT - clearing watchlist');
          clearWatchlist();
        } else if (event === 'USER_UPDATED' && currentUser) {
          // console.log('AuthWM: USER_UPDATED - fetching watchlist');
          await fetchWatchedListings(currentUser);
        } else if (event === 'INITIAL_SESSION') {
            if (currentUser) {
                // console.log('AuthWM: INITIAL_SESSION (user) - fetching watchlist');
                await fetchWatchedListings(currentUser);
            } else {
                // console.log('AuthWM: INITIAL_SESSION (no user) - clearing watchlist');
                clearWatchlist();
            }
        }
      }
    );

    return () => {
      // console.log('AuthWM: Cleaning up auth listener.');
      authListener?.subscription?.unsubscribe();
    };
  }, [fetchWatchedListings, clearWatchlist]);

  return null;
}