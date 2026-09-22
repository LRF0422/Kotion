package com.knowledge.agent.core.event;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.core.config.AgentCoreProperties;
import com.knowledge.agent.core.entity.AgentRunEventEntity;
import com.knowledge.agent.core.mapper.AgentRunEventMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ZSetOperations;
import org.springframework.stereotype.Component;

import javax.annotation.PreDestroy;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.LinkedBlockingQueue;
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

    /** Single-thread cold-tier mirror: ordered drain + multi-row INSERT. */
    private final ExecutorService mirrorExecutor = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "agentcore-event-mirror");
        t.setDaemon(true);
        return t;
    });

    /** Pending cold-tier rows, drained in seq order by the mirror thread. */
    private final BlockingQueue<AgentRunEventEntity> mirrorQueue = new LinkedBlockingQueue<>();

    /** Set on shutdown so the drain loop flushes what is queued and exits. */
    private volatile boolean mirrorStopped;

    public DefaultRunEventLog(StringRedisTemplate redis, ObjectMapper objectMapper,
                              AgentRunEventMapper eventMapper, AgentCoreProperties properties) {
        this.redis = redis;
        this.objectMapper = objectMapper;
        this.eventMapper = eventMapper;
        this.properties = properties;
        this.mirrorExecutor.submit(this::drainMirrorLoop);
    }

    @Override
    public RunEvent append(String runId, String type, Map<String, Object> payload) {
        long now = System.currentTimeMillis();
        AtomicLong counter = seqCounters.computeIfAbsent(runId, this::initCounter);
        long seq = counter.incrementAndGet();

        RunEvent event = new RunEvent(seq, type, payload != null ? payload : Collections.emptyMap(), now);

        // 1. Durable write BEFORE fan-out. Hot tier first; if Redis fails, fall
        //    back to a SYNCHRONOUS cold write so we never fan out an event that
        //    would be lost on reconnect (the documented invariant).
        boolean hotOk = false;
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
            hotOk = true;
        } catch (Exception e) {
            log.warn("EventLog Redis append failed for {} seq {}: {}", runId, seq, e.getMessage());
        }

        if (hotOk) {
            // 2. Async cold-tier mirror (best-effort, ordered by seq): the
            //    single mirror thread drains the queue into multi-row INSERTs,
            //    so a streaming run pays one round trip per batch, not per token.
            mirrorQueue.offer(toEntity(runId, event));
        } else if (!mirror(runId, event)) {
            log.error("EventLog append NOT durable for {} seq {} — delivered live only",
                    runId, seq);
        }

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
        // Redis is usable only when it starts exactly at the requested cursor.
        // A trimmed/TTL-ed head or a partial hot write would otherwise surface
        // as a permanent sequence gap.
        if (!events.isEmpty() && events.get(0).getSeq() <= afterSeq + 1) {
            return events;
        }
        List<RunEvent> cold = coldReplay(runId, afterSeq, limit);
        if (!cold.isEmpty()) {
            return cold;
        }
        return events;
    }

    /** Replay from the MySQL cold tier (authoritative across Redis trim/TTL). */
    private List<RunEvent> coldReplay(String runId, long afterSeq, int limit) {
        List<RunEvent> events = new ArrayList<>();
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
        mirrorStopped = true;
        mirrorExecutor.shutdown();
        try {
            // Do not drop queued cold mirrors on graceful shutdown: the drain
            // loop flushes the remaining queue before it terminates.
            if (!mirrorExecutor.awaitTermination(5, TimeUnit.SECONDS)) {
                mirrorExecutor.shutdownNow();
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            mirrorExecutor.shutdownNow();
        }
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

    private boolean mirror(String runId, RunEvent event) {
        return insertOne(toEntity(runId, event));
    }

    /** RunEvent → cold-tier row (payload serialized once, on the append path). */
    private AgentRunEventEntity toEntity(String runId, RunEvent event) {
        AgentRunEventEntity entity = new AgentRunEventEntity();
        entity.setRunId(runId);
        entity.setSeq(event.getSeq());
        entity.setEventType(event.getType());
        try {
            entity.setPayload(objectMapper.writeValueAsString(event.getPayload()));
        } catch (Exception e) {
            entity.setPayload("{}");
        }
        entity.setCreateTime(event.getCreateTime());
        return entity;
    }

    /**
     * Drain the queued cold rows into multi-row INSERTs. Events stay ordered by
     * seq (single thread, FIFO queue); a failed batch falls back to per-row
     * inserts so one bad row cannot drop its neighbours.
     *
     * <p>Once woken by the first event, the loop keeps coalescing for up to
     * {@code mirror-flush-interval-ms} (or until the batch is full) before it
     * writes. Without that linger a fast producer would be mirrored one row at
     * a time, which is exactly the per-token INSERT this batching removes.
     */
    private void drainMirrorLoop() {
        int batchSize = Math.max(1, properties.getEvent().getMirrorBatchSize());
        long flushMs = Math.max(10L, properties.getEvent().getMirrorFlushIntervalMs());
        while (!mirrorStopped) {
            // Fresh per iteration: a finished batch is never re-flushed, while a
            // batch interrupted mid-linger still gets written out.
            List<AgentRunEventEntity> batch = new ArrayList<>(batchSize);
            try {
                AgentRunEventEntity first = mirrorQueue.poll(flushMs, TimeUnit.MILLISECONDS);
                if (first == null) {
                    continue;
                }
                batch.add(first);
                long lingerUntil = System.currentTimeMillis() + flushMs;
                while (batch.size() < batchSize) {
                    long remaining = lingerUntil - System.currentTimeMillis();
                    if (remaining <= 0) {
                        break;
                    }
                    AgentRunEventEntity next = mirrorQueue.poll(remaining, TimeUnit.MILLISECONDS);
                    if (next == null) {
                        break;
                    }
                    batch.add(next);
                }
                mirrorBatch(batch);
            } catch (InterruptedException e) {
                mirrorBatch(batch);
                Thread.currentThread().interrupt();
                break;
            } catch (Exception e) {
                log.warn("EventLog mirror loop failed: {}", e.getMessage());
            }
        }
        // Final drain so a graceful shutdown never drops a queued event.
        List<AgentRunEventEntity> rest = new ArrayList<>(batchSize);
        while (mirrorQueue.drainTo(rest, batchSize) > 0) {
            mirrorBatch(rest);
            rest.clear();
        }
    }

    private void mirrorBatch(List<AgentRunEventEntity> batch) {
        if (batch.isEmpty()) {
            return;
        }
        if (batch.size() == 1) {
            insertOne(batch.get(0));
            return;
        }
        try {
            eventMapper.insertBatch(batch);
            return;
        } catch (Exception e) {
            log.warn("EventLog JDBC batch mirror failed for {} rows ({}); retrying individually",
                    batch.size(), e.getMessage());
        }
        for (AgentRunEventEntity entity : batch) {
            insertOne(entity);
        }
    }

    private boolean insertOne(AgentRunEventEntity entity) {
        try {
            eventMapper.insertEvent(entity);
            return true;
        } catch (Exception e) {
            log.warn("EventLog JDBC mirror failed for {} seq {}: {}",
                    entity.getRunId(), entity.getSeq(), e.getMessage());
            return false;
        }
    }

    /**
     * Retention sweep: drop cold events older than {@code event.retention-days}.
     * Without this the cold tier grows without bound.
     */
    @Scheduled(fixedDelayString = "21600000")
    public void retentionSweep() {
        int days = properties.getEvent().getRetentionDays();
        if (days <= 0) {
            return;
        }
        long cutoff = System.currentTimeMillis() - (long) days * 24L * 60L * 60L * 1000L;
        int batches = 0;
        try {
            int deleted;
            do {
                deleted = eventMapper.deleteOlderThan(cutoff, 1000);
                batches++;
            } while (deleted == 1000 && batches < 100);
        } catch (Exception e) {
            log.warn("EventLog retention sweep failed: {}", e.getMessage());
        }
    }
}
