/**
 * usePendingToolExecution — executes frontend (editor) tool calls for the
 * active run and resumes it, with callId-idempotent journals and bounded
 * re-submits. Extracted from useEditorAgent so the run hook is not also the
 * tool-execution owner.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { Dispatch, MutableRefObject } from 'react'
import type { AgentClient } from './client'
import { AgentControlError } from './events'
import type { EditorToolExecutor, ToolExecutionResult } from './tool-executor'
import type { AgentRunStore } from './persistence'
import {
    createPendingToolBatch,
    decidePendingAck,
    matchesPendingToolBatch,
    PENDING_ACK_FORCE_ATTEMPT,
    pendingAckBackoffMs,
    pendingAckForcesExecution,
    pendingBatchIsEditorIndependent,
    pendingCallIdCandidates,
    type PendingToolBatch,
} from './tool-batch'
import { parseToolArgs, type ResumePayload } from './types'
import { MAX_TOOL_RESUME_RETRIES, isPermanentTransportError } from './retry-policy'
import type { Action, EditorAgentState } from './editor-agent-state'

/**
 * Bounded idempotent re-submits before accepting the server's "not waiting for
 * these" answer. A parked backend can read a stale hot state (its pause/state
 * publication race), so a single answer is not proof; the POST is idempotent by
 * callId, so trying again costs nothing.
 */
const PENDING_ACK_MAX_RESUBMITS = 3

export interface UsePendingToolExecutionOptions {
    client: AgentClient
    store: AgentRunStore
    executor: EditorToolExecutor
    resumeWith: (runId: string, payload: ResumePayload, generation?: number) => Promise<void>
    dispatch: Dispatch<Action>
    state: EditorAgentState
    stateRef: MutableRefObject<EditorAgentState>
    generationRef: MutableRefObject<number>
    mountedRef: MutableRefObject<boolean>
    /** Events at/after this seq must replay before tools execute. */
    attachReplayThroughRef: MutableRefObject<number>
    /** Execute frontend tool calls automatically (editor UX). */
    autoExecuteTools: boolean
    /**
     * Whether a tool needs a live editor. A batch whose tools all say no is
     * executed even while the edit target is not ready: the gate exists to keep
     * document tools off a half-switched target, not to freeze file/studio/host
     * tools. Unknown tools count as editor-bound.
     */
    needsEditor?: (toolName: string) => boolean
}

export interface UsePendingToolExecutionApi {
    executePendingTools: () => Promise<void>
    /** Force a re-submit of the current pending batch (manual retry). */
    retryPendingTools: () => void
    /** Clear the batch + retry timers (new turn / cancel / reset). */
    resetPending: () => void
    /** Clear only the retry timer (attach); keeps the batch guard. */
    clearRetryTimer: () => void
}

