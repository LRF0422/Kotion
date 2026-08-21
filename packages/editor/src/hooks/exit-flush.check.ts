/**
 * Executable checks for what a closing editor sends.
 *
 * This file exists because of a bug the user hit within minutes of the previous
 * stage shipping: switching between pages produced "当前不是该页面的编辑主持人，
 * 无法保存" every single time. Two independent faults, both here:
 *
 * 1. A session arms a reconcile at its start, so `hasDirty()` was true on a page
 *    nobody had touched, so closing it sent a full-document write. Fixed by
 *    asking `dirty` — see {@link decideExitFlush}.
 * 2. That write was issued *after* the lease had been handed back, so the server
 *    refused it. Fixed by {@link closeSession}, whose order is checked below.
 *
 * Neither fault is arithmetic; both are a question asked of the wrong flag, and
 * both are invisible until something rejects the request. `pnpm --filter
 * @kn/editor check:exit` compiles and runs this.
 */
import { decideExitFlush, ExitFlushContext } from './exit-flush'
import { closeSession } from './session-rules'

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

/** A session that has just started: reconcile armed, nothing typed. */
const opened: ExitFlushContext = {
  pending: false,
  dirty: false,
  needsReconcile: true,
  reconcileOnly: false,
}

// ─── What is owed on the way out ──────────────────────────────────────

console.log('\nexit flush')

check(
  // The reported bug. Every page switch went through here.
  'a page nobody edited owes nothing, even with a reconcile armed',
  decideExitFlush(opened) === 'none',
  decideExitFlush(opened),
)

check(
  'a page nobody edited owes nothing in reconcile-only mode either',
  decideExitFlush({ ...opened, needsReconcile: false, reconcileOnly: true }) === 'none',
)

check(
  'an edited page whose baseline is unconfirmed sends the whole document',
  decideExitFlush({ ...opened, dirty: true }) === 'reconcile',
)

check(
  'an edited page with a trusted baseline sends ops',
  decideExitFlush({ ...opened, dirty: true, needsReconcile: false }) === 'ops',
)

check(
  // A client that never synced with the relay holds a document whose anchors may
  // point at blocks the server moved, so its ops are not safe to send.
  'reconcile-only never sends ops',
  decideExitFlush({ ...opened, dirty: true, needsReconcile: false, reconcileOnly: true }) === 'reconcile',
)

check(
  // Deriving fresh work would mint a new idempotency key for ops that may
  // already have landed, and a re-applied `insert` is a duplicate block.
  'work already on the wire is re-sent as-is, not re-derived',
  decideExitFlush({ ...opened, pending: true }) === 'pending' &&
    decideExitFlush({ pending: true, dirty: true, needsReconcile: false, reconcileOnly: false }) === 'pending',
)

check(
  'pending outranks even a clean tracker',
  // The clean tracker is exactly the state a fully-committed-but-unacknowledged
  // write leaves behind; reading it as "nothing owed" strands that write.
  decideExitFlush({ pending: true, dirty: false, needsReconcile: false, reconcileOnly: false }) === 'pending',
)

// ─── Invariant: only a real change opens the wallet ───────────────────

console.log('\ninvariant')

{
  const flags = [false, true]
  const wrong: ExitFlushContext[] = []
  for (const dirty of flags) {
    for (const needsReconcile of flags) {
      for (const reconcileOnly of flags) {
        const ctx: ExitFlushContext = { pending: false, dirty, needsReconcile, reconcileOnly }
        const owes = decideExitFlush(ctx) !== 'none'
        if (owes !== dirty) wrong.push(ctx)
      }
    }
  }
  check(
    // Stated as a property so no future flag can become a second way to trigger
    // a write on a page the user only looked at.
    'with nothing pending, a write is owed exactly when there are local changes',
    wrong.length === 0,
    wrong,
  )
}

// ─── Closing order ───────────────────────────────────────────────────

console.log('\nclosing a session')

{
  const order: string[] = []
  closeSession({
    heldLease: true,
    flush: () => { order.push('flush'); return null },
    release: () => { order.push('release') },
  })
  check('nothing to flush releases immediately', JSON.stringify(order) === '["flush","release"]', order)
}

{
  // The reported bug's second half: with the release first, the server sees the
  // write arrive from a client that no longer holds the lease and refuses it.
  const order: string[] = []
  let settle: (() => void) | null = null
  closeSession({
    heldLease: true,
    flush: () => {
      order.push('flush')
      return new Promise<void>(resolve => { settle = () => resolve() })
    },
    release: () => { order.push('release') },
  })
  check('the release waits for a write in flight', JSON.stringify(order) === '["flush"]', order)

  settle!()
  void Promise.resolve().then(() => Promise.resolve()).then(() => {
    check('and happens once it lands', JSON.stringify(order) === '["flush","release"]', order)
    finish()
  })
}

{
  const order: string[] = []
  closeSession({
    heldLease: false,
    flush: () => { order.push('flush'); return null },
    release: () => { order.push('release') },
  })
  check(
    // A collaborator holds no lease and has written nothing. Releasing here would
    // end the host's session for everyone.
    'a client without the lease neither flushes nor releases',
    order.length === 0,
    order,
  )
}

{
  const order: string[] = []
  closeSession({
    heldLease: true,
    flush: () => { throw new Error('boom') },
    release: () => { order.push('release') },
  })
  check(
    // A flush that throws is a lost edit; a lease that then leaks locks the page
    // for the whole TTL on top of it.
    'a throwing flush still releases the lease',
    JSON.stringify(order) === '["release"]',
    order,
  )
}

{
  const order: string[] = []
  let reject: (() => void) | null = null
  closeSession({
    heldLease: true,
    flush: () => new Promise<void>((_, rej) => { reject = () => rej(new Error('refused')) }),
    release: () => { order.push('release') },
  })
  reject!()
  void Promise.resolve().then(() => Promise.resolve()).then(() => {
    check('a rejected final write still releases the lease', JSON.stringify(order) === '["release"]', order)
    finish()
  })
}

// Two async checks above; report once both have run.
let remaining = 2
function finish(): void {
  remaining -= 1
  if (remaining > 0) return
  console.log('\n' + pass + ' passed, ' + fail + ' failed')
  process.exit(fail === 0 ? 0 : 1)
}
