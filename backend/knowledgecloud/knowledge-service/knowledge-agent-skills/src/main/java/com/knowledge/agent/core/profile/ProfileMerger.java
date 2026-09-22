package com.knowledge.agent.core.profile;

import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * Merge / conflict / decay policy for profile traits. Deliberately free of I/O
 * so the math is unit-testable and so all writes go through one place.
 *
 * <p>Privacy invariants enforced here:
 * <ul>
 *   <li>a {@code suppressed} tombstone is NEVER revived by a later extraction;</li>
 *   <li>a user-{@code locked} trait has its value/confidence left alone.</li>
 * </ul>
 */
@Component
public class ProfileMerger {

    /** Confidence gained per new observation (diminishing). */
    private static final double ALPHA = 18.0;
    private static final long DAY_MILLIS = 24L * 60L * 60L * 1000L;
    /** Soft-expiry window for stale low-confidence traits. */
    private static final long SOFT_EXPIRY_MILLIS = 60L * DAY_MILLIS;

    /**
     * Combine one extracted draft with the existing trait (may be null) and
     * return the row to upsert, or {@code null} when nothing may be written.
     *
     * @param existing row at the same (dimension, value) key, or null
     */
    public ProfileTrait merge(Long tenantId, Long userId, ProfileTrait existing,
                              ProfileTraitDraft draft, long now) {
        if (draft == null) {
            return null;
        }
        ProfileDimension dimension = ProfileDimension.fromKey(draft.getDimension());
        if (dimension == null) {
            return null; // not allowlisted
        }
        String value = normalizeValue(draft.getValue());
        if (value == null) {
            return null;
        }
        // A user deletion is final: the tombstone occupies the unique key and
        // must never be turned back into an active trait.
        if (existing != null && ProfileTrait.STATUS_SUPPRESSED.equals(existing.getStatus())) {
            return null;
        }

        ProfileTrait trait = new ProfileTrait();
        trait.setTenantId(tenantId);
        trait.setUserId(userId);
        trait.setDimension(dimension.getKey());
        trait.setTraitValue(value);

        if (existing == null) {
            trait.setTraitId(UUID.randomUUID().toString());
            trait.setConfidence(clamp(draft.getConfidence()));
            trait.setSource(ProfileTrait.SOURCE_INFERRED);
            trait.setStatus(ProfileTrait.STATUS_ACTIVE);
            trait.setLocked(false);
            trait.setEvidenceCount(1);
            trait.setFirstSeen(now);
            trait.setLastSeen(now);
            trait.setExpiresAt(expiryFor(dimension, now));
            trait.setCreateTime(now);
            trait.setUpdateTime(now);
            return trait;
        }

        // Reuse the existing id so evidence stays attached to the same trait.
        trait.setTraitId(existing.getTraitId());
        trait.setFirstSeen(existing.getFirstSeen() > 0 ? existing.getFirstSeen() : now);
        trait.setLastSeen(now);
        trait.setCreateTime(existing.getCreateTime());
        trait.setEvidenceCount(existing.getEvidenceCount() + 1);

        if (existing.isLocked() || ProfileTrait.SOURCE_USER.equals(existing.getSource())) {
            // User-owned: never overwrite the value or confidence.
            trait.setConfidence(existing.getConfidence());
            trait.setSource(ProfileTrait.SOURCE_USER);
            trait.setLocked(true);
            trait.setStatus(ProfileTrait.STATUS_ACTIVE);
            trait.setExpiresAt(0L);
            trait.setUpdateTime(now);
            return trait;
        }

        trait.setConfidence(nextConfidence(existing.getConfidence(), existing.getLastSeen(),
                now, dimension.getHalfLifeDays()));
        trait.setSource(ProfileTrait.SOURCE_INFERRED);
        trait.setStatus(ProfileTrait.STATUS_ACTIVE);
        trait.setLocked(false);
        trait.setExpiresAt(expiryFor(dimension, now));
        trait.setUpdateTime(now);
        return trait;
    }

    /** Diminishing-increment confidence: each fresh observation adds less. */
    public int nextConfidence(int previous, long lastSeen, long now, int halfLifeDays) {
        int old = clamp(previous);
        double recency = recencyFactor(lastSeen, now);
        double next = old + ALPHA * (1.0 - old / 100.0) * recency;
        return clamp((int) Math.round(next));
    }

    /** Exponential confidence decay by the dimension half-life. */
    public int decay(int confidence, long lastSeen, long now, int halfLifeDays) {
        if (lastSeen <= 0 || halfLifeDays <= 0 || now <= lastSeen) {
            return clamp(confidence);
        }
        double days = (now - lastSeen) / (double) DAY_MILLIS;
        double factor = Math.pow(0.5, days / halfLifeDays);
        return clamp((int) Math.round(confidence * factor));
    }

    /** Freshness weight for a new observation: 1.0 within a day, 0.3 after 30. */
    private double recencyFactor(long lastSeen, long now) {
        if (lastSeen <= 0 || now <= lastSeen) {
            return 1.0;
        }
        double gapDays = (now - lastSeen) / (double) DAY_MILLIS;
        if (gapDays <= 1.0) {
            return 1.0;
        }
        if (gapDays >= 30.0) {
            return 0.3;
        }
        return 1.0 - 0.7 * ((gapDays - 1.0) / 29.0);
    }

    /** Expiry: four half-lives out (stable traits therefore last ~2 years). */
    public long expiryFor(ProfileDimension dimension, long now) {
        return now + (long) dimension.getHalfLifeDays() * 4L * DAY_MILLIS;
    }

    /** Whether a trait may still be injected / recommended. */
    public boolean isUsable(ProfileTrait trait, long now, int minConfidence) {
        if (trait == null || !trait.isActive()) {
            return false;
        }
        if (trait.getConfidence() < minConfidence) {
            return false;
        }
        if (trait.getExpiresAt() > 0 && trait.getExpiresAt() <= now) {
            return false;
        }
        return !(trait.getConfidence() < 25 && trait.getLastSeen() > 0
                && now - trait.getLastSeen() > SOFT_EXPIRY_MILLIS);
    }

    /** Trim + collapse whitespace; null when empty or over the 128-char column. */
    public static String normalizeValue(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim().replaceAll("\\s+", " ");
        if (trimmed.isEmpty() || trimmed.length() > 128) {
            return null;
        }
        return trimmed;
    }

    public static int clamp(int confidence) {
        if (confidence < 0) {
            return 0;
        }
        return Math.min(confidence, 100);
    }
}
