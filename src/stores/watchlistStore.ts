import { create } from 'zustand';
import { supabase } from '@/lib/supabaseClient'; // Adjust path if necessary
import { User } from '@supabase/supabase-js';

interface WatchedListingEntry {
  listing_id: string;
  // You could add other fields like created_at if needed later
}

interface WatchlistState {
  watchedListingIds: Set<string>; // Using a Set for efficient add/delete/check
  isLoading: boolean;
  error: string | null;
  fetchWatchedListings: (user: User | null) => Promise<void>;
  addToWatchlistLocal: (listingId: string) => void;
  removeFromWatchlistLocal: (listingId: string) => void;
  isWatched: (listingId: string) => boolean;
  clearWatchlist: () => void; // For logout
}

export const useWatchlistStore = create<WatchlistState>((set, get) => ({
  watchedListingIds: new Set<string>(),
  isLoading: false,
  error: null,

  fetchWatchedListings: async (user: User | null) => {
    if (!user) {
      set({ watchedListingIds: new Set(), isLoading: false, error: null }); // Clear on no user
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('watched_listings')
        .select('listing_id')
        .eq('user_id', user.id);

      if (error) {
        throw error;
      }

      const idSet = new Set(data?.map(item => item.listing_id) || []);
      set({ watchedListingIds: idSet, isLoading: false });
    } catch (error: any) {
      console.error("Error fetching watchlist:", error);
      set({ error: error.message || 'Failed to fetch watchlist', isLoading: false, watchedListingIds: new Set() });
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

  isWatched: (listingId: string): boolean => {
    return get().watchedListingIds.has(listingId);
  },

  clearWatchlist: () => {
    set({ watchedListingIds: new Set(), isLoading: false, error: null });
  }
}));