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
  decideHeartbeat('NONE', { wasHost: false, wasCollaborator: true }) === 'ended',
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

console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail === 0 ? 0 : 1)
