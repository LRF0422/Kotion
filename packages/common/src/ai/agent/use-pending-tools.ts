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
import { createPendingToolBatch, matchesPendingToolBatch, type PendingToolBatch } from './tool-batch'
import { parseToolArgs, type ResumePayload } from './types'
import { MAX_TOOL_RESUME_RETRIES, isPermanentTransportError } from './retry-policy'
import type { Action, EditorAgentState } from './editor-agent-state'

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

    // Timers are owned here; clear them on unmount.
    useEffect(() => () => {
        if (toolRetryTimerRef.current) {
            clearTimeout(toolRetryTimerRef.current)
            toolRetryTimerRef.current = null
        }
    }, [])

    return { executePendingTools, retryPendingTools, resetPending, clearRetryTimer }
}
