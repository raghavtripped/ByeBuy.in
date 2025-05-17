// src/components/ListingChat.tsx
'use client';

import { useState, useEffect, FormEvent, ChangeEvent, useRef, useCallback } from 'react';
import { supabase, User } from '@/lib/supabaseClient';
import { formatRelativeTime } from '@/lib/timeUtils';
import Link from 'next/link';

// Interface defining the structure of a chat message
interface ChatMessage {
  id: string;
  listing_id: string;
  sender_id: string | null; // Can be null if, for example, system messages were ever a thing
  content: string;
  created_at: string;
  sender_email?: string | null; // Populated by the 'listing_chats_with_sender_email' view
}

// Interface for the component's props
interface ListingChatProps {
  listingId: string;
  currentUser: User | null; // The currently logged-in user
}

export default function ListingChat({ listingId, currentUser }: ListingChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  
  const messageContainerRef = useRef<null | HTMLDivElement>(null); 

  // Simple notification function (consider replacing with a toast system later)
  const showNotification = (type: 'success' | 'error', message: string) => {
    if (typeof window !== 'undefined') {
      if (type === 'success') alert(`Success: ${message}`); // Keep for now, per our flow
      else alert(`Error: ${message}`); // Keep for now
    }
    console.log(`ListingChat Notification (${type}): ${message}`);
  };

  // Fetches the initial set of messages for the listing
  const fetchInitialMessages = useCallback(async () => {
    if (!listingId) {
      setLoadingMessages(false);
      setError("No listing ID provided for chat.");
      setMessages([]);
      return;
    }
    // console.log(`ListingChat: Fetching initial messages for listingId: ${listingId}`);
    setLoadingMessages(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('listing_chats_with_sender_email') // Use view to get sender_email
        .select('*')
        .eq('listing_id', listingId)
        .order('created_at', { ascending: true });

      if (fetchError) {
        throw fetchError;
      }
      setMessages(data || []);
      // console.log(`ListingChat: Fetched ${data?.length || 0} initial messages.`);
    } catch (err: unknown) {
      console.error("ListingChat: Error fetching initial messages:", err);
      let message = 'Failed to load chat messages.';
      if (err instanceof Error) message = err.message;
      else if (typeof err === 'string') message = err;
      else if (err && typeof err === 'object' && 'message' in err && typeof (err as {message: unknown}).message === 'string') {
           message = (err as {message: string}).message;
      }
      setError(message);
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }, [listingId]); // Dependency is listingId

  // Effect for initial data load and setting up Realtime subscription
  useEffect(() => {
    if (!listingId) {
      // console.log("ListingChat: No listingId in effect, clearing messages and skipping setup.");
      setMessages([]);
      setLoadingMessages(false); // Ensure loading stops if listingId is not present
      setError(null); // Clear any previous errors
      return;
    }

    fetchInitialMessages(); // Load initial messages

    // console.log(`ListingChat: Setting up Realtime channel for listing-chat-${listingId}`);
    const channel = supabase
      .channel(`listing-chat-${listingId}`) // Unique channel name per listing
      .on<ChatMessage>( // Specify the expected payload type for 'postgres_changes'
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'listing_chats', // Listen to the base table for inserts
          filter: `listing_id=eq.${listingId}`, // Server-side filter
        },
        async (payload) => {
          // console.log('ListingChat: Realtime INSERT received!', payload);
          
          // When a new message is inserted, its payload.new will be from 'listing_chats'
          // which might not have sender_email. We need to fetch the full detail.
          if (payload.new && payload.new.id) {
            // console.log(`ListingChat RT: New message ID ${payload.new.id}. Fetching details...`);
            const { data: newMessageDetails, error: fetchDetailsError } = await supabase
              .from('listing_chats_with_sender_email') // Fetch from view to get email
              .select('*')
              .eq('id', payload.new.id)
              .single();

            if (fetchDetailsError) {
              console.error("ListingChat RT: Error fetching details for new message:", fetchDetailsError);
              return;
            }

            if (newMessageDetails) {
              // console.log("ListingChat RT: Successfully fetched new message details:", newMessageDetails);
              setMessages((prevMessages) => {
                // Prevent adding duplicate if somehow already present
                if (prevMessages.find(m => m.id === newMessageDetails.id)) {
                  return prevMessages;
                }
                return [...prevMessages, newMessageDetails as ChatMessage];
              });
            }
          }
        }
      )
      .subscribe((status, err) => { // Handle subscription status changes
        if (status === 'SUBSCRIBED') {
          // console.log(`ListingChat: Realtime SUBSCRIBED to listing-chat-${listingId}`);
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`ListingChat: Realtime CHANNEL_ERROR for listing-chat-${listingId}:`, err);
          setError("Chat connection error. Live updates may not work. Please try refreshing.");
        } else if (status === 'TIMED_OUT') {
          console.warn(`ListingChat: Realtime TIMED_OUT for listing-chat-${listingId}.`);
          setError("Chat connection timed out. Live updates might be delayed.");
        } else {
          // console.log(`ListingChat: Realtime status for listing-chat-${listingId}: ${status}`);
        }
      });

    // Cleanup function to remove the channel subscription when component unmounts or listingId changes
    return () => {
      // console.log(`ListingChat: Cleaning up Realtime channel for listing-chat-${listingId}`);
      if (channel) {
        supabase.removeChannel(channel)
          .catch(removeError => console.error("ListingChat: Error removing Realtime channel:", removeError));
      }
    };
  }, [listingId, fetchInitialMessages]); // Dependencies for this effect

  // Effect for auto-scrolling to the bottom of the message container
  useEffect(() => {
    const container = messageContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]); // Scroll whenever the messages array updates

  // Handles sending a new message
  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) {
        showNotification('error', 'Message cannot be empty.');
        return;
    }
    if (!currentUser) {
        showNotification('error', 'You must be logged in to send a message.');
        router.push(`/auth?redirect=/listings/${listingId}`); // Redirect to login
        return;
    }
    if (!listingId) {
        showNotification('error', 'Cannot send message: Listing ID is missing.');
        return;
    }

    setIsSending(true);
    const messageContent = newMessage.trim();
    
    try {
      const { error: insertError } = await supabase
        .from('listing_chats') // Insert into the base table
        .insert({
          listing_id: listingId,
          sender_id: currentUser.id,
          content: messageContent,
        });

      if (insertError) {
        throw insertError;
      }
      setNewMessage(''); // Clear input field on successful send
      // The message will appear via the real-time subscription, no need to manually add or refetch here
      // console.log("ListingChat: Message insert successful. Realtime should pick it up.");
    } catch (err: unknown) {
      console.error("ListingChat: Error sending message:", err);
      showNotification('error', `Failed to send message: ${err instanceof Error ? err.message : 'An unknown error occurred'}`);
      // Optionally, put the message back in the input if send failed so user doesn't lose it.
      // setNewMessage(messageContent); 
    } finally {
      setIsSending(false);
    }
  };
  
  // Helper to get display name for a message sender
  const getSenderDisplayName = (message: ChatMessage): string => {
    if (message.sender_id === currentUser?.id) {
      return "You";
    }
    if (message.sender_email) {
      return message.sender_email.includes('@') ? message.sender_email.split('@')[0] : message.sender_email;
    }
    return "Anonymous"; // Fallback if sender_email is somehow not available
  };

  // --- Render Logic ---

  if (!listingId) { // Initial state if listingId isn't ready
    return (
        <div className="mt-8 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 shadow">
             <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-100">Listing Chat</h3>
             <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">Loading chat information...</p>
        </div>
    );
  }

  if (loadingMessages && messages.length === 0) {
    return (
      <div className="mt-8 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 shadow">
        <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-100">Listing Chat</h3>
        <div className="h-64 flex items-center justify-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading chat messages...</p>
            {/* Consider adding a small spinner here too */}
        </div>
      </div>
    );
  }

  if (error && !loadingMessages) { 
    return (
        <div className="mt-8 p-4 border border-red-300 dark:border-red-700 rounded-lg bg-red-50 dark:bg-red-900/30 shadow">
            <h3 className="text-lg font-semibold mb-3 text-red-700 dark:text-red-300">Listing Chat Error</h3>
            <p className="text-sm text-red-600 dark:text-red-200 text-center">{error}</p>
            <div className="text-center mt-2">
                <button 
                    onClick={fetchInitialMessages} 
                    className="px-3 py-1 bg-red-600 text-white text-xs font-medium rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1"
                >
                    Try Again
                </button>
            </div>
        </div>
    );
  }

  return (
    <div className="mt-8 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 shadow">
      <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-100">Listing Chat</h3>
      
      {/* Removed the "refresh to see new messages" note as it's now real-time */}

      <div 
        ref={messageContainerRef}
        className="h-64 max-h-[40vh] overflow-y-auto mb-4 space-y-3 pr-2 custom-scrollbar border-b border-gray-200 dark:border-gray-700 pb-2"
      >
        {messages.length === 0 && !loadingMessages ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">No messages yet. Be the first to chat!</p>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex flex-col ${msg.sender_id === currentUser?.id ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[75%] sm:max-w-[65%] p-2.5 rounded-lg shadow-sm ${
                msg.sender_id === currentUser?.id 
                  ? 'bg-indigo-500 text-white rounded-br-none' 
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-bl-none'
              }`}>
                {msg.sender_id !== currentUser?.id && ( // Only show sender name if it's not the current user
                    <p className="text-xs font-semibold mb-0.5 opacity-80">{getSenderDisplayName(msg)}</p>
                )}
                <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                <p className={`text-[10px] sm:text-xs mt-1.5 opacity-70 ${msg.sender_id === currentUser?.id ? 'text-right' : 'text-left'}`}>
                  {formatRelativeTime(msg.created_at)}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {currentUser ? (
        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setNewMessage(e.target.value)}
            placeholder="Type your message..."
            disabled={isSending}
            className="flex-grow border border-gray-300 dark:border-gray-600 px-3 py-2 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm dark:bg-gray-700/80 dark:text-gray-100 dark:placeholder-gray-500"
            aria-label="Chat message input"
          />
          <button
            type="submit"
            disabled={isSending || !newMessage.trim()}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            aria-label={isSending ? "Sending message" : "Send message"}
          >
            {isSending ? (
                 <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
            ) : null}
            {isSending ? 'Sending...' : 'Send'}
          </button>
        </form>
      ) : (
        <p className="text-sm text-center text-gray-500 dark:text-gray-400">
          <Link href={`/auth?redirect=/listings/${listingId}`} className="text-indigo-600 hover:underline dark:text-indigo-400">Log in</Link> to chat about this listing.
        </p>
      )}
    </div>
  );
}