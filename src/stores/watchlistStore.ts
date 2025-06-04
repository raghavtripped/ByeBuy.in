import { create } from 'zustand';
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
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
  onDelete: (listingId: string) => void,
  retryAttempt = 0
): Promise<RealtimeChannel> => {
  const maxRetries = 3;
  const channel = supabase.channel(`watched_listings_${userId}`);

  return new Promise((resolve, reject) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        cleanup();
        if (retryAttempt < maxRetries) {
          console.log(`Retrying subscription (attempt ${retryAttempt + 1}/${maxRetries})`);
          resolve(setupRealtimeChannel(userId, onInsert, onDelete, retryAttempt + 1));
        } else {
          console.log('Subscription timeout, but proceeding with channel');
          resolved = true;
          resolve(channel);
        }
      }
    }, retryAttempt === 0 ? 2000 : 5000);

    const cleanup = () => {
      if (timeout) clearTimeout(timeout);
    };

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
                onInsert(newRecord.listing_id);
              }
              break;
            case 'DELETE':
              if (oldRecord?.listing_id) {
                onDelete(oldRecord.listing_id);
              }
              break;
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' || status === 'TIMED_OUT') {
          resolved = true;
          cleanup();
          resolve(channel);
        } else if (status === 'CHANNEL_ERROR') {
          cleanup();
          if (retryAttempt < maxRetries) {
            console.log(`Channel error, retrying (attempt ${retryAttempt + 1}/${maxRetries})`);
            resolve(setupRealtimeChannel(userId, onInsert, onDelete, retryAttempt + 1));
          } else {
            console.log('Channel error, but proceeding with channel');
            resolved = true;
            resolve(channel);
          }
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
        return;
      }

      // Clean up any existing subscription
      await cleanupRealtimeChannel(get().realtimeSubscription);
      
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
        
        // For empty watchlists, we can skip waiting for the realtime subscription
        if (listingIds.length === 0) {
          console.log('Empty watchlist detected, skipping realtime subscription wait');
          set({ 
            watchedListingIds: new Set(),
            hasFetchedInitialWatchlist: true,
            isLoading: false,
            error: null,
            realtimeSubscription: null,
            currentUserId: userId
          });
          
          // Set up realtime subscription in the background
          setupRealtimeChannel(
            userId,
            (listingId) => get().actions.addToWatchlistLocal(listingId),
            (listingId) => get().actions.removeFromWatchlistLocal(listingId)
          ).then(channel => {
            if (get().currentUserId === userId) {  // Only update if still same user
              set({ realtimeSubscription: channel });
            } else {
              cleanupRealtimeChannel(channel);
            }
          }).catch(console.error);  // Log any errors but don't affect UI
          
          return;
        }
        
        // Setup realtime channel with retries for non-empty watchlists
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
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to initialize watchlist';
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