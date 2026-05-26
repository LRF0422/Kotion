/**
 * Vue 3 Composable for Instant Message
 * Usage: const { messages, unreadCount, sendMessage, markAsRead } = useInstantMessage()
 */

import { ref, reactive, onMounted, onUnmounted, computed } from 'vue';
import { 
  InstantMessageService, 
  InstantMessage, 
  Conversation,
  ContentType 
} from './instant-message';

// ============== Configuration ==============

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:7770';

// ============== Store State ==============

interface MessageState {
  messages: Map<string, InstantMessage[]>;  // conversationId -> messages
  conversations: Conversation[];
  unreadCount: number;
  isConnected: boolean;
  currentConversationId: string | null;
}

const state = reactive<MessageState>({
  messages: new Map(),
  conversations: [],
  unreadCount: 0,
  isConnected: false,
  currentConversationId: null
});

let service: InstantMessageService | null = null;

// ============== Main Composable ==============

export function useInstantMessage() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  /** Initialize the service */
  const init = (token: string) => {
    if (service) {
      service.disconnect();
    }

    service = new InstantMessageService(BASE_URL, token);

    // Register event handlers
    service.ws
      .on('onConnect', () => {
        state.isConnected = true;
        console.log('IM WebSocket connected');
      })
      .on('onDisconnect', () => {
        state.isConnected = false;
        console.log('IM WebSocket disconnected');
      })
      .on('onNewMessage', (message) => {
        addMessage(message);
        if (message.conversationId !== state.currentConversationId) {
          state.unreadCount++;
        }
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
        state.unreadCount = count;
      });

    service.connect();
  };

  /** Disconnect service */
  const destroy = () => {
    service?.disconnect();
    service = null;
    state.isConnected = false;
  };

  /** Add message to store */
  const addMessage = (message: InstantMessage) => {
    const { conversationId } = message;
    if (!state.messages.has(conversationId)) {
      state.messages.set(conversationId, []);
    }
    const messages = state.messages.get(conversationId)!;
    
    // Avoid duplicates
    if (!messages.find(m => m.id === message.id)) {
      messages.push(message);
      // Sort by time
      messages.sort((a, b) => 
        new Date(a.sentTime).getTime() - new Date(b.sentTime).getTime()
      );
    }
  };

  /** Update message status */
  const updateMessageStatus = (messageId: number, status: 'DELIVERED' | 'READ') => {
    state.messages.forEach(messages => {
      const msg = messages.find(m => m.id === messageId);
      if (msg) {
        msg.status = status;
      }
    });
  };

  /** Update conversation last message */
  const updateConversationLastMessage = (message: InstantMessage) => {
    const conversation = state.conversations.find(
      c => c.conversationId === message.conversationId
    );
    if (conversation) {
      conversation.lastMessageContent = message.content;
      conversation.lastMessageContentType = message.contentType;
      conversation.lastMessageTime = message.sentTime;
    }
  };

  /** Send message via WebSocket */
  const sendMessage = (receiverId: number, content: string, contentType: ContentType = 'TEXT') => {
    service?.ws.sendMessage(receiverId, content, contentType);
  };

  /** Mark message as read via WebSocket */
  const markAsRead = (messageId: number) => {
    service?.ws.markAsRead(messageId);
    if (state.unreadCount > 0) {
      state.unreadCount--;
    }
  };

  /** Mark all messages from sender as read */
  const markAllAsRead = (senderId?: number) => {
    service?.ws.markAllAsRead(senderId);
  };

  /** Load conversations */
  const loadConversations = async () => {
    if (!service) return;
    loading.value = true;
    try {
      const res = await service.api.getConversations();
      if (res.success) {
        state.conversations = res.data;
      }
    } catch (e: any) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  };

  /** Load conversation messages */
  const loadMessages = async (userId: number, pageNum = 1, pageSize = 20) => {
    if (!service) return;
    loading.value = true;
    try {
      const res = await service.api.getConversation(userId, pageNum, pageSize);
      if (res.success) {
        res.data.records.forEach(addMessage);
        return res.data;
      }
    } catch (e: any) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  };

  /** Set current conversation */
  const setCurrentConversation = (conversationId: string | null) => {
    state.currentConversationId = conversationId;
  };

  /** Get messages for current conversation */
  const currentMessages = computed(() => {
    if (!state.currentConversationId) return [];
    return state.messages.get(state.currentConversationId) || [];
  });

  /** Check if user is online */
  const checkOnline = async (userId: number): Promise<boolean> => {
    if (!service) return false;
    const res = await service.api.isUserOnline(userId);
    return res.success && res.data;
  };

  // Lifecycle
  onUnmounted(() => {
    // Don't destroy on unmount - let parent manage lifecycle
  });

  return {
    // State
    state,
    loading,
    error,
    currentMessages,
    
    // Actions
    init,
    destroy,
    sendMessage,
    markAsRead,
    markAllAsRead,
    loadConversations,
    loadMessages,
    setCurrentConversation,
    checkOnline,
    
    // Computed
    isConnected: computed(() => state.isConnected),
    unreadCount: computed(() => state.unreadCount),
    conversations: computed(() => state.conversations)
  };
}

// ============== Simple Hook for Components ==============

export function useChat(otherUserId: number) {
  const { 
    state, 
    sendMessage: send, 
    markAsRead,
    loadMessages, 
    setCurrentConversation 
  } = useInstantMessage();

  const conversationId = computed(() => {
    const currentUserId = getCurrentUserId(); // You need to implement this
    const min = Math.min(currentUserId, otherUserId);
    const max = Math.max(currentUserId, otherUserId);
    return `${min}_${max}`;
  });

  const messages = computed(() => {
    return state.messages.get(conversationId.value) || [];
  });

  const sendMessage = (content: string, contentType: ContentType = 'TEXT') => {
    send(otherUserId, content, contentType);
  };

  const loadMore = async (page = 1) => {
    await loadMessages(otherUserId, page);
  };

  // Set current conversation on mount
  onMounted(() => {
    setCurrentConversation(conversationId.value);
    loadMore();
  });

  onUnmounted(() => {
    setCurrentConversation(null);
  });

  return {
    messages,
    sendMessage,
    markAsRead,
    loadMore
  };
}

// Helper function - implement based on your auth system
function getCurrentUserId(): number {
  // Example: return store.state.user.id;
  // Or: return JSON.parse(localStorage.getItem('user')).id;
  return 0;
}

export default useInstantMessage;
