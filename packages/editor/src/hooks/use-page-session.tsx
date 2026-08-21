import { useCallback, useEffect, useRef, useState } from 'react'
import { closeSession, decideHeartbeat, shouldWaitForHost } from './session-rules'

/**
 * The caller's standing in a page's editing session, as reported by the server.
 * Mirrors `PageSessionVO`.
 */
export interface PageSessionState {
  role: 'HOST' | 'COLLABORATOR' | 'NONE'
  alive: boolean
  hostUserId?: number | string | null
  hostName?: string | null
  hostSelf?: boolean
  /** The page's rev at the moment the server answered. */
  rev?: number | null
}

export interface UsePageSessionOptions {
  /**
   * Whether to hold a session at all. False for a read-only viewer, a page that
   * has not finished loading, or any editor that is not a real interactive
   * window.
   */
  enabled: boolean
  /**
   * Identity of this editing client. Must be stable for the lifetime of one
   * collaboration provider and *different* across reloads and tabs — the write
   * lease is pinned to the document actually being edited, not to the user.
   */
  clientId: string
  onClaim: (clientId: string) => Promise<PageSessionState>
  onHeartbeat: (clientId: string) => Promise<PageSessionState>
  /**
   * Give up the lease. Called on unmount and on `pagehide`, so it must be
   * fire-and-forget: at `pagehide` a normal async request is killed by the
   * browser.
   */
  onRelease: (clientId: string) => void
  /**
   * Send anything still unsaved, before the lease goes back. Returns the write
   * in flight so the release can wait for it, or null when nothing was owed.
   *
   * The writer cannot own this ordering itself: it does not know when the lease
   * is handed back, and the server refuses a write that arrives after it. See
   * {@link closeSession}.
   */
  onBeforeRelease?: () => Promise<unknown> | null
  /**
   * How often to renew. Defaults to a third of the server's 30s lease, so two
   * heartbeats can be lost without the session dying.
   */
  heartbeatMs?: number
  /**
   * Whether the realtime transport is currently connected.
   *
   * Load-bearing for host-departure detection: awareness entries disappear when
   * *our own* connection drops just as surely as when the host's does, and a
   * client that cannot see anyone knows nothing about who is still there.
   * Without this, every network blip would be reported to the user as the host
   * leaving.
   */
  connected?: boolean
  /** Whether another client is currently announcing itself as the host. */
  hostPresent?: boolean
  /**
   * Whether a host has been seen at least once on this connection. Absence is
   * only meaningful after a presence — awareness is empty for a moment after
   * connecting, and counting that would put every collaborator into the waiting
   * state the instant it opens the page.
   */
  hostSeen?: boolean
  /**
   * How long to wait after the host's awareness entry disappears before asking
   * the server whether the session is really over. Defaults to the server's 30s
   * lease, which is the window in which a reload, a network change or a tunnel
   * lets the host re-claim and continue its own session.
   */
  graceMs?: number
}

export interface UsePageSessionReturn {
  role: 'HOST' | 'COLLABORATOR' | 'NONE'
  /** The only thing most callers need: may this client write the database? */
  isHost: boolean
  /** False once the page has no live session at all. */
  alive: boolean
  /** Who holds the page, for telling a collaborator why it cannot edit. */
  hostName: string | null
  /**
   * Who held the page most recently, which outlives the session itself.
   *
   * Separate from {@link hostName} on purpose: once the session ends the server
   * reports no host at all, but that is exactly the moment the user has to be
   * told *whose* departure ended their editing session. Overloading `hostName`
   * with this fallback would let the save indicator credit a host that is no
   * longer there.
   */
  lastHostName: string | null
  /**
   * The page rev the server last reported. Compared against the rev the writer
   * knows about, this is the watermark that reveals a write this client did not
   * make: AI, import or a scheduled job.
   */
  serverRev: number | null
  /**
   * The host's awareness entry is gone and the grace period is running. A
   * collaborator shows "waiting for the host" on this; it is not yet a verdict.
   */
  hostDisconnected: boolean
  /**
   * The server has confirmed there is no session left. Latched: the caller must
   * go read-only and leave, and reopening the page is what makes a new host.
   */
  sessionEnded: boolean
  /** Claim again now, rather than waiting for the next heartbeat. */
  reclaim: () => Promise<void>
}

