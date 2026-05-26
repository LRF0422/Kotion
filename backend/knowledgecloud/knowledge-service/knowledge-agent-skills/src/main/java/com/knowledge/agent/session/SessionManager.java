package com.knowledge.agent.session;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

/**
 * Redis-backed session storage with Jackson JSON serialization.
 */
@Slf4j
@Component
public class SessionManager {

    private static final String KEY_PREFIX = "agent:session:";
    private static final long SESSION_TTL_HOURS = 24;

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    /**
     * In-memory fallback for when Redis is not available.
     */
    private final ConcurrentHashMap<String, Session> memoryFallback = new ConcurrentHashMap<>();

    public SessionManager(StringRedisTemplate redisTemplate, ObjectMapper objectMapper) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
    }

    /**
     * Create a new session.
     */
    public Session create(String conversationId, Long userId) {
        Session session = Session.builder()
                .sessionId(UUID.randomUUID().toString())
                .conversationId(conversationId)
                .createdAt(System.currentTimeMillis())
                .lastActiveAt(System.currentTimeMillis())
                .build();

        save(session);
        log.info("Created session: {}", session.getSessionId());
        return session;
    }

    /**
     * Get a session by ID.
     */
    public Session get(String sessionId) {
        if (sessionId == null) {
            return null;
        }

        // Try Redis first
        try {
            String json = redisTemplate.opsForValue().get(KEY_PREFIX + sessionId);
            if (json != null) {
                return objectMapper.readValue(json, Session.class);
            }
        } catch (Exception e) {
            log.warn("Failed to get session from Redis: {}", e.getMessage());
        }

        // Fallback to memory
        return memoryFallback.get(sessionId);
    }

    /**
     * Save/update a session.
     */
    public void save(Session session) {
        session.setLastActiveAt(System.currentTimeMillis());

        try {
            String json = objectMapper.writeValueAsString(session);
            redisTemplate.opsForValue().set(KEY_PREFIX + session.getSessionId(), json, SESSION_TTL_HOURS,
                    TimeUnit.HOURS);
        } catch (Exception e) {
            log.warn("Failed to save session to Redis, using memory fallback: {}", e.getMessage());
            memoryFallback.put(session.getSessionId(), session);
        }
    }

    /**
     * Delete a session.
     */
    public void delete(String sessionId) {
        try {
            redisTemplate.delete(KEY_PREFIX + sessionId);
        } catch (Exception e) {
            log.warn("Failed to delete session from Redis: {}", e.getMessage());
        }
        memoryFallback.remove(sessionId);
    }
}
