/**
 * Fractional indexing for ordering blocks without renumbering siblings.
 *
 * Keys are short strings over a base-36 alphabet (`0-9a-z`) compared
 * lexicographically. Comparison is byte/code-unit order, which matches Java's
 * `String.compareTo` for this alphabet — so the backend can derive and sort the
 * same keys (see `BlockStorageService.encodeOrder`).
 *
 * Invariant: a key never ends in the zero digit (`'0'`). This guarantees that
 * `keyBetween` can always find a key strictly between any two existing keys by
 * appending digits, so an insert/move only writes the moved block — its
 * neighbours keep their keys.
 */

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz'
const ZERO = DIGITS[0] // '0'
// A mid-alphabet, non-zero digit used to append "just after" a key.
const MID = DIGITS[Math.floor(DIGITS.length / 2)] // 'i'

/**
 * Return a key `k` such that `a < k < b` lexicographically.
 * `a == null` means "before the first key"; `b == null` means "after the last
 * key". The result never ends in `'0'`.
 */
export function keyBetween(a: string | null | undefined, b: string | null | undefined): string {
  const lo = a == null || a === '' ? null : a
  const hi = b == null || b === '' ? null : b

  // Defensive: equal or out-of-order bounds (e.g. concurrent collaborative
  // inserts between the same pair). Degrade to "just after `lo`" — the final
  // order is disambiguated by the blockId tiebreaker on read.
  if (lo != null && hi != null && lo >= hi) {
    return appendAfter(lo)
  }

  return midpoint(lo ?? '', hi)
}

/** A key that sorts immediately after `a` and does not end in `'0'`. */
function appendAfter(a: string): string {
  return a + MID
}

/**
 * Core midpoint between fraction string `a` and upper bound `b` (null = +∞).
 * Adapted from the standard fractional-indexing algorithm.
 */
function midpoint(a: string, b: string | null): string {
  if (b != null && a >= b) {
    return appendAfter(a)
  }

  if (b != null) {
    // Strip the longest common prefix, padding `a` with implicit zeros.
    let n = 0
    while ((a[n] ?? ZERO) === b[n]) n++
    if (n > 0) {
      return b.slice(0, n) + midpoint(a.slice(n), b.slice(n))
    }
  }

  const digitA = a.length ? DIGITS.indexOf(a[0]) : 0
  const digitB = b != null && b.length ? DIGITS.indexOf(b[0]) : DIGITS.length

  if (digitB - digitA > 1) {
    // Room for a digit strictly between the two leading digits.
    const mid = Math.round(0.5 * (digitA + digitB))
    return DIGITS[mid]
  }

  // Leading digits are consecutive (or equal at position 0 with no room).
  if (b != null && b.length > 1) {
    // Borrow `b`'s first digit; the remainder of `b` leaves room below it.
    return b.slice(0, 1)
  }

  // `b` is null or a single digit: keep `a`'s leading digit and recurse into
  // its tail with no upper bound.
  return DIGITS[digitA] + midpoint(a.slice(1), null)
}

/**
 * Generate `count` evenly-ordered keys to seed a fresh list (e.g. the first
 * blocks of a brand-new document). Each call returns strictly increasing keys.
 */
export function keysForCount(count: number): string[] {
  const keys: string[] = []
  let prev: string | null = null
  for (let i = 0; i < count; i++) {
    const k = keyBetween(prev, null)
    keys.push(k)
    prev = k
  }
  return keys
}
