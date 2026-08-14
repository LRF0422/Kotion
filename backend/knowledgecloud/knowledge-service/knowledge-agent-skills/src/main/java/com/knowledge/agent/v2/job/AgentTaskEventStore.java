package com.knowledge.agent.v2.job;

import java.util.List;

/**
 * Durable per-task event log — the source of truth for replay/resume.
 *
 * <p>Every agent event is appended with its monotonic {@code seq} BEFORE it is
 * streamed to clients, so any interruption (page refresh, dropped connection,
 * process restart) can be recovered by replaying {@code seq > afterSeq}. The
 * hot tier is Redis (ZSET scored by seq); the cold tier is MySQL.
 */
public interface AgentTaskEventStore {

    /**
     * Append an event record. Best-effort per tier; Redis is authoritative for
     * replay within the TTL window.
     *
     * @param taskId      task identifier
     * @param seq         monotonic sequence within the task
     * @param type        SSE event type (e.g. {@code think.delta})
     * @param payloadJson JSON payload exactly as streamed over SSE (minus seq)
     */
    void append(String taskId, long seq, String type, String payloadJson);

    /** Replay records with {@code seq > afterSeq}, ascending, bounded by limit. */
    List<TaskEventRecord> replay(String taskId, long afterSeq, int limit);

    /** The highest seq durably logged for the task (0 when none). */
    long maxSeq(String taskId);

    /** A durable event record. */
    class TaskEventRecord {
        public final long seq;
        public final String type;
        public final String payloadJson;

        public TaskEventRecord(long seq, String type, String payloadJson) {
            this.seq = seq;
            this.type = type;
            this.payloadJson = payloadJson;
        }
    }
}
