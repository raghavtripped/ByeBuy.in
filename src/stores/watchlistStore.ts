// src/stores/watchlistStore.ts
import { create } from 'zustand';
import { supabase } from '@/lib/supabaseClient';
import type { User, PostgrestError } from '@supabase/supabase-js';

interface WatchlistState {
  watchedListingIds: Set<string>;
  isLoading: boolean;
  error: string | null;
  fetchWatchedListings: (user: User | null) => Promise<void>; 
  addToWatchlistLocal: (listingId: string) => void;
  removeFromWatchlistLocal: (listingId: string) => void;
  isWatched: (listingId: string) => boolean;
  clearWatchlist: () => void;
}

type WatchedListingData = { listing_id: string };

// More specific type for Supabase select operations that return an array or null
type SupabaseSelectArrayResponse<T> = 
  | { data: T[]; error: null; status: number; count: number | null }
  | { data: null; error: PostgrestError; status: number; count: number | null };

export const useWatchlistStore = create<WatchlistState>((set, get) => ({
  watchedListingIds: new Set<string>(),
  isLoading: false,
  error: null,

  fetchWatchedListings: async (user: User | null) => { 
    if (!user) {
      // If no user, clear watchlist and ensure loading/error states are clean
      set({ watchedListingIds: new Set(), isLoading: false, error: null });
      return;
    }
    // Set loading true, clear previous error
    set({ isLoading: true, error: null }); 
    try {
      const FETCH_TIMEOUT = 7000;

      const dbOperation = supabase
        .from('watched_listings')
        .select('listing_id')
        .eq('user_id', user.id);

      const timeoutPromise = new Promise<Error>((_, reject) => 
        setTimeout(() => reject(new Error(`STORE: fetchWatchedListings DB call timed out after ${FETCH_TIMEOUT/1000} seconds`)), FETCH_TIMEOUT)
      );
      
      const result = await Promise.race([dbOperation, timeoutPromise]);

      if (result instanceof Error) { // Timeout occurred
        throw result;
      }

      const { data, error: fetchDbError } = result as SupabaseSelectArrayResponse<WatchedListingData>;

      if (fetchDbError) {
        throw fetchDbError;
      }

      const idSet = new Set(data?.map(item => item.listing_id) || []);
      set({ watchedListingIds: idSet, isLoading: false, error: null }); // Clear error on success
    } catch (error: unknown) {
      let message = 'Failed to fetch watchlist';
      if (error instanceof Error) {
        message = error.message;
      } else if (error && typeof error === 'object' && 'message' in error && typeof (error as {message: unknown}).message === 'string'){
        message = (error as {message: string}).message;
      }
      // On error, set error message, set loading false, and clear watchlist IDs
      set({ error: message, isLoading: false, watchedListingIds: new Set() });
    }
  },

  addToWatchlistLocal: (listingId: string) => {
    set(state => {
      // Ensure immutability: create a new Set
      const newSet = new Set(state.watchedListingIds);
      newSet.add(listingId);
      return { watchedListingIds: newSet };
    });
  },

  removeFromWatchlistLocal: (listingId: string) => {
    set(state => {
      // Ensure immutability: create a new Set
      const newSet = new Set(state.watchedListingIds);
      newSet.delete(listingId);
      return { watchedListingIds: newSet };
    });
  },

  isWatched: (listingId: string): boolean => {
    return get().watchedListingIds.has(listingId);
  },

  clearWatchlist: () => {
    set({ watchedListingIds: new Set(), isLoading: false, error: null });
  }
}));