// src/components/AuthWatchlistManager.tsx
'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient'; // User type will be inferred from store actions
import { useWatchlistStore } from '@/stores/watchlistStore';
// REMOVED: import type { User } from '@supabase/supabase-js'; 

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

    getInitialUserAndWatchlist();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // console.log('AuthWM: onAuthStateChange event:', event, 'Session user ID:', session?.user?.id);
        const currentUser = session?.user ?? null;

        if (event === 'SIGNED_IN' && currentUser) {
          await fetchWatchedListings(currentUser);
        } else if (event === 'SIGNED_OUT') {
          clearWatchlist();
        } else if (event === 'USER_UPDATED' && currentUser) {
          await fetchWatchedListings(currentUser);
        } else if (event === 'INITIAL_SESSION') {
            if (currentUser) {
                await fetchWatchedListings(currentUser);
            } else {
                clearWatchlist();
            }
        }
      }
    );

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, [fetchWatchedListings, clearWatchlist]);

  return null;
}