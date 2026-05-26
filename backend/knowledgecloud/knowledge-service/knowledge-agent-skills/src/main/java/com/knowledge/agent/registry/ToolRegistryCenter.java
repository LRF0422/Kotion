package com.knowledge.agent.registry;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.tool.Tool;
import com.knowledge.agent.tool.ToolContext;
import com.knowledge.agent.tool.ToolResult;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

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
     */
    public void register(String serviceId, List<RemoteToolRecord> records) {
        try {
            // Add service to the set of registered services
            redisTemplate.opsForSet().add(SERVICE_SET_KEY, serviceId);

            for (RemoteToolRecord record : records) {
                record.setServiceId(serviceId);
                record.setLastHeartbeat(System.currentTimeMillis());
                record.setStatus("ACTIVE");

                String json = objectMapper.writeValueAsString(record);
                String key = KEY_PREFIX + serviceId + ":" + record.getToolId();
                redisTemplate.opsForValue().set(key, json);

                // Update in-memory adapter
                toolCache.put(record.getToolId(), new RemoteToolAdapter(record));
                log.info("Registered remote tool: {} from service: {}", record.getToolId(), serviceId);
            }
        } catch (Exception e) {
            log.error("Failed to register remote tools from service: {}", serviceId, e);
        }
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
            Set<String> keys = redisTemplate.keys(KEY_PREFIX + serviceId + ":*");
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
            Set<String> keys = redisTemplate.keys(KEY_PREFIX + serviceId + ":*");
            if (keys != null) {
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
            Set<String> keys = redisTemplate.keys(KEY_PREFIX + "*");
            if (keys != null) {
                for (String key : keys) {
                    String json = redisTemplate.opsForValue().get(key);
                    if (json != null) {
                        records.add(objectMapper.readValue(json, RemoteToolRecord.class));
                    }
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
     * Get a remote tool adapter by tool ID.
     */
    public RemoteToolAdapter getToolAdapter(String toolId) {
        return toolCache.get(toolId);
    }

    /**
     * Get all remote tool adapters (for tool registry integration).
     */
    public Collection<RemoteToolAdapter> getAllToolAdapters() {
        return Collections.unmodifiableCollection(toolCache.values());
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
