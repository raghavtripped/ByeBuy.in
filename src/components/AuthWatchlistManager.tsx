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
  // Tracks which userId is currently being initialized to prevent concurrent double-calls.
  // Both initializeAuth (getSession path) and onAuthStateChange(SIGNED_IN) can fire for
  // the same user on initial page load — this ref gates the second concurrent call.
  const initializingForUserId = useRef<string | null>(null);
  const authListenerRef = useRef<{ subscription: { unsubscribe: () => void } } | null>(null);

  const safeInitializeWatchlist = async (userId: string) => {
    if (initializingForUserId.current === userId) return;
    initializingForUserId.current = userId;
    try {
      await initializeWatchlist(userId);
    } finally {
      initializingForUserId.current = null;
    }
  };

  useEffect(() => {
    isMounted.current = true;

    // Initial auth check
    const initializeAuth = async () => {
      if (initializationAttempted.current) return;
      initializationAttempted.current = true;

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user && isMounted.current) {
          await safeInitializeWatchlist(session.user.id);
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
          await safeInitializeWatchlist(session.user.id);
        } else if (event === 'SIGNED_OUT') {
          initializingForUserId.current = null;
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