export function usePendingToolExecution(
    options: UsePendingToolExecutionOptions,
): UsePendingToolExecutionApi {
    const {
        client, store, executor, resumeWith, dispatch, state, stateRef,
        generationRef, mountedRef, attachReplayThroughRef, autoExecuteTools, needsEditor,
    } = options

    const toolBatchRef = useRef<PendingToolBatch | null>(null)
    const toolRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const toolRetryAttemptRef = useRef(0)
    const toolRetryKeyRef = useRef('')
    /** True while executePendingTools is mid-flight (the watchdog stays off). */
    const submittingRef = useRef(false)
    const ackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    /**
     * Completed WAIT passes on the current batch. Reset only when nothing is owed
     * any more (or a new turn/cancel resets the hook), never by a mere event: the
     * watchdog's force pass must be reachable on a stream that has gone quiet.
     */
    const ackAttemptsRef = useRef(0)
    /** Latest check, so the timer can re-arm itself without a dependency cycle. */
    const checkPendingAckRef = useRef<() => Promise<void>>(async () => {})

    /**
     * Arm the next watchdog pass. Only one pass is ever pending, and a burst of
     * state changes does NOT push its deadline out — a watchdog that only ran on
     * the next state change fired once and left the run spinning forever, which is
     * exactly the hang it was written to end.
     */
    const scheduleAckPass = useCallback((delayMs: number) => {
        if (ackTimerRef.current) return
        ackTimerRef.current = setTimeout(() => {
            ackTimerRef.current = null
            void checkPendingAckRef.current()
        }, delayMs)
    }, [])

    const retryPendingTools = useCallback(() => {
        toolBatchRef.current = null
        toolRetryAttemptRef.current = 0
        ackAttemptsRef.current = 0
        // A manual retry starts a fresh escalation now: without this it could sit
        // behind the tail of the previous batch's 20s backoff.
        if (ackTimerRef.current) {
            clearTimeout(ackTimerRef.current)
            ackTimerRef.current = null
        }
        dispatch({ type: 'retry-pending-tools' })
    }, [dispatch])

    const clearRetryTimer = useCallback(() => {
        if (toolRetryTimerRef.current) {
            clearTimeout(toolRetryTimerRef.current)
            toolRetryTimerRef.current = null
        }
    }, [])

    const resetPending = useCallback(() => {
        toolBatchRef.current = null
        if (toolRetryTimerRef.current) {
            clearTimeout(toolRetryTimerRef.current)
            toolRetryTimerRef.current = null
        }
        if (ackTimerRef.current) {
            clearTimeout(ackTimerRef.current)
            ackTimerRef.current = null
        }
        toolRetryAttemptRef.current = 0
        toolRetryKeyRef.current = ''
        ackAttemptsRef.current = 0
    }, [])

    const executePendingTools = useCallback(async () => {
        const current = stateRef.current
        const generation = generationRef.current
        // Candidates come from BOTH sources: the run.suspended payload and the
        // tape. A lost suspend frame leaves the tape showing calls as running
        // while `pendingToolIds` stays empty — keying the batch on the latter
        // alone left such a run with spinners and no execution at all.
        const callIds = pendingCallIdCandidates(current.pendingToolIds, current.toolCalls)
        if (!current.runId || callIds.length === 0) return
        const retryKey = current.runId + ':' + callIds.join(',')
        if (toolRetryKeyRef.current !== retryKey) {
            toolRetryKeyRef.current = retryKey
            toolRetryAttemptRef.current = 0
        }
        if (matchesPendingToolBatch(toolBatchRef.current, current.runId, callIds)) {
            return
        }
        toolBatchRef.current = createPendingToolBatch(current.runId, callIds)
        submittingRef.current = true

        try {
            const missing = callIds.filter(callId =>
                !stateRef.current.toolCalls.some(call => call.callId === callId)
            )
            if (missing.length > 0) {
                const view = await client.getRun(current.runId)
                if (!mountedRef.current || generation !== generationRef.current) return
                const records = view.pendingTools.map(pending => ({
                    callId: pending.callId,
                    tool: pending.tool,
                    args: parseToolArgs(pending.argsJson),
                    status: 'running' as const,
                    subRunId: pending.subRunId,
                }))
                if (records.length === 0 || missing.some(id => !records.some(record => record.callId === id))) {
                    throw new Error('无法恢复待执行的前端工具调用: ' + missing.join(', '))
                }
                toolBatchRef.current = null
                dispatch({ type: 'restore-pending', records })
                return
            }

            const results: { callId: string; ok: boolean; result?: unknown; error?: string }[] = []
            for (const callId of callIds) {
                const record = stateRef.current.toolCalls.find(call => call.callId === callId)
                if (!record) {
                    throw new Error('前端工具调用记录已丢失: ' + callId)
                }
                const savedOutcome = store.loadToolResult(current.runId, callId)
                if (savedOutcome?.status === 'started') {
                    throw new AgentControlError(
                        'TOOL_EXECUTION_UNCERTAIN',
                        '上次工具执行在完成前中断，为避免重复修改已停止自动重试'
                    )
                }
                let outcome: ToolExecutionResult | null = savedOutcome
                if (!outcome) {
                    // Write an intent marker before the side effect. A crash after
                    // mutation but before result persistence will then fail closed
                    // instead of executing the same callId again after reload.
                    if (!store.saveToolStarted(current.runId, callId)) {
                        throw new AgentControlError(
                            'TOOL_RESULT_PERSIST_FAILED',
                            '无法持久化工具执行状态，已在修改文档前停止'
                        )
                    }
                    outcome = await executor.execute(callId, record.tool, record.args, record.subRunId ?? null)
                    if (!store.saveToolResult(current.runId, callId, outcome)) {
                        // Persistence only backs crash recovery. The intent marker
                        // written before the side effect still makes a re-attach
                        // fail closed, so a full storage quota must not strand an
                        // otherwise-healthy turn.
                        console.warn('[agent] tool result not persisted; continuing without recovery for', callId)
                    }
                    if (!mountedRef.current || generation !== generationRef.current) return
                }
                dispatch({ type: 'tool-result', callId, ok: outcome.ok, result: outcome.result, error: outcome.error })
                results.push({
                    callId,
                    ok: outcome.ok,
                    result: outcome.result,
                    error: outcome.error,
                })
            }
            let resumeError: unknown
            for (let attempt = 0; attempt < 3 && mountedRef.current; attempt += 1) {
                try {
                    await resumeWith(current.runId, { action: 'tool_results', toolResults: results }, generation)
                    resumeError = undefined
                    toolRetryAttemptRef.current = 0
                    break
                } catch (error) {
                    resumeError = error
                    if (isPermanentTransportError(error)) break
                    if (attempt < 2) {
                        await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, attempt)))
                    }
                }
            }
            if (!mountedRef.current) return
            if (resumeError) throw resumeError
        } catch (error: any) {
            if (!mountedRef.current || generation !== generationRef.current) return
            toolBatchRef.current = null
            const message = error?.message ?? String(error)
            const retryAttempt = ++toolRetryAttemptRef.current
            if (isPermanentTransportError(error) || retryAttempt >= MAX_TOOL_RESUME_RETRIES) {
                dispatch({ type: 'connection-stopped', error: message })
                return
            }
            dispatch({ type: 'transport-error', error: message })
            if (toolRetryTimerRef.current) clearTimeout(toolRetryTimerRef.current)
            toolRetryTimerRef.current = setTimeout(() => {
                toolRetryTimerRef.current = null
                if (!mountedRef.current || generation !== generationRef.current) return
                const latest = stateRef.current
                if (latest.runId === current.runId
                    && latest.phase === 'waiting-tools'
                    && latest.pendingToolIds.length > 0) {
                    dispatch({ type: 'retry-pending-tools' })
                }
            }, 2000)
        } finally {
            submittingRef.current = false
        }
    }, [client, executor, resumeWith, store])

    // Release a submitted batch only after every result is acknowledged by the
    // backend's durable tool.completed events.
    useEffect(() => {
        const batch = toolBatchRef.current
        if (!batch || batch.runId !== state.runId) return
        const remaining = batch.callIds.filter(callId => state.pendingToolIds.includes(callId))
        batch.callIds
            .filter(callId => !state.pendingToolIds.includes(callId))
            .forEach(callId => store.clearToolResult(batch.runId, callId))
        if (remaining.length === 0) {
            if (toolRetryTimerRef.current) {
                clearTimeout(toolRetryTimerRef.current)
                toolRetryTimerRef.current = null
            }
            toolBatchRef.current = null
            toolRetryAttemptRef.current = 0
            toolRetryKeyRef.current = ''
            return
        }
        if (remaining.length < batch.callIds.length && !toolRetryTimerRef.current) {
            // Give the original resume stream a short window to acknowledge the
            // rest. If it died after a partial durable apply, resubmit only the
            // still-pending cached results.
            const generation = generationRef.current
            toolRetryTimerRef.current = setTimeout(() => {
                toolRetryTimerRef.current = null
                if (!mountedRef.current || generation !== generationRef.current) return
                const latest = stateRef.current
                if (latest.runId === batch.runId
                    && remaining.some(callId => latest.pendingToolIds.includes(callId))) {
                    toolBatchRef.current = null
                    dispatch({ type: 'retry-pending-tools' })
                }
            }, 2000)
        }
    }, [state.runId, state.pendingToolIds, store])

    /**
     * Frontend calls this run still owes the server. Two sources, because either
     * one alone can be missing: the `run.suspended` payload fills
     * `pendingToolIds`, and the tape fills in calls announced by
     * `tool.requested` whose suspend frame never arrived (a cut stream leaves the
     * UI showing them as running with nothing left to execute them).
     */
    const pendingCandidates = useMemo(
        () => pendingCallIdCandidates(state.pendingToolIds, state.toolCalls),
        [state.pendingToolIds, state.toolCalls],
    )

    /**
     * True when every pending call can run without a live editor (file / studio /
     * host tools). Those are executed even while the edit target is not ready: the
     * readiness gate protects document tools from a half-switched editor, it must
     * not freeze an entire batch behind it — that is what left the main agent's
     * `writePluginProjectFile` batch unexecuted until the server's tool timeout.
     */
    const editorIndependentBatch = useMemo(() => {
        if (!needsEditor || pendingCandidates.length === 0) return false
        const byCallId = new Map(state.toolCalls.map(call => [call.callId, call.tool]))
        return pendingBatchIsEditorIndependent(
            pendingCandidates,
            callId => byCallId.get(callId),
            needsEditor,
        )
    }, [needsEditor, pendingCandidates, state.toolCalls])

    // Auto-execute frontend tools when the run pauses for them.
    useEffect(() => {
        if ((!autoExecuteTools && !editorIndependentBatch)
            || state.phase !== 'waiting-tools'
            || pendingCandidates.length === 0
            || state.lastSeq < attachReplayThroughRef.current) {
            return
        }
        void executePendingTools()
    }, [
        autoExecuteTools, editorIndependentBatch, pendingCandidates, state.phase,
        state.lastSeq, state.toolRetryToken, executePendingTools,
    ])

    /**
     * Watchdog for the conversation's OWN tool batch. It covers the ways a
     * parent-run batch strands while the server waits:
     *
     *  1. it was never submitted — the readiness gate (`autoExecuteTools`) stayed
     *     closed (page switch, plugin route without a document, offscreen session
     *     released), or its `run.suspended` frame was lost so nothing ever asked
     *     for it;
     *  2. it was submitted but the server never acknowledged it — the backend can
     *     accept a resume with a 200 and still drop the payload (its pause
     *     announcement races its published state).
     *
     * Both are handled from `pendingCandidates` (tape ∪ suspend payload) and the
     * server's own run view, after a quiet period. Editor-independent tools just
     * work; a tool that truly needs a missing editor fails with its own error
     * result, which the model can react to — better than a ten-minute hang.
     * Results come from the executor cache / journal, so nothing runs twice, and a
     * duplicate `tool_results` POST is idempotent server-side.
     *
     * Every pass that leaves the batch owed ARMS THE NEXT ONE. Waiting for the
     * next state change instead was the actual hang: with the server parked there
     * is no next event, so the watchdog fired once, warned "第 1 次等待", and the
     * run sat in WAITING_TOOLS until its ten-minute tool timeout — the force pass
     * below was unreachable exactly when it was needed.
     */
    const checkPendingAck = useCallback(async () => {
        const current = stateRef.current
        if (!mountedRef.current || !current.runId) return
        const candidates = pendingCallIdCandidates(current.pendingToolIds, current.toolCalls)
        if (candidates.length === 0) return
        if (submittingRef.current) {
            // An execution is mid-flight; look again after the next backoff so a
            // submit the server silently drops is still retried.
            scheduleAckPass(pendingAckBackoffMs(ackAttemptsRef.current))
            return
        }

        const generation = generationRef.current
        let view: {
            status: string
            pendingTools?: Array<{ callId: string; tool: string; argsJson: string; subRunId?: string }>
        } | null = null
        try {
            view = await client.getRun(current.runId)
        } catch {
            view = null
        }
        if (!mountedRef.current || generation !== generationRef.current) return

        const parked = !!view && (view.status === 'WAITING_TOOLS' || view.status === 'SUSPENDED')
        const serverIds = (view?.pendingTools ?? []).map(pending => pending.callId)

        // The server waits for a call this client never recorded as pending: adopt
        // its list (restore-pending seeds both the tape and the pending set), then
        // the normal path executes it.
        if (parked) {
            const unknown = serverIds.filter(callId => !current.pendingToolIds.includes(callId))
            if (unknown.length > 0) {
                const records = (view?.pendingTools ?? [])
                    .filter(pending => unknown.includes(pending.callId))
                    .map(pending => ({
                        callId: pending.callId,
                        tool: pending.tool,
                        args: parseToolArgs(pending.argsJson),
                        status: 'running' as const,
                        subRunId: pending.subRunId,
                    }))
                if (records.length === unknown.length) {
                    console.warn(
                        `[agent] 同步服务端仍在等待的前端调用（本地漏记 run.suspended）: ${unknown.join(', ')}`
                    )
                    dispatch({ type: 'restore-pending', records })
                    scheduleAckPass(pendingAckBackoffMs(ackAttemptsRef.current))
                    return
                }
            }
        }

        const decision = decidePendingAck(view, candidates)
        // Unknown run state (the view request failed). Re-check a few times, but
        // never indefinitely: a GET that keeps failing (expired token, a proxy
        // dropping it) parked the batch in total silence — no log the user could
        // act on, no execution — until the server's ten-minute tool timeout. Past
        // the force threshold the batch is executed and re-submitted blind; the
        // journal makes that safe (a completed call is never executed twice) and
        // the POST is idempotent by callId.
        const viewUnreadable = decision === 'wait'
        if (viewUnreadable && ackAttemptsRef.current < PENDING_ACK_FORCE_ATTEMPT) {
            // The pass is COUNTED here as well: an early return that left the
            // counter alone made this branch re-arm forever, which is the very
            // silent stall it is meant to bound.
            const waitPasses = ackAttemptsRef.current
            ackAttemptsRef.current = waitPasses + 1
            scheduleAckPass(pendingAckBackoffMs(waitPasses))
            return
        }
        if (decision === 'ack' && ackAttemptsRef.current >= PENDING_ACK_MAX_RESUBMITS) {
            // The server has said "not waiting for these" repeatedly: settle
            // locally (and stop the spinners) instead of re-submitting forever.
            console.warn(`[agent] 服务端已不再等待这些工具结果，本地结算: ${candidates.join(', ')}`)
            dispatch({ type: 'ack-pending', callIds: candidates })
            ackAttemptsRef.current = 0
            return
        }

        const waitPasses = ackAttemptsRef.current
        ackAttemptsRef.current = waitPasses + 1
        if (!toolBatchRef.current) {
            // Never submitted. Give a page switch / offscreen re-acquire a generous
            // moment — the retries back off 3s→20s — then submit anyway.
            if (!pendingAckForcesExecution(waitPasses)) {
                console.warn(
                    `[agent] 前端工具调用尚未提交（autoExecuteTools=${autoExecuteTools}，`
                    + `第 ${waitPasses + 1} 次等待）: ${candidates.join(', ')}`
                )
                scheduleAckPass(pendingAckBackoffMs(waitPasses))
                return
            }
            console.warn(
                `[agent] 前端工具调用长时间未提交，直接执行以免挂起`
                + `（autoExecuteTools=${autoExecuteTools}）: ${candidates.join(', ')}`
            )
        } else {
            // Submitted but unacknowledged. A parked server that does not list them
            // may be reading a stale hot state (the backend's known pause/state
            // race), so a bounded number of idempotent re-submits is safer than
            // trusting a single "not waiting" answer.
            console.warn(
                `[agent] 工具结果未被服务端确认，重新提交（第 ${waitPasses + 1} 次）`
                + (viewUnreadable ? '（服务端状态读取失败，按超时处理）' : '')
                + ` run ${current.runId} calls ${candidates.join(', ')}`
            )
        }
        toolBatchRef.current = null
        void executePendingTools()
        // The POST can be accepted and still dropped: stay armed so the batch is
        // re-submitted rather than left spinning with no further events.
        scheduleAckPass(pendingAckBackoffMs(ackAttemptsRef.current))
    }, [autoExecuteTools, client, dispatch, executePendingTools, scheduleAckPass])
    // The re-arm chain reads the latest check through a ref: the timer cannot
    // depend on a callback that depends on it.
    checkPendingAckRef.current = checkPendingAck

    useEffect(() => {
        const terminal = state.phase === 'completed' || state.phase === 'failed' || state.phase === 'cancelled'
        // Armed whenever this run still owes the server a frontend result — no
        // `waiting-tools` phase required: a lost suspend frame leaves the phase at
        // `streaming` while the tape still shows the calls running, and that is
        // exactly the case nothing else recovers. The replay watermark is NOT a
        // gate here either: `executePendingTools` re-syncs unknown calls from the
        // run view, so waiting for a replay that may never catch up is pointless.
        if (terminal || pendingCandidates.length === 0) {
            ackAttemptsRef.current = 0
            if (ackTimerRef.current) {
                clearTimeout(ackTimerRef.current)
                ackTimerRef.current = null
            }
            return
        }
        // Only an empty candidate set resets the backoff (the pass count lives
        // across events on purpose: a stream with nothing left to say is precisely
        // when the force pass has to happen). `scheduleAckPass` ignores a call while
        // a pass is already pending, so state churn cannot postpone it either.
        scheduleAckPass(pendingAckBackoffMs(ackAttemptsRef.current))
    }, [
        pendingCandidates, state.phase, state.lastSeq, state.toolRetryToken, scheduleAckPass,
    ])

    // Timers are owned here; clear them on unmount.
    useEffect(() => () => {
        if (toolRetryTimerRef.current) {
            clearTimeout(toolRetryTimerRef.current)
            toolRetryTimerRef.current = null
        }
        if (ackTimerRef.current) {
            clearTimeout(ackTimerRef.current)
            ackTimerRef.current = null
        }
    }, [])

    return { executePendingTools, retryPendingTools, resetPending, clearRetryTimer }
}
