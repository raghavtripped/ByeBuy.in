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
  const currentUserId = useRef<string | null>(null);

  useEffect(() => {
    isMounted.current = true;
    let retryTimeout: NodeJS.Timeout;

    const setupWatchlist = async (userId: string) => {
      if (!isMounted.current || currentUserId.current !== userId) return;
      
      try {
        console.log('Setting up watchlist for user:', userId, 'hasFetched:', hasFetched);
        
        // First fetch the watchlist
        await fetchAndSyncWatchlist(userId);
        
        if (!isMounted.current || currentUserId.current !== userId) return;
        
        // Then setup realtime sync
        await setupRealtimeSync(userId);
        setupAttempts.current = 0;
      } catch (error) {
        console.error('Error setting up watchlist:', error);
        if (setupAttempts.current < maxAttempts && isMounted.current && currentUserId.current === userId) {
          setupAttempts.current++;
          // Exponential backoff: 1s, 2s, 4s
          const delay = Math.pow(2, setupAttempts.current - 1) * 1000;
          retryTimeout = setTimeout(() => void setupWatchlist(userId), delay);
        }
      }
    };

    const handleAuthChange = async (event: AuthChangeEvent, session: Session | null) => {
      if (!isMounted.current) return;
      
      const userId = session?.user?.id ?? null;
      currentUserId.current = userId;

      if (event === 'SIGNED_OUT' || !userId) {
        console.log('User signed out, clearing watchlist');
        await cleanupRealtimeSync();
        clearWatchlistLocal();
      } else if (userId && !hasFetched) {
        console.log('Auth state change - setting up watchlist for user:', userId);
        await setupWatchlist(userId);
      }
    };
    
    // Initial session check
    let initialCheckDone = false;
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted.current || initialCheckDone) return;
      initialCheckDone = true;
      
      const userId = session?.user?.id ?? null;
      currentUserId.current = userId;

      if (userId && !hasFetched) {
        console.log('Initial session found, setting up watchlist');
        void setupWatchlist(userId);
      } else if (!userId) {
        clearWatchlistLocal();
      }
    });

    // Subscribe to auth changes
    const { data: authListener } = supabase.auth.onAuthStateChange(handleAuthChange);
    
    return () => {
      console.log('AuthWatchlistManager unmounting, cleaning up');
      isMounted.current = false;
      currentUserId.current = null;
      if (retryTimeout) clearTimeout(retryTimeout);
      if (authListener?.subscription) {
        authListener.subscription.unsubscribe();
      }
      void cleanupRealtimeSync();
    };
  }, [fetchAndSyncWatchlist, clearWatchlistLocal, setupRealtimeSync, cleanupRealtimeSync, hasFetched]);

  // This component does not render UI
  return null;
} 