package com.knowledge.message.websocket;

/**
 * WebSocket Message Types
 */
public enum WebSocketMessageType {

    /**
     * New message received
     */
    NEW_MESSAGE,

    /**
     * Message sent confirmation
     */
    MESSAGE_SENT,

    /**
     * Message has been read by recipient
     */
    MESSAGE_READ,

    /**
     * Offline messages when user connects
     */
    OFFLINE_MESSAGES,

    /**
     * Unread message count update
     */
    UNREAD_COUNT,

    /**
     * Ping response
     */
    PONG,

    /**
     * Error message
     */
    ERROR,

    /**
     * User online status changed
     */
    USER_STATUS,

    /**
     * Message delivered (but not yet read)
     */
    MESSAGE_DELIVERED,

    /**
     * Collaboration invitation notification
     */
    COLLABORATION_INVITATION
}
