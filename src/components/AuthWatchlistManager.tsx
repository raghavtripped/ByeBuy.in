'use client';

import { useEffect, useRef } from 'react';
import { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import { useWatchlistStore, type WatchlistState } from '@/stores/watchlistStore';

export default function AuthWatchlistManager() {
  const { 
    fetchAndSyncWatchlist, 
    clearWatchlistLocal,
    setupRealtimeSync,
    cleanupRealtimeSync 
  } = useWatchlistStore((state: WatchlistState) => state.actions);
  const hasFetched = useWatchlistStore((state: WatchlistState) => state.hasFetchedInitialWatchlist);
  const setupAttempts = useRef(0);
  const maxAttempts = 3;
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    let retryTimeout: NodeJS.Timeout;

    const setupWatchlist = async (userId: string) => {
      if (!isMounted.current) return;
      
      try {
        console.log('Setting up watchlist for user:', userId, 'hasFetched:', hasFetched);
        await fetchAndSyncWatchlist(userId);
        
        if (!isMounted.current) return;
        
        await setupRealtimeSync(userId);
        setupAttempts.current = 0; // Reset attempts on success
      } catch (error) {
        console.error('Error setting up watchlist:', error);
        if (setupAttempts.current < maxAttempts && isMounted.current) {
          setupAttempts.current++;
          // Exponential backoff: 1s, 2s, 4s
          const delay = Math.pow(2, setupAttempts.current - 1) * 1000;
          retryTimeout = setTimeout(() => setupWatchlist(userId), delay);
        }
      }
    };

    const handleAuthChange = async (event: AuthChangeEvent, session: Session | null) => {
      if (!isMounted.current) return;
      
      if (event === 'SIGNED_OUT') {
        console.log('User signed out, clearing watchlist');
        clearWatchlistLocal();
      } else if (session?.user && !hasFetched) {
        console.log('Auth state change - setting up watchlist for user:', session.user.id);
        await setupWatchlist(session.user.id);
      }
    };
    
    // Initial session check
    let initialCheckDone = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted.current || initialCheckDone) return;
      initialCheckDone = true;
      
      if (session?.user && !hasFetched) {
        console.log('Initial session found, setting up watchlist');
        setupWatchlist(session.user.id);
      } else if (!session?.user) {
        clearWatchlistLocal();
      }
    });

    // Subscribe to auth changes
    const { data: authListener } = supabase.auth.onAuthStateChange(handleAuthChange);
    
    return () => {
      console.log('AuthWatchlistManager unmounting, cleaning up');
      isMounted.current = false;
      if (retryTimeout) clearTimeout(retryTimeout);
      if (authListener?.subscription) {
        authListener.subscription.unsubscribe();
      }
      cleanupRealtimeSync();
    };
  }, [fetchAndSyncWatchlist, clearWatchlistLocal, setupRealtimeSync, cleanupRealtimeSync, hasFetched]);

  // This component does not render UI
  return null;
} 