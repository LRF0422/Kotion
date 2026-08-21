/**
 * Where a page's initial content comes from, as a pure function.
 *
 * The block store is the authority, so loading reads `GET /page/{id}/doc`. But
 * two situations make that answer alone insufficient, and both of them are
 * data-loss shaped rather than merely inconvenient:
 *
 * - a page that predates this model has no block rows at all, and seeding
 *   nothing into it would show a real page as blank;
 * - a page that has been deliberately emptied *also* has no block rows, and
 *   falling back to the legacy content column there would resurrect content the
 *   user deleted.
 *
 * `rev` is what separates them, which is the whole reason it is worth reading.
 * `seed-source.check.ts` pins the distinction so a later simplification cannot
 * collapse the two cases back together.
 */

/** The parsed `GET /doc` answer, reduced to what the decision needs. */
export interface BlockStoreRead {
  /** The assembled document, or null when the response carried none. */
  doc: unknown | null
  /**
   * The rev the document represents. **0 means "this page has no rows under this
   * model"** — never backfilled, never saved — which is the only reading that
   * licenses falling back to the legacy column.
   *
   * Null is not zero: it means the response carried no rev this client could
   * read, which is a different and much weaker claim. Parse it with `toRev`,
   * which knows that this backend spells 64-bit integers as JSON strings.
   */
  rev: number | null
}

export interface SeedDecision {
  /** The document to seed a fresh Y.Doc from, or undefined to seed nothing. */
  doc: unknown | undefined
  /**
   * Whether the block store produced this content.
   *
   * False means the read failed and we are showing a best guess. It must gate
   * writing, not merely warn: a client that could not read the authority is in
   * no position to overwrite it, and the first write of a session is a reconcile
   * that would persist whatever it is holding.
   */
  trusted: boolean
}

/**
 * Choose what to seed the editor with.
 *
 * @param read   the block store's answer, or null if the read failed
 * @param legacy the parsed legacy content column, if any
 *
 * Returns null when the decision cannot be made yet, which callers must treat as
 * "do not mount the editor". Seeding is a one-shot decision taken the moment the
 * editor binds to the Y.Doc, so mounting early does not merely delay content —
 * it seeds emptiness, and the host's first reconcile then persists it.
 */
export function chooseSeed(
  read: BlockStoreRead | null | undefined,
  legacy: unknown | undefined,
): SeedDecision | null {
  if (read === undefined) return null

  if (read === null) {
    // The read failed. Show the legacy column rather than a blank page, but
    // withhold trust so nothing is written back.
    return { doc: legacy, trusted: false }
  }

  if (read.rev == null) {
    // The read succeeded but its rev was unreadable, so the two cases above are
    // no longer distinguishable and every remaining branch would be a guess.
    // Withhold trust for the same reason a failed read does, and show what the
    // authority returned in preference to the legacy column: displaying its
    // document read-only costs the user an edit, writing a guess over it costs
    // them the page.
    return { doc: read.doc ?? legacy, trusted: false }
  }

  if (read.rev > 0) {
    // The block store is authoritative for this page, *including* when it is
    // legitimately empty. This is the branch that must not fall through to the
    // legacy column.
    return { doc: read.doc ?? undefined, trusted: true }
  }

  // rev 0: nothing in the block store to overwrite, so adopting the legacy
  // column is the migration rather than a regression. The host's first write is
  // a reconcile, which is what establishes rev 1 from it.
  return { doc: legacy, trusted: true }
}
