package com.knowledge.agent.core.skill;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.core.config.AgentCoreProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
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
 * <p><b>Heartbeat contract.</b> The registration SDK (
 * {@code knowledge-core-agent}) sends the <em>skill ids</em> it registered
 * ({@code HeartbeatRequest.skillIds}, e.g. {@code wiki-page}), while this
 * registry keys tools by {@code serviceId:toolName}. Liveness therefore has to
 * match on {@link RemoteSkillRecord#getSkillId()} (one skill maps to many
 * tools); matching on tool name alone silently dropped every heartbeat and
 * pruned all remote skills after {@code agent.remote-skill.stale-ms}. Tool
 * names are accepted too so either side can evolve without losing liveness.
 *
 * <p>The registration SDK contract is unchanged — this is purely the
 * consumption side.
 */
@Slf4j
@Component
public class RemoteSkillRegistry implements ApplicationRunner {

    private static final String KEY_PREFIX = "agentcore:skill:";
    private static final String SERVICE_INDEX_KEY = "agentcore:skill:services";
    /** Fallback liveness window when no {@link AgentCoreProperties} is bound. */
    private static final long DEFAULT_STALE_MS = 90_000;

    private final StringRedisTemplate redis;
    private final ObjectMapper objectMapper;
    private final RemoteSkillInvoker invoker;
    private final AgentCoreProperties properties;

    /** Live tool cache: serviceId:toolName → tool. */
    private final Map<String, RemoteSkillTool> tools = new ConcurrentHashMap<>();

    public RemoteSkillRegistry(StringRedisTemplate redis, ObjectMapper objectMapper,
                               RemoteSkillInvoker invoker, AgentCoreProperties properties) {
        this.redis = redis;
        this.objectMapper = objectMapper;
        this.invoker = invoker;
        this.properties = properties;
    }

    // ==================== registration (called by RemoteSkillController) ====================

    public synchronized void register(String serviceId, List<RemoteSkillRecord> records) {
        if (records == null || records.isEmpty()) {
            return;
        }
        if (!enabled()) {
            log.info("Remote skill registration ignored for {} (agent.remote-skill.enabled=false)", serviceId);
            return;
        }
        long now = System.currentTimeMillis();
        for (RemoteSkillRecord record : records) {
            record.setServiceId(serviceId);
            record.setLastHeartbeat(now);
            if (record.getStatus() == null || record.getStatus().trim().isEmpty()) {
                record.setStatus("ACTIVE");
            }
            save(record);
            tools.put(key(serviceId, record.getToolName()), newTool(record));
        }
        indexService(serviceId);
        log.info("Registered {} remote skill tool(s) from service {}", records.size(), serviceId);
    }

