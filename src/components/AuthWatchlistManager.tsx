'use client';

import { useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useWatchlistStore } from '../stores/watchlistStore';

export default function AuthWatchlistManager() {
  const { 
    fetchAndSyncWatchlist, 
    clearWatchlistLocal,
    setupRealtimeSync,
    cleanupRealtimeSync 
  } = useWatchlistStore(state => state.actions);
  const hasFetched = useWatchlistStore(state => state.hasFetchedInitialWatchlist);

  useEffect(() => {
    let isMounted = true;

    const handleAuthChange = async (_event: string, session: any) => {
      if (!isMounted) return;
      
      if (session?.user && !hasFetched) {
        console.log('AuthWatchlistManager: User signed in, fetching watchlist.');
        await fetchAndSyncWatchlist(session.user.id);
        setupRealtimeSync(session.user.id);
      } else if (!session?.user) {
        console.log('AuthWatchlistManager: User signed out, clearing watchlist.');
        clearWatchlistLocal();
      }
    };
    
    // Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (isMounted && session?.user && !hasFetched) {
        console.log('AuthWatchlistManager: Initial session found, fetching watchlist.');
        fetchAndSyncWatchlist(session.user.id);
        setupRealtimeSync(session.user.id);
      } else if (isMounted && !session?.user) {
        clearWatchlistLocal();
      }
    });

    // Subscribe to auth changes
    const { data: authListener } = supabase.auth.onAuthStateChange(handleAuthChange);
    
    return () => {
      isMounted = false;
      authListener?.subscription.unsubscribe();
      cleanupRealtimeSync();
    };
  }, [fetchAndSyncWatchlist, clearWatchlistLocal, setupRealtimeSync, cleanupRealtimeSync, hasFetched]);

  return null; // This component does not render UI
} 