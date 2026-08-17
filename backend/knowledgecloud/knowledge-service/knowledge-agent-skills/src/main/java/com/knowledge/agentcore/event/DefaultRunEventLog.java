package com.knowledge.agentcore.event;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agentcore.config.AgentCoreProperties;
import com.knowledge.agentcore.entity.AgentRunEventEntity;
import com.knowledge.agentcore.mapper.AgentRunEventMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ZSetOperations;
import org.springframework.stereotype.Component;

import javax.annotation.PreDestroy;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Default {@link RunEventLog}: Redis ZSET hot tier ({@code agent:run:events:{runId}},
 * score = seq) + async MySQL cold mirror ({@code agent_run_event}) + in-memory
 * subscriber fan-out.
 */
@Slf4j
@Component
public class DefaultRunEventLog implements RunEventLog {

    private static final String ZSET_KEY_PREFIX = "agent:run:events:";

    private final StringRedisTemplate redis;
    private final ObjectMapper objectMapper;
    private final AgentRunEventMapper eventMapper;
    private final AgentCoreProperties properties;

    /** Per-run seq counters (initialized from durable storage on first touch). */
    private final Map<String, AtomicLong> seqCounters = new ConcurrentHashMap<>();

    /** Per-run live subscribers. */
    private final Map<String, CopyOnWriteArrayList<EventSubscription>> subscribers =
            new ConcurrentHashMap<>();

    /** Single-thread cold-tier mirror (ordered, batched by nature). */
    private final ExecutorService mirrorExecutor = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "agentcore-event-mirror");
        t.setDaemon(true);
        return t;
    });

    public DefaultRunEventLog(StringRedisTemplate redis, ObjectMapper objectMapper,
                              AgentRunEventMapper eventMapper, AgentCoreProperties properties) {
        this.redis = redis;
        this.objectMapper = objectMapper;
        this.eventMapper = eventMapper;
        this.properties = properties;
    }

    @Override
    public RunEvent append(String runId, String type, Map<String, Object> payload) {
        long now = System.currentTimeMillis();
        AtomicLong counter = seqCounters.computeIfAbsent(runId, this::initCounter);
        long seq = counter.incrementAndGet();

        RunEvent event = new RunEvent(seq, type, payload != null ? payload : Collections.emptyMap(), now);

        // 1. Durable hot-tier append BEFORE fan-out.
        try {
            String json = objectMapper.writeValueAsString(event);
            String key = ZSET_KEY_PREFIX + runId;
            redis.opsForZSet().add(key, json, seq);
            long ttlHours = properties.getEvent().getTtlHours();
            if (ttlHours > 0) {
                redis.expire(key, ttlHours, TimeUnit.HOURS);
            }
            // Trim oldest when over the per-run safety cap (keep the newest).
            int maxEvents = properties.getEvent().getMaxEventsPerRun();
            if (maxEvents > 0) {
                Long size = redis.opsForZSet().zCard(key);
                if (size != null && size > maxEvents) {
                    redis.opsForZSet().removeRange(key, 0, size - maxEvents - 1);
                }
            }
        } catch (Exception e) {
            log.warn("EventLog Redis append failed for {} seq {}: {}", runId, seq, e.getMessage());
        }

        // 2. Async cold-tier mirror (best-effort, ordered by seq).
        mirrorExecutor.submit(() -> mirror(runId, event));

        // 3. Fan out to live subscribers.
        CopyOnWriteArrayList<EventSubscription> list = subscribers.get(runId);
        if (list != null) {
            for (EventSubscription sub : list) {
                sub.offer(event);
            }
        }
        return event;
    }

    @Override
    public List<RunEvent> replay(String runId, long afterSeq, int limit) {
        List<RunEvent> events = new ArrayList<>();
        try {
            String key = ZSET_KEY_PREFIX + runId;
            Set<ZSetOperations.TypedTuple<String>> range = redis.opsForZSet()
                    .rangeByScoreWithScores(key, afterSeq + 0.001, Double.POSITIVE_INFINITY, 0, limit);
            if (range != null) {
                for (ZSetOperations.TypedTuple<String> tuple : range) {
                    events.add(objectMapper.readValue(tuple.getValue(), RunEvent.class));
                }
            }
        } catch (Exception e) {
            log.warn("EventLog Redis replay failed for {}: {}", runId, e.getMessage());
        }
        if (!events.isEmpty()) {
            return events;
        }
        // Redis hot tier empty (TTL eviction) → MySQL cold tier.
        try {
            List<AgentRunEventEntity> entities = eventMapper.selectAfterSeq(runId, afterSeq, limit);
            for (AgentRunEventEntity entity : entities) {
                RunEvent event = new RunEvent();
                event.setSeq(entity.getSeq());
                event.setType(entity.getEventType());
                event.setCreateTime(entity.getCreateTime());
                if (entity.getPayload() != null && !entity.getPayload().isEmpty()) {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> payload = objectMapper.readValue(entity.getPayload(), Map.class);
                    event.setPayload(payload);
                } else {
                    event.setPayload(Collections.emptyMap());
                }
                events.add(event);
            }
        } catch (Exception e) {
            log.warn("EventLog JDBC replay failed for {}: {}", runId, e.getMessage());
        }
        return events;
    }

    @Override
    public long lastSeq(String runId) {
        AtomicLong counter = seqCounters.get(runId);
        if (counter != null) {
            return counter.get();
        }
        return initCounter(runId).get();
    }

    @Override
    public EventSubscription subscribe(String runId) {
        EventSubscription subscription = new EventSubscription(runId);
        subscribers.computeIfAbsent(runId, k -> new CopyOnWriteArrayList<>()).add(subscription);
        return subscription;
    }

    @Override
    public void release(String runId) {
        seqCounters.remove(runId);
        // Deregister so no NEW subscribers attach to a finished run; existing
        // subscribers keep draining their queues (the terminal event is still
        // buffered for them and the SSE side closes itself on it).
        subscribers.remove(runId);
    }

    @PreDestroy
    public void shutdown() {
        mirrorExecutor.shutdown();
    }

    // ---- internals ----

    private AtomicLong initCounter(String runId) {
        long max = 0;
        try {
            String key = ZSET_KEY_PREFIX + runId;
            Set<String> tail = redis.opsForZSet().reverseRange(key, 0, 0);
            if (tail != null && !tail.isEmpty()) {
                RunEvent last = objectMapper.readValue(tail.iterator().next(), RunEvent.class);
                max = last.getSeq();
            }
        } catch (Exception e) {
            log.warn("EventLog Redis seq init failed for {}: {}", runId, e.getMessage());
        }
        if (max == 0) {
            try {
                max = eventMapper.selectMaxSeq(runId);
            } catch (Exception e) {
                log.warn("EventLog JDBC seq init failed for {}: {}", runId, e.getMessage());
            }
        }
        return new AtomicLong(max);
    }

    private void mirror(String runId, RunEvent event) {
        try {
            AgentRunEventEntity entity = new AgentRunEventEntity();
            entity.setRunId(runId);
            entity.setSeq(event.getSeq());
            entity.setEventType(event.getType());
            entity.setPayload(objectMapper.writeValueAsString(event.getPayload()));
            entity.setCreateTime(event.getCreateTime());
            eventMapper.insertEvent(entity);
        } catch (Exception e) {
            log.warn("EventLog JDBC mirror failed for {} seq {}: {}", runId, event.getSeq(), e.getMessage());
        }
    }
}