    /**
     * Refresh liveness for the given identifiers.
     *
     * <p>An identifier may be either a skill id (the SDK's contract) or a tool
     * name (defensive). An empty list refreshes every tool of the service.
     */
    public synchronized void heartbeat(String serviceId, List<String> identifiers) {
        if (!enabled()) {
            return;
        }
        long now = System.currentTimeMillis();
        Set<String> ids = identifiers == null
                ? Collections.<String>emptySet() : new LinkedHashSet<>(identifiers);
        boolean refreshAll = ids.isEmpty();
        int refreshed = 0;
        for (RemoteSkillTool tool : tools.values()) {
            RemoteSkillRecord record = tool.getRecord();
            if (!serviceId.equals(record.getServiceId())) {
                continue;
            }
            if (!refreshAll
                    && !ids.contains(record.getSkillId())
                    && !ids.contains(record.getToolName())) {
                continue;
            }
            record.setLastHeartbeat(now);
            save(record);
            refreshed++;
        }
        if (refreshed > 0) {
            indexService(serviceId);
            log.debug("Remote skill heartbeat: {} tool(s) refreshed for {}", refreshed, serviceId);
        } else {
            log.warn("Remote skill heartbeat for {} matched no registered tools (identifiers: {})",
                    serviceId, ids);
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
        List<RemoteSkillTool> live = new ArrayList<>();
        long now = System.currentTimeMillis();
        for (RemoteSkillTool tool : tools.values()) {
            if (isLive(tool.getRecord(), now)) {
                live.add(tool);
            }
        }
        return live;
    }

    public RemoteSkillTool find(String toolName) {
        if (toolName == null) {
            return null;
        }
        for (RemoteSkillTool tool : tools.values()) {
            if (toolName.equals(tool.getRecord().getToolName())) {
                return tool;
            }
        }
        return null;
    }

    /**
     * Read-only diagnostics snapshot of every registered tool (live or stale).
     * Backs {@code GET /api/v1/skills/remote}.
     */
    public List<Map<String, Object>> statusSnapshot() {
        long now = System.currentTimeMillis();
        List<Map<String, Object>> snapshot = new ArrayList<>();
        for (RemoteSkillTool tool : tools.values()) {
            RemoteSkillRecord record = tool.getRecord();
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("serviceId", record.getServiceId());
            row.put("skillId", record.getSkillId());
            row.put("toolName", record.getToolName());
            row.put("name", record.getName());
            row.put("status", record.getStatus());
            row.put("lastHeartbeat", record.getLastHeartbeat());
            row.put("heartbeatAgeMs", now - record.getLastHeartbeat());
            row.put("live", isLive(record, now));
            row.put("callbackUrl", record.effectiveCallbackUrl());
            snapshot.add(row);
        }
        return snapshot;
    }

    /** Total registered tools (live + stale); diagnostics only. */
    public int size() {
        return tools.size();
    }

    // ==================== startup restore ====================

    @Override
    public void run(ApplicationArguments args) {
        if (!enabled()) {
            log.info("Remote skills disabled (agent.remote-skill.enabled=false); skipping restore");
            return;
        }
        try {
            Set<String> keys = redis.keys(KEY_PREFIX + "*");
            if (keys == null || keys.isEmpty()) {
                return;
            }
            long now = System.currentTimeMillis();
            int count = 0;
            for (String key : keys) {
                // The service index is stored under the same prefix; skip it.
                if (SERVICE_INDEX_KEY.equals(key)) {
                    continue;
                }
                try {
                    String json = redis.opsForValue().get(key);
                    if (json == null) {
                        continue;
                    }
                    RemoteSkillRecord record = objectMapper.readValue(json, RemoteSkillRecord.class);
                    // Treat restored registrations as freshly seen: otherwise a
                    // restart longer than the stale window instantly prunes every
                    // skill before its owner's next heartbeat can arrive.
                    record.setLastHeartbeat(now);
                    tools.put(key(record.getServiceId(), record.getToolName()), newTool(record));
                    indexService(record.getServiceId());
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

    // ==================== helpers ====================

    private RemoteSkillTool newTool(RemoteSkillRecord record) {
        return new RemoteSkillTool(record, objectMapper, invoker);
    }

    private boolean isLive(RemoteSkillRecord record, long now) {
        if (record == null) {
            return false;
        }
        if (record.getStatus() != null && !"ACTIVE".equalsIgnoreCase(record.getStatus())) {
            return false;
        }
        return now - record.getLastHeartbeat() <= staleMs();
    }

    private boolean enabled() {
        return properties == null
                || properties.getRemoteSkill() == null
                || properties.getRemoteSkill().isEnabled();
    }

    private long staleMs() {
        if (properties == null || properties.getRemoteSkill() == null) {
            return DEFAULT_STALE_MS;
        }
        long configured = properties.getRemoteSkill().getStaleMs();
        return configured > 0 ? configured : DEFAULT_STALE_MS;
    }

    private void save(RemoteSkillRecord record) {
        try {
            redis.opsForValue().set(record.redisKey(), objectMapper.writeValueAsString(record));
        } catch (Exception e) {
            log.warn("RemoteSkill Redis save failed for {}: {}", record.redisKey(), e.getMessage());
        }
    }

    private void indexService(String serviceId) {
        try {
            redis.opsForSet().add(SERVICE_INDEX_KEY, serviceId);
        } catch (Exception e) {
            log.warn("RemoteSkill service index failed: {}", e.getMessage());
        }
    }

    private String key(String serviceId, String toolName) {
        return serviceId + ":" + toolName;
    }
}
