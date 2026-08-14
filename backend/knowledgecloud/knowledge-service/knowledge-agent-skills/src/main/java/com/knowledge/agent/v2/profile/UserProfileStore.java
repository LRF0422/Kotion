package com.knowledge.agent.v2.profile;

/**
 * Persistence for user agent profiles (画像).
 *
 * <p>Redis is the hot cache; JDBC is the durable fallback and cold path. All
 * methods are best-effort from the caller's perspective.
 */
public interface UserProfileStore {

    /**
     * Load the profile for a (user, tenant), or a fresh empty profile when none
     * exists.
     */
    UserProfile load(Long userId, Long tenantId);

    /** Persist (upsert) a profile. */
    void save(UserProfile profile);

    /** Mark a declared fact (from the remember tool) on the profile. */
    void addFact(Long userId, Long tenantId, String fact);

    /** Mark a declared preference (from the remember tool) on the profile. */
    void addPreference(Long userId, Long tenantId, String preference);
}
