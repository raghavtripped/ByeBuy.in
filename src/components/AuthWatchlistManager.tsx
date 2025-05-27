// src/components/AuthWatchlistManager.tsx
'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useWatchlistStore } from '@/stores/watchlistStore';

export default function AuthWatchlistManager() {
  // Get actions ONCE using getState(). These references should be stable.
  // Destructure directly to avoid re-creating references in the dependency array.
  const { fetchWatchedListings, clearWatchlist } = useWatchlistStore.getState();

  useEffect(() => {
    const getInitialUserAndWatchlist = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          console.error("AuthWM: Error getting initial session:", sessionError.message);
          clearWatchlist(); // Clear on session fetch error
          return;
        }
        const currentUser = session?.user ?? null;
        if (currentUser) {
          await fetchWatchedListings(currentUser);
        } else {
          clearWatchlist();
        }
      } catch (e: unknown) {
        console.error("AuthWM: CATCH in getInitialUserAndWatchlist", e instanceof Error ? e.message : String(e));
        clearWatchlist(); // Ensure clear on any unexpected error
      }
    };

    getInitialUserAndWatchlist(); // Call on mount

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const currentUser = session?.user ?? null;

        // Re-fetch actions from getState inside callback to ensure latest, though usually stable
        // This is a good pattern for Zustand actions used in async callbacks.
        const { fetchWatchedListings: currentFetch, clearWatchlist: currentClear } = useWatchlistStore.getState();

        if (event === 'SIGNED_IN' && currentUser) {
          await currentFetch(currentUser);
        } else if (event === 'SIGNED_OUT') {
          currentClear();
        } else if (event === 'USER_UPDATED' && currentUser) {
          // User updated (e.g., email change, password change), re-fetch watchlist
          await currentFetch(currentUser);
        } else if (event === 'INITIAL_SESSION') {
            if (currentUser) {
                await currentFetch(currentUser);
            } else {
                currentClear();
            }
        }
      }
    );

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, [fetchWatchedListings, clearWatchlist]); // These are stable references from getState()

  return null;
}