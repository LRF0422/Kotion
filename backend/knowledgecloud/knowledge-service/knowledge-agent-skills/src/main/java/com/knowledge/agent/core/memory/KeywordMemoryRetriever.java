package com.knowledge.agent.core.memory;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Deterministic retrieval: {@code importance × 0.7 + recency decay × 30 +
 * keyword/tag hit bonus} (max ~130). No external vector store required;
 * deterministic enough for unit tests.
 */
@Component
public class KeywordMemoryRetriever implements MemoryRetriever {

    @Override
    public List<MemoryEntry> top(List<MemoryEntry> candidates, String query, int limit) {
        List<MemoryEntry> sorted = new ArrayList<>(candidates);
        String lowerQuery = query == null ? "" : query.toLowerCase().trim();
        final long now = System.currentTimeMillis();
        sorted.sort(Comparator.comparingDouble((MemoryEntry e) -> score(e, lowerQuery, now)).reversed());
        if (sorted.size() > limit) {
            return new ArrayList<>(sorted.subList(0, limit));
        }
        return sorted;
    }

    private double score(MemoryEntry entry, String lowerQuery, long now) {
        double importanceScore = entry.getImportance() * 0.7;
        double ageDays = Math.max(0, (now - entry.getLastAccessTime()) / (24.0 * 3600 * 1000));
        double recencyScore = Math.exp(-ageDays / 30.0) * 30.0;
        double keywordBonus = 0;
        if (!lowerQuery.isEmpty()) {
            String content = entry.getContent() == null ? "" : entry.getContent().toLowerCase();
            for (String token : lowerQuery.split("[\\s,，。;；]+")) {
                if (token.isEmpty()) {
                    continue;
                }
                if (content.contains(token)) {
                    keywordBonus += 10;
                }
                for (String tag : entry.getTags()) {
                    if (tag.toLowerCase().contains(token) || token.contains(tag.toLowerCase())) {
                        keywordBonus += 8;
                    }
                }
            }
            if (keywordBonus > 30) {
                keywordBonus = 30;
            }
        }
        return importanceScore + recencyScore + keywordBonus;
    }
}
