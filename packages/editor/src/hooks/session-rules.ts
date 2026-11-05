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
 * - `reclaim` — our own (or a same-user sibling's) lease lapsed; take the
 *   answer, then claim again.
 * - `claim` — we have never held a session and there is none: the opening claim
 *   is still in flight or it failed. Claim again; one dropped request must not
 *   leave the writer off for the rest of the session.
 * - `ended` — the session we were part of is gone; go read-only and leave.
 *   Never returned for an invited guest: a guest takes the page over instead.
 */
export type HeartbeatDecision = 'adopt' | 'reclaim' | 'claim' | 'ended'

export interface HeartbeatContext {
  /** Was this client the host as of the last answer? */
  wasHost: boolean
  /** Has this client been a collaborator at any point in this session? */
  wasCollaborator: boolean
  /**
   * Whether the last live host belonged to the same *user* as this client
   * (another tab, or another editor of the same page inside this tab).
   *
   * A same-user host going away is not someone else ending our session: the
   * lease is still ours to take, and the server's claim path deliberately lets
   * the same user take over. Latching "ended" here is what makes opening the
   * floating page-edit window (or the hidden off-screen editor) eject the user
   * from a page they are still looking at.
   */
  lastHostSelf?: boolean
  /**
   * Whether this client is an invited collaborator (a guest arriving through a
   * collaboration invitation rather than through the page's own space).
   *
   * A guest is not kicked out when the session it was part of disappears: it
   * takes the lease over instead, because an invited collaborator with write
   * access is a legitimate host. The same flag is what keeps a guest editable
   * when it opens the page *before* the inviter, when there is no session yet.
   */
  guest?: boolean
  /**
   * Whether the invitation this guest arrived through permits writing.
   *
   * Only consulted when {@link guest} is set: a write invitation may take the
   * lease, a read-only one can never write and therefore has nothing to wait
   * for once the session is gone.
   */
  mayHost?: boolean
}

/**
 * Interpret a heartbeat. `NONE` is the interesting case: the same answer means
 * several different things depending on what this client used to be.
 */
export function decideHeartbeat(role: SessionRole, ctx: HeartbeatContext): HeartbeatDecision {
  if (role !== 'NONE') return 'adopt'

  // Checked before `wasCollaborator` on purpose. A client can be both — it was
  // demoted when the user opened another tab, or it took the lease over from
  // one — and of the two readings, re-claiming a lease we are entitled to is
  // recoverable while ending the session is not.
  if (ctx.wasHost) return 'reclaim'

  // The host that just went away was the same user (another tab, or the hidden
  // off-screen / floating editor for this page). Re-claim instead of ending:
  // otherwise every sibling editor that closes ejects the user from the page.
  if (ctx.wasCollaborator && ctx.lastHostSelf) return 'reclaim'

  // An invited collaborator takes the page over when no session exists instead
  // of treating it as the end of one. The inviter may never have opened the
  // page, may have left long ago, or may simply not have claimed yet — and a
  // guest that went read-only in every one of those cases would be unable to
  // open a page it was explicitly invited to write. This also retries a first
  // claim that failed: the next heartbeat answers `NONE` and claims again.
  //
  // A read-only invitation can never write, so it has no lease to take; `adopt`
  // keeps it in the same non-fatal state instead of latching a dead session.
  if (ctx.guest) return ctx.mayHost === false ? 'adopt' : 'reclaim'

  if (ctx.wasCollaborator) return 'ended'

  // No session, and we have never been in one: this is the answer that arrives
  // when a heartbeat races the very first claim. Reading it as an ended session
  // would eject every client as it opens the page — but reading it as "carry on"
  // is worse: a claim that failed on a dropped request would never be retried,
  // the writer would stay off, and the editor would keep showing "Saved" while
  // nothing reached the database. Claiming is idempotent (the server answers
  // COLLABORATOR when somebody else holds the lease), so retry.
  if (ctx.mayHost === false) return 'adopt'
  return 'claim'
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
  /**
   * Whether this client is an invited collaborator. A guest never shows the
   * host-disconnected countdown: it may host the page itself, so a missing host
   * is either a normal pre-inviter state or a moment at which the guest is
   * taking the lease over — never a reason to tell the user nothing is being
   * saved.
   */
  isGuest?: boolean
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
 *
 * `isGuest` is not a false-alarm guard but a different product rule: an invited
 * collaborator persists the page itself when nobody holds the lease, so there is
 * no absent writer to warn about and no countdown to run.
 */
export function shouldWaitForHost(ctx: GraceContext): boolean {
  if (!ctx.enabled || ctx.sessionEnded) return false
  if (ctx.isGuest) return false
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
