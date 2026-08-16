package com.knowledge.agent.v2.memory;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.store.entity.AgentMemoryEntity;
import com.knowledge.agent.store.mapper.AgentMemoryMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

/**
 * Redis-primary, JDBC-fallback implementation of {@link MemoryStore}.
 *
 * <p>Hot recent memories live in a Redis list keyed by scope; the JDBC table is
 * the durable source of truth and cold path. {@link #recall} consults Redis
 * first and back-fills from JDBC when the hot cache has too few matches, which
 * keeps the common case a pure in-memory scan while never losing older facts.
 */
@Slf4j
@Component
public class DefaultMemoryStore implements MemoryStore {

    private static final String KEY_PREFIX = "agent:memory:list:";
    private static final int REDIS_MAX_ENTRIES = 500;
    private static final long REDIS_TTL_DAYS = 7;

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;
    private final AgentMemoryMapper memoryMapper;

    public DefaultMemoryStore(StringRedisTemplate redisTemplate,
            ObjectMapper objectMapper,
            AgentMemoryMapper memoryMapper) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
        this.memoryMapper = memoryMapper;
    }

    @Override
    public List<MemoryEntry> recall(String scope, String query, int limit) {
        if (limit <= 0) {
            limit = 5;
        }
        String q = query == null ? "" : query.toLowerCase(Locale.ROOT);
        List<MemoryEntry> results = new ArrayList<>();
        Set<String> seen = new HashSet<>();

        // 1. Hot path: Redis recent memories.
        List<MemoryEntry> hot = readRedis(scope);
        for (MemoryEntry entry : hot) {
            if (matches(entry, q) && seen.add(entry.getMemoryId())) {
                results.add(entry);
            }
        }
        sortForRecall(results, q);

        // 2. Cold fallback: back-fill from JDBC when the hot cache is insufficient.
        if (results.size() < limit) {
            try {
                List<AgentMemoryEntity> rows = q.isEmpty()
                        ? memoryMapper.latest(scope, limit * 3)
                        : memoryMapper.search(scope, query, limit * 3);
                for (AgentMemoryEntity row : rows) {
                    MemoryEntry entry = toEntry(row);
                    if (seen.add(entry.getMemoryId())) {
                        results.add(entry);
                    }
                }
                sortForRecall(results, q);
            } catch (Exception e) {
                log.warn("MemoryStore JDBC recall failed for scope {}: {}", scope, e.getMessage());
            }
        }

        return results.size() > limit ? results.subList(0, limit) : results;
    }

    @Override
    public void remember(MemoryEntry entry) {
        if (entry == null || entry.getContent() == null || entry.getContent().trim().isEmpty()) {
            return;
        }
        long now = System.currentTimeMillis();
        if (entry.getMemoryId() == null || entry.getMemoryId().isEmpty()) {
            entry.setMemoryId(UUID.randomUUID().toString());
        }
        if (entry.getType() == null || entry.getType().isEmpty()) {
            entry.setType("note");
        }
        if (entry.getImportance() < 0) {
            entry.setImportance(0);
        }
        if (entry.getImportance() > 100) {
            entry.setImportance(100);
        }
        if (entry.getCreateTime() <= 0) {
            entry.setCreateTime(now);
        }
        entry.setUpdateTime(now);
        entry.setLastAccessTime(now);

        // Redis hot cache.
        try {
            String json = objectMapper.writeValueAsString(entry);
            String key = KEY_PREFIX + entry.getScope();
            redisTemplate.opsForList().leftPush(key, json);
            redisTemplate.opsForList().trim(key, 0, REDIS_MAX_ENTRIES - 1);
            redisTemplate.expire(key, REDIS_TTL_DAYS, TimeUnit.DAYS);
        } catch (Exception e) {
            log.warn("MemoryStore Redis write failed for {}: {}", entry.getMemoryId(), e.getMessage());
        }

        // JDBC durable fallback.
        try {
            memoryMapper.upsertByMemoryId(toEntity(entry));
        } catch (Exception e) {
            log.warn("MemoryStore JDBC write failed for {}: {}", entry.getMemoryId(), e.getMessage());
        }
    }

    @Override
    public boolean forget(String scope, String memoryId) {
        boolean removed = false;
        try {
            String key = KEY_PREFIX + scope;
            List<MemoryEntry> current = readRedis(scope);
            List<String> kept = new ArrayList<>();
            for (MemoryEntry entry : current) {
                if (memoryId.equals(entry.getMemoryId())) {
                    removed = true;
                } else {
                    kept.add(objectMapper.writeValueAsString(entry));
                }
            }
            if (removed) {
                redisTemplate.delete(key);
                if (!kept.isEmpty()) {
                    redisTemplate.opsForList().rightPushAll(key, kept);
                    redisTemplate.expire(key, REDIS_TTL_DAYS, TimeUnit.DAYS);
                }
            }
        } catch (Exception e) {
            log.warn("MemoryStore Redis forget failed for {}: {}", memoryId, e.getMessage());
        }

        try {
            int deleted = memoryMapper.delete(new LambdaQueryWrapper<AgentMemoryEntity>()
                    .eq(AgentMemoryEntity::getMemoryId, memoryId)
                    .eq(AgentMemoryEntity::getScope, scope));
            removed = removed || deleted > 0;
        } catch (Exception e) {
            log.warn("MemoryStore JDBC forget failed for {}: {}", memoryId, e.getMessage());
        }
        return removed;
    }

    // ---- Helpers ----

    private List<MemoryEntry> readRedis(String scope) {
        List<MemoryEntry> out = new ArrayList<>();
        try {
            List<String> raw = redisTemplate.opsForList().range(KEY_PREFIX + scope, 0, -1);
            if (raw != null) {
                for (String json : raw) {
                    try {
                        out.add(objectMapper.readValue(json, MemoryEntry.class));
                    } catch (Exception ignore) {
                        // skip malformed record
                    }
                }
            }
        } catch (Exception e) {
            log.warn("MemoryStore Redis read failed for scope {}: {}", scope, e.getMessage());
        }
        return out;
    }

    private boolean matches(MemoryEntry entry, String query) {
        if (query.isEmpty()) {
            return true;
        }
        if (entry.getContent() != null && entry.getContent().toLowerCase(Locale.ROOT).contains(query)) {
            return true;
        }
        if (entry.getType() != null && entry.getType().toLowerCase(Locale.ROOT).contains(query)) {
            return true;
        }
        if (entry.getTags() != null) {
            for (String tag : entry.getTags()) {
                if (tag != null && tag.toLowerCase(Locale.ROOT).contains(query)) {
                    return true;
                }
            }
        }
        return false;
    }

    /** Order by (importance, recency); a keyword match already filtered the list. */
    private void sortForRecall(List<MemoryEntry> list, String query) {
        Comparator<MemoryEntry> cmp = Comparator
                .comparingInt(MemoryEntry::getImportance).reversed()
                .thenComparingLong(MemoryEntry::getLastAccessTime).reversed();
        list.sort(cmp);
    }

    private AgentMemoryEntity toEntity(MemoryEntry entry) {
        AgentMemoryEntity e = new AgentMemoryEntity();
        e.setMemoryId(entry.getMemoryId());
        e.setScope(entry.getScope());
        e.setUserId(entry.getUserId());
        e.setTenantId(entry.getTenantId());
        e.setType(entry.getType());
        e.setContent(entry.getContent());
        e.setImportance(entry.getImportance());
        e.setTags(entry.getTags() != null ? String.join(",", entry.getTags()) : null);
        e.setCreateTime(entry.getCreateTime());
        e.setUpdateTime(entry.getUpdateTime());
        e.setLastAccessTime(entry.getLastAccessTime());
        return e;
    }

    private MemoryEntry toEntry(AgentMemoryEntity e) {
        MemoryEntry m = new MemoryEntry();
        m.setMemoryId(e.getMemoryId());
        m.setScope(e.getScope());
        m.setUserId(e.getUserId());
        m.setTenantId(e.getTenantId());
        m.setType(e.getType());
        m.setContent(e.getContent());
        m.setImportance(e.getImportance() != null ? e.getImportance() : 0);
        if (e.getTags() != null && !e.getTags().isEmpty()) {
            m.setTags(java.util.Arrays.asList(e.getTags().split(",")));
        }
        m.setCreateTime(e.getCreateTime() != null ? e.getCreateTime() : 0L);
        m.setUpdateTime(e.getUpdateTime() != null ? e.getUpdateTime() : 0L);
        m.setLastAccessTime(e.getLastAccessTime() != null ? e.getLastAccessTime() : 0L);
        return m;
    }
}
