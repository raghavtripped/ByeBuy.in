'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useWatchlistStore, type WatchlistState } from '@/stores/watchlistStore';

export default function AuthWatchlistManager() {
  const { 
    initializeWatchlist,
    clearWatchlist
  } = useWatchlistStore((state: WatchlistState) => state.actions);
  const isMounted = useRef(false);
  const initializationAttempted = useRef(false);
  const authListenerRef = useRef<{ subscription: { unsubscribe: () => void } } | null>(null);

  useEffect(() => {
    isMounted.current = true;

    // Initial auth check
    const initializeAuth = async () => {
      if (initializationAttempted.current) return;
      initializationAttempted.current = true;

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user && isMounted.current) {
          await initializeWatchlist(session.user.id);
        }
      } catch (error) {
        console.error('[AuthWatchlistManager] Initial auth check error:', error);
      }
    };

    // Set up auth listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted.current) return;

      try {
        if (event === 'SIGNED_IN' && session?.user) {
          await initializeWatchlist(session.user.id);
        } else if (event === 'SIGNED_OUT') {
          await clearWatchlist();
        }
      } catch (error) {
        console.error('[AuthWatchlistManager] Auth state change error:', error);
      }
    });

    authListenerRef.current = { subscription };
    void initializeAuth();

    return () => {
      isMounted.current = false;
      if (authListenerRef.current?.subscription) {
        try {
          authListenerRef.current.subscription.unsubscribe();
          authListenerRef.current = null;
        } catch (error) {
          console.error('[AuthWatchlistManager] Error during cleanup:', error);
        }
      }
      void clearWatchlist();
    };
  }, [initializeWatchlist, clearWatchlist]);

  return null;
} 