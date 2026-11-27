/**
 * Executable checks for `decideToolExecution` — the crash-recovery decision for
 * a pending frontend tool call.
 *
 * Danger this guards: replaying a side-effecting tool because the local journal
 * or the server ledger said `started`. The rule is: only read-only/idempotent
 * tools may be retried automatically; a completed result is resubmitted; every
 * other unknown outcome is surfaced to the user.
 *
 * `pnpm --filter @kn/common check:tool-ledger` compiles and runs this.
 */
import { decideToolExecution } from './tool-ledger'
import type { AgentToolCallView } from './runtime-state'
import type { SavedToolResult } from './persistence'

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

function ledger(status: AgentToolCallView['status'], patch: Partial<AgentToolCallView> = {}): AgentToolCallView {
    return {
        callId: 'call-1',
        runId: 'run-1',
        toolName: 'editPage',
        status,
        ...patch,
    }
}

const savedCompleted: SavedToolResult = { status: 'completed', ok: true, result: { ok: true } }
const savedStarted: SavedToolResult = { status: 'started', ok: false, error: 'started' }

console.log('\ntool ledger decisions')

check('no ledger and no journal -> execute',
    decideToolExecution({ ledger: null, saved: null, safeToRetry: false }).action === 'execute')

check('a locally completed result wins and is resumed', (() => {
    const decision = decideToolExecution({ ledger: null, saved: savedCompleted, safeToRetry: false })
    return decision.action === 'resume' && decision.outcome.ok === true
})())

check('a server completed result is resumed', (() => {
    const decision = decideToolExecution({
        ledger: ledger('completed', { result: { ok: true } }),
        saved: null,
        safeToRetry: false,
    })
    return decision.action === 'resume' && decision.outcome.ok === true
})())

check('a truncated server result is not resumed blindly',
    decideToolExecution({
        ledger: ledger('completed', { resultTruncated: true }),
        saved: null,
        safeToRetry: true,
    }).action === 'uncertain')

check('a failed server call resumes as an error', (() => {
    const decision = decideToolExecution({
        ledger: ledger('failed', { error: 'boom' }),
        saved: null,
        safeToRetry: true,
    })
    return decision.action === 'resume' && decision.outcome.ok === false && decision.outcome.error === 'boom'
})())

check('started + unsafe -> uncertain',
    decideToolExecution({ ledger: ledger('started'), saved: null, safeToRetry: false }).action === 'uncertain')

check('started + safe -> execute',
    decideToolExecution({ ledger: ledger('started'), saved: null, safeToRetry: true }).action === 'execute')

check('uncertain + safe -> execute',
    decideToolExecution({ ledger: ledger('uncertain'), saved: null, safeToRetry: true }).action === 'execute')

check('awaiting approval -> uncertain (never silently run)',
    decideToolExecution({ ledger: ledger('awaiting_approval'), saved: null, safeToRetry: true }).action === 'uncertain')

check('approved -> execute',
    decideToolExecution({ ledger: ledger('approved'), saved: null, safeToRetry: false }).action === 'execute')

check('pending -> execute',
    decideToolExecution({ ledger: ledger('pending'), saved: null, safeToRetry: false }).action === 'execute')

check('no ledger + started journal + unsafe -> uncertain',
    decideToolExecution({ ledger: null, saved: savedStarted, safeToRetry: false }).action === 'uncertain')

check('no ledger + started journal + safe -> execute',
    decideToolExecution({ ledger: null, saved: savedStarted, safeToRetry: true }).action === 'execute')

console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail === 0 ? 0 : 1)