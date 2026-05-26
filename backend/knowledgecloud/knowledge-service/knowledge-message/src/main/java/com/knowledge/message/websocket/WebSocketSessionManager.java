package com.knowledge.message.websocket;

import com.knowledge.message.websocket.cluster.RedisMessagePublisher;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArraySet;
import java.util.stream.Collectors;

/**
 * WebSocket Session Manager
 * Manages all active WebSocket connections with cluster support via Redis
 * Pub/Sub
 */
@Slf4j
@Component
public class WebSocketSessionManager {

    /**
     * User ID -> Set of WebSocket sessions (supports multiple devices per user)
     * This map only contains LOCAL sessions on this instance
     */
    private final Map<Long, Set<WebSocketSession>> userSessions = new ConcurrentHashMap<>();

    /**
     * Session ID -> User ID mapping for quick lookup
     */
    private final Map<String, Long> sessionUserMap = new ConcurrentHashMap<>();

    @Lazy
    @Autowired
    private RedisMessagePublisher redisMessagePublisher;

    /**
     * Register a new WebSocket session
     */
    public void addSession(Long userId, WebSocketSession session) {
        userSessions.computeIfAbsent(userId, k -> new CopyOnWriteArraySet<>()).add(session);
        sessionUserMap.put(session.getId(), userId);

        // Notify cluster about user online status
        if (redisMessagePublisher != null) {
            redisMessagePublisher.notifyUserOnline(userId);
        }

        log.info("WebSocket session added for user: {}, total sessions for user: {}, total local users online: {}",
                userId, userSessions.get(userId).size(), userSessions.size());
    }

    /**
     * Remove a WebSocket session
     */
    public void removeSession(WebSocketSession session) {
        Long userId = sessionUserMap.remove(session.getId());
        if (userId != null) {
            Set<WebSocketSession> sessions = userSessions.get(userId);
            if (sessions != null) {
                sessions.remove(session);
                if (sessions.isEmpty()) {
                    userSessions.remove(userId);
                    // Notify cluster about user offline status only when all local sessions are
                    // closed
                    if (redisMessagePublisher != null) {
                        redisMessagePublisher.notifyUserOffline(userId);
                    }
                }
            }
            log.info("WebSocket session removed for user: {}, remaining sessions: {}, total local users online: {}",
                    userId, sessions != null ? sessions.size() : 0, userSessions.size());
        }
    }

    /**
     * Get user ID by session
     */
    public Long getUserId(WebSocketSession session) {
        return sessionUserMap.get(session.getId());
    }

    /**
     * Check if a user is online locally (on this instance)
     */
    public boolean isUserOnlineLocally(Long userId) {
        Set<WebSocketSession> sessions = userSessions.get(userId);
        return sessions != null && !sessions.isEmpty();
    }

    /**
     * Check if a user is online (locally first, then globally via Redis)
     */
    public boolean isUserOnline(Long userId) {
        // First check local
        if (isUserOnlineLocally(userId)) {
            return true;
        }
        // Then check globally via Redis
        if (redisMessagePublisher != null) {
            return redisMessagePublisher.isUserOnlineGlobally(userId);
        }
        return false;
    }

    /**
     * Send a message to a specific user - LOCAL ONLY (used by cluster subscriber)
     */
    public boolean sendMessageToLocalUser(Long userId, String message) {
        Set<WebSocketSession> sessions = userSessions.get(userId);
        if (sessions == null || sessions.isEmpty()) {
            return false;
        }

        boolean sent = false;
        for (WebSocketSession session : sessions) {
            if (session.isOpen()) {
                try {
                    session.sendMessage(new TextMessage(message));
                    sent = true;
                } catch (IOException e) {
                    log.error("Failed to send message to session: {}", session.getId(), e);
                }
            }
        }
        return sent;
    }

    /**
     * Send a message to a specific user (all devices, across all cluster nodes)
     * First tries to send locally, then broadcasts via Redis to other nodes
     */
    public boolean sendMessageToUser(Long userId, String message) {
        // First try to send locally
        boolean sentLocally = sendMessageToLocalUser(userId, message);

        // Also publish to Redis for other cluster nodes
        if (redisMessagePublisher != null) {
            redisMessagePublisher.publishToUser(userId, message);
        }

        if (!sentLocally) {
            log.debug("User {} is not on this instance, message published to cluster", userId);
        }

        return sentLocally || (redisMessagePublisher != null && redisMessagePublisher.isUserOnlineGlobally(userId));
    }

    /**
     * Broadcast message to all local online users (used by cluster subscriber)
     */
    public void broadcastLocal(String message) {
        userSessions.values().forEach(sessions -> {
            sessions.forEach(session -> {
                if (session.isOpen()) {
                    try {
                        session.sendMessage(new TextMessage(message));
                    } catch (IOException e) {
                        log.error("Failed to broadcast to session: {}", session.getId(), e);
                    }
                }
            });
        });
    }

    /**
     * Broadcast message to all online users across all cluster nodes
     */
    public void broadcast(String message) {
        // Broadcast locally
        broadcastLocal(message);

        // Publish to Redis for other cluster nodes
        if (redisMessagePublisher != null) {
            redisMessagePublisher.broadcast(message);
        }
    }

    /**
     * Get count of online users on this local instance
     */
    public int getLocalOnlineUserCount() {
        return userSessions.size();
    }

    /**
     * Get count of online users across all cluster nodes
     */
    public int getOnlineUserCount() {
        if (redisMessagePublisher != null) {
            Long globalCount = redisMessagePublisher.getGlobalOnlineUserCount();
            return globalCount != null ? globalCount.intValue() : getLocalOnlineUserCount();
        }
        return getLocalOnlineUserCount();
    }

    /**
     * Get all local online user IDs
     */
    public Set<Long> getLocalOnlineUserIds() {
        return userSessions.keySet();
    }

    /**
     * Get all online user IDs across all cluster nodes
     */
    public Set<Long> getOnlineUserIds() {
        if (redisMessagePublisher != null) {
            Set<String> globalUsers = redisMessagePublisher.getGlobalOnlineUsers();
            if (globalUsers != null) {
                return globalUsers.stream()
                        .map(Long::parseLong)
                        .collect(Collectors.toSet());
            }
        }
        return getLocalOnlineUserIds();
    }
}
