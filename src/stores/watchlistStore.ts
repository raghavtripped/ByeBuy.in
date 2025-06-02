import { create } from 'zustand';
import { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';

interface WatchlistState {
  watchedListingIds: Set<string>;
  isLoading: boolean;
  error: string | null;
  hasFetchedInitialWatchlist: boolean;
  realtimeSubscription: RealtimeChannel | null;
  actions: {
    isWatched: (listingId: string) => boolean;
    addToWatchlistLocal: (listingId: string) => void;
    removeFromWatchlistLocal: (listingId: string) => void;
    fetchAndSyncWatchlist: (userId: string) => Promise<void>;
    clearWatchlistLocal: () => void;
    setupRealtimeSync: (userId: string) => Promise<void>;
    cleanupRealtimeSync: () => void;
  };
}

interface WatchedListingRecord {
  listing_id: string;
  user_id: string;
}

export const useWatchlistStore = create<WatchlistState>((set, get) => ({
  watchedListingIds: new Set(),
  isLoading: false,
  error: null,
  hasFetchedInitialWatchlist: false,
  realtimeSubscription: null,
  actions: {
    isWatched: (listingId) => get().watchedListingIds.has(listingId),
    
    addToWatchlistLocal: (listingId) => 
      set((state) => ({ 
        watchedListingIds: new Set(state.watchedListingIds).add(listingId),
        error: null 
      })),
    
    removeFromWatchlistLocal: (listingId) => 
      set((state) => {
        const newSet = new Set(state.watchedListingIds);
        newSet.delete(listingId);
        return { watchedListingIds: newSet, error: null };
      }),
    
    fetchAndSyncWatchlist: async (userId) => {
      if (!userId) return;
      
      set({ isLoading: true, error: null });
      try {
        const { data, error } = await supabase
          .from('watched_listings')
          .select('listing_id')
          .eq('user_id', userId);

        if (error) throw error;
        
        set({ 
          watchedListingIds: new Set(data?.map(item => item.listing_id) || []),
          hasFetchedInitialWatchlist: true,
          isLoading: false 
        });
      } catch (error: any) {
        set({ 
          error: error.message || 'Failed to fetch watchlist',
          isLoading: false,
          hasFetchedInitialWatchlist: true 
        });
      }
    },
    
    clearWatchlistLocal: () => {
      const { cleanupRealtimeSync } = get().actions;
      cleanupRealtimeSync();
      set({ 
        watchedListingIds: new Set(),
        hasFetchedInitialWatchlist: false,
        error: null,
        isLoading: false 
      });
    },

    setupRealtimeSync: async (userId) => {
      try {
        const { cleanupRealtimeSync } = get().actions;
        cleanupRealtimeSync();

        const channel = supabase.channel(`watched_listings_${userId}`);
        
        channel
          .on(
            'postgres_changes' as any,
            {
              event: '*',
              schema: 'public',
              table: 'watched_listings',
              filter: `user_id=eq.${userId}`,
            },
            (payload: { eventType: string; new: WatchedListingRecord; old: WatchedListingRecord }) => {
              const { eventType, new: newRecord, old: oldRecord } = payload;
              
              switch (eventType) {
                case 'INSERT':
                  get().actions.addToWatchlistLocal(newRecord.listing_id);
                  break;
                case 'DELETE':
                  get().actions.removeFromWatchlistLocal(oldRecord.listing_id);
                  break;
                default:
                  break;
              }
            }
          );

        await channel.subscribe();
        set({ realtimeSubscription: channel, error: null });
      } catch (error: any) {
        set({ error: `Failed to setup realtime sync: ${error.message}` });
        console.error('Realtime sync setup error:', error);
      }
    },

    cleanupRealtimeSync: () => {
      const subscription = get().realtimeSubscription;
      if (subscription) {
        subscription.unsubscribe();
        set({ realtimeSubscription: null });
      }
    },
  },
})); 