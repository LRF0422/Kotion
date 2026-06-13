package com.knowledge.agent.store;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * Append-only event log for agent turns (P3), backed by Redis lists.
 *
 * <p>Each emitted {@code StreamEvent} is persisted as a record
 * {@code {seq, ts, type, payload}} under {@code agent:events:<conversationId>},
 * where {@code payload} is the exact SSE-serializable map sent to the client.
 * This serves two purposes:
 * <ul>
 *   <li><b>Audit</b>: the full decision/output trace of a conversation.</li>
 *   <li><b>Resume (P5)</b>: a reconnecting client can replay everything after
 *       its {@code Last-Event-ID}.</li>
 * </ul>
 *
 * <p>Deliberately Redis-backed (already a project dependency) rather than a
 * relational schema — no DDL, no new infra. A future phase can add a MyBatis
 * mirror for long-term audit. All methods are best-effort and never throw, so
 * persistence can never break the streaming path.
 */
@Slf4j
@Component
public class AgentEventStore {

    private static final String KEY_PREFIX = "agent:events:";

    @Value("${agent.persistence.enabled:true}")
    private boolean enabled;

    /** Keep at most this many recent events per conversation (ring buffer). */
    @Value("${agent.persistence.max-events:2000}")
    private int maxEvents;

    /** Event-log TTL in hours. */
    @Value("${agent.persistence.ttl-hours:24}")
    private long ttlHours;

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    public AgentEventStore(StringRedisTemplate redisTemplate, ObjectMapper objectMapper) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
    }

    /**
     * Append one event record. Best-effort; swallows all errors.
     *
     * @param conversationId conversation key (no-op if null/blank)
     * @param seq            per-turn sequence number
     * @param ts             send timestamp (epoch millis)
     * @param type           event type identifier
     * @param payload        the SSE-serializable payload map (may be null)
     */
    public void append(String conversationId, long seq, long ts, String type, Object payload) {
        if (!enabled || conversationId == null || conversationId.isEmpty()) {
            return;
        }
        try {
            Map<String, Object> record = new LinkedHashMap<>();
            record.put("seq", seq);
            record.put("ts", ts);
            record.put("type", type);
            record.put("payload", payload);
            String json = objectMapper.writeValueAsString(record);
            String key = KEY_PREFIX + conversationId;
            redisTemplate.opsForList().rightPush(key, json);
            // Trim to the most recent maxEvents and refresh TTL.
            redisTemplate.opsForList().trim(key, -maxEvents, -1);
            redisTemplate.expire(key, ttlHours, TimeUnit.HOURS);
        } catch (Exception e) {
            log.warn("AgentEventStore.append failed for conversation {}: {}", conversationId, e.getMessage());
        }
    }

    /**
     * Return the persisted payloads for events with {@code seq > afterSeq},
     * in order. Each returned entry is a record {@code {seq, ts, type, payload}}.
     * Returns an empty list on any error or when persistence is disabled.
     */
    public List<EventRecord> replayAfter(String conversationId, long afterSeq) {
        List<EventRecord> out = new ArrayList<>();
        if (!enabled || conversationId == null || conversationId.isEmpty()) {
            return out;
        }
        try {
            String key = KEY_PREFIX + conversationId;
            List<String> raw = redisTemplate.opsForList().range(key, 0, -1);
            if (raw == null) {
                return out;
            }
            for (String json : raw) {
                try {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> rec = objectMapper.readValue(json, Map.class);
                    long seq = rec.get("seq") instanceof Number ? ((Number) rec.get("seq")).longValue() : -1L;
                    if (seq > afterSeq) {
                        out.add(new EventRecord(seq,
                                rec.get("ts") instanceof Number ? ((Number) rec.get("ts")).longValue() : 0L,
                                String.valueOf(rec.get("type")),
                                rec.get("payload")));
                    }
                } catch (Exception ignore) {
                    // skip malformed record
                }
            }
        } catch (Exception e) {
            log.warn("AgentEventStore.replayAfter failed for conversation {}: {}", conversationId, e.getMessage());
        }
        return out;
    }

    /** A persisted event record. */
    public static class EventRecord {
        public final long seq;
        public final long ts;
        public final String type;
        public final Object payload;

        public EventRecord(long seq, long ts, String type, Object payload) {
            this.seq = seq;
            this.ts = ts;
            this.type = type;
            this.payload = payload;
        }
    }
}
