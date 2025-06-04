'use client';

import { useEffect, useRef, useCallback } from 'react';
import { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import { useWatchlistStore, type WatchlistState } from '@/stores/watchlistStore';

// Keep track of whether the component is mounted globally
let isGloballyMounted = false;

export default function AuthWatchlistManager() {
  const { 
    initializeWatchlist,
    clearWatchlist
  } = useWatchlistStore((state: WatchlistState) => state.actions);
  const currentUserId = useWatchlistStore((state: WatchlistState) => state.currentUserId);
  const isMounted = useRef(true);
  const setupAttempts = useRef(0);
  const maxAttempts = 3;
  const authChangeHandled = useRef(false);
  const authListenerRef = useRef<{ subscription: { unsubscribe: () => void } } | null>(null);

  // Memoize the setup function to prevent unnecessary re-renders
  const setupWatchlist = useCallback(async (userId: string) => {
    if (!isMounted.current || !userId) {
      return;
    }
    
    try {
      await initializeWatchlist(userId);
      setupAttempts.current = 0;
      authChangeHandled.current = true;
    } catch (error) {
      console.error('[AuthWatchlistManager] Error setting up watchlist:', error);
      if (setupAttempts.current < maxAttempts && isMounted.current) {
        setupAttempts.current++;
        const delay = Math.pow(2, setupAttempts.current - 1) * 1000;
        setTimeout(() => {
          if (isMounted.current && !authChangeHandled.current) {
            void setupWatchlist(userId);
          }
        }, delay);
      }
    }
  }, [initializeWatchlist]);

  // Memoize the auth change handler to prevent unnecessary re-renders
  const handleAuthChange = useCallback(async (event: AuthChangeEvent, session: Session | null) => {
    if (!isMounted.current) {
      return;
    }
    
    const userId = session?.user?.id ?? null;

    try {
      if (event === 'SIGNED_OUT' || !userId) {
        await clearWatchlist();
        authChangeHandled.current = true;
      } else if (userId !== currentUserId && !authChangeHandled.current) {
        await setupWatchlist(userId);
      }
    } catch (error) {
      console.error('[AuthWatchlistManager] Error handling auth change:', error);
    }
  }, [setupWatchlist, clearWatchlist, currentUserId]);

  useEffect(() => {
    // Prevent multiple instances from mounting
    if (isGloballyMounted) {
      isMounted.current = false;
      return;
    }

    isGloballyMounted = true;
    isMounted.current = true;
    authChangeHandled.current = false;
    setupAttempts.current = 0;

    // Clean up any existing listener before setting up a new one
    if (authListenerRef.current?.subscription) {
      authListenerRef.current.subscription.unsubscribe();
      authListenerRef.current = null;
    }

    // Initialize auth state
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        await handleAuthChange('SIGNED_IN', session);
        
        // Set up auth listener only after initial check
        const { data: listener } = supabase.auth.onAuthStateChange(handleAuthChange);
        authListenerRef.current = listener;
      } catch (error) {
        console.error('[AuthWatchlistManager] Error initializing auth:', error);
      }
    };

    void initAuth();
    
    // Cleanup function
    return () => {
      if (isMounted.current) {
        isGloballyMounted = false;
        isMounted.current = false;
        if (authListenerRef.current?.subscription) {
          authListenerRef.current.subscription.unsubscribe();
          authListenerRef.current = null;
        }
      }
    };
  }, [handleAuthChange]); // Only depend on the memoized handler

  // This component does not render UI
  return null;
} 