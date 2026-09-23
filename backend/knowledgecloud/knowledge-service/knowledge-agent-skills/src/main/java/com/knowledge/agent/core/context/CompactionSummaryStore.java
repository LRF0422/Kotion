package com.knowledge.agent.core.context;

/**
 * Durable cache for compaction summaries, keyed by a conversation scope and a
 * fingerprint of the exact summarized span.
 *
 * <p>Why this exists instead of writing the compacted conversation back into
 * {@code agent_chat_session.model_messages_json}: that column is not only the
 * model context but also the source of the UI transcript. Replacing it with a
 * compacted view would make previously summarized turns disappear from the
 * user's scrollback. DSH can compact its session surface because the UI reads
 * a separate append-only event log; this project does not have that split yet.
 *
 * <p>Persisting the summary itself (not the compacted log) removes the only
 * non-determinism in compaction: a fresh JVM or another cluster node re-derives
 * the same compacted prefix from the raw log and reuses the stored summary, so
 * the provider prefix cache still lines up across restarts. It also survives
 * the bounded in-memory summary cache being cleared on a long run.
 *
 * <p>Implementations must fail open — a store error is a cache miss, never a
 * run failure.
 */
public interface CompactionSummaryStore {

    /** The stored summary for one span, or {@code null} on a miss. */
    String find(String scope, String key);

    /** Persist one span's summary. Best-effort. */
    void save(String scope, String key, String summary);
}
