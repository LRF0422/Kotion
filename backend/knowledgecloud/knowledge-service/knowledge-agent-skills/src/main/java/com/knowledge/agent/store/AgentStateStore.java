package com.knowledge.agent.store;

/**
 * Persistence interface for full agent state snapshots.
 *
 * <p>
 * Implementations persist the mutable working state of an agent loop
 * (messages, iteration count, activated skills, tool call history) so
 * that a crashed or restarted agent can resume from its last commit point.
 *
 * <p>
 * All methods are best-effort: a failure to persist must never propagate
 * to the agent loop. Load methods return {@code null} when no snapshot
 * exists, signalling the loop to start fresh.
 */
public interface AgentStateStore {

    /**
     * Persist a state snapshot for the given session.
     *
     * @param sessionId the session ID (used as the file key)
     * @param snapshot  the full state snapshot
     */
    void save(String sessionId, AgentStateSnapshot snapshot);

    /**
     * Persist a pre-serialized state snapshot (JSON bytes) for the given
     * session. This avoids re-serialization when the caller has already
     * serialized the snapshot synchronously to avoid shallow-copy race
     * conditions.
     *
     * @param sessionId  the session ID (used as the file key)
     * @param jsonBytes  the pre-serialized snapshot as JSON bytes
     */
    void saveBytes(String sessionId, byte[] jsonBytes);

    /**
     * Persist a state snapshot synchronously. Used at critical commit points
     * (resume, sub-agent spawn/completion) where a crash immediately after
     * the call must not roll back to the previous checkpoint.
     *
     * <p>Default implementation delegates to {@link #save(String, AgentStateSnapshot)}
     * so existing best-effort implementations remain compatible.
     */
    default void saveNow(String sessionId, AgentStateSnapshot snapshot) {
        save(sessionId, snapshot);
    }

    /**
     * Load the persisted state snapshot for the given session.
     *
     * @param sessionId the session ID
     * @return the snapshot, or {@code null} if none exists
     */
    AgentStateSnapshot load(String sessionId);

    /**
     * Check whether a snapshot exists for the given session.
     *
     * @param sessionId the session ID
     * @return {@code true} if a snapshot file exists
     */
    boolean exists(String sessionId);

    /**
     * Delete the snapshot for the given session.
     *
     * @param sessionId the session ID
     */
    void delete(String sessionId);

    /**
     * Load the most recent snapshot across all sessions belonging to a
     * conversation. Useful for finding the latest checkpoint of a
     * multi-session conversation.
     *
     * @param conversationId the conversation ID
     * @return the latest snapshot, or {@code null} if none exists
     */
    AgentStateSnapshot loadLatest(String conversationId);
}
