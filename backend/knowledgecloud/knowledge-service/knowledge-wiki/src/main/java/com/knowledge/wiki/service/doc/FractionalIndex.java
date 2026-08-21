package com.knowledge.wiki.service.doc;

/**
 * Fractional indexing over a base-36 alphabet, used to order sibling blocks
 * without renumbering them.
 * <p>
 * This is a deliberate port of the frontend's
 * {@code packages/editor/src/utilities/fractional-index.ts}. The two must agree
 * exactly: ranks written by the server are compared against ranks that were
 * originally minted in the browser, and the comparison happens in three places
 * with three different collations (JS string compare, {@code String.compareTo},
 * and MySQL's index order on an ASCII column). The alphabet {@code 0-9a-z} is
 * chosen so all three coincide.
 * </p>
 * <p>
 * Invariant: a key never ends in {@code '0'}. That is what guarantees a key can
 * always be found strictly between any two existing keys by appending digits, so
 * an insert or move rewrites only the block that moved — never its neighbours.
 * </p>
 */
public final class FractionalIndex {

    private static final String DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";

    private static final char ZERO = '0';

    /** A mid-alphabet, non-zero digit used to append "just after" a key. */
    private static final char MID = 'i';

    /**
     * Fixed width of the base-36 integer encoding used to derive a rank from the
     * legacy {@code sort_order} column during backfill.
     */
    private static final int LEGACY_ORDER_WIDTH = 6;

    private FractionalIndex() {
    }

    /**
     * A key {@code k} such that {@code a < k < b} lexicographically. A
     * {@code null} or empty {@code a} means "before the first key"; likewise
     * {@code b} means "after the last key".
     */
    public static String keyBetween(String a, String b) {
        String lo = isBlank(a) ? null : a;
        String hi = isBlank(b) ? null : b;

        // Defensive: equal or out-of-order bounds. Can be reached when the
        // caller's view of sibling order is stale. Degrading to "just after lo"
        // keeps the key strictly greater than its left neighbour, which is the
        // property the sibling unique key depends on.
        if (lo != null && hi != null && lo.compareTo(hi) >= 0) {
            return appendAfter(lo);
        }

        return midpoint(lo == null ? "" : lo, hi);
    }

    /**
     * {@code count} strictly increasing keys, for seeding a fresh sibling list.
     */
    public static String[] keysForCount(int count) {
        String[] keys = new String[Math.max(count, 0)];
        String prev = null;
        for (int i = 0; i < keys.length; i++) {
            keys[i] = keyBetween(prev, null);
            prev = keys[i];
        }
        return keys;
    }

    /**
     * Encode a non-negative integer as a fixed-width, zero-padded base-36 string
     * so lexicographic order matches numeric order, with a trailing non-zero
     * digit so fractional keys can still be inserted between any two values.
     * <p>
     * Used only by the one-time backfill, for legacy rows that have a
     * {@code sort_order} but no {@code attrs.rank}.
     * </p>
     */
    public static String fromLegacyOrder(int order) {
        int n = Math.max(order, 0);
        String s = Integer.toString(n, 36);
        if (s.length() > LEGACY_ORDER_WIDTH) {
            s = s.substring(s.length() - LEGACY_ORDER_WIDTH);
        }
        StringBuilder sb = new StringBuilder(LEGACY_ORDER_WIDTH + 1);
        for (int i = s.length(); i < LEGACY_ORDER_WIDTH; i++) {
            sb.append(ZERO);
        }
        sb.append(s);
        sb.append(MID);
        return sb.toString();
    }

    /** A key that sorts immediately after {@code a} and does not end in '0'. */
    private static String appendAfter(String a) {
        return a + MID;
    }

    /**
     * Midpoint between fraction string {@code a} and upper bound {@code b}
     * ({@code null} = +infinity). {@code a} is read as a fraction with implicit
     * trailing zeros, which is why a missing digit reads as '0'.
     */
    private static String midpoint(String a, String b) {
        if (b != null && a.compareTo(b) >= 0) {
            return appendAfter(a);
        }

        if (b != null) {
            // Strip the longest common prefix, padding `a` with implicit zeros.
            int n = 0;
            while (n < b.length() && digitAt(a, n) == b.charAt(n)) {
                n++;
            }
            if (n > 0) {
                return b.substring(0, n) + midpoint(tail(a, n), b.substring(n));
            }
        }

        int digitA = a.isEmpty() ? 0 : DIGITS.indexOf(a.charAt(0));
        int digitB = (b != null && !b.isEmpty()) ? DIGITS.indexOf(b.charAt(0)) : DIGITS.length();

        if (digitB - digitA > 1) {
            // Room for a digit strictly between the two leading digits.
            int mid = Math.round(0.5f * (digitA + digitB));
            return String.valueOf(DIGITS.charAt(mid));
        }

        // Leading digits are consecutive, so no single digit fits between them.
        if (b != null && b.length() > 1) {
            // Borrow b's first digit; the remainder of b leaves room below it.
            return b.substring(0, 1);
        }

        // b is null or a single digit: keep a's leading digit and recurse into
        // its tail with no upper bound.
        return DIGITS.charAt(digitA) + midpoint(tail(a, 1), null);
    }

    /** Digit at {@code i}, or '0' past the end (implicit trailing zeros). */
    private static char digitAt(String s, int i) {
        return i < s.length() ? s.charAt(i) : ZERO;
    }

    private static String tail(String s, int from) {
        return from >= s.length() ? "" : s.substring(from);
    }

    private static boolean isBlank(String s) {
        return s == null || s.isEmpty();
    }

}
