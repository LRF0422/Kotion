/**
 * useEditorAgent — the editor-facing React hook over the AgentCore SDK.
 *
 * Owns one run's lifecycle: start / attach (断点恢复) / resume / cancel, the
 * typed event stream, frontend tool auto-execution, plan approval and budget
 * continuation. The host supplies the editor tool specs + executables; the
 * hook never touches editor internals.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import type { OnToolExecution, ToolsRecord } from '../types'
import { AgentClient } from './client'
import { EditorToolExecutor } from './tool-executor'
import { RunLock, RunStore } from './run-store'
import type {
    AgentChatMessage,
    AgentEvent,
    AgentSkillInput,
    AgentToolSpec,
    ResumePayload,
} from './types'
import { parseToolArgs } from './types'

// ==================== state ====================

export type EditorAgentPhase =
    | 'idle' | 'creating' | 'streaming' | 'waiting-tools'
    | 'waiting-approval' | 'suspended' | 'completed' | 'failed' | 'cancelled'

export interface ToolCallRecord {
    callId: string
    tool: string
    args: Record<string, any>
    status: 'running' | 'success' | 'error'
    result?: unknown
    error?: string
    durationMs?: number
}

export interface SubRunRecord {
    callId: string
    subRunId: string
    task?: string
    status: 'running' | 'completed' | 'failed'
    result?: unknown
    error?: string
}

export interface EditorAgentState {
    phase: EditorAgentPhase
    runId: string | null
    lastSeq: number
    /** Accumulated assistant text (rebuilt from assistantText on attach). */
    text: string
    reasoning: string
    step: number
    toolCalls: ToolCallRecord[]
    subRuns: SubRunRecord[]
    plan: { callId: string; text: string } | null
    pendingToolIds: string[]
    suspendReason: string | null
    error: string | null
    finishReason: string | null
}

const initialState: EditorAgentState = {
    phase: 'idle',
    runId: null,
    lastSeq: 0,
    text: '',
    reasoning: '',
    step: 0,
    toolCalls: [],
    subRuns: [],
    plan: null,
    pendingToolIds: [],
    suspendReason: null,
    error: null,
    finishReason: null,
}

type Action =
    | { type: 'reset' }
    | { type: 'run-created'; runId: string; lastSeq: number; text: string; phase: EditorAgentPhase }
    | { type: 'restore-pending'; records: ToolCallRecord[] }
    | { type: 'event'; event: AgentEvent }
    | { type: 'tool-result'; callId: string; ok: boolean; result?: unknown; error?: string }
    | { type: 'error'; error: string }

function reducer(state: EditorAgentState, action: Action): EditorAgentState {
    switch (action.type) {
        case 'reset':
            return { ...initialState }
        case 'run-created':
            return {
                ...initialState,
                phase: action.phase,
                runId: action.runId,
                lastSeq: action.lastSeq,
                text: action.text,
            }
        case 'restore-pending': {
            const known = new Set(state.toolCalls.map(call => call.callId))
            const merged = [
                ...state.toolCalls,
                ...action.records.filter(record => !known.has(record.callId)),
            ]
            return {
                ...state,
                phase: 'waiting-tools',
                toolCalls: merged,
                pendingToolIds: action.records.map(record => record.callId),
            }
        }
        case 'tool-result': {
            const toolCalls = state.toolCalls.map(call =>
                call.callId === action.callId
                    ? ({
                        ...call,
                        status: (action.ok ? 'success' : 'error') as ToolCallRecord['status'],
                        result: action.result,
                        error: action.error,
                    } as ToolCallRecord)
                    : call
            )
            const pendingToolIds = state.pendingToolIds.filter(id => id !== action.callId)
            return { ...state, toolCalls, pendingToolIds }
        }
        case 'error':
            return { ...state, phase: 'failed', error: action.error }
        case 'event':
            return applyEvent(state, action.event)
        default:
            return state
    }
}

