// src/components/AuthWatchlistManager.tsx
'use client';

import { useEffect } from 'react';
import { supabase, User } from '@/lib/supabaseClient'; // User might be needed by store actions
import { useWatchlistStore } from '@/stores/watchlistStore';

export default function AuthWatchlistManager() {
  // Get actions. These selectors should be stable if store actions are defined correctly.
  const fetchWatchedListings = useWatchlistStore(state => state.fetchWatchedListings);
  const clearWatchlist = useWatchlistStore(state => state.clearWatchlist);

  // Effect for initial load - this seemed to work fine with an empty array before
  useEffect(() => {
    console.log('AuthWM: Initial Load Effect - START');
    const getInitialUserAndWatchlist = async () => {
      console.log('AuthWM: getInitialUserAndWatchlist - Attempting session...');
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          console.error("AuthWM: Error getting session:", sessionError.message);
          clearWatchlist(); 
          return;
        }
        const currentUser = session?.user ?? null;
        console.log('AuthWM: getInitialUserAndWatchlist - User ID:', currentUser?.id);
        if (currentUser) {
          console.log('AuthWM: getInitialUserAndWatchlist - Fetching for user:', currentUser.id);
          await fetchWatchedListings(currentUser);
        } else {
          console.log('AuthWM: getInitialUserAndWatchlist - No user, clearing.');
          clearWatchlist();
        }
      } catch (e: unknown) {
        console.error("AuthWM: CATCH in getInitialUserAndWatchlist", e instanceof Error ? e.message : String(e));
        clearWatchlist();
      }
      console.log('AuthWM: Initial Load Effect - END');
    };

    getInitialUserAndWatchlist();
  }, [fetchWatchedListings, clearWatchlist]); // Using store actions in dependency array

  // Effect for onAuthStateChange
  useEffect(() => {
    console.log('AuthWM: Setting up onAuthStateChange listener.');
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('AuthWM: onAuthStateChange - Event:', event, 'User ID:', session?.user?.id);
        const currentUser = session?.user ?? null;

        if (event === 'SIGNED_IN' && currentUser) {
          console.log('AuthWM: onAuthStateChange - SIGNED_IN - Fetching watchlist');
          await fetchWatchedListings(currentUser);
        } else if (event === 'SIGNED_OUT') {
          console.log('AuthWM: onAuthStateChange - SIGNED_OUT - Clearing watchlist');
          clearWatchlist();
        } else if (event === 'USER_UPDATED' && currentUser) {
          // This can fire often (e.g., token refresh).
          // Only fetch if you really need to, or add more conditions.
          // For now, let's keep it to ensure watchlist stays current.
          console.log('AuthWM: onAuthStateChange - USER_UPDATED - Fetching watchlist');
          await fetchWatchedListings(currentUser);
        } else if (event === 'INITIAL_SESSION') {
            // This is mostly handled by the first useEffect, but good for completeness
            if (currentUser) {
                console.log('AuthWM: onAuthStateChange - INITIAL_SESSION (user) - Fetching watchlist');
                await fetchWatchedListings(currentUser);
            } else {
                console.log('AuthWM: onAuthStateChange - INITIAL_SESSION (no user) - Clearing watchlist');
                clearWatchlist();
            }
        }
      }
    );

    return () => {
      console.log('AuthWM: Cleaning up onAuthStateChange listener.');
      authListener?.subscription?.unsubscribe();
    };
  // CRITICAL: Test with the functions in the dependency array.
  // If this causes a loop, the functions from useWatchlistStore are not stable.
  }, [fetchWatchedListings, clearWatchlist]); 

  return null;
}