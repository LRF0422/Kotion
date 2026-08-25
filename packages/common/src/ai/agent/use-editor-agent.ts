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
import { AgentControlError } from './events'
import { createPendingToolBatch, matchesPendingToolBatch, type PendingToolBatch } from './tool-batch'
import { EditorToolExecutor, type ToolExecutionResult } from './tool-executor'
import { RunLock, RunStore } from './run-store'
import type {
    AgentChatMessage,
    AgentEvent,
    AgentSkillInput,
    AgentToolSpec,
    ResumePayload,
    RunUsage,
} from './types'
import { parseToolArgs, TERMINAL_EVENT_TYPES } from './types'

const MAX_OUTER_RECONNECTS = 5
const MAX_TOOL_RESUME_RETRIES = 5
const MAX_ATTACH_RETRIES = 5
const RESUME_FIRST_EVENT_TIMEOUT_MS = 10_000

function isPermanentTransportError(error: unknown): boolean {
    if (error instanceof AgentControlError) {
        return error.code !== 'RUN_BUSY'
    }
    const message = error instanceof Error ? error.message : String(error)
    return /\((400|401|403|404)\)/.test(message)
}

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
    /** Token accounting for the finished run (includes the cache-hit share). */
    usage: RunUsage | null
    /** Internal nonce used to retry an unchanged pending-tool batch. */
    toolRetryToken: number
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
    usage: null,
    toolRetryToken: 0,
}

type Action =
    | { type: 'reset' }
    | { type: 'creating' }
    | { type: 'run-created'; runId: string; lastSeq: number; text: string; phase: EditorAgentPhase }
    | { type: 'restore-pending'; records: ToolCallRecord[] }
    | { type: 'event'; event: AgentEvent }
    | { type: 'tool-result'; callId: string; ok: boolean; result?: unknown; error?: string }
    | { type: 'transport-error'; error: string }
    | { type: 'connection-stopped'; error: string }
    | { type: 'transport-restored' }
    | { type: 'retry-pending-tools' }
    | { type: 'retry-connection' }
    | { type: 'error'; error: string }

