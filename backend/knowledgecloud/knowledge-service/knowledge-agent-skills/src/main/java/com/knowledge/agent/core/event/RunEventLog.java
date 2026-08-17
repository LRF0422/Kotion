package com.knowledge.agent.core.event;

import java.util.List;
import java.util.Map;

/**
 * Durable append-only event log for a run, with live tail fan-out.
 *
 * <p>Invariants:
 * <ul>
 *   <li>Events are assigned a run-scoped monotonic seq.</li>
 *   <li>Every event is durably appended (Redis ZSET hot tier) BEFORE it is
 *       fanned out to live subscribers — no event is ever "pushed but lost".</li>
 *   <li>The MySQL cold tier mirrors asynchronously (batched) for post-TTL replay.</li>
 *   <li>Replay reads Redis first and falls back to MySQL.</li>
 * </ul>
 */
public interface RunEventLog {

    /** Durably append an event and fan it out; returns the seq-bearing event. */
    RunEvent append(String runId, String type, Map<String, Object> payload);

    /** Replay events with seq &gt; afterSeq, ascending, at most {@code limit}. */
    List<RunEvent> replay(String runId, long afterSeq, int limit);

    /** Highest durably-known seq for a run (0 when none). */
    long lastSeq(String runId);

    /** Subscribe to the live tail (events appended after the call). */
    EventSubscription subscribe(String runId);

    /** Forget in-memory per-run state after a run reaches a terminal state. */
    void release(String runId);
}