/**
 * Holds a page's write lease for exactly one client.
 *
 * The transport is injected rather than imported so this stays in the editor
 * package alongside the tracker it gates, the same way the writer hook takes its
 * callbacks.
 *
 * The heartbeat is doing three jobs at once, which is why it is worth having at
 * all: it renews the lease, it tells a demoted host to stop writing, and it
 * carries the rev watermark. A collaborator uses the same call to discover that
 * the session ended.
 */
export function usePageSession(options: UsePageSessionOptions): UsePageSessionReturn {
  const {
    enabled, clientId, onClaim, onHeartbeat, onRelease, onBeforeRelease,
    heartbeatMs = 10_000,
    connected = true, hostPresent = false, hostSeen = false, graceMs = 30_000,
  } = options

  const [state, setState] = useState<PageSessionState>({ role: 'NONE', alive: false })
  const [hostDisconnected, setHostDisconnected] = useState(false)
  const [sessionEnded, setSessionEnded] = useState(false)

  const onClaimRef = useRef(onClaim)
  onClaimRef.current = onClaim
  const onHeartbeatRef = useRef(onHeartbeat)
  onHeartbeatRef.current = onHeartbeat
  const onReleaseRef = useRef(onRelease)
  onReleaseRef.current = onRelease
  const onBeforeReleaseRef = useRef(onBeforeRelease)
  onBeforeReleaseRef.current = onBeforeRelease

  // Whether this client was host as of the last answer. A host whose lease
  // expired has to be told apart from a client that never held one: the former
  // re-claims, the latter waits.
  const wasHostRef = useRef(false)
  // Whether this client has been a collaborator since the session was enabled.
  // A server reporting "no session" only means the session *ended* if we were in
  // one: the identical answer arrives before the very first claim has landed,
  // and acting on that would eject every client as it opens the page.
  const wasCollaboratorRef = useRef(false)
  // Guards against two claims racing after a remount or a fast reclaim.
  const claimingRef = useRef(false)
  const liveRef = useRef(true)
  // Read from inside the heartbeat interval, which deliberately does not take
  // `sessionEnded` as a dependency: re-running that effect would re-run its
  // initial `claim()` and promote this client to host of a session that ended.
  const sessionEndedRef = useRef(false)
  // The last host the server named. Survives the session ending so the user can
  // be told who left; see `lastHostName` on the return type.
  const lastHostNameRef = useRef<string | null>(null)

  const apply = useCallback((next: PageSessionState) => {
    if (!liveRef.current) return
    wasHostRef.current = next.role === 'HOST'
    if (next.role === 'COLLABORATOR') wasCollaboratorRef.current = true
    if (next.hostName) lastHostNameRef.current = next.hostName
    setState(next)
  }, [])

  const claim = useCallback(async () => {
    if (claimingRef.current) return
    claimingRef.current = true
    try {
      apply(await onClaimRef.current(clientId))
    } catch (err) {
      // A failed claim is not fatal: the next heartbeat tick tries again. Going
      // read-only on one dropped request would make a flaky network look like
      // somebody else is holding the page.
      console.error('[usePageSession] claim failed:', err)
    } finally {
      claimingRef.current = false
    }
  }, [clientId, apply])

  /**
   * One heartbeat: renew if we hold the lease, and act on what comes back.
   * Shared by the interval and by the end of the grace period, which needs an
   * answer immediately rather than up to a heartbeat later.
   */
  const beat = useCallback(async (): Promise<void> => {
    if (sessionEndedRef.current) return
    try {
      const next = await onHeartbeatRef.current(clientId)
      if (!liveRef.current || sessionEndedRef.current) return

      const decision = decideHeartbeat(next.role, {
        wasHost: wasHostRef.current,
        wasCollaborator: wasCollaboratorRef.current,
      })

      if (decision === 'reclaim') {
        // Our own lease expired while we still had the page open — a
        // suspended laptop, a long offline stretch, a tab throttled to
        // death. Re-claim rather than silently stopping: this client is
        // still the one the user is typing into.
        //
        // Whether it is then *safe* to write is a separate question, and
        // deliberately not answered here: someone else may have held and
        // edited the page in the meantime. The rev watermark is what
        // catches that, and the writer refuses to write while behind.
        console.warn('[usePageSession] lease lost; re-claiming')
        apply(next)
        await claim()
        return
      }

      if (decision === 'ended') {
        // The host is gone and its lease has expired, so there is no session
        // left to belong to. Deliberately *not* taken as an opportunity to
        // claim: there is no election and no handover, so promoting whichever
        // collaborator's heartbeat happened to fire first would hand the page
        // to an arbitrary user without anyone asking for it. This client goes
        // read-only and leaves; whoever opens the page next becomes the host.
        console.warn('[usePageSession] session ended: no host, lease expired')
        apply(next)
        sessionEndedRef.current = true
        setSessionEnded(true)
        return
      }

      apply(next)
    } catch (err) {
      // Swallowed on purpose. A dropped heartbeat must not change our role:
      // the server is the only thing that can demote us, and it needs a
      // whole lease period of silence to do it.
      console.warn('[usePageSession] heartbeat failed:', err)
    }
  }, [clientId, apply, claim])

  useEffect(() => {
    if (!enabled || !clientId) return
    liveRef.current = true

    void claim()

    const timer = setInterval(() => { void beat() }, heartbeatMs)

    // Flush first, release second, and only if we hold the lease at all — the
    // whole reason this is a function rather than two statements.
    const release = () => {
      closeSession({
        heldLease: wasHostRef.current,
        flush: () => onBeforeReleaseRef.current?.() ?? null,
        release: () => onReleaseRef.current(clientId),
      })
    }
    window.addEventListener('pagehide', release)

    return () => {
      liveRef.current = false
      clearInterval(timer)
      window.removeEventListener('pagehide', release)
      // Orderly close: hand the lease back so the next person to open the page
      // is not made to wait out the TTL.
      release()
    }
  }, [enabled, clientId, heartbeatMs, claim, beat])

  // Host departure. Awareness is the fast signal; the server is the verdict.
  //
  // Awareness drops the host's entry within a second of its connection going,
  // which is what lets a collaborator show "waiting for the host" immediately
  // instead of sitting on a confident "Editing" for a whole lease period. It is
  // not evidence that the session is over, for two independent reasons: the host
  // may be reloading or changing network and about to re-claim its own lease,
  // and the entry also disappears when *our own* connection drops, which says
  // nothing about the host at all. So the countdown only ever schedules a
  // question for the server, and only the server's answer ends the session.
  useEffect(() => {
    if (!shouldWaitForHost({
      enabled, sessionEnded, role: state.role, connected, hostSeen, hostPresent,
    })) {
      setHostDisconnected(false)
      return
    }

    setHostDisconnected(true)
    const timer = setTimeout(() => { void beat() }, graceMs)
    return () => clearTimeout(timer)
    // If the server still reports a live session when that fires, nothing
    // changes and the ordinary heartbeat keeps asking — the host's lease simply
    // has not run out yet.
  }, [enabled, sessionEnded, state.role, connected, hostSeen, hostPresent, graceMs, beat])

  // Nothing to be host of once disabled — otherwise a page that stops loading
  // would keep reporting a stale role.
  useEffect(() => {
    if (!enabled) {
      wasHostRef.current = false
      wasCollaboratorRef.current = false
      sessionEndedRef.current = false
      lastHostNameRef.current = null
      setState({ role: 'NONE', alive: false })
      setHostDisconnected(false)
      setSessionEnded(false)
    }
  }, [enabled])

  return {
    role: state.role,
    isHost: state.role === 'HOST',
    alive: state.alive,
    hostName: state.hostName ?? null,
    lastHostName: state.hostName ?? lastHostNameRef.current,
    serverRev: state.rev ?? null,
    hostDisconnected,
    sessionEnded,
    reclaim: claim,
  }
}
