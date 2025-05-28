// src/stores/watchlistStore.ts
import { create } from 'zustand';
import { supabase } from '@/lib/supabaseClient';
import type { User } from '@supabase/supabase-js'; // PostgrestError removed as it's no longer directly used

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

export const useWatchlistStore = create<WatchlistState>((set, get) => ({
  watchedListingIds: new Set<string>(),
  isLoading: false,
  error: null,

  fetchWatchedListings: async (user: User | null) => { 
    if (!user) {
      set({ watchedListingIds: new Set(), isLoading: false, error: null });
      return;
    }
    set({ isLoading: true, error: null }); 
    try {
      // MODIFIED: Removed Promise.race and FETCH_TIMEOUT.
      // Now directly await the Supabase query to see its true resolution time.
      const { data, error: fetchDbError } = await supabase
        .from('watched_listings')
        .select('listing_id')
        .eq('user_id', user.id)
        .returns<WatchedListingData[]>(); // Explicitly define return type for better type safety

      if (fetchDbError) {
        throw fetchDbError;
      }

      const idSet = new Set(data?.map(item => item.listing_id) || []);
      set({ watchedListingIds: idSet, isLoading: false, error: null });
    } catch (error: unknown) {
      let message = 'Failed to fetch watchlist';
      if (error instanceof Error) {
        message = error.message;
      } else if (error && typeof error === 'object' && 'message' in error && typeof (error as {message: unknown}).message === 'string'){
        message = (error as {message: string}).message;
      }
      set({ error: message, isLoading: false, watchedListingIds: new Set() });
    }
  },

  addToWatchlistLocal: (listingId: string) => {
    set(state => {
      const newSet = new Set(state.watchedListingIds);
      newSet.add(listingId);
      return { watchedListingIds: newSet };
    });
  },

  removeFromWatchlistLocal: (listingId: string) => {
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
    set({ watchedListingIds: new Set(), isLoading: false, error: null });
  }
}));