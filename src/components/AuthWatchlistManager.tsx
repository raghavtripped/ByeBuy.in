'use client';

import { useEffect, useRef, useCallback } from 'react';
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
  const authChangeHandled = useRef(false);

  // Memoize the setup function to prevent unnecessary re-renders
  const setupWatchlist = useCallback(async (userId: string) => {
    if (!isMounted.current || !userId) return;
    
    try {
      console.log('Setting up watchlist for user:', userId);
      await initializeWatchlist(userId);
      setupAttempts.current = 0;
      authChangeHandled.current = true;
    } catch (error) {
      console.error('Error setting up watchlist:', error);
      if (setupAttempts.current < maxAttempts && isMounted.current) {
        setupAttempts.current++;
        // Exponential backoff: 1s, 2s, 4s
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
    if (!isMounted.current) return;
    
    const userId = session?.user?.id ?? null;
    console.log('Auth state change event:', event, 'userId:', userId);

    try {
      if (event === 'SIGNED_OUT' || !userId) {
        console.log('User signed out or no user ID, clearing watchlist');
        await clearWatchlist();
        authChangeHandled.current = true;
      } else if (userId !== currentUserId && !authChangeHandled.current) {
        console.log('New user session detected, setting up watchlist');
        await setupWatchlist(userId);
      }
    } catch (error) {
      console.error('Error handling auth change:', error);
    }
  }, [setupWatchlist, clearWatchlist, currentUserId]);

  useEffect(() => {
    // Reset flags on mount
    isMounted.current = true;
    authChangeHandled.current = false;
    setupAttempts.current = 0;

    let authListener: { subscription: { unsubscribe: () => void } } | null = null;

    // Initialize auth state
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        await handleAuthChange('SIGNED_IN', session);
        
        // Set up auth listener only after initial check
        const { data: listener } = supabase.auth.onAuthStateChange(handleAuthChange);
        authListener = listener;
      } catch (error) {
        console.error('Error initializing auth:', error);
      }
    };

    void initAuth();
    
    // Cleanup function
    return () => {
      console.log('AuthWatchlistManager unmounting, cleaning up');
      isMounted.current = false;
      if (authListener?.subscription) {
        authListener.subscription.unsubscribe();
      }
    };
  }, [handleAuthChange]); // Only depend on the memoized handler

  // This component does not render UI
  return null;
} 