// src/stores/watchlistStore.ts
import { create } from 'zustand';
import { supabase } from '@/lib/supabaseClient';
import type { User, PostgrestError } from '@supabase/supabase-js'; // Ensure PostgrestError is imported

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

// Helper type for the data structure we expect from the watched_listings select
type WatchedListingData = { listing_id: string };

// Helper type for Supabase select responses (more specific)
type SupabaseSelectResponse<T = any> = { data: T[] | null; error: PostgrestError | null; status?: number; count?: number | null };


export const useWatchlistStore = create<WatchlistState>((set, get) => ({
  watchedListingIds: new Set<string>(),
  isLoading: false,
  error: null,

  fetchWatchedListings: async (user: User | null) => { 
    if (!user) {
      console.log("STORE: fetchWatchedListings - No user, clearing watchlist and returning.");
      set({ watchedListingIds: new Set(), isLoading: false, error: null });
      return;
    }
    set({ isLoading: true, error: null });
    console.log("STORE: fetchWatchedListings - START for user:", user.id);
    try {
      const FETCH_TIMEOUT = 7000; // 7 seconds

      // The Supabase call itself returns a "thenable" builder, not immediately a Promise<SupabaseSelectResponse>
      // The 'await' in Promise.race will effectively call .then() on it.
      const dbOperation = supabase
        .from('watched_listings')
        .select('listing_id')
        .eq('user_id', user.id);
      // No explicit type annotation for dbOperation needed here, let Promise.race handle it.

      const timeoutPromise = new Promise<Error>((_, reject) => // Timeout promise rejects with an Error
        setTimeout(() => reject(new Error(`STORE: fetchWatchedListings DB call timed out after ${FETCH_TIMEOUT/1000} seconds`)), FETCH_TIMEOUT)
      );
      
      // When 'dbOperation' is passed to Promise.race, it will be treated as a Promise.
      // TypeScript might still be a bit fussy here with the union type if not explicitly cast later.
      const result = await Promise.race([dbOperation, timeoutPromise]);

      if (result instanceof Error) { // Timeout occurred
        console.error("STORE: fetchWatchedListings - Timeout Error:", result.message);
        throw result; // Propagate the timeout error
      }

      // If not an error, it's the result from Supabase.
      // Now we cast it to what we expect from a successful select.
      const { data, error: fetchDbError } = result as SupabaseSelectResponse<WatchedListingData>;
      console.log("STORE: fetchWatchedListings - DB result. Error:", fetchDbError, "Data:", data);

      if (fetchDbError) {
        console.error("STORE: fetchWatchedListings - Supabase DB Error:", fetchDbError);
        throw fetchDbError;
      }

      const idSet = new Set(data?.map(item => item.listing_id) || []);
      set({ watchedListingIds: idSet, isLoading: false, error: null });
      console.log("STORE: fetchWatchedListings - SUCCESS, new count:", idSet.size);
    } catch (error: unknown) {
      console.error("STORE: fetchWatchedListings - CATCH block. Error:", error);
      let message = 'Failed to fetch watchlist';
      if (error instanceof Error) {
        message = error.message;
      } else if (typeof error === 'string') {
        message = error;
      } else if (error && typeof error === 'object' && 'message' in error && typeof (error as {message: unknown}).message === 'string'){
        message = (error as {message: string}).message;
      }
      set({ error: message, isLoading: false, watchedListingIds: new Set() });
    }
  },

  addToWatchlistLocal: (listingId: string) => {
    console.log("STORE: addToWatchlistLocal - START for", listingId);
    set(state => {
      const newSet = new Set(state.watchedListingIds);
      newSet.add(listingId);
      return { watchedListingIds: newSet };
    });
    // console.log("STORE: addToWatchlistLocal - END for", listingId, useWatchlistStore.getState().watchedListingIds.has(listingId));
  },

  removeFromWatchlistLocal: (listingId: string) => {
    console.log("STORE: removeFromWatchlistLocal - START for", listingId);
    set(state => {
      const newSet = new Set(state.watchedListingIds);
      newSet.delete(listingId);
      return { watchedListingIds: newSet };
    });
    // console.log("STORE: removeFromWatchlistLocal - END for", listingId, !useWatchlistStore.getState().watchedListingIds.has(listingId));
  },

  isWatched: (listingId: string): boolean => {
    const watched = get().watchedListingIds.has(listingId);
    // console.log(`STORE: isWatched for ${listingId}: ${watched}`);
    return watched;
  },

  clearWatchlist: () => {
    console.log("STORE: clearWatchlist called");
    set({ watchedListingIds: new Set(), isLoading: false, error: null });
  }
}));