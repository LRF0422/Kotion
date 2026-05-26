package com.knowledge.message.websocket.cluster;

import cn.hutool.json.JSONUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.util.Set;
import java.util.UUID;

/**
 * Redis Message Publisher
 * Publishes WebSocket messages to Redis channel for cluster-wide broadcasting
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RedisMessagePublisher {

    public static final String WEBSOCKET_CHANNEL = "websocket:message:channel";
    public static final String ONLINE_USERS_KEY = "websocket:online:users";

    private final StringRedisTemplate redisTemplate;

    /**
     * Unique instance ID for this application instance
     */
    @Value("${spring.application.name:message-service}-${random.uuid:#{T(java.util.UUID).randomUUID().toString()}}")
    private String instanceId;

    /**
     * Get current instance ID
     */
    public String getInstanceId() {
        if (instanceId == null || instanceId.contains("${")) {
            instanceId = "message-" + UUID.randomUUID().toString().substring(0, 8);
        }
        return instanceId;
    }

    /**
     * Publish message to single user across cluster
     */
    public void publishToUser(Long userId, String message) {
        ClusterWebSocketMessage clusterMessage = ClusterWebSocketMessage.builder()
                .type(ClusterWebSocketMessage.ClusterMessageType.SINGLE_USER)
                .targetUserId(userId)
                .payload(message)
                .sourceInstanceId(getInstanceId())
                .timestamp(System.currentTimeMillis())
                .build();

        publish(clusterMessage);
    }

    /**
     * Publish message to multiple users across cluster
     */
    public void publishToUsers(Set<Long> userIds, String message) {
        ClusterWebSocketMessage clusterMessage = ClusterWebSocketMessage.builder()
                .type(ClusterWebSocketMessage.ClusterMessageType.MULTI_USER)
                .targetUserIds(userIds)
                .payload(message)
                .sourceInstanceId(getInstanceId())
                .timestamp(System.currentTimeMillis())
                .build();

        publish(clusterMessage);
    }

    /**
     * Broadcast message to all online users across cluster
     */
    public void broadcast(String message) {
        ClusterWebSocketMessage clusterMessage = ClusterWebSocketMessage.builder()
                .type(ClusterWebSocketMessage.ClusterMessageType.BROADCAST)
                .payload(message)
                .sourceInstanceId(getInstanceId())
                .timestamp(System.currentTimeMillis())
                .build();

        publish(clusterMessage);
    }

    /**
     * Notify cluster that a user is online
     */
    public void notifyUserOnline(Long userId) {
        // Add to Redis Set for global online users tracking
        redisTemplate.opsForSet().add(ONLINE_USERS_KEY, userId.toString());

        ClusterWebSocketMessage clusterMessage = ClusterWebSocketMessage.builder()
                .type(ClusterWebSocketMessage.ClusterMessageType.USER_ONLINE)
                .targetUserId(userId)
                .sourceInstanceId(getInstanceId())
                .timestamp(System.currentTimeMillis())
                .build();

        publish(clusterMessage);
        log.info("User {} online notification published to cluster", userId);
    }

    /**
     * Notify cluster that a user is offline
     */
    public void notifyUserOffline(Long userId) {
        // Remove from Redis Set
        redisTemplate.opsForSet().remove(ONLINE_USERS_KEY, userId.toString());

        ClusterWebSocketMessage clusterMessage = ClusterWebSocketMessage.builder()
                .type(ClusterWebSocketMessage.ClusterMessageType.USER_OFFLINE)
                .targetUserId(userId)
                .sourceInstanceId(getInstanceId())
                .timestamp(System.currentTimeMillis())
                .build();

        publish(clusterMessage);
        log.info("User {} offline notification published to cluster", userId);
    }

    /**
     * Check if user is online globally (across all cluster nodes)
     */
    public boolean isUserOnlineGlobally(Long userId) {
        Boolean isMember = redisTemplate.opsForSet().isMember(ONLINE_USERS_KEY, userId.toString());
        return Boolean.TRUE.equals(isMember);
    }

    /**
     * Get all online users globally
     */
    public Set<String> getGlobalOnlineUsers() {
        return redisTemplate.opsForSet().members(ONLINE_USERS_KEY);
    }

    /**
     * Get global online user count
     */
    public Long getGlobalOnlineUserCount() {
        return redisTemplate.opsForSet().size(ONLINE_USERS_KEY);
    }

    /**
     * Publish cluster message to Redis channel
     */
    private void publish(ClusterWebSocketMessage message) {
        try {
            String jsonMessage = JSONUtil.toJsonStr(message);
            redisTemplate.convertAndSend(WEBSOCKET_CHANNEL, jsonMessage);
            log.debug("Published cluster message: type={}, targetUser={}", message.getType(),
                    message.getTargetUserId());
        } catch (Exception e) {
            log.error("Failed to publish cluster message", e);
        }
    }
}
