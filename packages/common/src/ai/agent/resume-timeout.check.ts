/**
 * Executable checks for interpreting a silent `tool_results` resume.
 *
 * The failure this guards: the backend acknowledges an already-applied batch
 * without emitting an event (a duplicate POST from the pending-tools watchdog),
 * the client's 30s "first event" timeout fired, and a healthy run was reported
 * as "Agent temporarily unavailable: Agent resume timed out before the first
 * event". These checks pin the decision so a benign no-op keeps the stream and a
 * genuinely dropped payload is still retried.
 *
 * `pnpm --filter @kn/common check:resume-timeout` compiles and runs this.
 */
import { resumeTimeoutMeansApplied } from './resume-timeout'
import type { ResumePayload } from './types'

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

const payload = {
    action: 'tool_results',
    toolResults: [{ callId: 'call-a', ok: true }, { callId: 'call-b', ok: false, error: 'x' }],
} as unknown as ResumePayload

console.log('\nsilent resume classification')

check('an unknown run view is not treated as applied', resumeTimeoutMeansApplied(payload, null) === false)
check('only WAITING_TOOLS/SUSPENDED count as parked (unknown is treated as not-parked)',
    resumeTimeoutMeansApplied(payload, { status: undefined, pendingTools: [] }) === true)

check('a run still parked on the sent calls retries',
    resumeTimeoutMeansApplied(payload, { status: 'WAITING_TOOLS', pendingTools: [{ callId: 'call-a' }] }) === false)
check('a run parked only on calls we did not send is followed',
    resumeTimeoutMeansApplied(payload, { status: 'WAITING_TOOLS', pendingTools: [{ callId: 'call-z' }] }) === true)
check('a run that applied the batch and kept generating is followed',
    resumeTimeoutMeansApplied(payload, { status: 'RUNNING', pendingTools: [] }) === true)
check('a terminal run is followed (its remaining events get replayed)',
    resumeTimeoutMeansApplied(payload, { status: 'COMPLETED', pendingTools: [] }) === true &&
    resumeTimeoutMeansApplied(payload, { status: 'FAILED', pendingTools: [] }) === true)
check('a suspended run whose calls are gone is followed',
    resumeTimeoutMeansApplied(payload, { status: 'SUSPENDED', pendingTools: [] }) === true)
check('a suspended run still listing our calls retries',
    resumeTimeoutMeansApplied(payload, { status: 'SUSPENDED', pendingTools: [{ callId: 'call-b' }] }) === false)
check('a payload with no tool results is still resolved from the run state',
    resumeTimeoutMeansApplied({ action: 'tool_results', toolResults: [] } as ResumePayload,
        { status: 'RUNNING', pendingTools: [] }) === true)
check('ids are compared as strings',
    resumeTimeoutMeansApplied({ action: 'tool_results', toolResults: [{ callId: '42' }] } as unknown as ResumePayload,
        { status: 'WAITING_TOOLS', pendingTools: [{ callId: 42 as unknown as string }] }) === false)

console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail === 0 ? 0 : 1)
