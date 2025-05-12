  // src/components/AuthWatchlistManager.tsx
  'use client';

  import { useEffect } from 'react';
  import { supabase } from '@/lib/supabaseClient';
  import { useWatchlistStore } from '@/stores/watchlistStore';
  import type { User } from '@supabase/supabase-js'; // Explicit User type

  export default function AuthWatchlistManager() {
    // Get actions ONCE using getState(). These references should be stable.
    const { fetchWatchedListings, clearWatchlist } = useWatchlistStore.getState();

    useEffect(() => {
      console.log('AuthWM: Main effect running. Dependencies are stable from getState().');

      const getInitialUserAndWatchlist = async () => {
        console.log('AuthWM: getInitialUserAndWatchlist - START');
        try {
          const { data: { session }, error: sessionError } = await supabase.auth.getSession();
          if (sessionError) {
            console.error("AuthWM: Error getting session:", sessionError.message);
            // Ensure clearWatchlist (from getState) is called
            useWatchlistStore.getState().clearWatchlist(); 
            return;
          }
          const currentUser = session?.user ?? null;
          console.log('AuthWM: getInitialUserAndWatchlist - User ID:', currentUser?.id);
          if (currentUser) {
            // Pass the User object (or null) as expected by the store's action
            await useWatchlistStore.getState().fetchWatchedListings(currentUser);
          } else {
            useWatchlistStore.getState().clearWatchlist();
          }
          console.log('AuthWM: getInitialUserAndWatchlist - END');
        } catch (e: unknown) {
          console.error("AuthWM: CATCH in getInitialUserAndWatchlist", e instanceof Error ? e.message : String(e));
          useWatchlistStore.getState().clearWatchlist();
        }
      };

      getInitialUserAndWatchlist(); // Call on mount

      console.log('AuthWM: Setting up onAuthStateChange listener.');
      const { data: authListener } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          console.log('AuthWM: onAuthStateChange event:', event, 'User ID:', session?.user?.id);
          const currentUser = session?.user ?? null;

          // Use actions obtained from getState() for stability
          const currentFetchWatchedListings = useWatchlistStore.getState().fetchWatchedListings;
          const currentClearWatchlist = useWatchlistStore.getState().clearWatchlist;

          if (event === 'SIGNED_IN' && currentUser) {
            console.log('AuthWM: SIGNED_IN - fetching watchlist');
            await currentFetchWatchedListings(currentUser);
          } else if (event === 'SIGNED_OUT') {
            console.log('AuthWM: SIGNED_OUT - clearing watchlist');
            currentClearWatchlist();
          } else if (event === 'USER_UPDATED' && currentUser) {
            console.log('AuthWM: USER_UPDATED - fetching watchlist');
            await currentFetchWatchedListings(currentUser);
          } else if (event === 'INITIAL_SESSION') {
              if (currentUser) {
                  console.log('AuthWM: INITIAL_SESSION (user) - fetching watchlist');
                  await currentFetchWatchedListings(currentUser);
              } else {
                  console.log('AuthWM: INITIAL_SESSION (no user) - clearing watchlist');
                  currentClearWatchlist();
              }
          }
        }
      );

      return () => {
        console.log('AuthWM: Cleaning up auth listener.');
        authListener?.subscription?.unsubscribe();
      };
    // These dependencies (fetchWatchedListings, clearWatchlist) are now the stable
    // references obtained from useWatchlistStore.getState() at the component's initialization.
    // This should prevent the useEffect from re-running due to these functions changing reference.
    }, [fetchWatchedListings, clearWatchlist]); 

    return null;
  }