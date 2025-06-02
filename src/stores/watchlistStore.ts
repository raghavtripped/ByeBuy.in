import { create } from 'zustand';
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { PostgrestError } from '@supabase/postgrest-js';
import { supabase } from '@/lib/supabaseClient';

export interface WatchlistState {
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

type WatchlistPayload = RealtimePostgresChangesPayload<{
  listing_id: string;
  user_id: string;
}>;

export const useWatchlistStore = create<WatchlistState>((set, get) => ({
  watchedListingIds: new Set(),
  isLoading: false,
  error: null,
  hasFetchedInitialWatchlist: false,
  realtimeSubscription: null,
  actions: {
    isWatched: (listingId: string) => get().watchedListingIds.has(listingId),
    
    addToWatchlistLocal: (listingId: string) => 
      set((state: WatchlistState) => ({ 
        watchedListingIds: new Set(state.watchedListingIds).add(listingId),
        error: null 
      })),
    
    removeFromWatchlistLocal: (listingId: string) => 
      set((state: WatchlistState) => {
        const newSet = new Set(state.watchedListingIds);
        newSet.delete(listingId);
        return { watchedListingIds: newSet, error: null };
      }),
    
    fetchAndSyncWatchlist: async (userId: string) => {
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
      } catch (error: unknown) {
        const errorMessage = error instanceof PostgrestError ? error.message : 'Failed to fetch watchlist';
        set({ 
          error: errorMessage,
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

    setupRealtimeSync: async (userId: string) => {
      try {
        const { cleanupRealtimeSync } = get().actions;
        cleanupRealtimeSync();

        const channel = supabase.channel(`watched_listings_${userId}`);
        
        channel
          .on(
            'postgres_changes' as const,
            {
              event: '*',
              schema: 'public',
              table: 'watched_listings',
              filter: `user_id=eq.${userId}`,
            },
            (payload: WatchlistPayload) => {
              const { eventType, new: newRecord, old: oldRecord } = payload;
              
              switch (eventType) {
                case 'INSERT':
                  if (newRecord?.listing_id) {
                    get().actions.addToWatchlistLocal(newRecord.listing_id);
                  }
                  break;
                case 'DELETE':
                  if (oldRecord?.listing_id) {
                    get().actions.removeFromWatchlistLocal(oldRecord.listing_id);
                  }
                  break;
                default:
                  break;
              }
            }
          );

        await channel.subscribe();
        set({ realtimeSubscription: channel, error: null });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to setup realtime sync';
        set({ error: `Failed to setup realtime sync: ${errorMessage}` });
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