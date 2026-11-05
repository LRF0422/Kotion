/**
 * Executable checks for the page-session rules.
 *
 * The plan makes host departure a named test target: "房主断开 10s 内重连，断言会话
 * 未结束、协同者未被踢；断开 35s 后断言协同者转只读". Both are modelled here as
 * sequences of observations, because the bugs in this area are not wrong
 * arithmetic — they are a guard that looks redundant and is not.
 *
 * This repo has no JavaScript test runner, so like `derive-ops.check.ts` this is
 * a plain program: `pnpm --filter @kn/editor check:session` compiles and runs it.
 */
import { decideHeartbeat, shouldWaitForHost, SessionRole, GraceContext } from './session-rules'

let pass = 0
let fail = 0

function check(name: string, cond: boolean, extra?: unknown): void {
  if (cond) {
    pass++
    console.log('  ok   ' + name)
  } else {
    fail++
    console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''))
  }
}

// ─── Interpreting a heartbeat ─────────────────────────────────────────

console.log('\nheartbeat')

check(
  'a live role is simply adopted',
  decideHeartbeat('COLLABORATOR', { wasHost: false, wasCollaborator: true }) === 'adopt' &&
    decideHeartbeat('HOST', { wasHost: true, wasCollaborator: false }) === 'adopt',
)

check(
  'a host whose lease lapsed re-claims',
  decideHeartbeat('NONE', { wasHost: true, wasCollaborator: false }) === 'reclaim',
)

check(
  'a collaborator with no session left is ended',
  decideHeartbeat('NONE', { wasHost: false, wasCollaborator: true, lastHostSelf: false }) === 'ended',
)

check(
  'a same-user host releasing is re-claimed, not ended',
  // Another tab / the floating page-edit window / the hidden off-screen editor
  // of the SAME user held the lease and let go. The user is still looking at the
  // page, so take the (deliberately same-user-transferable) lease back instead
  // of ejecting them with "Session Ended".
  decideHeartbeat('NONE', { wasHost: false, wasCollaborator: true, lastHostSelf: true }) === 'reclaim',
)

check(
  'a different-user host leaving still ends the session',
  decideHeartbeat('NONE', { wasHost: false, wasCollaborator: true, lastHostSelf: false }) === 'ended',
)

check(
  'having been both, the host reading wins',
  // Recoverable beats unrecoverable: a wrong re-claim is corrected by the rev
  // watermark, a wrong "ended" throws the user out of a live session.
  decideHeartbeat('NONE', { wasHost: true, wasCollaborator: true }) === 'reclaim',
)

check(
  'NONE before the first claim is not an ended session',
  // The heartbeat that races the opening claim. Reading this as "ended" would
  // eject every client as it opened the page.
  decideHeartbeat('NONE', { wasHost: false, wasCollaborator: false }) === 'adopt',
)

// ─── Invited collaborators (guests) ───────────────────────────────────
//
// A guest used to be forbidden from claiming, so "no session" always meant
// "the host is gone, and nobody is persisting this page". That is no longer the
// product rule: an invitation with write access may host the page itself, so the
// same answer now means "the lease is free — take it".

check(
  'an invited guest takes over a vanished session instead of ending it',
  // The host left, or never arrived, and the lease is free. Ending here would
  // eject a guest from a page it is allowed to edit and persist.
  decideHeartbeat(
    'NONE',
    { wasHost: false, wasCollaborator: true, guest: true, mayHost: true },
  ) === 'reclaim',
)

check(
  'a guest opening before anyone has claimed claims the page itself',
  decideHeartbeat(
    'NONE',
    { wasHost: false, wasCollaborator: false, guest: true, mayHost: true },
  ) === 'reclaim',
)

check(
  'a guest that was the host reclaims exactly like a member does',
  decideHeartbeat('NONE', { wasHost: true, wasCollaborator: false, guest: true }) === 'reclaim',
)

check(
  'a read-only guest adopts a missing session rather than latching it as ended',
  decideHeartbeat(
    'NONE',
    { wasHost: false, wasCollaborator: true, guest: true, mayHost: false },
  ) === 'adopt',
)

check(
  'a different-user host leaving still ends a member collaborator',
  // The guest rule must not leak into ordinary collaborators: for them a
  // vanished session really is over.
  decideHeartbeat(
    'NONE',
    { wasHost: false, wasCollaborator: true, lastHostSelf: false, guest: false },
  ) === 'ended',
)

check(
  'a live role is adopted for guests too',
  decideHeartbeat('COLLABORATOR', { wasHost: false, wasCollaborator: true, guest: true }) === 'adopt' &&
    decideHeartbeat('HOST', { wasHost: false, wasCollaborator: true, guest: true }) === 'adopt',
)

// ─── Starting the grace countdown ─────────────────────────────────────

console.log('\ngrace countdown')

const collab: GraceContext = {
  enabled: true,
  sessionEnded: false,
  role: 'COLLABORATOR',
  connected: true,
  hostSeen: true,
  hostPresent: true,
}

check('a present host is not waited for', shouldWaitForHost(collab) === false)

check(
  'an absent host starts the countdown',
  shouldWaitForHost({ ...collab, hostPresent: false }) === true,
)

