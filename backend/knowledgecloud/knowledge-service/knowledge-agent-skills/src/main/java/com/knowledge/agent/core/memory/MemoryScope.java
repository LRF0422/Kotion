package com.knowledge.agent.core.memory;

import java.util.ArrayList;
import java.util.List;

/**
 * Hierarchical scope keys for long-term memory:
 * {@code u:{userId}} → {@code u:{userId}:s:{spaceId}} → {@code u:{userId}:s:{spaceId}:p:{pageId}}.
 */
public final class MemoryScope {

    private MemoryScope() {
    }

    public static String userScope(Long userId) {
        return "u:" + userId;
    }

    public static String spaceScope(Long userId, String spaceId) {
        return userScope(userId) + ":s:" + spaceId;
    }

    public static String pageScope(Long userId, String spaceId, String pageId) {
        return spaceScope(userId, spaceId) + ":p:" + pageId;
    }

    /** Scopes relevant to a run, most specific first. */
    public static List<String> scopesFor(Long userId, String spaceId, String pageId) {
        List<String> scopes = new ArrayList<>();
        if (pageId != null && !pageId.isEmpty() && spaceId != null && !spaceId.isEmpty()) {
            scopes.add(pageScope(userId, spaceId, pageId));
        }
        if (spaceId != null && !spaceId.isEmpty()) {
            scopes.add(spaceScope(userId, spaceId));
        }
        scopes.add(userScope(userId));
        return scopes;
    }

    /** The most specific scope available (auto-scope for remember). */
    public static String mostSpecific(Long userId, String spaceId, String pageId) {
        return scopesFor(userId, spaceId, pageId).get(0);
    }
}
