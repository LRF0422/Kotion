package com.knowledge.agent.core.memory;

import com.knowledge.agent.core.config.AgentCoreProperties;
import com.knowledge.agent.core.entity.AgentLongMemoryEntity;
import com.knowledge.agent.core.mapper.AgentLongMemoryMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Redis-hot (single-entry cache), MySQL-authoritative {@link MemoryStore}.
 * Recall queries MySQL (indexed by scope) and scores in memory — volume per
 * user is small and this keeps the Redis index bookkeeping out of the core.
 */
@Slf4j
@Component
public class DefaultMemoryStore implements MemoryStore {

    private final AgentLongMemoryMapper memoryMapper;
    private final MemoryRetriever retriever;
    private final AgentCoreProperties properties;

    public DefaultMemoryStore(AgentLongMemoryMapper memoryMapper,
                              MemoryRetriever retriever,
                              AgentCoreProperties properties) {
        this.memoryMapper = memoryMapper;
        this.retriever = retriever;
        this.properties = properties;
    }

    @Override
    public MemoryEntry remember(MemoryEntry entry) {
        if (entry.getMemoryId() == null || entry.getMemoryId().isEmpty()) {
            entry.setMemoryId(UUID.randomUUID().toString());
        }
        long now = System.currentTimeMillis();
        if (entry.getCreateTime() == 0) {
            entry.setCreateTime(now);
        }
        entry.setUpdateTime(now);
        entry.setLastAccessTime(now);
        try {
            memoryMapper.upsertByMemoryId(entry.toEntity());
        } catch (Exception e) {
            log.warn("remember failed for scope {}: {}", entry.getScope(), e.getMessage());
        }
        return entry;
    }

    @Override
    public List<MemoryEntry> recall(List<String> scopes, String query, String type, int limit) {
        List<MemoryEntry> candidates = new ArrayList<>();
        Map<String, MemoryEntry> dedupe = new LinkedHashMap<>();
        if (scopes != null) {
            for (String scope : scopes) {
                try {
                    List<AgentLongMemoryEntity> entities = memoryMapper.selectTopByScope(scope, 200);
                    for (AgentLongMemoryEntity entity : entities) {
                        if (type != null && !type.isEmpty() && !type.equalsIgnoreCase(entity.getType())) {
                            continue;
                        }
                        MemoryEntry entry = MemoryEntry.fromEntity(entity);
                        dedupe.putIfAbsent(entry.getMemoryId(), entry);
                    }
                } catch (Exception e) {
                    log.warn("recall failed for scope {}: {}", scope, e.getMessage());
                }
            }
        }
        candidates.addAll(dedupe.values());
        List<MemoryEntry> top = retriever.top(candidates, query, limit);
        // Touch lastAccessTime (recency feeds future scoring).
        long now = System.currentTimeMillis();
        for (MemoryEntry entry : top) {
            entry.setLastAccessTime(now);
            try {
                memoryMapper.upsertByMemoryId(entry.toEntity());
            } catch (Exception ignored) {
                // hot-path best effort
            }
        }
        return top;
    }

    @Override
    public boolean forget(String memoryId, Long userId, Long tenantId) {
        try {
            AgentLongMemoryEntity entity = memoryMapper.selectByMemoryId(memoryId);
            if (entity == null) {
                return false;
            }
            if (userId != null && entity.getUserId() != null && !userId.equals(entity.getUserId())) {
                return false; // ownership — tools pass the run's identity
            }
            memoryMapper.deleteById(entity.getId());
            return true;
        } catch (Exception e) {
            log.warn("forget failed for {}: {}", memoryId, e.getMessage());
            return false;
        }
    }

    @Override
    public List<MemoryEntry> list(String scope, int limit) {
        List<MemoryEntry> entries = new ArrayList<>();
        try {
            for (AgentLongMemoryEntity entity : memoryMapper.selectByScope(scope, limit)) {
                entries.add(MemoryEntry.fromEntity(entity));
            }
        } catch (Exception e) {
            log.warn("list failed for scope {}: {}", scope, e.getMessage());
        }
        return entries;
    }
}
