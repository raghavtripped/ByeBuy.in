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
    cleanupRealtimeSync: () => Promise<void>;
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
    
    addToWatchlistLocal: (listingId: string) => {
      console.log('Adding to watchlist locally:', listingId);
      set((state: WatchlistState) => ({ 
        watchedListingIds: new Set(state.watchedListingIds).add(listingId),
        error: null 
      }));
    },
    
    removeFromWatchlistLocal: (listingId: string) => {
      console.log('Removing from watchlist locally:', listingId);
      set((state: WatchlistState) => {
        const newSet = new Set(state.watchedListingIds);
        newSet.delete(listingId);
        return { watchedListingIds: newSet, error: null };
      });
    },
    
    fetchAndSyncWatchlist: async (userId: string) => {
      if (!userId) {
        console.error('fetchAndSyncWatchlist called without userId');
        return;
      }
      
      console.log('Fetching watchlist for user:', userId);
      set({ isLoading: true, error: null });
      
      try {
        const { data, error } = await supabase
          .from('watched_listings')
          .select('listing_id')
          .eq('user_id', userId);

        if (error) throw error;
        
        const listingIds = data?.map(item => item.listing_id) || [];
        console.log('Fetched watchlist items:', listingIds.length);
        
        set({ 
          watchedListingIds: new Set(listingIds),
          hasFetchedInitialWatchlist: true,
          isLoading: false,
          error: null
        });
      } catch (error: unknown) {
        const errorMessage = error instanceof PostgrestError ? error.message : 'Failed to fetch watchlist';
        console.error('Error fetching watchlist:', errorMessage);
        set({ 
          error: errorMessage,
          isLoading: false,
          hasFetchedInitialWatchlist: true
        });
      }
    },
    
    clearWatchlistLocal: () => {
      console.log('Clearing watchlist state');
      const { cleanupRealtimeSync } = get().actions;
      void cleanupRealtimeSync();
      set({ 
        watchedListingIds: new Set(),
        hasFetchedInitialWatchlist: false,
        error: null,
        isLoading: false 
      });
    },

    setupRealtimeSync: async (userId: string) => {
      if (!userId) {
        console.error('setupRealtimeSync called without userId');
        return;
      }

      // Clean up any existing subscription first
      await get().actions.cleanupRealtimeSync();

      console.log('Setting up realtime sync for user:', userId);
      try {
        const channel = supabase.channel(`watched_listings_${userId}`);
        
        // Set up the channel before subscribing
        channel
          .on(
            'postgres_changes' as const,
            {
              event: '*',
              schema: 'public',
              table: 'watched_listings',
              filter: `user_id=eq.${userId}`,
            },
            async (payload: WatchlistPayload) => {
              console.log('Received watchlist change:', payload.eventType);
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
                  console.log('Unhandled watchlist event type:', eventType);
                  break;
              }
              // Return false to indicate sync handling is complete
              return false;
            }
          );

        // Subscribe to the channel
        const status = await new Promise<'SUBSCRIBED' | string>((resolve) => {
          channel.subscribe((status) => {
            console.log('Realtime subscription status:', status);
            resolve(status);
          });
        });

        if (status === 'SUBSCRIBED') {
          set({ realtimeSubscription: channel, error: null });
          console.log('Successfully subscribed to watchlist updates');
        } else {
          throw new Error(`Failed to subscribe to channel: ${status}`);
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to setup realtime sync';
        console.error('Realtime sync setup error:', errorMessage);
        set({ error: `Failed to setup realtime sync: ${errorMessage}` });
        throw error;
      }
    },

    cleanupRealtimeSync: async () => {
      const subscription = get().realtimeSubscription;
      if (subscription) {
        console.log('Cleaning up realtime subscription');
        try {
          await subscription.unsubscribe();
          await supabase.removeChannel(subscription);
          set({ realtimeSubscription: null });
          console.log('Successfully cleaned up realtime subscription');
        } catch (error) {
          console.error('Error cleaning up realtime subscription:', error);
        }
      }
    },
  },
})); 