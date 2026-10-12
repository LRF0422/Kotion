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
    pendingBatchIsEditorIndependent,
    pendingCallIdCandidates,
    type PendingToolBatch,
} from './tool-batch'
import { parseToolArgs, type ResumePayload } from './types'
import { MAX_TOOL_RESUME_RETRIES, isPermanentTransportError } from './retry-policy'
import type { Action, EditorAgentState } from './editor-agent-state'

/** Quiet period before re-submitting a batch the server never acknowledged. */
const PENDING_ACK_BASE_MS = 3_000
const PENDING_ACK_MAX_MS = 20_000
/**
 * Watchdog passes to wait for the editor/target gate before executing a batch it
 * never submitted (3s + 6s + 12s ≈ 21s). A page switch settles long before that,
 * while the server's own tool timeout is 600s.
 */
const PENDING_ACK_FORCE_ATTEMPT = 3
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
    const ackAttemptsRef = useRef(0)

    const retryPendingTools = useCallback(() => {
        toolBatchRef.current = null
        toolRetryAttemptRef.current = 0
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
        toolRetryAttemptRef.current = 0
        toolRetryKeyRef.current = ''
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
     */
    const checkPendingAck = useCallback(async () => {
        const current = stateRef.current
        if (!mountedRef.current || submittingRef.current || !current.runId) return
        const candidates = pendingCallIdCandidates(current.pendingToolIds, current.toolCalls)
        if (candidates.length === 0) return

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
                    return
                }
            }
        }

        const decision = decidePendingAck(view, candidates)
        if (decision === 'wait') return
        if (decision === 'ack' && ackAttemptsRef.current >= PENDING_ACK_MAX_RESUBMITS) {
            // The server has said "not waiting for these" repeatedly: settle
            // locally (and stop the spinners) instead of re-submitting forever.
            console.warn(`[agent] 服务端已不再等待这些工具结果，本地结算: ${candidates.join(', ')}`)
            dispatch({ type: 'ack-pending', callIds: candidates })
            ackAttemptsRef.current = 0
            return
        }

        ackAttemptsRef.current += 1
        if (!toolBatchRef.current) {
            // Never submitted. Give a page switch / offscreen re-acquire a generous
            // moment — the retries back off 3s→20s — then submit anyway.
            if (ackAttemptsRef.current < PENDING_ACK_FORCE_ATTEMPT) {
                console.warn(
                    `[agent] 前端工具调用尚未提交（autoExecuteTools=${autoExecuteTools}，`
                    + `第 ${ackAttemptsRef.current} 次等待）: ${candidates.join(', ')}`
                )
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
                `[agent] 工具结果未被服务端确认，重新提交（第 ${ackAttemptsRef.current} 次）`
                + ` run ${current.runId} calls ${candidates.join(', ')}`
            )
        }
        toolBatchRef.current = null
        void executePendingTools()
    }, [autoExecuteTools, client, dispatch, executePendingTools])

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
        // Any event (lastSeq) or new batch re-arms this: the watchdog only fires
        // after a quiet period, so a server that is still streaming is left alone.
        if (ackTimerRef.current) clearTimeout(ackTimerRef.current)
        const delay = Math.min(
            PENDING_ACK_BASE_MS * 2 ** Math.min(ackAttemptsRef.current, 3),
            PENDING_ACK_MAX_MS
        )
        ackTimerRef.current = setTimeout(() => {
            ackTimerRef.current = null
            void checkPendingAck()
        }, delay)
        return () => {
            if (ackTimerRef.current) {
                clearTimeout(ackTimerRef.current)
                ackTimerRef.current = null
            }
        }
    }, [
        pendingCandidates, state.phase, state.lastSeq, state.toolRetryToken, checkPendingAck,
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
