package com.knowledge.agentcore.memory;

import java.util.List;

/**
 * Long-term memory store — remember / recall / forget with hierarchical scope.
 * {@link MemoryRetriever} owns the scoring policy (keyword+importance+recency
 * now; embeddings plug in later without changing this contract).
 */
public interface MemoryStore {

    /** Create or update a memory entry. */
    MemoryEntry remember(MemoryEntry entry);

    /**
     * Recall top entries across the given scopes (most specific first),
     * optionally filtered by type, scored by the retriever.
     */
    List<MemoryEntry> recall(List<String> scopes, String query, String type, int limit);

    /** Delete by memory id; returns true when something was removed. */
    boolean forget(String memoryId, Long userId, Long tenantId);

    /** List entries in one scope (UI browsing), newest first. */
    List<MemoryEntry> list(String scope, int limit);
}
