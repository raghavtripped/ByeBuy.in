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
  currentUserId: string | null;
  actions: {
    isWatched: (listingId: string) => boolean;
    addToWatchlistLocal: (listingId: string) => void;
    removeFromWatchlistLocal: (listingId: string) => void;
    initializeWatchlist: (userId: string) => Promise<void>;
    clearWatchlist: () => Promise<void>;
  };
}

type WatchlistPayload = RealtimePostgresChangesPayload<{
  listing_id: string;
  user_id: string;
}>;

// Helper function to create and setup a realtime channel
const setupRealtimeChannel = async (
  userId: string,
  onInsert: (listingId: string) => void,
  onDelete: (listingId: string) => void
): Promise<RealtimeChannel> => {
  const channel = supabase.channel(`watched_listings_${userId}`);

  return new Promise((resolve, reject) => {
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
          console.log('Received watchlist change:', payload.eventType);
          const { eventType, new: newRecord, old: oldRecord } = payload;
          
          switch (eventType) {
            case 'INSERT':
              if (newRecord?.listing_id) {
                onInsert(newRecord.listing_id);
              }
              break;
            case 'DELETE':
              if (oldRecord?.listing_id) {
                onDelete(oldRecord.listing_id);
              }
              break;
            default:
              console.log('Unhandled watchlist event type:', eventType);
          }
          return false; // Indicate sync handling is complete
        }
      )
      .subscribe((status) => {
        console.log('Realtime subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('Successfully subscribed to watchlist updates');
          resolve(channel);
        } else {
          reject(new Error(`Failed to subscribe to channel: ${status}`));
        }
      });
  });
};

// Helper function to cleanup a realtime channel
const cleanupRealtimeChannel = async (channel: RealtimeChannel | null): Promise<void> => {
  if (channel) {
    try {
      console.log('Cleaning up realtime subscription');
      await channel.unsubscribe();
      await supabase.removeChannel(channel);
      console.log('Successfully cleaned up realtime subscription');
    } catch (error) {
      console.error('Error cleaning up realtime subscription:', error);
    }
  }
};

export const useWatchlistStore = create<WatchlistState>((set, get) => ({
  watchedListingIds: new Set(),
  isLoading: false,
  error: null,
  hasFetchedInitialWatchlist: false,
  realtimeSubscription: null,
  currentUserId: null,
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
    
    initializeWatchlist: async (userId: string) => {
      if (!userId) {
        console.error('initializeWatchlist called without userId');
        return;
      }

      // If we're already initialized for this user, do nothing
      if (get().currentUserId === userId && get().hasFetchedInitialWatchlist) {
        console.log('Watchlist already initialized for user:', userId);
        return;
      }

      // Clean up any existing subscription
      await cleanupRealtimeChannel(get().realtimeSubscription);
      
      console.log('Initializing watchlist for user:', userId);
      set({ 
        isLoading: true, 
        error: null,
        currentUserId: userId,
        hasFetchedInitialWatchlist: false 
      });
      
      try {
        // Fetch initial watchlist
        const { data, error } = await supabase
          .from('watched_listings')
          .select('listing_id')
          .eq('user_id', userId);

        if (error) throw error;
        
        const listingIds = data?.map(item => item.listing_id) || [];
        console.log('Fetched watchlist items:', listingIds.length);
        
        // Setup realtime channel
        const channel = await setupRealtimeChannel(
          userId,
          (listingId) => get().actions.addToWatchlistLocal(listingId),
          (listingId) => get().actions.removeFromWatchlistLocal(listingId)
        );
        
        // Update state with initial data and channel
        set({ 
          watchedListingIds: new Set(listingIds),
          hasFetchedInitialWatchlist: true,
          isLoading: false,
          error: null,
          realtimeSubscription: channel
        });
      } catch (error: unknown) {
        const errorMessage = error instanceof PostgrestError ? error.message : 'Failed to initialize watchlist';
        console.error('Error initializing watchlist:', errorMessage);
        set({ 
          error: errorMessage,
          isLoading: false,
          hasFetchedInitialWatchlist: true,
          currentUserId: null
        });
      }
    },

    clearWatchlist: async () => {
      console.log('Clearing watchlist state');
      await cleanupRealtimeChannel(get().realtimeSubscription);
      set({ 
        watchedListingIds: new Set(),
        hasFetchedInitialWatchlist: false,
        error: null,
        isLoading: false,
        realtimeSubscription: null,
        currentUserId: null
      });
    }
  },
})); 