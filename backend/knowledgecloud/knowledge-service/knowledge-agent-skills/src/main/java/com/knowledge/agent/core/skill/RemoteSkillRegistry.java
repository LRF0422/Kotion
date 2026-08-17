package com.knowledge.agent.core.skill;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * AgentCore consumer of remote skills — replaces the V1
 * ToolRegistryCenter/RemoteToolAdapter stack with a single registry:
 *
 * <ul>
 *   <li>registrations persist in Redis ({@code agentcore:skill:*}), rebuilt at
 *       startup so a service restart never loses cross-service skills;</li>
 *   <li>each record becomes a {@link RemoteSkillTool} ({@link BackendTool})
 *       exposed to the {@link ToolGateway} on demand;</li>
 *   <li>heartbeats mark liveness; expired skills are dropped from the catalog.</li>
 * </ul>
 *
 * <p>The registration SDK (knowledge-core-agent / @AgentSkill) is untouched —
 * this is purely the consumption side, rewritten.
 */
@Slf4j
@Component
public class RemoteSkillRegistry implements ApplicationRunner {

    private static final String KEY_PREFIX = "agentcore:skill:";
    private static final String SERVICE_INDEX_KEY = "agentcore:skill:services";
    /** A service is considered dead after 90s without a heartbeat. */
    private static final long HEARTBEAT_STALE_MS = 90_000;

    private final StringRedisTemplate redis;
    private final ObjectMapper objectMapper;

    /** Live tool cache: serviceId:toolName → tool. */
    private final Map<String, RemoteSkillTool> tools = new ConcurrentHashMap<>();

    public RemoteSkillRegistry(StringRedisTemplate redis, ObjectMapper objectMapper) {
        this.redis = redis;
        this.objectMapper = objectMapper;
    }

    // ==================== registration (called by RemoteSkillController) ====================

    public synchronized void register(String serviceId, List<RemoteSkillRecord> records) {
        if (records == null || records.isEmpty()) {
            return;
        }
        long now = System.currentTimeMillis();
        for (RemoteSkillRecord record : records) {
            record.setServiceId(serviceId);
            record.setLastHeartbeat(now);
            try {
                redis.opsForValue().set(record.redisKey(), objectMapper.writeValueAsString(record));
            } catch (Exception e) {
                log.warn("RemoteSkill Redis save failed for {}: {}", record.redisKey(), e.getMessage());
            }
            tools.put(key(serviceId, record.getToolName()), new RemoteSkillTool(record));
        }
        try {
            redis.opsForSet().add(SERVICE_INDEX_KEY, serviceId);
        } catch (Exception e) {
            log.warn("RemoteSkill service index failed: {}", e.getMessage());
        }
        log.info("Registered {} remote skill tool(s) from service {}", records.size(), serviceId);
    }

    public synchronized void heartbeat(String serviceId, List<String> toolNames) {
        long now = System.currentTimeMillis();
        for (String toolName : toolNames) {
            RemoteSkillTool tool = tools.get(key(serviceId, toolName));
            if (tool != null) {
                tool.getRecord().setLastHeartbeat(now);
            }
        }
    }

    public synchronized void unregister(String serviceId) {
        tools.entrySet().removeIf(entry -> serviceId.equals(entry.getValue().getRecord().getServiceId()));
        try {
            Set<String> keys = redis.keys(KEY_PREFIX + serviceId + ":*");
            if (keys != null && !keys.isEmpty()) {
                redis.delete(keys);
            }
            redis.opsForSet().remove(SERVICE_INDEX_KEY, serviceId);
        } catch (Exception e) {
            log.warn("RemoteSkill unregister Redis failed for {}: {}", serviceId, e.getMessage());
        }
    }

    // ==================== catalog access (ToolGateway) ====================

    /** All live backend tools (heartbeat-fresh). */
    public List<RemoteSkillTool> liveTools() {
        long now = System.currentTimeMillis();
        List<RemoteSkillTool> live = new ArrayList<>();
        for (RemoteSkillTool tool : tools.values()) {
            if (now - tool.getRecord().getLastHeartbeat() > HEARTBEAT_STALE_MS) {
                continue;
            }
            live.add(tool);
        }
        return live;
    }

    public RemoteSkillTool find(String toolName) {
        for (RemoteSkillTool tool : tools.values()) {
            if (toolName.equals(tool.getRecord().getToolName())) {
                return tool;
            }
        }
        return null;
    }

    // ==================== startup restore ====================

    @Override
    public void run(ApplicationArguments args) {
        try {
            Set<String> keys = redis.keys(KEY_PREFIX + "*");
            if (keys == null || keys.isEmpty()) {
                return;
            }
            int count = 0;
            for (String key : keys) {
                try {
                    String json = redis.opsForValue().get(key);
                    if (json == null) {
                        continue;
                    }
                    RemoteSkillRecord record = objectMapper.readValue(json, RemoteSkillRecord.class);
                    tools.put(key(record.getServiceId(), record.getToolName()), new RemoteSkillTool(record));
                    count++;
                } catch (Exception e) {
                    log.warn("RemoteSkill restore failed for {}: {}", key, e.getMessage());
                }
            }
            log.info("Restored {} remote skill tool(s) from Redis", count);
        } catch (Exception e) {
            log.warn("RemoteSkill restore sweep failed: {}", e.getMessage());
        }
    }

    private String key(String serviceId, String toolName) {
        return serviceId + ":" + toolName;
    }
}
