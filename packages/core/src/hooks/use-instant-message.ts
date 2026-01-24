import { useState, useEffect, useRef, useCallback } from 'react';

// ==================== Types ====================

export type MessageContentType = 'TEXT' | 'IMAGE' | 'FILE' | 'LINK';
export type MessageStatus = 'SENT' | 'DELIVERED' | 'READ';

/** API Message from backend */
export interface ApiMessage {
    id: number;
    senderId: number;
    senderName: string;
    receiverId: number;
    receiverName?: string;
    content: string;
    contentType: MessageContentType;
    status: MessageStatus;
    sentTime: string;
    readTime?: string;
    conversationId?: string;
}

/** Conversation summary */
export interface Conversation {
    conversationId: string;
    userId: number;
    userName: string;
    userAvatar?: string;
    lastMessageContent: string;
    lastMessageContentType: MessageContentType;
    lastMessageTime: string;
    unreadCount: number;
    isOnline: boolean;
}

/** WebSocket message types */
type WsMessageType =
    | 'SEND' | 'READ' | 'READ_ALL' | 'PING' | 'GET_UNREAD_COUNT'  // Client -> Server
    | 'NEW_MESSAGE' | 'MESSAGE_SENT' | 'MESSAGE_READ' | 'OFFLINE_MESSAGES' | 'UNREAD_COUNT' | 'PONG' | 'ERROR'; // Server -> Client

interface WsResponse<T = any> {
    code: number;
    success: boolean;
    data?: {
        type: WsMessageType;
        data: T;
        timestamp: number;
    };
    msg?: string;
}

// ==================== Constants ====================

const TOKEN_KEY = 'knowledge-token';
const WS_BASE_URL = '/ws/message';
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const RECONNECT_DELAY = 3000; // 3 seconds

// ==================== Helper Functions ====================

/**
 * Get JWT token from localStorage
 */
const getToken = (): string | null => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) return null;
    // Token format: "bearer {accessToken}"
    return stored.replace(/^bearer\s+/i, '');
};

/**
 * Build WebSocket URL with token
 */
const buildWsUrl = (): string => {
    const token = getToken();
    if (!token) return '';

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `wss://kotion.top:888/api/knowledge-message${WS_BASE_URL}?token=${token}`;
};

// ==================== Hook ====================

export interface UseInstantMessageOptions {
    /** Auto connect on mount, default true */
    autoConnect?: boolean;
    /** Enable heartbeat, default true */
    heartbeat?: boolean;
    /** Enable auto reconnect, default true */
    autoReconnect?: boolean;
    /** Max reconnect attempts, default 5 */
    maxReconnectAttempts?: number;
}

export interface UseInstantMessageReturn {
    /** All messages */
    messages: ApiMessage[];
    /** Unread count */
    unreadCount: number;
    /** Connection status */
    isConnected: boolean;
    /** Is connecting */
    isConnecting: boolean;
    /** Send a message */
    sendMessage: (receiverId: number, content: string, contentType?: MessageContentType) => void;
    /** Mark single message as read */
    markAsRead: (messageId: number) => void;
    /** Mark all messages as read (optionally from a specific sender) */
    markAllAsRead: (senderId?: number) => void;
    /** Manually connect */
    connect: () => void;
    /** Manually disconnect */
    disconnect: () => void;
    /** Refresh unread count */
    refreshUnreadCount: () => void;
}

