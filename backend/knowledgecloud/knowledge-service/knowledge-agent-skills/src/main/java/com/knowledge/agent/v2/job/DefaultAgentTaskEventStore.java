package com.knowledge.agent.v2.job;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.store.entity.AgentTaskEventEntity;
import com.knowledge.agent.store.mapper.AgentTaskEventMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import javax.annotation.PreDestroy;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/**
 * Redis-ZSET + JDBC implementation of {@link AgentTaskEventStore}.
 *
 * <p>Hot tier: {@code agent:taskevents:<taskId>} ZSET, score = seq, member =
 * JSON record {@code {seq, type, payload}} — supports O(log n) range replay and
 * cheap max-seq lookups. Kept as a ring buffer ({@code maxEvents}, default
 * 10000) with a TTL.
 *
 * <p>Cold tier: {@code agent_task_event} rows written by a bounded async
 * executor (silent drop on saturation, like the snapshot store) for long-term
 * audit and replay after the Redis TTL.
 */
@Slf4j
@Component
public class DefaultAgentTaskEventStore implements AgentTaskEventStore {

    private static final String KEY_PREFIX = "agent:taskevents:";
    private static final long TTL_HOURS = 24;
    private static final int MAX_EVENTS = 10_000;
    private static final int REPLAY_BATCH = 2_000;

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;
    private final AgentTaskEventMapper eventMapper;

    private ThreadPoolExecutor mirrorExecutor;

    public DefaultAgentTaskEventStore(StringRedisTemplate redisTemplate,
            ObjectMapper objectMapper,
            AgentTaskEventMapper eventMapper) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
        this.eventMapper = eventMapper;
    }

    @PostConstruct
    void init() {
        mirrorExecutor = new ThreadPoolExecutor(2, 2, 0L, TimeUnit.MILLISECONDS,
                new LinkedBlockingQueue<>(500),
                (r, executor) -> log.warn("AgentTaskEventStore mirror queue full, dropping event row"));
    }

    @PreDestroy
    void shutdown() {
        if (mirrorExecutor != null) {
            mirrorExecutor.shutdown();
            try {
                if (!mirrorExecutor.awaitTermination(5, TimeUnit.SECONDS)) {
                    mirrorExecutor.shutdownNow();
                }
            } catch (InterruptedException e) {
                mirrorExecutor.shutdownNow();
                Thread.currentThread().interrupt();
            }
        }
    }

    @Override
    public void append(String taskId, long seq, String type, String payloadJson) {
        try {
            Map<String, Object> record = new LinkedHashMap<>();
            record.put("seq", seq);
            record.put("type", type);
            record.put("payload", payloadJson != null ? payloadJson : "");
            String member = objectMapper.writeValueAsString(record);

            String key = KEY_PREFIX + taskId;
            redisTemplate.opsForZSet().add(key, member, seq);
            // Ring buffer: keep the newest MAX_EVENTS.
            redisTemplate.opsForZSet().removeRange(key, 0, -(MAX_EVENTS + 1));
            redisTemplate.expire(key, TTL_HOURS, TimeUnit.HOURS);
        } catch (Exception e) {
            log.warn("AgentTaskEventStore Redis append failed for {} seq {}: {}",
                    taskId, seq, e.getMessage());
        }

        // Cold mirror (async, best-effort).
        try {
            CompletableFuture.runAsync(() -> {
                AgentTaskEventEntity entity = new AgentTaskEventEntity();
                entity.setTaskId(taskId);
                entity.setSeq(seq);
                entity.setEventType(type);
                entity.setPayload(payloadJson);
                entity.setCreateTime(System.currentTimeMillis());
                eventMapper.upsertByTaskSeq(entity);
            }, mirrorExecutor).exceptionally(e -> {
                log.warn("AgentTaskEventStore JDBC append failed for {} seq {}: {}",
                        taskId, seq, e.getMessage());
                return null;
            });
        } catch (Exception e) {
            log.warn("AgentTaskEventStore mirror submit failed for {} seq {}: {}",
                    taskId, seq, e.getMessage());
        }
    }

    @Override
    public List<TaskEventRecord> replay(String taskId, long afterSeq, int limit) {
        List<TaskEventRecord> out = new ArrayList<>();
        int cap = limit > 0 ? Math.min(limit, REPLAY_BATCH) : REPLAY_BATCH;

        // Hot tier: ZSET range by score, ascending.
        try {
            Set<String> members = redisTemplate.opsForZSet().rangeByScore(
                    KEY_PREFIX + taskId, afterSeq + 1, Double.POSITIVE_INFINITY, 0, cap);
            if (members != null) {
                for (String member : members) {
                    TaskEventRecord rec = parse(member);
                    if (rec != null) {
                        out.add(rec);
                    }
                }
            }
        } catch (Exception e) {
            log.warn("AgentTaskEventStore Redis replay failed for {}: {}", taskId, e.getMessage());
        }

        // Cold fallback: JDBC when the hot tier has nothing (Redis TTL evicted).
        if (out.isEmpty()) {
            try {
                List<AgentTaskEventEntity> rows = eventMapper.replay(taskId, afterSeq, cap);
                for (AgentTaskEventEntity row : rows) {
                    out.add(new TaskEventRecord(
                            row.getSeq() != null ? row.getSeq() : 0L,
                            row.getEventType(),
                            row.getPayload()));
                }
            } catch (Exception e) {
                log.warn("AgentTaskEventStore JDBC replay failed for {}: {}", taskId, e.getMessage());
            }
        }
        return out;
    }

    @Override
    public long maxSeq(String taskId) {
        try {
            Set<org.springframework.data.redis.core.ZSetOperations.TypedTuple<String>> top =
                    redisTemplate.opsForZSet().reverseRangeWithScores(KEY_PREFIX + taskId, 0, 0);
            if (top != null && !top.isEmpty()) {
                Double score = top.iterator().next().getScore();
                if (score != null) {
                    return score.longValue();
                }
            }
        } catch (Exception e) {
            log.warn("AgentTaskEventStore Redis maxSeq failed for {}: {}", taskId, e.getMessage());
        }
        try {
            Long max = eventMapper.maxSeq(taskId);
            return max != null ? max : 0L;
        } catch (Exception e) {
            log.warn("AgentTaskEventStore JDBC maxSeq failed for {}: {}", taskId, e.getMessage());
        }
        return 0L;
    }

    private TaskEventRecord parse(String member) {
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> record = objectMapper.readValue(member, Map.class);
            long seq = record.get("seq") instanceof Number ? ((Number) record.get("seq")).longValue() : -1L;
            String type = String.valueOf(record.get("type"));
            String payload = record.get("payload") != null ? String.valueOf(record.get("payload")) : "";
            return new TaskEventRecord(seq, type, payload);
        } catch (Exception e) {
            return null;
        }
    }
}
