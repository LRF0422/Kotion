/**
 * Interpreting a silent `tool_results` resume.
 *
 * The resume HTTP response is an SSE stream; the client waits for the first
 * real event to prove the payload was applied. A timeout alone does NOT prove a
 * failure: the backend acknowledges a `tool_results` payload that is no longer
 * pending (an earlier duplicate POST already applied it) by returning success
 * without emitting anything, and the run keeps generating. Treating that benign
 * no-op as an error produced the false "Agent temporarily unavailable: resume
 * timed out before the first event" while the run was healthy.
 *
 * This module decides, from the run view, whether a silent resume can be read as
 * "already applied" (follow the event stream) or means the payload was dropped
 * while the run is still parked on those calls (retry the resume).
 */

import type { PendingToolCall, ResumePayload } from './types'

/** The slice of the run view this decision needs. */
export interface ResumeTimeoutRunView {
    status?: string
    pendingTools?: Array<Pick<PendingToolCall, 'callId'>> | null
}

/** Terminal/active states that mean the run is not parked on our calls. */
const PARKED_STATUSES = new Set(['WAITING_TOOLS', 'SUSPENDED'])

/**
 * True when a silent resume should be followed through the run's event stream
 * instead of being reported as a failure.
 *
 * - No run view (the probe itself failed): unknown → not safe, let the caller
 *   retry so the payload is not silently lost.
 * - The run is still parked and still lists the calls we just sent: the payload
 *   may have been dropped → retry.
 * - The run is still parked but our calls are gone (already applied), or the run
 *   is running/terminal: the results landed, the run just had nothing new to say
 *   yet → follow the stream.
 */
export function resumeTimeoutMeansApplied(
    payload: ResumePayload,
    view: ResumeTimeoutRunView | null | undefined,
): boolean {
    if (!view) return false
    const status = String(view.status ?? '').toUpperCase()
    if (!PARKED_STATUSES.has(status)) return true
    const pending = new Set((view.pendingTools ?? []).map(call => String(call.callId)))
    const sent = (payload.toolResults ?? []).map(item => String(item.callId))
    return !sent.some(callId => pending.has(callId))
}
