/**
 * What a closing editor still owes the database.
 *
 * Extracted from {@link useOpSave} because the interesting part is a judgement
 * call rather than plumbing, and because getting it wrong is quiet in both
 * directions: flush too little and the last thing the user typed dies with the
 * tab, flush too much and a page nobody edited gets written back.
 */

export type ExitFlush =
  /** Re-send a write already handed to the network, under its original key. */
  | 'pending'
  /** Send the whole document and let the server derive the ops. */
  | 'reconcile'
  /** Send the op batch derived from the tracker's baseline. */
  | 'ops'
  /** Nothing is owed. */
  | 'none'

export interface ExitFlushContext {
  /**
   * A write is already on the wire, unacknowledged. Re-sending *that* request is
   * safe because it carries its original idempotency key; deriving a fresh one
   * is not, which is why this outranks everything else.
   */
  pending: boolean
  /**
   * Real local changes since the last acknowledged write — the tracker's own
   * `dirty`, not `hasDirty()`.
   */
  dirty: boolean
  /** The tracker cannot trust its baseline, so a write has to carry the whole document. */
  needsReconcile: boolean
  /** This client never synced with the relay, so every write is a reconcile. */
  reconcileOnly: boolean
}

/**
 * Decide what a closing session sends.
 *
 * The load-bearing line is `!dirty → none`, and it is the one that looks
 * removable. `needsReconcile` is armed at the *start* of every session on
 * purpose — the baseline came from the screen, not from the database, so the
 * first real write must carry the whole document — and reading that as "a write
 * is due" made every page the user merely looked at write itself back on the way
 * out. Two costs, one of them serious: a full-document request per page switch,
 * and, whenever the document on screen came from anywhere but the block table (a
 * legacy-content seed, a stale relay room), a write of something older than what
 * is stored.
 *
 * `needsReconcile` answers *how* to write, never *whether* to.
 */
export function decideExitFlush(ctx: ExitFlushContext): ExitFlush {
  if (ctx.pending) return 'pending'
  if (!ctx.dirty) return 'none'
  if (ctx.needsReconcile || ctx.reconcileOnly) return 'reconcile'
  return 'ops'
}
