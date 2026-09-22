package com.knowledge.agent.core.profile;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ProfileMergerTest {

    private final ProfileMerger merger = new ProfileMerger();
    private static final long DAY = 24L * 60L * 60L * 1000L;

    @Test
    void createsANewTraitFromADraft() {
        long now = 1_700_000_000_000L;
        ProfileTrait trait = merger.merge(1L, 2L,
                null, new ProfileTraitDraft("occupation", "后端工程师", 60, "我在做后端"), now);

        assertNotNull(trait);
        assertNotNull(trait.getTraitId());
        assertEquals(60, trait.getConfidence());
        assertEquals(ProfileTrait.STATUS_ACTIVE, trait.getStatus());
        assertEquals(1, trait.getEvidenceCount());
        assertEquals(now, trait.getFirstSeen());
        assertTrue(trait.getExpiresAt() > now);
    }

    @Test
    void dropsNonAllowlistedDimension() {
        assertNull(merger.merge(1L, 2L, null,
                new ProfileTraitDraft("gender", "女", 90, "我是女生"), 1L));
    }

    @Test
    void neverRevivesASuppressedTombstone() {
        ProfileTrait tombstone = new ProfileTrait();
        tombstone.setStatus(ProfileTrait.STATUS_SUPPRESSED);
        tombstone.setTraitValue("后端工程师");

        assertNull(merger.merge(1L, 2L, tombstone,
                new ProfileTraitDraft("occupation", "后端工程师", 90, "我在做后端"), 1L));
    }

    @Test
    void lockedTraitKeepsItsValueAndConfidence() {
        ProfileTrait locked = new ProfileTrait();
        locked.setTraitId("t1");
        locked.setStatus(ProfileTrait.STATUS_ACTIVE);
        locked.setSource(ProfileTrait.SOURCE_USER);
        locked.setLocked(true);
        locked.setConfidence(100);
        locked.setTraitValue("产品经理");
        locked.setFirstSeen(1L);
        locked.setCreateTime(1L);
        locked.setEvidenceCount(2);

        ProfileTrait merged = merger.merge(1L, 2L, locked,
                new ProfileTraitDraft("occupation", "产品经理", 40, "更新证据"), 5L);

        assertEquals("t1", merged.getTraitId());
        assertEquals(100, merged.getConfidence());
        assertEquals(ProfileTrait.SOURCE_USER, merged.getSource());
        assertEquals(3, merged.getEvidenceCount());
        assertTrue(merged.isLocked());
    }

    @Test
    void repeatedEvidenceRaisesConfidenceWithDiminishingReturns() {
        int first = merger.nextConfidence(0, 0L, DAY, 180);
        int second = merger.nextConfidence(first, DAY, 2 * DAY, 180);
        assertTrue(first > 0);
        assertTrue(second > first);
        assertTrue(second - first < first); // diminishing increment
        assertTrue(merger.nextConfidence(99, 0L, DAY, 180) <= 100);
    }

    @Test
    void decayHalvesConfidenceAtOneHalfLife() {
        // lastSeen one half-life before now -> confidence halves.
        int decayed = merger.decay(80, 45 * DAY, 90 * DAY, 45);
        assertTrue(decayed >= 39 && decayed <= 41, "expected ~40, got " + decayed);
    }

    @Test
    void decayLeavesUnknownRecencyUntouched() {
        assertEquals(80, merger.decay(80, 0L, 45 * DAY, 45));
    }

    @Test
    void lowStaleTraitsAreNotUsable() {
        ProfileTrait stale = new ProfileTrait();
        stale.setStatus(ProfileTrait.STATUS_ACTIVE);
        stale.setConfidence(20);
        stale.setLastSeen(0L);
        stale.setFirstSeen(0L);
        stale.setExpiresAt(0L);
        // lastSeen 100 days ago and below the floor -> soft-expired
        stale.setLastSeen(System.currentTimeMillis() - 100 * DAY);
        assertFalse(merger.isUsable(stale, System.currentTimeMillis(), 55));
    }
}
