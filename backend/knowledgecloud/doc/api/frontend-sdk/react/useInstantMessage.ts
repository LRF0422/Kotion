/**
 * React Hook for Instant Message
 * Usage: const { messages, unreadCount, sendMessage, markAsRead } = useInstantMessage(token)
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  InstantMessageService, 
  InstantMessage, 
  Conversation,
  ContentType,
  PageResponse
} from './instant-message';

// ============== Configuration ==============

const BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:7770';

// ============== Types ==============

interface UseInstantMessageReturn {
  // State
  isConnected: boolean;
  unreadCount: number;
  conversations: Conversation[];
  loading: boolean;
  error: string | null;
  
  // Actions
  sendMessage: (receiverId: number, content: string, contentType?: ContentType) => void;
  markAsRead: (messageId: number) => void;
  markAllAsRead: (senderId?: number) => void;
  loadConversations: () => Promise<void>;
  loadMessages: (userId: number, page?: number, pageSize?: number) => Promise<PageResponse<InstantMessage> | null>;
  getMessages: (conversationId: string) => InstantMessage[];
  checkOnline: (userId: number) => Promise<boolean>;
}

// ============== Main Hook ==============

export function useInstantMessage(token: string): UseInstantMessageReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messagesMap, setMessagesMap] = useState<Map<string, InstantMessage[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const serviceRef = useRef<InstantMessageService | null>(null);

  // Add message to store
  const addMessage = useCallback((message: InstantMessage) => {
    setMessagesMap(prev => {
      const newMap = new Map(prev);
      const messages = newMap.get(message.conversationId) || [];
      
      // Avoid duplicates
      if (!messages.find(m => m.id === message.id)) {
        const newMessages = [...messages, message].sort(
          (a, b) => new Date(a.sentTime).getTime() - new Date(b.sentTime).getTime()
        );
        newMap.set(message.conversationId, newMessages);
      }
      
      return newMap;
    });
  }, []);

  // Update message status
  const updateMessageStatus = useCallback((messageId: number, status: 'DELIVERED' | 'READ') => {
    setMessagesMap(prev => {
      const newMap = new Map(prev);
      newMap.forEach((messages, key) => {
        const updatedMessages = messages.map(m => 
          m.id === messageId ? { ...m, status } : m
        );
        newMap.set(key, updatedMessages);
      });
      return newMap;
    });
  }, []);

  // Update conversation last message
  const updateConversationLastMessage = useCallback((message: InstantMessage) => {
    setConversations(prev => 
      prev.map(conv => 
        conv.conversationId === message.conversationId
          ? {
              ...conv,
              lastMessageContent: message.content,
              lastMessageContentType: message.contentType,
              lastMessageTime: message.sentTime
            }
          : conv
      )
    );
  }, []);

  // Initialize WebSocket connection
  useEffect(() => {
    if (!token) return;

    const service = new InstantMessageService(BASE_URL, token);
    serviceRef.current = service;

    service.ws
      .on('onConnect', () => {
        setIsConnected(true);
        console.log('IM WebSocket connected');
      })
      .on('onDisconnect', () => {
        setIsConnected(false);
        console.log('IM WebSocket disconnected');
      })
      .on('onError', () => {
        setError('WebSocket connection error');
      })
      .on('onNewMessage', (message) => {
        addMessage(message);
        setUnreadCount(prev => prev + 1);
        updateConversationLastMessage(message);
      })
      .on('onMessageSent', (message) => {
        addMessage(message);
        updateConversationLastMessage(message);
      })
      .on('onMessageRead', (messageId) => {
        updateMessageStatus(messageId, 'READ');
      })
      .on('onOfflineMessages', (messages) => {
        messages.forEach(addMessage);
      })
      .on('onUnreadCountUpdate', (count) => {
        setUnreadCount(count);
      });

    service.connect();

    return () => {
      service.disconnect();
      serviceRef.current = null;
    };
  }, [token, addMessage, updateMessageStatus, updateConversationLastMessage]);

  // Send message
  const sendMessage = useCallback((
    receiverId: number, 
    content: string, 
    contentType: ContentType = 'TEXT'
  ) => {
    serviceRef.current?.ws.sendMessage(receiverId, content, contentType);
  }, []);

  // Mark as read
  const markAsRead = useCallback((messageId: number) => {
    serviceRef.current?.ws.markAsRead(messageId);
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  // Mark all as read
  const markAllAsRead = useCallback((senderId?: number) => {
    serviceRef.current?.ws.markAllAsRead(senderId);
  }, []);

  // Load conversations
  const loadConversations = useCallback(async () => {
    if (!serviceRef.current) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const res = await serviceRef.current.api.getConversations();
      if (res.success) {
        setConversations(res.data);
      } else {
        setError(res.msg);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load messages for a conversation
  const loadMessages = useCallback(async (
    userId: number, 
    page = 1, 
    pageSize = 20
  ): Promise<PageResponse<InstantMessage> | null> => {
    if (!serviceRef.current) return null;
    
    setLoading(true);
    setError(null);
    
    try {
      const res = await serviceRef.current.api.getConversation(userId, page, pageSize);
      if (res.success) {
        res.data.records.forEach(addMessage);
        return res.data;
      } else {
        setError(res.msg);
        return null;
      }
    } catch (e: any) {
      setError(e.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [addMessage]);

  // Get messages for a conversation
  const getMessages = useCallback((conversationId: string): InstantMessage[] => {
    return messagesMap.get(conversationId) || [];
  }, [messagesMap]);

  // Check if user is online
  const checkOnline = useCallback(async (userId: number): Promise<boolean> => {
    if (!serviceRef.current) return false;
    const res = await serviceRef.current.api.isUserOnline(userId);
    return res.success && res.data;
  }, []);

  return {
    isConnected,
    unreadCount,
    conversations,
    loading,
    error,
    sendMessage,
    markAsRead,
    markAllAsRead,
    loadConversations,
    loadMessages,
    getMessages,
    checkOnline
  };
}

// ============== Chat Hook for Specific Conversation ==============

interface UseChatReturn {
  messages: InstantMessage[];
  loading: boolean;
  sendMessage: (content: string, contentType?: ContentType) => void;
  markAsRead: (messageId: number) => void;
  loadMore: (page?: number) => Promise<void>;
}

export function useChat(
  token: string, 
  currentUserId: number, 
  otherUserId: number
): UseChatReturn {
  const { 
    getMessages, 
    sendMessage: send, 
    markAsRead: mark,
    loadMessages,
    loading 
  } = useInstantMessage(token);

  const conversationId = useMemo(() => {
    const min = Math.min(currentUserId, otherUserId);
    const max = Math.max(currentUserId, otherUserId);
    return `${min}_${max}`;
  }, [currentUserId, otherUserId]);

  const messages = useMemo(() => {
    return getMessages(conversationId);
  }, [getMessages, conversationId]);

  const sendMessage = useCallback((content: string, contentType: ContentType = 'TEXT') => {
    send(otherUserId, content, contentType);
  }, [send, otherUserId]);

  const markAsRead = useCallback((messageId: number) => {
    mark(messageId);
  }, [mark]);

  const loadMore = useCallback(async (page = 1) => {
    await loadMessages(otherUserId, page);
  }, [loadMessages, otherUserId]);

  // Load initial messages
  useEffect(() => {
    loadMore();
  }, [loadMore]);

  return {
    messages,
    loading,
    sendMessage,
    markAsRead,
    loadMore
  };
}

export default useInstantMessage;
