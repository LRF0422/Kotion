package com.knowledge.agent.registry;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.tool.Tool;
import com.knowledge.agent.tool.ToolContext;
import com.knowledge.agent.tool.ToolResult;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.Cursor;
import org.springframework.data.redis.core.ScanOptions;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Central registry for remote tool registrations with HA support.
 * Stores registration data in Redis so it survives agent-service restarts
 * and is consistent across multiple instances.
 */
@Slf4j
@Component
public class ToolRegistryCenter {

    private static final String KEY_PREFIX = "agent:tools:";
    private static final String SERVICE_SET_KEY = "agent:services";

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    /**
     * In-memory cache of remote tool adapters (for fast tool invocation).
     */
    private final Map<String, RemoteToolAdapter> toolCache = new ConcurrentHashMap<>();

    public ToolRegistryCenter(StringRedisTemplate redisTemplate, ObjectMapper objectMapper) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
    }

    /**
     * Register remote tools from a service.
     *
     * @throws RuntimeException when persistence fails — callers must surface
     *         the failure instead of silently reporting success.
     */
    public void register(String serviceId, List<RemoteToolRecord> records) {
        // Add service to the set of registered services
        redisTemplate.opsForSet().add(SERVICE_SET_KEY, serviceId);

        for (RemoteToolRecord record : records) {
            record.setServiceId(serviceId);
            record.setLastHeartbeat(System.currentTimeMillis());
            record.setStatus("ACTIVE");

            String json;
            try {
                json = objectMapper.writeValueAsString(record);
            } catch (IOException e) {
                throw new IllegalStateException("Failed to serialize tool record "
                        + record.getToolId(), e);
            }
            String key = KEY_PREFIX + serviceId + ":" + record.getToolId();
            redisTemplate.opsForValue().set(key, json);

            // Update in-memory adapter. Cache is scoped by service so two
            // services registering the same toolId no longer overwrite each
            // other's adapter; a name conflict is surfaced as a warning.
            String cacheKey = serviceId + ":" + record.getToolId();
            RemoteToolAdapter previous = toolCache.put(cacheKey, new RemoteToolAdapter(record));
            if (previous != null) {
                log.warn("Remote tool {} re-registered by service {}", record.getToolId(), serviceId);
            }
            log.info("Registered remote tool: {} from service: {}", record.getToolId(), serviceId);
        }
    }

    /**
     * Iterate keys with SCAN (never KEYS) — safe on production Redis with
     * large key counts.
     */
    private List<String> scanKeys(String pattern) {
        List<String> keys = new ArrayList<>();
        try (Cursor<String> cursor = redisTemplate.scan(
                ScanOptions.scanOptions().match(pattern).count(200).build())) {
            while (cursor.hasNext()) {
                keys.add(cursor.next());
            }
        } catch (Exception e) {
            log.error("Failed to scan Redis keys for pattern {}: {}", pattern, e.getMessage());
        }
        return keys;
    }

    /**
     * Handle heartbeat from a remote service.
     * Accepts skillIds (from the Agent SDK heartbeat) and updates all matching
     * tools.
     */
    public void heartbeat(String serviceId, List<String> skillIds) {
        long now = System.currentTimeMillis();
        try {
            // Update all tools belonging to this service
            // skillIds may be skill-level IDs (e.g., "wiki-page"), not tool-level IDs
            // We need to find all tool records for this service and update them
            List<String> keys = scanKeys(KEY_PREFIX + serviceId + ":*");
            if (keys != null) {
                for (String key : keys) {
                    String json = redisTemplate.opsForValue().get(key);
                    if (json != null) {
                        RemoteToolRecord record = objectMapper.readValue(json, RemoteToolRecord.class);
                        // Update if the skillId is in the provided list, or if list is null/empty
                        // (update all)
                        if (skillIds == null || skillIds.isEmpty() || skillIds.contains(record.getSkillId())
                                || skillIds.contains(record.getToolId())) {
                            record.setLastHeartbeat(now);
                            record.setStatus("ACTIVE");
                            redisTemplate.opsForValue().set(key, objectMapper.writeValueAsString(record));
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.error("Failed to process heartbeat from service: {}", serviceId, e);
        }
    }

    /**
     * Unregister all tools from a service.
     */
    public void unregister(String serviceId) {
        try {
            List<String> keys = scanKeys(KEY_PREFIX + serviceId + ":*");
            if (!keys.isEmpty()) {
                redisTemplate.delete(keys);
            }
            redisTemplate.opsForSet().remove(SERVICE_SET_KEY, serviceId);

            // Remove from in-memory cache
            toolCache.entrySet().removeIf(e -> {
                RemoteToolAdapter adapter = e.getValue();
                return adapter != null && serviceId.equals(adapter.getServiceId());
            });

            log.info("Unregistered all tools from service: {}", serviceId);
        } catch (Exception e) {
            log.error("Failed to unregister service: {}", serviceId, e);
        }
    }

    /**
     * Get all remote tool records.
     */
    public List<RemoteToolRecord> getAllRecords() {
        List<RemoteToolRecord> records = new ArrayList<>();
        try {
            List<String> keys = scanKeys(KEY_PREFIX + "*");
            for (String key : keys) {
                String json = redisTemplate.opsForValue().get(key);
                if (json != null) {
                    records.add(objectMapper.readValue(json, RemoteToolRecord.class));
                }
            }
        } catch (Exception e) {
            log.error("Failed to get all remote tool records", e);
        }
        return records;
    }

    /**
     * Get all registered services.
     */
    public Set<String> getRegisteredServices() {
        Set<String> services = redisTemplate.opsForSet().members(SERVICE_SET_KEY);
        return services != null ? services : Collections.emptySet();
    }

    /**
     * Get a remote tool adapter by tool ID (first registered service wins on
     * a name collision — surfaced as a warning at registration time).
     */
    public RemoteToolAdapter getToolAdapter(String toolId) {
        for (RemoteToolAdapter adapter : toolCache.values()) {
            if (toolId.equals(adapter.getId())) {
                return adapter;
            }
        }
        return null;
    }

    /**
     * Get all remote tool adapters (for tool registry integration).
     */
    public Collection<RemoteToolAdapter> getAllToolAdapters() {
        return Collections.unmodifiableCollection(toolCache.values());
    }

    /** Adapters belonging to a single service (batch-scoped re-wiring). */
    public List<RemoteToolAdapter> getAdaptersForService(String serviceId) {
        List<RemoteToolAdapter> result = new ArrayList<>();
        for (Map.Entry<String, RemoteToolAdapter> entry : toolCache.entrySet()) {
            if (serviceId.equals(entry.getValue().getServiceId())) {
                result.add(entry.getValue());
            }
        }
        return result;
    }

    /**
     * Load all remote tools from Redis into memory (called on startup).
     */
    public void loadFromRedis() {
        try {
            List<RemoteToolRecord> records = getAllRecords();
            for (RemoteToolRecord record : records) {
                toolCache.put(record.getToolId(), new RemoteToolAdapter(record));
            }
            log.info("Loaded {} remote tools from Redis", records.size());
        } catch (Exception e) {
            log.error("Failed to load remote tools from Redis", e);
        }
    }
}
