package com.knowledge.message.websocket.cluster;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.util.Set;

/**
 * Cluster WebSocket Message DTO
 * Used for broadcasting messages across cluster nodes via Redis Pub/Sub
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ClusterWebSocketMessage implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * Message type for cluster routing
     */
    private ClusterMessageType type;

    /**
     * Target user ID (for single user message)
     */
    private Long targetUserId;

    /**
     * Target user IDs (for multi-user message)
     */
    private Set<Long> targetUserIds;

    /**
     * The actual message content (JSON string)
     */
    private String payload;

    /**
     * Source instance ID (to avoid self-processing)
     */
    private String sourceInstanceId;

    /**
     * Timestamp
     */
    private Long timestamp;

    /**
     * Cluster message types
     */
    public enum ClusterMessageType {
        /**
         * Send to single user
         */
        SINGLE_USER,

        /**
         * Send to multiple users
         */
        MULTI_USER,

        /**
         * Broadcast to all online users
         */
        BROADCAST,

        /**
         * User online notification (for updating online status across cluster)
         */
        USER_ONLINE,

        /**
         * User offline notification
         */
        USER_OFFLINE
    }
}
