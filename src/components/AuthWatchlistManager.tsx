'use client';

import { useEffect, useRef } from 'react';
import { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import { useWatchlistStore, type WatchlistState } from '@/stores/watchlistStore';

export default function AuthWatchlistManager() {
  const { 
    initializeWatchlist,
    clearWatchlist
  } = useWatchlistStore((state: WatchlistState) => state.actions);
  const currentUserId = useWatchlistStore((state: WatchlistState) => state.currentUserId);
  const isMounted = useRef(true);
  const setupAttempts = useRef(0);
  const maxAttempts = 3;

  useEffect(() => {
    isMounted.current = true;
    let retryTimeout: NodeJS.Timeout;

    const setupWatchlist = async (userId: string) => {
      if (!isMounted.current) return;
      
      try {
        console.log('Setting up watchlist for user:', userId);
        await initializeWatchlist(userId);
        setupAttempts.current = 0;
      } catch (error) {
        console.error('Error setting up watchlist:', error);
        if (setupAttempts.current < maxAttempts && isMounted.current) {
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

      if (event === 'SIGNED_OUT' || !userId) {
        console.log('User signed out, clearing watchlist');
        await clearWatchlist();
      } else if (userId && userId !== currentUserId) {
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

      if (userId && userId !== currentUserId) {
        console.log('Initial session found, setting up watchlist');
        void setupWatchlist(userId);
      } else if (!userId) {
        void clearWatchlist();
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
    };
  }, [initializeWatchlist, clearWatchlist, currentUserId]);

  // This component does not render UI
  return null;
} 