function applyEvent(state: EditorAgentState, event: AgentEvent): EditorAgentState {
    const next = { ...state, lastSeq: Math.max(state.lastSeq, event.seq) }
    switch (event.type) {
        case 'run.created':
            return { ...next, runId: event.runId, phase: 'streaming' }
        case 'step.started':
            return { ...next, step: event.step, phase: 'streaming' }
        case 'text.delta':
            return { ...next, text: next.text + event.content }
        case 'reasoning.delta':
            return { ...next, reasoning: next.reasoning + event.content }
        case 'tool.requested':
            return {
                ...next,
                toolCalls: [
                    ...next.toolCalls,
                    {
                        callId: event.callId,
                        tool: event.tool,
                        args: parseToolArgs(event.args),
                        status: 'running',
                    },
                ],
            }
        case 'tool.completed':
            return {
                ...next,
                toolCalls: next.toolCalls.map(call =>
                    call.callId === event.callId
                        ? {
                            ...call,
                            status: event.ok ? 'success' : 'error',
                            result: event.result,
                            error: event.error,
                            durationMs: event.durationMs,
                        }
                        : call
                ),
            }
        case 'sub.spawned':
            return {
                ...next,
                subRuns: [
                    ...next.subRuns,
                    { callId: event.callId, subRunId: event.subRunId, task: event.task, status: 'running' },
                ],
            }
        case 'sub.completed':
            return {
                ...next,
                subRuns: next.subRuns.map(sub =>
                    sub.subRunId === event.subRunId
                        ? { ...sub, status: event.ok ? 'completed' : 'failed', result: event.result }
                        : sub
                ),
            }
        case 'sub.failed':
            return {
                ...next,
                subRuns: next.subRuns.map(sub =>
                    sub.subRunId === event.subRunId ? { ...sub, status: 'failed', error: event.error } : sub
                ),
            }
        case 'plan.proposed':
            return {
                ...next,
                plan: { callId: event.callId, text: tryParsePlan(event.plan) },
                phase: 'waiting-approval',
            }
        case 'run.suspended':
            if (event.reason === 'waiting_tools') {
                return {
                    ...next,
                    phase: 'waiting-tools',
                    pendingToolIds: event.pendingCallIds ?? next.pendingToolIds,
                    suspendReason: event.reason,
                }
            }
            return { ...next, phase: event.reason === 'budget' ? 'suspended' : next.phase, suspendReason: event.reason }
        case 'run.completed':
            return { ...next, phase: 'completed', finishReason: event.finishReason ?? 'stop' }
        case 'run.failed':
            return { ...next, phase: 'failed', error: event.error ?? event.code ?? 'unknown error' }
        case 'run.cancelled':
            return { ...next, phase: 'cancelled' }
        default:
            return next
    }
}

function tryParsePlan(raw: string): string {
    try {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object' && parsed.plan) return typeof parsed.plan === 'string' ? parsed.plan : JSON.stringify(parsed.plan, null, 2)
        return raw
    } catch {
        return raw
    }
}

// ==================== hook ====================

export interface UseEditorAgentOptions {
    conversationId: string
    /** Client-declared editor tool specs (host builds them from its registry). */
    tools: AgentToolSpec[]
    /** Live editor-bound tool executables keyed by name. */
    resolveTools: () => ToolsRecord | Promise<ToolsRecord>
    skills?: AgentSkillInput[]
    spaceId?: string
    pageId?: string
    client?: AgentClient
    onToolExecution?: OnToolExecution
    /** Execute frontend tool calls automatically and resume (editor UX). */
    autoExecuteTools?: boolean
    /** Persist the run handle for refresh re-attach. */
    persist?: boolean
    store?: RunStore
}

export interface StartTurnOptions {
    model?: string
    mode?: 'execute' | 'plan'
    temperature?: number
    maxTokens?: number
}

