/**
 * The decisions {@link usePageSession} has to make, as pure functions.
 *
 * Extracted from the hook so they can be exercised without React, a network or a
 * clock. Every rule here is a guard whose absence is invisible in normal
 * operation and wrong only in the cases that actually matter — a network blip,
 * a reload, the instant before the first claim lands. `session-rules.check.ts`
 * pins them so a later simplification cannot quietly remove one.
 */

export type SessionRole = 'HOST' | 'COLLABORATOR' | 'NONE'

/**
 * What to do with the role the server just reported.
 *
 * - `adopt` — believe it and carry on.
 * - `reclaim` — our own lease lapsed; take the answer, then claim again.
 * - `ended` — the session we were part of is gone; go read-only and leave.
 */
export type HeartbeatDecision = 'adopt' | 'reclaim' | 'ended'

export interface HeartbeatContext {
  /** Was this client the host as of the last answer? */
  wasHost: boolean
  /** Has this client been a collaborator at any point in this session? */
  wasCollaborator: boolean
}

/**
 * Interpret a heartbeat. `NONE` is the interesting case: the same answer means
 * three different things depending on what this client used to be.
 */
export function decideHeartbeat(role: SessionRole, ctx: HeartbeatContext): HeartbeatDecision {
  if (role !== 'NONE') return 'adopt'

  // Checked before `wasCollaborator` on purpose. A client can be both — it was
  // demoted when the user opened another tab, or it took the lease over from
  // one — and of the two readings, re-claiming a lease we are entitled to is
  // recoverable while ending the session is not.
  if (ctx.wasHost) return 'reclaim'

  if (ctx.wasCollaborator) return 'ended'

  // No session, and we have never been in one: this is the answer that arrives
  // when a heartbeat races the very first claim. Reading it as an ended session
  // would eject every client as it opened the page.
  return 'adopt'
}

export interface GraceContext {
  enabled: boolean
  /** Already over — the countdown must not restart and re-ask. */
  sessionEnded: boolean
  role: SessionRole
  /** Whether *our own* realtime transport is up. */
  connected: boolean
  /** Whether a host has been seen at least once on this connection. */
  hostSeen: boolean
  /** Whether a host is in awareness right now. */
  hostPresent: boolean
}

/**
 * Whether to report the host as disconnected and start the grace countdown.
 *
 * Three of these guards exist only to stop a false alarm, and each covers a case
 * that happens routinely:
 *
 * - `connected` — when our own socket drops we lose *every* awareness entry,
 *   including the host's. An observer who cannot see anyone has learned nothing
 *   about who is still there.
 * - `hostSeen` — awareness is empty for a moment after connecting, so absence is
 *   only meaningful once a presence has been observed.
 * - `role` — a host is its own presence, and a client with no session has
 *   nothing to wait for.
 */
export function shouldWaitForHost(ctx: GraceContext): boolean {
  if (!ctx.enabled || ctx.sessionEnded) return false
  if (ctx.role !== 'COLLABORATOR') return false
  if (!ctx.connected) return false
  if (!ctx.hostSeen) return false
  return !ctx.hostPresent
}

export interface CloseSessionSteps {
  /** Whether this client actually holds the lease. Nothing to flush or release if not. */
  heldLease: boolean
  /**
   * Send whatever is still unsaved. Returns the write in flight, or null when
   * there was nothing to send.
   */
  flush?: () => Promise<unknown> | null
  /** Hand the lease back. */
  release: () => void
}

/**
 * Close a session in the only order that does not lose the user's last edit.
 *
 * The two steps look independent and are not. The server checks the lease when a
 * write *arrives*, so a release that overtakes the final flush turns it into
 * `NOT_SESSION_HOST` — the write is refused, the toast blames the user for not
 * being the host of a page they were just editing, and whatever was inside the
 * debounce window is gone. Cleanup order alone does not prevent that: the two are
 * separate HTTP requests, and the release is the smaller one.
 *
 * So the release waits for the flush to land. That is affordable because the
 * lease is a courtesy and not a lock — its TTL expires it, and the same user
 * takes it straight back on their next claim — whereas an edit refused on the way
 * out is not recoverable from anywhere.
 */
export function closeSession(steps: CloseSessionSteps): void {
  if (!steps.heldLease) return

  let inFlight: Promise<unknown> | null = null
  try {
    inFlight = steps.flush?.() ?? null
  } catch (err) {
    // A flush that throws must not strand the lease as well.
    console.error('[closeSession] final flush threw:', err)
  }

  if (!inFlight) {
    steps.release()
    return
  }
  // Released either way: a failed final write is still a finished session, and
  // holding the lease hostage to it would lock the page for the TTL.
  void inFlight.then(() => steps.release(), () => steps.release())
}
