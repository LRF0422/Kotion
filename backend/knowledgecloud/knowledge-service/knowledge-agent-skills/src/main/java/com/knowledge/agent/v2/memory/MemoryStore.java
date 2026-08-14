package com.knowledge.agent.v2.memory;

import java.util.List;

/**
 * Long-term memory persistence + retrieval.
 *
 * <p>Memory is scoped by {@code scope} (user + tenant), so a tenant's memories
 * are isolated per user. The default implementation is Redis-primary with a
 * JDBC cold fallback, but callers depend only on this interface.
 *
 * <p>All methods are best-effort from the caller's perspective: retrieval
 * returns an empty list on any failure, and writes never throw.
 */
public interface MemoryStore {

    /**
     * Retrieve memories relevant to {@code query}, ordered by importance then
     * recency. A blank query returns the most recent memories.
     */
    List<MemoryEntry> recall(String scope, String query, int limit);

    /** Persist a memory (upsert by {@code memoryId}). */
    void remember(MemoryEntry entry);

    /** Delete a memory by id; returns true when at least one tier removed it. */
    boolean forget(String scope, String memoryId);

    /**
     * Build the scope key for a (user, tenant). Mirrors the key layout used by
     * the store implementation.
     */
    static String scope(Long userId, Long tenantId) {
        return "u:" + (userId != null ? userId : 0) + ":t:" + (tenantId != null ? tenantId : 0);
    }
}