export function useInstantMessage(options: UseInstantMessageOptions = {}): UseInstantMessageReturn {
    const {
        autoConnect = true,
        heartbeat = true,
        autoReconnect = true,
        maxReconnectAttempts = 5
    } = options;

    const ws = useRef<WebSocket | null>(null);
    const heartbeatTimer = useRef<NodeJS.Timeout | null>(null);
    const reconnectAttempts = useRef(0);
    const reconnectTimer = useRef<NodeJS.Timeout | null>(null);

    const [messages, setMessages] = useState<ApiMessage[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isConnected, setIsConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);

    // Clear timers
    const clearTimers = useCallback(() => {
        if (heartbeatTimer.current) {
            clearInterval(heartbeatTimer.current);
            heartbeatTimer.current = null;
        }
        if (reconnectTimer.current) {
            clearTimeout(reconnectTimer.current);
            reconnectTimer.current = null;
        }
    }, []);

    // Start heartbeat
    const startHeartbeat = useCallback(() => {
        if (!heartbeat) return;

        heartbeatTimer.current = setInterval(() => {
            if (ws.current?.readyState === WebSocket.OPEN) {
                ws.current.send(JSON.stringify({ type: 'PING' }));
            }
        }, HEARTBEAT_INTERVAL);
    }, [heartbeat]);

    // Handle incoming WebSocket messages
    const handleWsMessage = useCallback((event: MessageEvent) => {
        try {
            const response: WsResponse = JSON.parse(event.data);

            if (!response.success || !response.data) {
                console.warn('[InstantMessage] Error response:', response.msg);
                return;
            }

            const { type, data } = response.data;

            switch (type) {
                case 'NEW_MESSAGE':
                    // New message received
                    setMessages(prev => [...prev, data as ApiMessage]);
                    setUnreadCount(prev => prev + 1);
                    break;

                case 'MESSAGE_SENT':
                    // Message sent confirmation
                    setMessages(prev => [...prev, data as ApiMessage]);
                    break;

                case 'OFFLINE_MESSAGES':
                    // Offline messages on connect
                    const offlineMessages = data as ApiMessage[];
                    setMessages(prev => [...offlineMessages, ...prev]);
                    break;

                case 'UNREAD_COUNT':
                    // Unread count update
                    setUnreadCount(data as number);
                    break;

                case 'MESSAGE_READ':
                    // Message read by receiver
                    const readMessageId = data as number;
                    setMessages(prev =>
                        prev.map(m => m.id === readMessageId ? { ...m, status: 'READ' as MessageStatus } : m)
                    );
                    break;

                case 'PONG':
                    // Heartbeat response - no action needed
                    break;

                default:
                    console.log('[InstantMessage] Unknown message type:', type);
            }
        } catch (error) {
            console.error('[InstantMessage] Failed to parse message:', error);
        }
    }, []);

    // Connect to WebSocket
    const connect = useCallback(() => {
        const token = getToken();
        if (!token) {
            console.warn('[InstantMessage] No auth token available');
            return;
        }

        if (ws.current?.readyState === WebSocket.OPEN || isConnecting) {
            return;
        }

        setIsConnecting(true);
        const url = buildWsUrl();

        try {
            ws.current = new WebSocket(url);

            ws.current.onopen = () => {
                console.log('[InstantMessage] Connected');
                setIsConnected(true);
                setIsConnecting(false);
                reconnectAttempts.current = 0;
                startHeartbeat();
            };

            ws.current.onmessage = handleWsMessage;

            ws.current.onclose = (event) => {
                console.log('[InstantMessage] Disconnected:', event.code, event.reason);
                setIsConnected(false);
                setIsConnecting(false);
                clearTimers();

                // Auto reconnect
                if (autoReconnect && reconnectAttempts.current < maxReconnectAttempts) {
                    reconnectAttempts.current++;
                    console.log(`[InstantMessage] Reconnecting (${reconnectAttempts.current}/${maxReconnectAttempts})...`);
                    reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY);
                }
            };

            ws.current.onerror = (error) => {
                console.error('[InstantMessage] WebSocket error:', error);
                setIsConnecting(false);
            };
        } catch (error) {
            console.error('[InstantMessage] Failed to connect:', error);
            setIsConnecting(false);
        }
    }, [autoReconnect, maxReconnectAttempts, handleWsMessage, startHeartbeat, clearTimers, isConnecting]);

    // Disconnect
    const disconnect = useCallback(() => {
        clearTimers();
        reconnectAttempts.current = maxReconnectAttempts; // Prevent auto reconnect

        if (ws.current) {
            ws.current.close();
            ws.current = null;
        }

        setIsConnected(false);
    }, [clearTimers, maxReconnectAttempts]);

    // Send message
    const sendMessage = useCallback((
        receiverId: number,
        content: string,
        contentType: MessageContentType = 'TEXT'
    ) => {
        if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({
                type: 'SEND',
                receiverId,
                content,
                contentType
            }));
        } else {
            console.warn('[InstantMessage] Cannot send message: not connected');
        }
    }, []);

    // Mark message as read
    const markAsRead = useCallback((messageId: number) => {
        if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({
                type: 'READ',
                messageId
            }));
            // Optimistically update local state
            setMessages(prev =>
                prev.map(m => m.id === messageId ? { ...m, status: 'READ' as MessageStatus } : m)
            );
            setUnreadCount(prev => Math.max(0, prev - 1));
        }
    }, []);

    // Mark all messages as read
    const markAllAsRead = useCallback((senderId?: number) => {
        if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({
                type: 'READ_ALL',
                ...(senderId && { senderId })
            }));
            // Optimistically update local state
            setMessages(prev => prev.map(m => ({ ...m, status: 'READ' as MessageStatus })));
            setUnreadCount(0);
        }
    }, []);

    // Refresh unread count
    const refreshUnreadCount = useCallback(() => {
        if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ type: 'GET_UNREAD_COUNT' }));
        }
    }, []);

    // Auto connect on mount
    useEffect(() => {
        if (autoConnect) {
            connect();
        }

        return () => {
            disconnect();
        };
    }, [autoConnect]); // eslint-disable-line react-hooks/exhaustive-deps

    return {
        messages,
        unreadCount,
        isConnected,
        isConnecting,
        sendMessage,
        markAsRead,
        markAllAsRead,
        connect,
        disconnect,
        refreshUnreadCount
    };
}

export default useInstantMessage;
