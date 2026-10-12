export interface PendingToolBatch {
    runId: string
    callIds: string[]
}

export function createPendingToolBatch(runId: string, callIds: string[]): PendingToolBatch {
    return { runId, callIds: [...callIds] }
}

export function matchesPendingToolBatch(
    batch: PendingToolBatch | null,
    runId: string,
    callIds: string[]
): boolean {
    return !!batch
        && batch.runId === runId
        && callIds.length > 0
        && callIds.every(id => batch.callIds.includes(id))
}

/** What to do about a submitted batch the server has not acknowledged yet. */
export type PendingAckDecision = 'ack' | 'resubmit' | 'wait'

/**
 * Whether every call in a pending batch can run without a live editor.
 *
 * The chat's edit target is not always ready (page switch, offscreen re-acquire,
 * a plugin page with no document), and the gate that waits for it must not hold
 * editor-independent tools — file / studio / host tools — because that freezes
 * the whole batch until the server's tool timeout. Unknown tools count as
 * editor-bound: running a document tool against the wrong document is worse than
 * waiting for one, and the batch watchdog still bounds the wait.
 */
export function pendingBatchIsEditorIndependent(
    callIds: string[],
    toolOf: (callId: string) => string | undefined,
    needsEditor: (toolName: string) => boolean,
): boolean {
    if (callIds.length === 0) return false
    return callIds.every(callId => {
        const tool = toolOf(callId)
        return tool !== undefined && tool !== '' && needsEditor(tool) === false
    })
}

/**
 * Decide from the run view whether an unacknowledged batch must be re-submitted.
 *
 * A batch is delivered only when the server acknowledges it (durable
 * `tool.completed` events shrink the local pending set). The backend can accept
 * a resume with a 200 and still drop the payload — its pause announcement and
 * its published state race each other — and nothing else would ever re-send it,
 * so the run parks in WAITING_TOOLS until its tool timeout while the UI shows
 * every call as running. The view is the authority, exactly as in the sub-run
 * worker.
 */
export function decidePendingAck(
    view: { status: string; pendingTools?: Array<{ callId: string }> } | null,
    pendingCallIds: string[],
): PendingAckDecision {
    if (pendingCallIds.length === 0) return 'ack'
    // Unknown state (request failed): keep the batch and re-check later.
    if (!view) return 'wait'
    const waiting = view.status === 'WAITING_TOOLS' || view.status === 'SUSPENDED'
    const onServer = new Set((view.pendingTools ?? []).map(pending => pending.callId))
    // The server is no longer waiting for any of them: already applied, or the
    // run moved on. Settle locally instead of re-submitting forever.
    if (!waiting || pendingCallIds.every(callId => !onServer.has(callId))) return 'ack'
    return 'resubmit'
}
