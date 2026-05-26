/**
 * WebSocket Instant Message Service
 * TypeScript SDK for frontend integration
 */

// ============== Type Definitions ==============

/** Message content types */
export type ContentType = 'TEXT' | 'IMAGE' | 'FILE' | 'LINK';

/** Message status */
export type MessageStatus = 'SENT' | 'DELIVERED' | 'READ';

/** WebSocket message types */
export type WebSocketMessageType = 
  | 'NEW_MESSAGE' 
  | 'MESSAGE_SENT' 
  | 'MESSAGE_READ' 
  | 'OFFLINE_MESSAGES' 
  | 'UNREAD_COUNT' 
  | 'PONG' 
  | 'ERROR'
  | 'USER_STATUS'
  | 'MESSAGE_DELIVERED';

/** Client send message types */
export type ClientMessageType = 'SEND' | 'READ' | 'READ_ALL' | 'PING' | 'GET_UNREAD_COUNT';

/** Instant message entity */
export interface InstantMessage {
  id: number;
  senderId: number;
  senderName: string;
  receiverId: number;
  receiverName: string;
  content: string;
  contentType: ContentType;
  status: MessageStatus;
  sentTime: string;
  deliveredTime?: string;
  readTime?: string;
  conversationId: string;
  replyToMessageId?: number;
  extraData?: Record<string, any>;
}

/** Conversation VO */
export interface Conversation {
  conversationId: string;
  userId: number;
  userName: string;
  userAvatar?: string;
  lastMessageContent: string;
  lastMessageContentType: ContentType;
  lastMessageTime: string;
  unreadCount: number;
  isOnline: boolean;
}

/** API Response wrapper */
export interface ApiResponse<T> {
  code: number;
  success: boolean;
  data: T;
  msg: string;
}

/** WebSocket message wrapper */
export interface WebSocketMessage<T = any> {
  type: WebSocketMessageType;
  data: T;
  timestamp: number;
}

/** Send message request */
export interface SendMessageRequest {
  receiverId: number;
  content: string;
  contentType?: ContentType;
  replyToMessageId?: number;
  extraData?: string;
}

/** Mark as read request */
export interface MarkAsReadRequest {
  messageId?: number;
  messageIds?: number[];
  senderId?: number;
  conversationId?: string;
}

/** Paginated response */
export interface PageResponse<T> {
  records: T[];
  total: number;
  size: number;
  current: number;
  pages: number;
}

// ============== Event Types ==============

export interface WebSocketEvents {
  onConnect: () => void;
  onDisconnect: (code: number, reason: string) => void;
  onError: (error: Event) => void;
  onNewMessage: (message: InstantMessage) => void;
  onMessageSent: (message: InstantMessage) => void;
  onMessageRead: (messageId: number) => void;
  onOfflineMessages: (messages: InstantMessage[]) => void;
  onUnreadCountUpdate: (count: number) => void;
}

// ============== WebSocket Service ==============

export class InstantMessageWebSocket {
  private ws: WebSocket | null = null;
  private token: string;
  private baseUrl: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 3000;
  private heartbeatInterval: number | null = null;
  private events: Partial<WebSocketEvents> = {};

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/^http/, 'ws');
    this.token = token;
  }

  /** Register event handlers */
  on<K extends keyof WebSocketEvents>(event: K, handler: WebSocketEvents[K]): this {
    this.events[event] = handler;
    return this;
  }

  /** Connect to WebSocket server */
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.warn('WebSocket is already connected');
      return;
    }

    const url = `${this.baseUrl}/ws/message?token=${this.token}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      this.events.onConnect?.();
    };

    this.ws.onmessage = (event) => {
      try {
        const response: ApiResponse<WebSocketMessage> = JSON.parse(event.data);
        if (response.success && response.data) {
          this.handleMessage(response.data);
        }
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    };

    this.ws.onclose = (event) => {
      console.log('WebSocket disconnected:', event.code, event.reason);
      this.stopHeartbeat();
      this.events.onDisconnect?.(event.code, event.reason);
      this.attemptReconnect();
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.events.onError?.(error);
    };
  }

  /** Disconnect from WebSocket server */
  disconnect(): void {
    this.stopHeartbeat();
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnection
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
  }

  /** Check if connected */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /** Send a message to another user */
  sendMessage(receiverId: number, content: string, contentType: ContentType = 'TEXT'): void {
    this.send({
      type: 'SEND',
      receiverId,
      content,
      contentType
    });
  }

  /** Mark a single message as read */
  markAsRead(messageId: number): void {
    this.send({
      type: 'READ',
      messageId
    });
  }

  /** Mark all messages from a sender as read */
  markAllAsRead(senderId?: number): void {
    this.send({
      type: 'READ_ALL',
      senderId
    });
  }

  /** Request current unread count */
  getUnreadCount(): void {
    this.send({ type: 'GET_UNREAD_COUNT' });
  }

  /** Send ping for heartbeat */
  private ping(): void {
    this.send({ type: 'PING' });
  }

  /** Send raw message */
  private send(data: Record<string, any>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn('WebSocket is not connected');
    }
  }

  /** Handle incoming messages */
  private handleMessage(message: WebSocketMessage): void {
    switch (message.type) {
      case 'NEW_MESSAGE':
        this.events.onNewMessage?.(message.data as InstantMessage);
        break;
      case 'MESSAGE_SENT':
        this.events.onMessageSent?.(message.data as InstantMessage);
        break;
      case 'MESSAGE_READ':
        this.events.onMessageRead?.(message.data as number);
        break;
      case 'OFFLINE_MESSAGES':
        this.events.onOfflineMessages?.(message.data as InstantMessage[]);
        break;
      case 'UNREAD_COUNT':
        this.events.onUnreadCountUpdate?.(message.data as number);
        break;
      case 'PONG':
        // Heartbeat response, no action needed
        break;
      default:
        console.log('Unknown message type:', message.type);
    }
  }

  /** Start heartbeat */
  private startHeartbeat(): void {
    this.heartbeatInterval = window.setInterval(() => {
      this.ping();
    }, 30000);
  }

  /** Stop heartbeat */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /** Attempt to reconnect */
  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Reconnecting... Attempt ${this.reconnectAttempts}`);
      setTimeout(() => this.connect(), this.reconnectDelay);
    }
  }
}

