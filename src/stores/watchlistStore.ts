// src/stores/watchlistStore.ts
import { create } from 'zustand';
import { supabase } from '@/lib/supabaseClient';
import type { User } from '@supabase/supabase-js'; // Ensure User is imported

// interface WatchedListingEntry { ... } // This was correctly removed in the previous fix

interface WatchlistState {
  watchedListingIds: Set<string>;
  isLoading: boolean;
  error: string | null;
  fetchWatchedListings: (user: User | null) => Promise<void>;
  addToWatchlistLocal: (listingId: string) => void;
  removeFromWatchlistLocal: (listingId: string) => void;
  isWatched: (listingId: string) => boolean; // This function needs to return a boolean
  clearWatchlist: () => void;
}

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
      const { data, error: fetchDbError } = await supabase
        .from('watched_listings')
        .select('listing_id')
        .eq('user_id', user.id);

      if (fetchDbError) {
        throw fetchDbError;
      }

      const idSet = new Set(data?.map(item => item.listing_id) || []);
      set({ watchedListingIds: idSet, isLoading: false });
    } catch (error: unknown) {
      console.error("Error fetching watchlist:", error);
      let message = 'Failed to fetch watchlist';
      if (error instanceof Error) {
        message = error.message;
      } else if (typeof error === 'string') {
        message = error;
      }
      set({ error: message, isLoading: false, watchedListingIds: new Set() });
    }
  },

  addToWatchlistLocal: (listingId: string) => {
    set(state => ({
      watchedListingIds: new Set(state.watchedListingIds).add(listingId),
    }));
  },

  removeFromWatchlistLocal: (listingId: string) => {
    set(state => {
      const newSet = new Set(state.watchedListingIds);
      newSet.delete(listingId);
      return { watchedListingIds: newSet };
    });
  },

  // CORRECTED: Ensure explicit return
  isWatched: (listingId: string): boolean => {
    return get().watchedListingIds.has(listingId);
  },

  clearWatchlist: () => {
    set({ watchedListingIds: new Set(), isLoading: false, error: null });
  }
}));