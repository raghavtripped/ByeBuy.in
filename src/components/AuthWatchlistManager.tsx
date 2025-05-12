// src/components/AuthWatchlistManager.tsx
'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useWatchlistStore } from '@/stores/watchlistStore';
// Removed: import type { User } from '@supabase/supabase-js'; 
// The User type for parameters is handled by the store's function signatures

export default function AuthWatchlistManager() {
  // Get actions ONCE using getState(). These references should be stable.
  const { fetchWatchedListings, clearWatchlist } = useWatchlistStore.getState();

  useEffect(() => {
    // console.log('AuthWM: Main effect running. Dependencies are stable from getState().');

    const getInitialUserAndWatchlist = async () => {
      // console.log('AuthWM: getInitialUserAndWatchlist - START');
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          console.error("AuthWM: Error getting session:", sessionError.message);
          clearWatchlist(); 
          return;
        }
        const currentUser = session?.user ?? null;
        // console.log('AuthWM: getInitialUserAndWatchlist - User ID:', currentUser?.id);
        if (currentUser) {
          await fetchWatchedListings(currentUser);
        } else {
          clearWatchlist();
        }
        // console.log('AuthWM: getInitialUserAndWatchlist - END');
      } catch (e: unknown) {
        console.error("AuthWM: CATCH in getInitialUserAndWatchlist", e instanceof Error ? e.message : String(e));
        clearWatchlist();
      }
    };

    getInitialUserAndWatchlist(); // Call on mount

    // console.log('AuthWM: Setting up onAuthStateChange listener.');
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // console.log('AuthWM: onAuthStateChange event:', event, 'User ID:', session?.user?.id);
        const currentUser = session?.user ?? null;

        // Re-fetch actions from getState inside callback to ensure latest, though usually stable
        const currentFetch = useWatchlistStore.getState().fetchWatchedListings;
        const currentClear = useWatchlistStore.getState().clearWatchlist;

        if (event === 'SIGNED_IN' && currentUser) {
          // console.log('AuthWM: SIGNED_IN - fetching watchlist');
          await currentFetch(currentUser);
        } else if (event === 'SIGNED_OUT') {
          // console.log('AuthWM: SIGNED_OUT - clearing watchlist');
          currentClear();
        } else if (event === 'USER_UPDATED' && currentUser) {
          // console.log('AuthWM: USER_UPDATED - fetching watchlist');
          await currentFetch(currentUser);
        } else if (event === 'INITIAL_SESSION') {
            if (currentUser) {
                // console.log('AuthWM: INITIAL_SESSION (user) - fetching watchlist');
                await currentFetch(currentUser);
            } else {
                // console.log('AuthWM: INITIAL_SESSION (no user) - clearing watchlist');
                currentClear();
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