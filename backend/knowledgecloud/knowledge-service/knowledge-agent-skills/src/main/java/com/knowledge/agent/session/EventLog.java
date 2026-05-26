package com.knowledge.agent.session;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * Append-only event store using Redis List per session.
 * Key format: agent:events:{sessionId}
 */
@Slf4j
@Component
public class EventLog {

    private static final String KEY_PREFIX = "agent:events:";
    private static final long EVENT_TTL_HOURS = 48;

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    public EventLog(StringRedisTemplate redisTemplate, ObjectMapper objectMapper) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
    }

    /**
     * Append an event to the session's event log.
     */
    public void append(String sessionId, String eventType, String payload) {
        try {
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("ts", System.currentTimeMillis());
            entry.put("type", eventType);
            entry.put("data", payload);

            String json = objectMapper.writeValueAsString(entry);
            String key = KEY_PREFIX + sessionId;
            redisTemplate.opsForList().rightPush(key, json);

            // Set TTL on first write
            Long ttl = redisTemplate.getExpire(key);
            if (ttl == null || ttl < 0) {
                redisTemplate.expire(key, EVENT_TTL_HOURS, java.util.concurrent.TimeUnit.HOURS);
            }
        } catch (Exception e) {
            log.warn("Failed to append event to Redis: {}", e.getMessage());
        }
    }

    /**
     * Get all events for a session.
     */
    public List<String> getEvents(String sessionId) {
        try {
            String key = KEY_PREFIX + sessionId;
            List<String> events = redisTemplate.opsForList().range(key, 0, -1);
            return events != null ? events : Collections.emptyList();
        } catch (Exception e) {
            log.warn("Failed to get events from Redis: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    /**
     * Clear events for a session.
     */
    public void clear(String sessionId) {
        try {
            redisTemplate.delete(KEY_PREFIX + sessionId);
        } catch (Exception e) {
            log.warn("Failed to clear events from Redis: {}", e.getMessage());
        }
    }
}
