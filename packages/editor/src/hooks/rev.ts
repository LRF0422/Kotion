/**
 * Reading a rev off the wire.
 *
 * A rev is a 64-bit counter server-side, and this backend serialises *every*
 * `Long` as a JSON string — `JacksonCustomizerConfig` registers that globally,
 * so it is the house wire format rather than a quirk of one endpoint. A parser
 * that only accepts numbers therefore throws away every real rev it is handed,
 * and because "this response carried no rev" is a legitimate answer, it does so
 * without a word.
 *
 * That silence is the expensive part. The rev is what tells the loader whether
 * the block store has ever written this page — the only thing separating "never
 * migrated, seed from the legacy column" from "emptied on purpose, leave it
 * empty" — and what tells the writer that somebody else has written since. A rev
 * read as absent turns both of those decisions into their wrong answer.
 */

/**
 * Normalise a rev from a JSON response.
 *
 * Accepts the number and decimal-string spellings of the same value; returns
 * null for anything else, including negative and fractional values, which no rev
 * can be.
 *
 * Null means **unknown**, never zero. Zero is a claim — "this page has no rows
 * under this model" — and callers act on it by adopting legacy content, so
 * letting an unreadable value collapse into it is how a page gets overwritten
 * with something older than itself.
 */
export function toRev(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? value : null
  }
  if (typeof value === 'string') {
    // Deliberately strict: a decimal integer and nothing else. `Number()` alone
    // would accept '', '0x10', '1e3' and ' 12 ' as revs, and a rev that came out
    // of a misread field is worse than one that is admitted to be unknown.
    const trimmed = value.trim()
    if (!/^\d+$/.test(trimmed)) return null
    const parsed = Number(trimmed)
    return Number.isSafeInteger(parsed) ? parsed : null
  }
  return null
}
