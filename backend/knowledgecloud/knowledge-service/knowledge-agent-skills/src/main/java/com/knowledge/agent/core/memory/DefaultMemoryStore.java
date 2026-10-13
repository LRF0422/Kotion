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

    /** Hard cap for one UI page of memories, whatever the caller asks for. */
    private static final int MAX_BROWSE_LIMIT = 200;

    /**
     * Candidates pulled from MySQL before keyword ranking. Browsing one user's
     * whole memory set is bounded and cheap (the store is per-user and small),
     * so ranking in memory beats a second indexed query.
     */
    private static final int RECALL_CANDIDATE_LIMIT = 500;

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
        touch(top);
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

    @Override
    public List<MemoryEntry> listAll(Long userId, Long tenantId, String query, String type,
                                     int limit, int offset) {
        if (userId == null) {
            return new ArrayList<>();
        }
        String normalizedType = blankToNull(type);
        int safeLimit = Math.max(1, Math.min(limit, MAX_BROWSE_LIMIT));
        try {
            if (query != null && !query.trim().isEmpty()) {
                List<AgentLongMemoryEntity> entities =
                        memoryMapper.selectByUserId(userId, tenantId, normalizedType,
                                RECALL_CANDIDATE_LIMIT, 0);
                List<MemoryEntry> top = retriever.top(toEntries(entities), query, safeLimit);
                touch(top);
                return top;
            }
            return toEntries(memoryMapper.selectByUserId(userId, tenantId, normalizedType,
                    safeLimit, Math.max(0, offset)));
        } catch (Exception e) {
            log.warn("listAll failed for user {}: {}", userId, e.getMessage());
            return new ArrayList<>();
        }
    }

    @Override
    public int countAll(Long userId, Long tenantId, String type) {
        if (userId == null) {
            return 0;
        }
        try {
            return memoryMapper.countByUserId(userId, tenantId, blankToNull(type));
        } catch (Exception e) {
            log.warn("countAll failed for user {}: {}", userId, e.getMessage());
            return 0;
        }
    }

    @Override
    public int forgetAll(Long userId, Long tenantId) {
        if (userId == null) {
            return 0;
        }
        try {
            return memoryMapper.deleteByUserId(userId, tenantId);
        } catch (Exception e) {
            log.warn("forgetAll failed for user {}: {}", userId, e.getMessage());
            return 0;
        }
    }

    private List<MemoryEntry> toEntries(List<AgentLongMemoryEntity> entities) {
        List<MemoryEntry> entries = new ArrayList<>();
        if (entities != null) {
            for (AgentLongMemoryEntity entity : entities) {
                entries.add(MemoryEntry.fromEntity(entity));
            }
        }
        return entries;
    }

    /** Touch lastAccessTime (recency feeds future scoring). */
    private void touch(List<MemoryEntry> entries) {
        long now = System.currentTimeMillis();
        for (MemoryEntry entry : entries) {
            entry.setLastAccessTime(now);
            try {
                memoryMapper.upsertByMemoryId(entry.toEntity());
            } catch (Exception ignored) {
                // hot-path best effort
            }
        }
    }

    private static String blankToNull(String value) {
        return (value == null || value.trim().isEmpty()) ? null : value.trim();
    }
}
