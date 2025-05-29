// src/components/ListingChat.tsx
'use client';

import { useState, useEffect, FormEvent, ChangeEvent, useRef, useCallback } from 'react';
import { supabase, User } from '@/lib/supabaseClient';
import { formatRelativeTime } from '@/lib/timeUtils';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useNotifications } from '@/hooks/useNotifications'; // Add this import

interface ChatMessage {
  id: string;
  listing_id: string;
  sender_id: string | null; 
  content: string;
  created_at: string;
  sender_email?: string | null; 
}

interface ListingChatProps {
  listingId: string;
  currentUser: User | null; 
}

export default function ListingChat({ listingId, currentUser }: ListingChatProps) {
  const router = useRouter();
  const { showNotification } = useNotifications(); // Add notifications hook
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  
  const messageContainerRef = useRef<null | HTMLDivElement>(null); 

  const fetchInitialMessages = useCallback(async () => {
    if (!listingId) {
      setLoadingMessages(false);
      setError("No listing ID provided for chat.");
      setMessages([]);
      return;
    }
    setLoadingMessages(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('listing_chats_with_sender_email')
        .select('*')
        .eq('listing_id', listingId)
        .order('created_at', { ascending: true });

      if (fetchError) {
        throw fetchError;
      }
      setMessages(data || []);
    } catch (err: unknown) {
      console.error("ListingChat: Error fetching messages:", err);
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
  }, [listingId]); 

  useEffect(() => {
    if (!listingId) {
      setMessages([]);
      setLoadingMessages(false); 
      setError(null); 
      return;
    }

    fetchInitialMessages(); 

    const channel = supabase
      .channel(`listing-chat-${listingId}`) 
      .on<ChatMessage>( 
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'listing_chats', 
          filter: `listing_id=eq.${listingId}`, 
        },
        async (payload) => {
          if (payload.new && payload.new.id) {
            const { data: newMessageDetails, error: fetchDetailsError } = await supabase
              .from('listing_chats_with_sender_email') 
              .select('*')
              .eq('id', payload.new.id)
              .single();

            if (fetchDetailsError) {
              console.error("ListingChat RT: Error fetching details for new message:", fetchDetailsError);
              return;
            }

            if (newMessageDetails) {
              setMessages((prevMessages) => {
                if (prevMessages.find(m => m.id === newMessageDetails.id)) {
                  return prevMessages;
                }
                return [...prevMessages, newMessageDetails as ChatMessage];
              });
            }
          }
        }
      )
      .subscribe((status, err) => { 
        if (status === 'SUBSCRIBED') {
          // console.log(`ListingChat: Realtime SUBSCRIBED to listing-chat-${listingId}`);
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`ListingChat: Realtime CHANNEL_ERROR for listing-chat-${listingId}:`, err);
          setError("Chat connection error. Live updates may not work. Please try refreshing.");
        } else if (status === 'TIMED_OUT') {
          console.warn(`ListingChat: Realtime TIMED_OUT for listing-chat-${listingId}.`);
          setError("Chat connection timed out. Live updates might be delayed.");
        }
      });

    return () => {
      if (channel) {
        supabase.removeChannel(channel)
          .catch(removeError => console.error("ListingChat: Error removing Realtime channel:", removeError));
      }
    };
  }, [listingId, fetchInitialMessages]); 

  useEffect(() => {
    const container = messageContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]); 

  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) {
      showNotification({ 
        type: 'error', 
        message: 'Message cannot be empty.'
      });
      return;
    }
    if (!currentUser) {
      showNotification({
        type: 'error',
        message: 'You must be logged in to send a message.'
      });
      router.push(`/auth?redirect=/listings/${listingId}`);
      return;
    }
    if (!listingId) {
      showNotification({
        type: 'error',
        message: 'Cannot send message: Listing ID is missing.'
      });
      return;
    }

    setIsSending(true);
    const messageContent = newMessage.trim();
    
    try {
      const { error: insertError } = await supabase
        .from('listing_chats') 
        .insert({
          listing_id: listingId,
          sender_id: currentUser.id,
          content: messageContent,
        });

      if (insertError) {
        throw insertError;
      }
      setNewMessage(''); 
    } catch (err: unknown) {
      console.error("ListingChat: Error sending message:", err);
      showNotification({
        type: 'error',
        message: `Failed to send message: ${err instanceof Error ? err.message : 'An unknown error occurred'}`
      });
    } finally {
      setIsSending(false);
    }
  };
  
  const getSenderDisplayName = (message: ChatMessage): string => {
    if (message.sender_id === currentUser?.id) {
      return "You";
    }
    if (message.sender_email) {
      return message.sender_email.includes('@') ? message.sender_email.split('@')[0] : message.sender_email;
    }
    return "Anonymous"; 
  };

  if (!listingId) { 
    return (
        // Updated container, title, and text colors
        <div className="mt-8 p-4 border border-gray-200 dark:border-bye-dark-border-primary rounded-lg bg-white dark:bg-bye-dark-bg-secondary shadow">
             <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-bye-dark-text-primary">Listing Chat</h3>
             <p className="text-sm text-gray-500 dark:text-bye-dark-text-secondary text-center py-8">Loading chat information...</p>
        </div>
    );
  }

  if (loadingMessages && messages.length === 0) {
    return (
      // Updated container, title, and text colors
      <div className="mt-8 p-4 border border-gray-200 dark:border-bye-dark-border-primary rounded-lg bg-white dark:bg-bye-dark-bg-secondary shadow">
        <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-bye-dark-text-primary">Listing Chat</h3>
        <div className="h-64 flex items-center justify-center">
            <p className="text-sm text-gray-500 dark:text-bye-dark-text-secondary">Loading chat messages...</p>
        </div>
      </div>
    );
  }

  if (error && !loadingMessages) { 
    return (
        // Updated error state container, title, and text colors
        <div className="mt-8 p-4 border border-red-300 dark:border-red-700/50 rounded-lg bg-red-50 dark:bg-red-900/20 shadow"> {/* Made dark error bg more subtle */}
            <h3 className="text-lg font-semibold mb-3 text-red-700 dark:text-red-300">Listing Chat Error</h3>
            <p className="text-sm text-red-600 dark:text-red-200 text-center">{error}</p>
            <div className="text-center mt-2">
                {/* Ensure button contrasts well */}
                <button 
                    onClick={fetchInitialMessages} 
                    className="px-3 py-1 bg-red-600 dark:bg-red-500 text-white dark:text-gray-100 text-xs font-medium rounded-md hover:bg-red-700 dark:hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 dark:focus:ring-offset-red-900/20"
                >
                    Try Again
                </button>
            </div>
        </div>
    );
  }

  return (
    // Updated main container, title, and border colors
    <div className="mt-8 p-4 border border-gray-200 dark:border-bye-dark-border-primary rounded-lg bg-white dark:bg-bye-dark-bg-secondary shadow">
      <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-bye-dark-text-primary">Listing Chat</h3>
      
      {/* Updated message container border and "No messages" text color */}
      <div 
        ref={messageContainerRef}
        className="h-64 max-h-[40vh] overflow-y-auto mb-4 space-y-3 pr-2 custom-scrollbar border-b border-gray-200 dark:border-bye-dark-border-primary pb-2"
      >
        {messages.length === 0 && !loadingMessages ? (
          <p className="text-sm text-gray-500 dark:text-bye-dark-text-secondary text-center py-8">No messages yet. Be the first to chat!</p>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex flex-col ${msg.sender_id === currentUser?.id ? 'items-end' : 'items-start'}`}>
              {/* Updated message bubble colors */}
              <div className={`max-w-[75%] sm:max-w-[65%] p-2.5 rounded-lg shadow-sm ${
                msg.sender_id === currentUser?.id 
                  ? 'bg-indigo-500 text-white rounded-br-none' // Sender's bubble (Indigo)
                  : 'bg-gray-100 dark:bg-bye-dark-bg-hover text-gray-800 dark:text-bye-dark-text-primary rounded-bl-none' // Receiver's bubble
              }`}>
                {msg.sender_id !== currentUser?.id && (
                    // Updated sender display name color
                    <p className="text-xs font-semibold mb-0.5 opacity-80 dark:opacity-70 dark:text-bye-dark-text-secondary">{getSenderDisplayName(msg)}</p>
                )}
                <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p> {/* Text color inherited from bubble */}
                {/* Timestamp color updated */}
                <p className={`text-[10px] sm:text-xs mt-1.5 opacity-70 ${msg.sender_id === currentUser?.id ? 'text-right text-indigo-100 dark:text-indigo-200' : 'text-left dark:text-bye-dark-text-secondary'}`}>
                  {formatRelativeTime(msg.created_at)}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {currentUser ? (
        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
          {/* Updated input field styling for dark mode */}
          <input
            type="text"
            value={newMessage}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setNewMessage(e.target.value)}
            placeholder="Type your message..."
            disabled={isSending}
            className="flex-grow border border-gray-300 dark:border-bye-dark-border-primary px-3 py-2 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white dark:bg-bye-dark-bg-hover text-gray-900 dark:text-bye-dark-text-primary dark:placeholder-bye-dark-text-secondary opacity-90 dark:opacity-100"
            aria-label="Chat message input"
          />
          {/* Send button (Indigo) - ensure contrast */}
          <button
            type="submit"
            disabled={isSending || !newMessage.trim()}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-bye-dark-bg-secondary focus:ring-indigo-500 disabled:opacity-50"
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
        // Updated "Log in to chat" text and link colors
        <p className="text-sm text-center text-gray-500 dark:text-bye-dark-text-secondary">
          <Link href={`/auth?redirect=/listings/${listingId}`} className="text-indigo-600 hover:underline dark:text-indigo-400">Log in</Link> to chat about this listing.
        </p>
      )}
    </div>
  );
}