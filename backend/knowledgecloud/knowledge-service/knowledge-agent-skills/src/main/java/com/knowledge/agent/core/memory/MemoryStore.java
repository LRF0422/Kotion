package com.knowledge.agent.core.memory;

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

    /**
     * Browse every entry owned by the user across all scopes (user → space →
     * page), newest first — the memory-management UI cannot enumerate the page
     * scopes a user has visited, so it browses by owner instead.
     *
     * <p>A non-blank {@code query} switches to keyword recall across the same
     * set (ranked by {@link MemoryRetriever}); {@code offset} then applies to
     * the unranked browse only, because a ranked top-k has no stable page.
     *
     * @param type optional type filter (fact | preference | note | episode); null/blank = all
     */
    List<MemoryEntry> listAll(Long userId, Long tenantId, String query, String type, int limit, int offset);

    /** Total entries owned by the user across all scopes (optional type filter). */
    int countAll(Long userId, Long tenantId, String type);

    /** Delete every entry owned by the user; returns the number of rows removed. */
    int forgetAll(Long userId, Long tenantId);
}