check(
  'our own disconnection is never read as the host leaving',
  // Losing our socket loses *every* awareness entry. Without this guard each
  // network blip tells the user the host left.
  shouldWaitForHost({ ...collab, hostPresent: false, connected: false }) === false,
)

check(
  'an empty awareness right after connecting does not count',
  // hostSeen false: states arrive a moment after the socket opens.
  shouldWaitForHost({ ...collab, hostPresent: false, hostSeen: false }) === false,
)

check(
  'the host does not wait for itself',
  shouldWaitForHost({ ...collab, role: 'HOST', hostPresent: false }) === false,
)

check(
  'a client with no session has nothing to wait for',
  shouldWaitForHost({ ...collab, role: 'NONE', hostPresent: false }) === false,
)

check(
  'an ended session does not re-arm the countdown',
  shouldWaitForHost({ ...collab, hostPresent: false, sessionEnded: true }) === false,
)

check(
  'a disabled session never waits',
  shouldWaitForHost({ ...collab, hostPresent: false, enabled: false }) === false,
)

check(
  'an invited guest never waits for a host',
  // A guest can persist the page itself, so the missing-host countdown (and its
  // "Host disconnected" banner) must never run for it — including before the
  // inviter has joined at all.
  shouldWaitForHost({ ...collab, hostPresent: false, isGuest: true }) === false,
)

// ─── The plan's two scenarios, as sequences ───────────────────────────

console.log('\nplan scenario: host reconnects inside the grace period')

{
  // A collaborator watching a host that drops and comes back. The grace timer
  // is what would fire at 30s; the point of the scenario is that it never does,
  // because the host's awareness returns first and the server never stopped
  // reporting a live session.
  let ctx: GraceContext = { ...collab }
  const waiting: boolean[] = []

  // t=0 steady state
  waiting.push(shouldWaitForHost(ctx))
  // t=1s the host's socket goes; awareness drops its entry
  ctx = { ...ctx, hostPresent: false }
  waiting.push(shouldWaitForHost(ctx))
  // t=10s the host is back — it re-claimed its own lease, which never expired
  ctx = { ...ctx, hostPresent: true }
  waiting.push(shouldWaitForHost(ctx))

  check('the collaborator waits only while the host is away', JSON.stringify(waiting) === JSON.stringify([false, true, false]), waiting)

  // Throughout, the server kept naming a host, so the session never ended.
  const decisions: string[] = ['COLLABORATOR', 'COLLABORATOR', 'COLLABORATOR'].map(r =>
    decideHeartbeat(r as SessionRole, { wasHost: false, wasCollaborator: true }),
  )
  check(
    'the session is not ended and the collaborator is not kicked',
    decisions.every(d => d === 'adopt'),
    decisions,
  )
}

console.log('\nplan scenario: host stays away past the lease')

{
  let ctx: GraceContext = { ...collab, hostPresent: false }
  check('the countdown is running at t=1s', shouldWaitForHost(ctx) === true)

  // t=30s the countdown fires and asks the server. The lease has expired, so
  // the answer is NONE — and this client has been a collaborator, which is what
  // makes NONE mean "over" rather than "not started".
  const decision = decideHeartbeat('NONE', { wasHost: false, wasCollaborator: true })
  check('at grace expiry the server ends the session', decision === 'ended')

  // The caller latches `sessionEnded` and goes read-only; the countdown must
  // not re-arm and ask again.
  ctx = { ...ctx, sessionEnded: true }
  check('an ended session stops waiting', shouldWaitForHost(ctx) === false)
}

console.log('\nplan scenario: the host preempts a guest lease and then leaves')

{
  // t=0 nobody holds the page, so the invited guest claims it and persists.
  let decision = decideHeartbeat(
    'HOST',
    { wasHost: false, wasCollaborator: false, guest: true, mayHost: true },
  )
  check('the guest hosts the page while nobody else does', decision === 'adopt')

  // t=1 the inviter opens the page; the backend preempts the guest's lease.
  // The guest learns this from its next heartbeat and stops writing, but its
  // edits are already in the shared document for the host to persist.
  decision = decideHeartbeat(
    'COLLABORATOR',
    { wasHost: true, wasCollaborator: false, guest: true, mayHost: true },
  )
  check('a preempted guest adopts the collaborator role', decision === 'adopt')

  decision = decideHeartbeat(
    'COLLABORATOR',
    { wasHost: false, wasCollaborator: true, guest: true, mayHost: true },
  )
  check('the guest stays a collaborator while the host holds the lease', decision === 'adopt')

  // The host closes the page and the lease is free again: the guest takes over
  // rather than being ejected from a page it is still looking at.
  decision = decideHeartbeat(
    'NONE',
    { wasHost: false, wasCollaborator: true, guest: true, mayHost: true },
  )
  check('the guest reclaims the page instead of ending the session', decision === 'reclaim')

  check(
    'the guest never saw the host-disconnected countdown through any of it',
    shouldWaitForHost({ ...collab, hostPresent: false, isGuest: true }) === false,
  )
}

console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail === 0 ? 0 : 1)