function reducer(state: EditorAgentState, action: Action): EditorAgentState {
    switch (action.type) {
        case 'reset':
            return { ...initialState }
        case 'creating':
            return { ...initialState, phase: 'creating' }
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
            return { ...state, toolCalls }
        }
        case 'transport-error':
            return { ...state, error: action.error }
        case 'connection-stopped':
            return {
                ...state,
                phase: 'suspended',
                suspendReason: state.suspendReason ?? 'transport',
                error: action.error,
            }
        case 'transport-restored':
            return state.error ? { ...state, error: null } : state
        case 'retry-pending-tools':
            return { ...state, toolRetryToken: state.toolRetryToken + 1 }
        case 'retry-connection': {
            const phase = state.pendingToolIds.length > 0
                ? 'waiting-tools'
                : state.suspendReason === 'plan_approval'
                    ? 'waiting-approval'
                    : state.suspendReason === 'budget'
                        ? 'suspended'
                        : 'streaming'
            return {
                ...state,
                phase,
                suspendReason: state.suspendReason === 'transport' ? null : state.suspendReason,
                error: null,
            }
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
            return { ...next, step: event.step, phase: 'streaming', suspendReason: null }
        case 'text.delta':
            return { ...next, text: next.text + event.content }
        case 'reasoning.delta':
            return { ...next, reasoning: next.reasoning + event.content }
        case 'tool.requested': {
            const existing = next.toolCalls.find(call => call.callId === event.callId)
            if (existing) return next
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
        }
        case 'tool.completed':
            return {
                ...next,
                error: null,
                pendingToolIds: next.pendingToolIds.filter(id => id !== event.callId),
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
                suspendReason: 'plan_approval',
            }
        case 'run.suspended':
            if (event.reason === 'waiting_tools') {
                return {
                    ...next,
                    phase: 'waiting-tools',
                    pendingToolIds: event.pendingCallIds ?? next.pendingToolIds,
                    suspendReason: event.reason,
                    error: null,
                }
            }
            return { ...next, phase: event.reason === 'budget' ? 'suspended' : next.phase, suspendReason: event.reason }
        case 'run.completed':
            return {
                ...next,
                phase: 'completed',
                finishReason: event.finishReason ?? 'stop',
                usage: event.usage ?? next.usage,
            }
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
    retryConnection: () => void
    cancel: () => Promise<boolean>
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
    const mountedRef = useRef(true)
    const generationRef = useRef(0)
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const reconnectAttemptRef = useRef(0)
    const attachRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const attachRetryAttemptRef = useRef(0)
    const attachReplayThroughRef = useRef(0)
    const toolRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const toolRetryAttemptRef = useRef(0)
    const toolRetryKeyRef = useRef('')
    const controlResumeRef = useRef<Promise<void> | null>(null)
    const startInFlightRef = useRef<Promise<void> | null>(null)
    const toolBatchRef = useRef<PendingToolBatch | null>(null)
    const conversationRef = useRef(conversationId)
    const stateRef = useRef(state)
    const startStreamRef = useRef<(runId: string, afterSeq: number, generation: number) => void>(() => undefined)
    const attachRef = useRef<(runId?: string) => Promise<boolean>>(async () => false)
    stateRef.current = state

    const executor = useMemo(
        () => new EditorToolExecutor({ resolveTools, onExecution: onToolExecution }),
        [resolveTools, onToolExecution]
    )

    const startStream = useCallback(
        (runId: string, afterSeq: number, generation = generationRef.current) => {
            if (!mountedRef.current || generation !== generationRef.current) return
            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current)
                reconnectTimerRef.current = null
            }
            abortRef.current?.abort()
            const controller = new AbortController()
            abortRef.current = controller
            void (async () => {
                let cursor = afterSeq
                let receivedAny = false
                try {
                    for await (const event of client.streamEvents(runId, afterSeq, controller.signal)) {
                        if (controller.signal.aborted || generation !== generationRef.current) return
                        if (!receivedAny) {
                            receivedAny = true
                            reconnectAttemptRef.current = 0
                            dispatch({ type: 'transport-restored' })
                        }
                        cursor = event.seq
                        dispatch({ type: 'event', event })
                        if (persist && event.seq % 5 === 0) {
                            store.updateLastSeq(conversationId, event.seq, stateRef.current.phase)
                        }
                    }
                } catch (error: any) {
                    if (controller.signal.aborted || generation !== generationRef.current) return
                    const message = error?.message ?? String(error)
                    const attempt = reconnectAttemptRef.current++
                    if (isPermanentTransportError(error) || attempt >= MAX_OUTER_RECONNECTS) {
                        dispatch({ type: 'connection-stopped', error: message })
                        return
                    }
                    dispatch({ type: 'transport-error', error: message })
                    const delay = Math.min(30_000, 1000 * Math.pow(2, attempt))
                    reconnectTimerRef.current = setTimeout(() => {
                        if (!mountedRef.current || generation !== generationRef.current) return
                        const latest = stateRef.current
                        if (latest.runId === runId
                            && latest.phase !== 'completed'
                            && latest.phase !== 'failed'
                            && latest.phase !== 'cancelled') {
                            startStreamRef.current(runId, cursor, generation)
                        }
                    }, delay)
                }
            })()
        },
        [client, conversationId, persist, store]
    )
    startStreamRef.current = startStream

    const start = useCallback(
        (messages: AgentChatMessage[], opts: StartTurnOptions = {}): Promise<void> => {
            if (startInFlightRef.current) return startInFlightRef.current
            const task = (async () => {
                const requestGeneration = generationRef.current
            const acquired = await lock.acquire(conversationId)
            if (!mountedRef.current || requestGeneration !== generationRef.current) {
                if (acquired && lock.owns(conversationId)) lock.release(acquired)
                return
            }
            if (!acquired) {
                const error = new Error('该会话正在另一个标签页中运行')
                dispatch({ type: 'transport-error', error: error.message })
                throw error
            }
            const generation = ++generationRef.current
            abortRef.current?.abort()
            toolBatchRef.current = null
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
            if (attachRetryTimerRef.current) clearTimeout(attachRetryTimerRef.current)
            if (toolRetryTimerRef.current) clearTimeout(toolRetryTimerRef.current)
            reconnectAttemptRef.current = 0
            attachRetryAttemptRef.current = 0
            attachReplayThroughRef.current = 0
            toolRetryAttemptRef.current = 0
            toolRetryKeyRef.current = ''
            executor.clearCache()
            dispatch({ type: 'creating' })
            let previousActiveRunId: string | undefined
            let createAttempted = false
            try {
                try {
                    previousActiveRunId = (await client.getThread(conversationId, true))?.activeRunId
                } catch (error: any) {
                    if (!(error?.message ?? '').includes('会话不存在')) throw error
                }
                if (!mountedRef.current || generation !== generationRef.current) return
                createAttempted = true
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
                if (!mountedRef.current || generation !== generationRef.current) {
                    await client.cancelRun(run.runId).catch(() => undefined)
                    return
                }
                if (persist) {
                    store.save({ conversationId, runId: run.runId, lastSeq: 0, status: run.status, updatedAt: Date.now() })
                }
                dispatch({ type: 'run-created', runId: run.runId, lastSeq: 0, text: '', phase: 'streaming' })
                startStream(run.runId, 0, generation)
            } catch (error: any) {
                if (!mountedRef.current || generation !== generationRef.current) return
                if (createAttempted) {
                    // The create may have committed server-side before its response
                    // was lost. Recover only a newly changed active-run id.
                    const thread = await client.getThread(conversationId).catch(() => null)
                    if (!mountedRef.current || generation !== generationRef.current) return
                    if (thread?.activeRunId
                        && thread.activeRunId !== previousActiveRunId
                        && generation === generationRef.current) {
                        if (persist) {
                            store.save({
                                conversationId,
                                runId: thread.activeRunId,
                                lastSeq: 0,
                                status: 'QUEUED',
                                updatedAt: Date.now(),
                            })
                        }
                        if (lock.owns(conversationId)) lock.release(acquired)
                        await attachRef.current(thread.activeRunId)
                        return
                    }
                }
                if (lock.owns(conversationId)) lock.release()
                dispatch({ type: 'error', error: error?.message ?? String(error) })
                throw error
            }
            })()
            let tracked: Promise<void>
            tracked = task.finally(() => {
                if (startInFlightRef.current === tracked) startInFlightRef.current = null
            })
            startInFlightRef.current = tracked
            return tracked
        },
        [client, conversationId, tools, skills, spaceId, pageId, persist, store, lock, executor, startStream]
    )

    const resumeWith = useCallback(
        async (runId: string, payload: ResumePayload, generation = generationRef.current) => {
            const current = stateRef.current
            if (current.runId !== runId || generation !== generationRef.current) return
            // The resume POST re-opens the event stream (replay from lastSeq +
            // live tail); abort the previous stream first so only one consumer
            // applies events.
            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current)
                reconnectTimerRef.current = null
            }
            abortRef.current?.abort()
            const controller = new AbortController()
            abortRef.current = controller
            let cursor = current.lastSeq
            try {
                const events = await client.resume(runId, payload, cursor, controller.signal)
                let firstTimer: ReturnType<typeof setTimeout> | undefined
                const first = payload.action === 'tool_results'
                    ? await Promise.race([
                        events.next(),
                        new Promise<never>((_, reject) => {
                            firstTimer = setTimeout(
                                () => reject(new Error('Agent resume timed out before the first event')),
                                RESUME_FIRST_EVENT_TIMEOUT_MS
                            )
                        }),
                    ]).finally(() => {
                        if (firstTimer) clearTimeout(firstTimer)
                    })
                    : await events.next()
                if (controller.signal.aborted || generation !== generationRef.current) return
                if (first.done) {
                    startStream(runId, cursor, generation)
                    return
                }
                cursor = first.value.seq
                reconnectAttemptRef.current = 0
                dispatch({ type: 'transport-restored' })
                dispatch({ type: 'event', event: first.value })
                if (TERMINAL_EVENT_TYPES.has(first.value.type)) {
                    await events.return(undefined)
                    return
                }

                void (async () => {
                    try {
                        for await (const event of events) {
                            if (controller.signal.aborted || generation !== generationRef.current) return
                            cursor = event.seq
                            dispatch({ type: 'event', event })
                        }
                        // Resume stream ended without terminal event (proxy cut the
                        // connection). Fall back to the reconnecting streamEvents so
                        // the run doesn't appear stuck.
                        if (!controller.signal.aborted && generation === generationRef.current) {
                            const latest = stateRef.current
                            if (latest.runId === runId
                                && latest.phase !== 'completed'
                                && latest.phase !== 'failed'
                                && latest.phase !== 'cancelled') {
                                startStream(runId, cursor, generation)
                            }
                        }
                    } catch (error: any) {
                        if (controller.signal.aborted || generation !== generationRef.current) return
                        const message = error?.message ?? String(error)
                        if (isPermanentTransportError(error)) {
                            dispatch({ type: 'connection-stopped', error: message })
                            return
                        }
                        dispatch({ type: 'transport-error', error: message })
                        startStream(runId, cursor, generation)
                    }
                })()
            } catch (error: any) {
                if (controller.signal.aborted || generation !== generationRef.current) return
                controller.abort()
                const message = error?.message ?? String(error)
                if (isPermanentTransportError(error)) {
                    dispatch({ type: 'connection-stopped', error: message })
                } else {
                    dispatch({ type: 'transport-error', error: message })
                    startStream(runId, cursor, generation)
                }
                throw error
            }
        },
        [client, startStream]
    )

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
                    outcome = await executor.execute(callId, record.tool, record.args)
                    if (!store.saveToolResult(current.runId, callId, outcome)) {
                        throw new AgentControlError(
                            'TOOL_RESULT_PERSIST_FAILED',
                            '工具已执行但结果无法持久化，为避免重复修改已停止自动恢复'
                        )
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

    const scheduleAttachRetry = useCallback((runId: string | undefined, generation: number, error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        const attempt = attachRetryAttemptRef.current++
        if (isPermanentTransportError(error) || attempt >= MAX_ATTACH_RETRIES) {
            dispatch({ type: 'connection-stopped', error: message })
            return
        }
        dispatch({ type: 'transport-error', error: message })
        if (attachRetryTimerRef.current) clearTimeout(attachRetryTimerRef.current)
        const delay = Math.min(10_000, 1000 * Math.pow(2, attempt))
        attachRetryTimerRef.current = setTimeout(() => {
            attachRetryTimerRef.current = null
            if (!mountedRef.current || generation !== generationRef.current) return
            void attachRef.current(runId)
        }, delay)
    }, [])

    const attach = useCallback(
        async (runId?: string): Promise<boolean> => {
            const requestGeneration = generationRef.current
            let saved = runId ? { runId, lastSeq: 0 } : store.load(conversationId)
            if (!saved) {
                try {
                    const activeRunId = (await client.getThread(conversationId, true))?.activeRunId
                    if (!mountedRef.current || requestGeneration !== generationRef.current || !activeRunId) return false
                    saved = { runId: activeRunId, lastSeq: 0 }
                } catch (error: any) {
                    if ((error?.message ?? '').includes('会话不存在')) return false
                    scheduleAttachRetry(runId, requestGeneration, error)
                    return false
                }
            }
            let acquiredClaim: number | null = null
            try {
                acquiredClaim = await lock.acquire(conversationId)
                if (!mountedRef.current || requestGeneration !== generationRef.current) {
                    if (acquiredClaim) lock.release(acquiredClaim)
                    return false
                }
                if (!acquiredClaim) {
                    scheduleAttachRetry(
                        runId,
                        requestGeneration,
                        new AgentControlError('RUN_BUSY', '该会话正在另一个标签页中运行')
                    )
                    return false
                }
                const view = await client.getRun(saved.runId)
                if (!mountedRef.current || requestGeneration !== generationRef.current || !view) return false
                if ((view.pageId ?? null) !== (pageId ?? null)
                    || (view.spaceId ?? null) !== (spaceId ?? null)) {
                    throw new AgentControlError(
                        'RUN_CONTEXT_MISMATCH',
                        '保存的 Agent 任务绑定了不同的页面，已阻止自动执行工具'
                    )
                }
                if (view.status === 'COMPLETED' || view.status === 'FAILED' || view.status === 'CANCELLED') {
                    lock.release(acquiredClaim)
                    acquiredClaim = null
                    dispatch({
                        type: 'run-created',
                        runId: view.runId,
                        lastSeq: view.lastSeq,
                        text: view.assistantText ?? '',
                        phase: 'streaming',
                    })
                    if (view.status === 'COMPLETED') {
                        dispatch({
                            type: 'event',
                            event: {
                                seq: view.lastSeq,
                                type: 'run.completed',
                                finishReason: view.finishReason,
                                usage: {
                                    promptTokens: view.promptTokens,
                                    completionTokens: view.completionTokens,
                                    cachedPromptTokens: view.cachedPromptTokens,
                                },
                            },
                        })
                    } else if (view.status === 'FAILED') {
                        dispatch({ type: 'event', event: { seq: view.lastSeq, type: 'run.failed', code: view.errorCode, error: view.errorMessage } })
                    } else {
                        dispatch({ type: 'event', event: { seq: view.lastSeq, type: 'run.cancelled' } })
                    }
                    attachRetryAttemptRef.current = 0
                    return true
                }
                if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
                if (attachRetryTimerRef.current) clearTimeout(attachRetryTimerRef.current)
                if (toolRetryTimerRef.current) clearTimeout(toolRetryTimerRef.current)
                reconnectAttemptRef.current = 0
                attachRetryAttemptRef.current = 0
                const generation = ++generationRef.current
                attachReplayThroughRef.current = Math.max(view.lastSeq, view.replayThroughSeq)
                dispatch({
                    type: 'run-created',
                    runId: view.runId,
                    lastSeq: view.lastSeq,
                    text: view.assistantText ?? '',
                    phase: 'streaming',
                })
                if (view.status === 'WAITING_TOOLS' && view.pendingTools.length > 0) {
                    dispatch({
                        type: 'restore-pending',
                        records: view.pendingTools.map(pending => ({
                            callId: pending.callId,
                            tool: pending.tool,
                            args: parseToolArgs(pending.argsJson),
                            status: 'running',
                        })),
                    })
                } else if (view.status === 'SUSPENDED'
                    && view.suspendReason === 'plan_approval'
                    && view.pendingPlanCallId
                    && view.pendingPlan) {
                    dispatch({
                        type: 'event',
                        event: {
                            seq: view.lastSeq,
                            type: 'plan.proposed',
                            callId: view.pendingPlanCallId,
                            plan: view.pendingPlan,
                        },
                    })
                } else if (view.status === 'SUSPENDED' && view.suspendReason === 'budget') {
                    dispatch({
                        type: 'event',
                        event: { seq: view.lastSeq, type: 'run.suspended', reason: 'budget' },
                    })
                }
                startStream(view.runId, view.lastSeq, generation)
                return true
            } catch (error: any) {
                if (acquiredClaim) lock.release(acquiredClaim)
                if (mountedRef.current && requestGeneration === generationRef.current) {
                    scheduleAttachRetry(runId, requestGeneration, error)
                }
                return false
            }
        },
        [client, conversationId, lock, pageId, scheduleAttachRetry, spaceId, store, startStream]
    )
    attachRef.current = attach

    const resumeControl = useCallback((payload: ResumePayload): Promise<void> => {
        if (controlResumeRef.current) return controlResumeRef.current
        const current = stateRef.current
        const generation = generationRef.current
        if (!current.runId) return Promise.resolve()
        // Approval and budget grants are not safe to auto-retry after an
        // ambiguous response: the first payload may already be queued.
        const task = resumeWith(current.runId, payload, generation)
        controlResumeRef.current = task.finally(() => {
            controlResumeRef.current = null
        })
        return controlResumeRef.current
    }, [resumeWith])

    const approvePlan = useCallback(
        async (approved: boolean, feedback?: string) => {
            await resumeControl({ action: 'approve_plan', planDecision: { approved, feedback } })
        },
        [resumeControl]
    )

    const continueRun = useCallback(async () => {
        await resumeControl({ action: 'continue' })
    }, [resumeControl])

    const retryConnection = useCallback(() => {
        const current = stateRef.current
        if (!current.runId) {
            attachRetryAttemptRef.current = 0
            dispatch({ type: 'reset' })
            void attachRef.current()
            return
        }
        reconnectAttemptRef.current = 0
        toolRetryAttemptRef.current = 0
        attachRetryAttemptRef.current = 0
        dispatch({ type: 'retry-connection' })
        if (current.pendingToolIds.length > 0) {
            toolBatchRef.current = null
            dispatch({ type: 'retry-pending-tools' })
        } else {
            startStream(current.runId, current.lastSeq, generationRef.current)
        }
    }, [startStream])

    const cancel = useCallback(async () => {
        const current = stateRef.current
        const ownsConversation = lock.owns(conversationId)
        generationRef.current += 1
        startInFlightRef.current = null
        abortRef.current?.abort()
        toolBatchRef.current = null
        executor.clearCache()
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
        if (attachRetryTimerRef.current) clearTimeout(attachRetryTimerRef.current)
        if (toolRetryTimerRef.current) clearTimeout(toolRetryTimerRef.current)
        reconnectAttemptRef.current = 0
        attachRetryAttemptRef.current = 0
        attachReplayThroughRef.current = 0
        toolRetryAttemptRef.current = 0
        toolRetryKeyRef.current = ''
        if (current.runId && ownsConversation) {
            try {
                await client.cancelRun(current.runId)
            } catch (error: any) {
                dispatch({ type: 'connection-stopped', error: error?.message ?? String(error) })
                return false
            }
        }
        const terminal = current.phase === 'completed' || current.phase === 'failed' || current.phase === 'cancelled'
        if (current.runId && (ownsConversation || terminal)) store.clearToolResults(current.runId)
        lock.release()
        if (ownsConversation || terminal) store.clear(conversationId)
        dispatch({ type: 'event', event: { seq: current.lastSeq, type: 'run.cancelled' } })
        return true
    }, [client, conversationId, lock, store, executor])

    const reset = useCallback(() => {
        const current = stateRef.current
        const ownsConversation = lock.owns(conversationId)
        const terminal = current.phase === 'completed' || current.phase === 'failed' || current.phase === 'cancelled'
        generationRef.current += 1
        startInFlightRef.current = null
        abortRef.current?.abort()
        toolBatchRef.current = null
        executor.clearCache()
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
        if (attachRetryTimerRef.current) clearTimeout(attachRetryTimerRef.current)
        if (toolRetryTimerRef.current) clearTimeout(toolRetryTimerRef.current)
        reconnectAttemptRef.current = 0
        attachRetryAttemptRef.current = 0
        attachReplayThroughRef.current = 0
        toolRetryAttemptRef.current = 0
        toolRetryKeyRef.current = ''
        if (current.runId && (ownsConversation || terminal)) store.clearToolResults(current.runId)
        lock.release()
        if (ownsConversation || terminal) store.clear(conversationId)
        dispatch({ type: 'reset' })
    }, [conversationId, lock, store, executor])

    // A single mounted chat component can switch conversations. Release only the
    // local stream/lock; keep the previous conversation's saved handle intact.
    useEffect(() => {
        if (conversationRef.current === conversationId) return
        generationRef.current += 1
        startInFlightRef.current = null
        abortRef.current?.abort()
        toolBatchRef.current = null
        executor.clearCache()
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
        if (attachRetryTimerRef.current) clearTimeout(attachRetryTimerRef.current)
        if (toolRetryTimerRef.current) clearTimeout(toolRetryTimerRef.current)
        reconnectAttemptRef.current = 0
        attachRetryAttemptRef.current = 0
        attachReplayThroughRef.current = 0
        toolRetryAttemptRef.current = 0
        toolRetryKeyRef.current = ''
        lock.release()
        conversationRef.current = conversationId
        dispatch({ type: 'reset' })
    }, [conversationId, executor, lock])

    // Cleanup on unmount: release the stream (keep the stored handle for re-attach).
    useEffect(() => {
        mountedRef.current = true
        return () => {
            mountedRef.current = false
            generationRef.current += 1
            startInFlightRef.current = null
            abortRef.current?.abort()
            toolBatchRef.current = null
            attachReplayThroughRef.current = 0
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
            if (attachRetryTimerRef.current) clearTimeout(attachRetryTimerRef.current)
            if (toolRetryTimerRef.current) clearTimeout(toolRetryTimerRef.current)
            lock.release()
        }
    }, [lock])

    return { state, start, attach, approvePlan, continueRun, retryConnection, cancel, reset }
}
