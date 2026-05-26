package com.knowledge.message.websocket.cluster;

import cn.hutool.json.JSONUtil;
import com.knowledge.message.websocket.WebSocketSessionManager;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.stereotype.Component;

/**
 * Redis Message Subscriber
 * Receives WebSocket messages from Redis channel and delivers them locally
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RedisMessageSubscriber implements MessageListener {

    private final WebSocketSessionManager sessionManager;
    private final RedisMessagePublisher publisher;

    @Override
    public void onMessage(Message message, byte[] pattern) {
        try {
            String messageBody = new String(message.getBody());
            ClusterWebSocketMessage clusterMessage = JSONUtil.toBean(messageBody, ClusterWebSocketMessage.class);

            // Skip messages from this same instance (already processed locally)
            if (publisher.getInstanceId().equals(clusterMessage.getSourceInstanceId())) {
                log.debug("Skipping message from same instance: {}", clusterMessage.getSourceInstanceId());
                return;
            }

            log.debug("Received cluster message: type={}, from instance={}",
                    clusterMessage.getType(), clusterMessage.getSourceInstanceId());

            // Route message based on type
            switch (clusterMessage.getType()) {
                case SINGLE_USER:
                    handleSingleUserMessage(clusterMessage);
                    break;
                case MULTI_USER:
                    handleMultiUserMessage(clusterMessage);
                    break;
                case BROADCAST:
                    handleBroadcast(clusterMessage);
                    break;
                case USER_ONLINE:
                    handleUserOnline(clusterMessage);
                    break;
                case USER_OFFLINE:
                    handleUserOffline(clusterMessage);
                    break;
                default:
                    log.warn("Unknown cluster message type: {}", clusterMessage.getType());
            }

        } catch (Exception e) {
            log.error("Error processing Redis message", e);
        }
    }

    /**
     * Handle message targeted to single user
     */
    private void handleSingleUserMessage(ClusterWebSocketMessage message) {
        Long userId = message.getTargetUserId();
        if (userId != null && sessionManager.isUserOnlineLocally(userId)) {
            boolean sent = sessionManager.sendMessageToLocalUser(userId, message.getPayload());
            log.debug("Delivered cluster message to local user {}: {}", userId, sent);
        }
    }

    /**
     * Handle message targeted to multiple users
     */
    private void handleMultiUserMessage(ClusterWebSocketMessage message) {
        if (message.getTargetUserIds() != null) {
            for (Long userId : message.getTargetUserIds()) {
                if (sessionManager.isUserOnlineLocally(userId)) {
                    sessionManager.sendMessageToLocalUser(userId, message.getPayload());
                }
            }
        }
    }

    /**
     * Handle broadcast message to all users
     */
    private void handleBroadcast(ClusterWebSocketMessage message) {
        sessionManager.broadcastLocal(message.getPayload());
        log.debug("Broadcasted cluster message to local users");
    }

    /**
     * Handle user online notification
     * Can be used for updating local cache or UI notifications
     */
    private void handleUserOnline(ClusterWebSocketMessage message) {
        log.info("User {} is online on instance {}", message.getTargetUserId(), message.getSourceInstanceId());
        // Can add additional logic here if needed (e.g., update presence indicators)
    }

    /**
     * Handle user offline notification
     */
    private void handleUserOffline(ClusterWebSocketMessage message) {
        log.info("User {} is offline from instance {}", message.getTargetUserId(), message.getSourceInstanceId());
        // Can add additional logic here if needed
    }
}
