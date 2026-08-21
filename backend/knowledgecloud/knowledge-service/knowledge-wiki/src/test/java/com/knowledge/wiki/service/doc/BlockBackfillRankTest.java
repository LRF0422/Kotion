package com.knowledge.wiki.service.doc;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.Test;

/**
 * Rank assignment during the backfill.
 * <p>
 * Two requirements pull against each other here. The legacy rank must be kept
 * whenever possible, because it is what decided the order the author last saw.
 * But the new schema puts a unique key on {@code (page_id, parent_id, rank)} and
 * the old one did not, so legacy data is free to contain ranks that collide or
 * run backwards — and those would make the insert fail, or worse, silently
 * reorder the page.
 * </p>
 * <p>
 * The rule is therefore: keep the legacy rank when it is strictly greater than
 * its predecessor, and mint a fresh one only when it is not. That preserves
 * order wherever the old data was coherent and repairs it exactly where it was
 * not.
 * </p>
 */
class BlockBackfillRankTest {

    /** A coherent legacy rank is carried over untouched. */
    @Test
    void usableLegacyRankIsKept() {
        assertEquals("m", BlockBackfillService.nextRank("m", "b"));
    }

    /** The first block has no predecessor, so any non-empty legacy rank is fine. */
    @Test
    void firstBlockKeepsItsLegacyRank() {
        assertEquals("b", BlockBackfillService.nextRank("b", null));
    }

    /** A missing legacy rank means one has to be minted. */
    @Test
    void missingLegacyRankIsGenerated() {
        String rank = BlockBackfillService.nextRank(null, "b");
        assertTrue(rank.compareTo("b") > 0, rank + " > b");
        assertFalse(rank.endsWith("0"), rank);
    }

    @Test
    void emptyLegacyRankIsGenerated() {
        String rank = BlockBackfillService.nextRank("", "b");
        assertTrue(rank.compareTo("b") > 0, rank + " > b");
    }

    /**
     * Two siblings sharing a rank was legal in the old model and is rejected by the
     * new sibling unique key. The second one must be moved off the collision.
     */
    @Test
    void collidingLegacyRankIsRegenerated() {
        String rank = BlockBackfillService.nextRank("m", "m");
        assertTrue(rank.compareTo("m") > 0, rank + " > m");
    }

    /** A rank that runs backwards against its predecessor is repaired, not obeyed. */
    @Test
    void invertedLegacyRankIsRegenerated() {
        String rank = BlockBackfillService.nextRank("b", "m");
        assertTrue(rank.compareTo("m") > 0, rank + " > m");
    }

    /**
     * The property that actually matters: walking a page's legacy ranks in document
     * order must yield a strictly increasing sequence, however broken the input.
     * Anything less and the insert fails on the unique key.
     */
    @Test
    void aWholePageComesOutStrictlyIncreasing() {
        List<String> legacy = Arrays.asList("b", "m", "m", "d", null, "", "t", "t", "z");

        List<String> assigned = new ArrayList<>();
        String previous = null;
        for (String rank : legacy) {
            previous = BlockBackfillService.nextRank(rank, previous);
            assigned.add(previous);
        }

        assertEquals(legacy.size(), assigned.size(), "每个块都必须拿到 rank");
        for (int i = 1; i < assigned.size(); i++) {
            assertTrue(assigned.get(i - 1).compareTo(assigned.get(i)) < 0,
                    "位置 " + i + ": " + assigned.get(i - 1) + " < " + assigned.get(i));
        }
        assigned.forEach(rank -> assertFalse(rank.endsWith("0"), rank));
    }

    /** A page whose legacy ranks were all coherent is migrated verbatim. */
    @Test
    void aCoherentPageIsMigratedVerbatim() {
        List<String> legacy = Arrays.asList("b", "d", "m", "t", "z");

        List<String> assigned = new ArrayList<>();
        String previous = null;
        for (String rank : legacy) {
            previous = BlockBackfillService.nextRank(rank, previous);
            assigned.add(previous);
        }

        assertEquals(legacy, assigned, "原本自洽的顺序不得被改写");
    }

    /** Ranks derived from the legacy integer order are always usable as-is. */
    @Test
    void ranksDerivedFromSortOrderAreAlwaysUsable() {
        List<String> assigned = new ArrayList<>();
        String previous = null;
        for (int order = 0; order < 20; order++) {
            previous = BlockBackfillService.nextRank(FractionalIndex.fromLegacyOrder(order), previous);
            assigned.add(previous);
        }

        for (int i = 0; i < assigned.size(); i++) {
            assertEquals(FractionalIndex.fromLegacyOrder(i), assigned.get(i), "sort_order 推导出的 rank 应当直接沿用");
        }
    }

}