export interface EditorAgentApi {
    state: EditorAgentState
    start: (messages: AgentChatMessage[], options?: StartTurnOptions) => Promise<void>
    /** Re-attach to a saved run (断点恢复). Returns false when nothing to restore. */
    attach: (runId?: string) => Promise<boolean>
    approvePlan: (approved: boolean, feedback?: string) => Promise<void>
    continueRun: () => Promise<void>
    cancel: () => Promise<void>
    reset: () => void
}

export function useEditorAgent(options: UseEditorAgentOptions): EditorAgentApi {
    const {
        conversationId, tools, resolveTools, skills, spaceId, pageId, onToolExecution,
        autoExecuteTools = true, persist = true, store: providedStore,
    } = options

    const client = useMemo(() => options.client ?? new AgentClient(), [options.client])
    const store = useMemo(() => providedStore ?? new RunStore(), [providedStore])
    const lock = useMemo(() => new RunLock(), [])

    const [state, dispatch] = useReducer(reducer, initialState)

    const abortRef = useRef<AbortController | null>(null)
    const stateRef = useRef(state)
    stateRef.current = state

    const executor = useMemo(
        () => new EditorToolExecutor({ resolveTools, onExecution: onToolExecution }),
        [resolveTools, onToolExecution]
    )

    const startStream = useCallback(
        (runId: string, afterSeq: number) => {
            abortRef.current?.abort()
            const controller = new AbortController()
            abortRef.current = controller
            void (async () => {
                try {
                    for await (const event of client.streamEvents(runId, afterSeq, controller.signal)) {
                        if (controller.signal.aborted) return
                        dispatch({ type: 'event', event })
                        if (persist && event.seq % 5 === 0) {
                            store.updateLastSeq(conversationId, event.seq, stateRef.current.phase)
                        }
                    }
                } catch (error: any) {
                    if (!controller.signal.aborted) {
                        dispatch({ type: 'error', error: error?.message ?? String(error) })
                    }
                }
            })()
        },
        [client, conversationId, persist, store]
    )

    const finishRun = useCallback(() => {
        abortRef.current?.abort()
        lock.release()
        store.clear(conversationId)
    }, [conversationId, lock, store])

    const start = useCallback(
        async (messages: AgentChatMessage[], opts: StartTurnOptions = {}) => {
            abortRef.current?.abort()
            dispatch({ type: 'reset' })
            const run = await client.createRun({
                conversationId,
                messages,
                tools,
                skills,
                spaceId,
                pageId,
                model: opts.model,
                mode: opts.mode,
                temperature: opts.temperature,
                maxTokens: opts.maxTokens,
            })
            if (persist) {
                store.save({ conversationId, runId: run.runId, lastSeq: 0, status: run.status, updatedAt: Date.now() })
            }
            lock.acquire(run.runId)
            dispatch({ type: 'run-created', runId: run.runId, lastSeq: 0, text: '', phase: 'streaming' })
            startStream(run.runId, 0)
        },
        [client, conversationId, tools, skills, spaceId, pageId, persist, store, lock, startStream]
    )

    const resumeWith = useCallback(
        async (payload: ResumePayload) => {
            const current = stateRef.current
            if (!current.runId) return
            // The resume POST re-opens the event stream (replay from lastSeq +
            // live tail); abort the previous stream first so only one consumer
            // applies events.
            abortRef.current?.abort()
            const controller = new AbortController()
            abortRef.current = controller
            void (async () => {
                try {
                    for await (const event of client.resume(current.runId!, payload, current.lastSeq, controller.signal)) {
                        if (controller.signal.aborted) return
                        dispatch({ type: 'event', event })
                    }
                    // Resume stream ended without terminal event (proxy cut the
                    // connection). Fall back to the reconnecting streamEvents so
                    // the run doesn't appear stuck.
                    if (!controller.signal.aborted) {
                        const s = stateRef.current
                        if (s.runId && s.phase !== 'completed' && s.phase !== 'failed' && s.phase !== 'cancelled') {
                            startStream(s.runId, s.lastSeq)
                        }
                    }
                } catch (error: any) {
                    if (!controller.signal.aborted) {
                        dispatch({ type: 'error', error: error?.message ?? String(error) })
                    }
                }
            })()
        },
        [client, startStream]
    )

    const executePendingTools = useCallback(async () => {
        const current = stateRef.current
        if (!current.runId) return
        const results: { callId: string; ok: boolean; result?: unknown; error?: string }[] = []
        for (const callId of current.pendingToolIds) {
            const record = current.toolCalls.find(call => call.callId === callId)
            if (!record) continue
            const outcome = await executor.execute(callId, record.tool, record.args)
            dispatch({ type: 'tool-result', callId, ok: outcome.ok, result: outcome.result, error: outcome.error })
            results.push({ callId, ...outcome })
        }
        await resumeWith({ action: 'tool_results', toolResults: results })
    }, [executor, resumeWith])

    // Auto-execute frontend tools when the run pauses for them.
    useEffect(() => {
        if (!autoExecuteTools || state.phase !== 'waiting-tools' || state.pendingToolIds.length === 0) {
            return
        }
        void executePendingTools()
    }, [autoExecuteTools, state.phase, state.pendingToolIds, executePendingTools])

    const attach = useCallback(
        async (runId?: string): Promise<boolean> => {
            const saved = runId ? { runId, lastSeq: 0 } : store.load(conversationId)
            if (!saved) return false
            const view = await client.getRun(saved.runId)
            if (!view) return false
            dispatch({
                type: 'run-created',
                runId: view.runId,
                lastSeq: view.lastSeq,
                text: view.assistantText ?? '',
                phase: 'streaming',
            })
            if (view.status === 'COMPLETED') {
                dispatch({ type: 'event', event: { seq: view.lastSeq, type: 'run.completed', finishReason: view.finishReason } })
                return true
            }
            if (view.status === 'FAILED') {
                dispatch({ type: 'event', event: { seq: view.lastSeq, type: 'run.failed', code: view.errorCode, error: view.errorMessage } })
                return true
            }
            if (view.status === 'CANCELLED') {
                dispatch({ type: 'event', event: { seq: view.lastSeq, type: 'run.cancelled' } })
                return true
            }
            lock.acquire(view.runId)
            startStream(view.runId, view.lastSeq)
            if (view.status === 'WAITING_TOOLS' && view.pendingTools.length > 0 && autoExecuteTools) {
                dispatch({
                    type: 'restore-pending',
                    records: view.pendingTools.map(pending => ({
                        callId: pending.callId,
                        tool: pending.tool,
                        args: parseToolArgs(pending.argsJson),
                        status: 'running',
                    })),
                })
            }
            return true
        },
        [client, conversationId, lock, store, startStream, autoExecuteTools, executePendingTools]
    )

    const approvePlan = useCallback(
        async (approved: boolean, feedback?: string) => {
            await resumeWith({ action: 'approve_plan', planDecision: { approved, feedback } })
        },
        [resumeWith]
    )

    const continueRun = useCallback(async () => {
        await resumeWith({ action: 'continue' })
    }, [resumeWith])

    const cancel = useCallback(async () => {
        const current = stateRef.current
        abortRef.current?.abort()
        if (current.runId) {
            await client.cancelRun(current.runId).catch(() => undefined)
        }
        lock.release()
        store.clear(conversationId)
        dispatch({ type: 'event', event: { seq: current.lastSeq, type: 'run.cancelled' } })
    }, [client, conversationId, lock, store])

    const reset = useCallback(() => {
        abortRef.current?.abort()
        lock.release()
        store.clear(conversationId)
        dispatch({ type: 'reset' })
    }, [conversationId, lock, store])

    // Cleanup on unmount: release the stream (keep the stored handle for re-attach).
    useEffect(() => {
        return () => {
            abortRef.current?.abort()
            lock.release()
        }
    }, [lock])

    return { state, start, attach, approvePlan, continueRun, cancel, reset }
}
