package com.knowledge.agentcore.memory;

import java.util.List;

/**
 * Memory scoring policy. The keyword implementation scores importance + recency
 * + tag/keyword hits; a future {@code EmbeddingMemoryRetriever} implements the
 * same contract with vector similarity (see {@code embeddingRef}).
 */
public interface MemoryRetriever {

    /**
     * Score candidates against a query and return the top-k (stable order).
     */
    List<MemoryEntry> top(List<MemoryEntry> candidates, String query, int limit);
}
