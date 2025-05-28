// src/components/AuthWatchlistManager.tsx
'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useWatchlistStore } from '@/stores/watchlistStore'; // Import your Zustand store

export default function AuthWatchlistManager() {
  const fetchWatchedListings = useWatchlistStore(state => state.fetchWatchedListings);
  const clearWatchlist = useWatchlistStore(state => state.clearWatchlist);
  // REMOVED: storeLoading is no longer needed as a direct dependency of the useEffect
  // const storeLoading = useWatchlistStore(state => state.isLoading); 

  useEffect(() => {
    // Initial check for session and fetch watchlist if needed
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        // Use getState() directly to check store's loading status without making it a dependency
        if (!useWatchlistStore.getState().isLoading && useWatchlistStore.getState().watchedListingIds.size === 0) {
          console.log("AuthWatchlistManager: Initial session found, fetching watchlist.");
          fetchWatchedListings(session.user);
        }
      } else {
        console.log("AuthWatchlistManager: No initial session, clearing watchlist.");
        clearWatchlist();
      }
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log("AuthWatchlistManager: Auth state changed. Event:", _event);
      if (session?.user) {
        // On SIGNED_IN or TOKEN_REFRESHED, fetch/refresh watchlist
        // Use getState() directly to check store's loading status without making it a dependency
        if (!useWatchlistStore.getState().isLoading) {
          console.log("AuthWatchlistManager: User signed in/refreshed, fetching watchlist.");
          fetchWatchedListings(session.user);
        }
      } else {
        // On SIGNED_OUT, clear the watchlist
        console.log("AuthWatchlistManager: User signed out, clearing watchlist.");
        clearWatchlist();
      }
    });

    return () => {
      console.log("AuthWatchlistManager: Cleaning up auth subscription.");
      subscription?.unsubscribe();
    };
  }, [fetchWatchedListings, clearWatchlist]); // MODIFIED: Removed storeLoading from dependencies

  return null; // This component does not render any UI
}