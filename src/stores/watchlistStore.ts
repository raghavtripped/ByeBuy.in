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
      // console.log("STORE: fetchWatchedListings - No user, clearing watchlist and returning.");
      set({ watchedListingIds: new Set(), isLoading: false, error: null });
      return;
    }
    set({ isLoading: true, error: null });
    // console.log("STORE: fetchWatchedListings - START for user:", user.id);
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
        // console.error("STORE: fetchWatchedListings - Timeout Error:", result.message);
        throw result;
      }

      // If not an Error, it's the result from Supabase.
      // We explicitly cast to the expected Supabase response shape.
      const { data, error: fetchDbError } = result as SupabaseSelectArrayResponse<WatchedListingData>;
      // console.log("STORE: fetchWatchedListings - DB result. Error:", fetchDbError, "Data:", data);

      if (fetchDbError) {
        // console.error("STORE: fetchWatchedListings - Supabase DB Error:", fetchDbError);
        throw fetchDbError; // Throw PostgrestError or similar
      }

      const idSet = new Set(data?.map(item => item.listing_id) || []);
      set({ watchedListingIds: idSet, isLoading: false, error: null }); // Clear error on success
      // console.log("STORE: fetchWatchedListings - SUCCESS, new count:", idSet.size);
    } catch (error: unknown) {
      // console.error("STORE: fetchWatchedListings - CATCH block. Error:", error);
      let message = 'Failed to fetch watchlist';
      if (error instanceof Error) { // Handles timeout Error and re-thrown PostgrestError (which is an Error subclass)
        message = error.message;
      } else if (typeof error === 'string') { // Less likely path
        message = error;
      // Check if it's a PostgrestError-like object that wasn't an instanceof Error
      } else if (error && typeof error === 'object' && 'message' in error && typeof (error as {message: unknown}).message === 'string'){
        message = (error as {message: string}).message;
      }
      set({ error: message, isLoading: false, watchedListingIds: new Set() });
    }
  },

  addToWatchlistLocal: (listingId: string) => {
    // console.log("STORE: addToWatchlistLocal - START for", listingId);
    set(state => {
      const newSet = new Set(state.watchedListingIds);
      newSet.add(listingId);
      return { watchedListingIds: newSet };
    });
  },

  removeFromWatchlistLocal: (listingId: string) => {
    // console.log("STORE: removeFromWatchlistLocal - START for", listingId);
    set(state => {
      const newSet = new Set(state.watchedListingIds);
      newSet.delete(listingId);
      return { watchedListingIds: newSet };
    });
  },

  isWatched: (listingId: string): boolean => {
    return get().watchedListingIds.has(listingId);
  },

  clearWatchlist: () => {
    // console.log("STORE: clearWatchlist called");
    set({ watchedListingIds: new Set(), isLoading: false, error: null });
  }
}));