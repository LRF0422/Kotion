/**
 * usePendingToolExecution — executes frontend (editor) tool calls for the
 * active run and resumes it, with callId-idempotent journals and bounded
 * re-submits. Extracted from useEditorAgent so the run hook is not also the
 * tool-execution owner.
 */

import { useCallback, useEffect, useRef } from 'react'
import type { Dispatch, MutableRefObject } from 'react'
import type { AgentClient } from './client'
import { AgentControlError } from './events'
import type { EditorToolExecutor, ToolExecutionResult } from './tool-executor'
import type { AgentRunStore } from './persistence'
import { createPendingToolBatch, decidePendingAck, matchesPendingToolBatch, type PendingToolBatch } from './tool-batch'
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
        generationRef, mountedRef, attachReplayThroughRef, autoExecuteTools,
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
        if (!current.runId || current.pendingToolIds.length === 0) return
        const callIds = [...current.pendingToolIds]
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

    // Auto-execute frontend tools when the run pauses for them.
    useEffect(() => {
        if (!autoExecuteTools
            || state.phase !== 'waiting-tools'
            || state.pendingToolIds.length === 0
            || state.lastSeq < attachReplayThroughRef.current) {
            return
        }
        void executePendingTools()
    }, [autoExecuteTools, state.phase, state.pendingToolIds, state.lastSeq, state.toolRetryToken, executePendingTools])

    /**
     * Watchdog for the conversation's OWN tool batch. It covers the two ways a
     * parent-run batch strands forever while the server waits:
     *
     *  1. it was never submitted at all — `autoExecuteTools`
     *     (`targetToolsReady && !!agentEditor`) stayed false because the edit
     *     target/editor is not ready (user navigated away, plugin page without a
     *     document, offscreen session released). Nothing else re-evaluates the
     *     batch, so the run parks until its tool timeout with every call spinning
     *     in the UI and no tool ever running;
     *  2. it was submitted but the server never acknowledged it — the backend can
     *     accept a resume with a 200 and still drop the payload (its pause
     *     announcement races its published state).
     *
     * Either way the fix is the same: after a quiet period, submit/re-submit from
     * the tape. Editor-independent tools (file/studio/plugin tools, which is most
     * of them) then just work; a tool that truly needs the missing editor fails
     * with its own error result, which the model can react to — far better than a
     * guaranteed ten-minute hang. Results come from the executor cache / journal,
     * so nothing is executed twice.
     */
    const checkPendingAck = useCallback(async () => {
        const current = stateRef.current
        if (!mountedRef.current || submittingRef.current || !current.runId) return
        if (current.phase !== 'waiting-tools' || current.pendingToolIds.length === 0) return
        const pendingIds = [...current.pendingToolIds]

        if (!current.runId || !toolBatchRef.current) {
            // Never submitted (case 1). Give a page switch / offscreen re-acquire
            // a generous moment — the retries back off 3s→20s — then submit anyway:
            // an editor-independent tool (file / studio / plugin tools, which is
            // most of the catalog) just works, and one that truly needs the editor
            // fails with its own error result instead of hanging the run until its
            // ten-minute tool timeout.
            if (ackAttemptsRef.current < PENDING_ACK_FORCE_ATTEMPT) {
                ackAttemptsRef.current += 1
                console.warn(
                    `[agent] 前端工具调用尚未提交（autoExecuteTools=${autoExecuteTools}，`
                    + `第 ${ackAttemptsRef.current} 次等待）: ${pendingIds.join(', ')}`
                )
                return
            }
            ackAttemptsRef.current += 1
            console.warn(
                `[agent] 前端工具调用长时间未提交，直接执行以免挂起`
                + `（autoExecuteTools=${autoExecuteTools}）: ${pendingIds.join(', ')}`
            )
            void executePendingTools()
            return
        }

        const generation = generationRef.current
        let view: { status: string; pendingTools?: Array<{ callId: string }> } | null = null
        try {
            view = await client.getRun(current.runId)
        } catch {
            view = null
        }
        if (!mountedRef.current || generation !== generationRef.current) return
        const decision = decidePendingAck(view, pendingIds)
        if (decision === 'wait') return
        if (decision === 'ack') {
            // The server is not waiting for these anymore: settle locally instead
            // of re-submitting a batch it already applied.
            dispatch({ type: 'ack-pending', callIds: pendingIds })
            ackAttemptsRef.current = 0
            return
        }
        ackAttemptsRef.current += 1
        console.warn(
            `[agent] 工具结果未被服务端确认，重新提交（第 ${ackAttemptsRef.current} 次）`
            + ` run ${current.runId} calls ${pendingIds.join(', ')}`
        )
        toolBatchRef.current = null
        void executePendingTools()
    }, [autoExecuteTools, client, dispatch, executePendingTools])

    useEffect(() => {
        if (state.phase !== 'waiting-tools'
            || state.pendingToolIds.length === 0
            || state.lastSeq < attachReplayThroughRef.current) {
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
        autoExecuteTools, state.phase, state.pendingToolIds, state.lastSeq,
        state.toolRetryToken, attachReplayThroughRef, checkPendingAck,
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
