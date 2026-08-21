package com.knowledge.wiki.service.doc;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

/**
 * The rank algorithm's two load-bearing properties: a key can always be produced
 * strictly between any two others, and no key ever ends in '0'.
 * <p>
 * These are what let an insert or a move rewrite exactly one row. If either
 * breaks, the sibling unique key starts rejecting legitimate writes and reordering
 * becomes an O(siblings) rewrite.
 * </p>
 */
class FractionalIndexTest {

    @Test
    void firstKeyIsStable() {
        assertEquals(FractionalIndex.keyBetween(null, null), FractionalIndex.keyBetween(null, null));
    }

    @Test
    void keyIsStrictlyBetweenItsBounds() {
        String a = FractionalIndex.keyBetween(null, null);
        String b = FractionalIndex.keyBetween(a, null);
        String mid = FractionalIndex.keyBetween(a, b);
        assertTrue(a.compareTo(mid) < 0, a + " < " + mid);
        assertTrue(mid.compareTo(b) < 0, mid + " < " + b);
    }

    @Test
    void neverEndsInZero() {
        String prev = null;
        for (int i = 0; i < 200; i++) {
            prev = FractionalIndex.keyBetween(prev, null);
            assertFalse(prev.endsWith("0"), prev);
        }
    }

    /**
     * Repeatedly inserting into the same gap is the pathological case for
     * fractional indexing: each key must still land strictly inside the shrinking
     * interval.
     */
    @Test
    void survivesRepeatedInsertionIntoTheSameGap() {
        String lo = FractionalIndex.keyBetween(null, null);
        String hi = FractionalIndex.keyBetween(lo, null);
        for (int i = 0; i < 100; i++) {
            String mid = FractionalIndex.keyBetween(lo, hi);
            assertTrue(lo.compareTo(mid) < 0 && mid.compareTo(hi) < 0,
                    "iteration " + i + ": " + lo + " < " + mid + " < " + hi);
            assertFalse(mid.endsWith("0"), mid);
            hi = mid;
        }
    }

    @Test
    void keysForCountAreStrictlyIncreasing() {
        String[] keys = FractionalIndex.keysForCount(50);
        assertEquals(50, keys.length);
        for (int i = 1; i < keys.length; i++) {
            assertTrue(keys[i - 1].compareTo(keys[i]) < 0, keys[i - 1] + " < " + keys[i]);
        }
    }

    /**
     * Out-of-order bounds happen when a caller's view of sibling order is stale.
     * The key must still be greater than the left bound, because that is what the
     * sibling unique key relies on.
     */
    @Test
    void degradesSafelyOnInvertedBounds() {
        String key = FractionalIndex.keyBetween("c", "a");
        assertTrue(key.compareTo("c") > 0, key);
        assertFalse(key.endsWith("0"), key);
    }

    /**
     * The backfill derives ranks from the legacy integer {@code sort_order}. The
     * derived keys must sort in the same order as the integers they came from, or
     * migrating a page without stored ranks would shuffle it.
     */
    @Test
    void legacyOrderEncodingPreservesNumericOrder() {
        List<String> keys = new ArrayList<>();
        for (int order : new int[] { 0, 1, 2, 9, 10, 35, 36, 100, 1295, 1296, 99999 }) {
            keys.add(FractionalIndex.fromLegacyOrder(order));
        }
        for (int i = 1; i < keys.size(); i++) {
            assertTrue(keys.get(i - 1).compareTo(keys.get(i)) < 0, keys.get(i - 1) + " < " + keys.get(i));
        }
        keys.forEach(key -> assertFalse(key.endsWith("0"), key));
    }

    /** A key can still be inserted between two consecutive legacy-derived keys. */
    @Test
    void legacyKeysLeaveRoomBetweenThem() {
        String a = FractionalIndex.fromLegacyOrder(3);
        String b = FractionalIndex.fromLegacyOrder(4);
        String mid = FractionalIndex.keyBetween(a, b);
        assertTrue(a.compareTo(mid) < 0 && mid.compareTo(b) < 0, a + " < " + mid + " < " + b);
    }

    @Test
    void negativeLegacyOrderIsTreatedAsZero() {
        assertEquals(FractionalIndex.fromLegacyOrder(0), FractionalIndex.fromLegacyOrder(-7));
    }

}