// ============== REST API Service ==============

export class InstantMessageApi {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  /** Set new token */
  setToken(token: string): void {
    this.token = token;
  }

  /** Common fetch wrapper */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const response = await fetch(`${this.baseUrl}/instant-message${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
        ...options.headers
      }
    });
    return response.json();
  }

  /** Send instant message */
  async sendMessage(request: SendMessageRequest): Promise<ApiResponse<InstantMessage>> {
    return this.request('/send', {
      method: 'POST',
      body: JSON.stringify(request)
    });
  }

  /** Get conversation messages */
  async getConversation(
    userId: number,
    pageNum = 1,
    pageSize = 20
  ): Promise<ApiResponse<PageResponse<InstantMessage>>> {
    return this.request(`/conversation/${userId}?pageNum=${pageNum}&pageSize=${pageSize}`);
  }

  /** Get all conversations */
  async getConversations(): Promise<ApiResponse<Conversation[]>> {
    return this.request('/conversations');
  }

  /** Get unread message count */
  async getUnreadCount(): Promise<ApiResponse<number>> {
    return this.request('/unread-count');
  }

  /** Get unread messages */
  async getUnreadMessages(): Promise<ApiResponse<InstantMessage[]>> {
    return this.request('/unread');
  }

  /** Mark messages as read */
  async markAsRead(request: MarkAsReadRequest): Promise<ApiResponse<boolean>> {
    return this.request('/read', {
      method: 'POST',
      body: JSON.stringify(request)
    });
  }

  /** Mark all messages as read */
  async markAllAsRead(): Promise<ApiResponse<number>> {
    return this.request('/read-all', { method: 'POST' });
  }

  /** Delete a message */
  async deleteMessage(messageId: number): Promise<ApiResponse<boolean>> {
    return this.request(`/${messageId}`, { method: 'DELETE' });
  }

  /** Clear conversation history */
  async clearConversation(userId: number): Promise<ApiResponse<number>> {
    return this.request(`/conversation/${userId}`, { method: 'DELETE' });
  }

  /** Get online users */
  async getOnlineUsers(): Promise<ApiResponse<number[]>> {
    return this.request('/online-users');
  }

  /** Check if user is online */
  async isUserOnline(userId: number): Promise<ApiResponse<boolean>> {
    return this.request(`/online/${userId}`);
  }

  /** Get online user count */
  async getOnlineCount(): Promise<ApiResponse<number>> {
    return this.request('/online-count');
  }
}

// ============== Unified Service ==============

export class InstantMessageService {
  public ws: InstantMessageWebSocket;
  public api: InstantMessageApi;

  constructor(baseUrl: string, token: string) {
    this.ws = new InstantMessageWebSocket(baseUrl, token);
    this.api = new InstantMessageApi(baseUrl, token);
  }

  /** Connect WebSocket */
  connect(): void {
    this.ws.connect();
  }

  /** Disconnect WebSocket */
  disconnect(): void {
    this.ws.disconnect();
  }

  /** Update token (e.g., after token refresh) */
  updateToken(token: string): void {
    this.api.setToken(token);
    // Reconnect WebSocket with new token
    this.ws.disconnect();
    this.ws = new InstantMessageWebSocket(
      this.api['baseUrl'].replace(/^http/, 'ws'),
      token
    );
  }
}

// ============== Export Default Instance Creator ==============

export function createInstantMessageService(baseUrl: string, token: string): InstantMessageService {
  return new InstantMessageService(baseUrl, token);
}

export default InstantMessageService;
