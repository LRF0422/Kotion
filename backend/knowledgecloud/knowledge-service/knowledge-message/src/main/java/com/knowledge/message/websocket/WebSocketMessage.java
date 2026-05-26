package com.knowledge.message.websocket;

import lombok.Data;

/**
 * WebSocket Message wrapper
 * 
 * @param <T> Type of the message data
 */
@Data
public class WebSocketMessage<T> {

    /**
     * Message type
     */
    private WebSocketMessageType type;

    /**
     * Message data
     */
    private T data;

    /**
     * Timestamp
     */
    private Long timestamp = System.currentTimeMillis();
}
