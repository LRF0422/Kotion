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
import { EditorToolExecutor, type ToolExecutionResult } from './tool-executor'
import { useSubRuns } from './use-sub-runs'
import { usePendingToolExecution } from './use-pending-tools'
import { useAgentStream } from './use-agent-stream'
import { isPermanentTransportError } from './retry-policy'
import { createAgentPersistence, type AgentRunStore, type AgentTabLock } from './persistence'
import type {
    AgentChatMessage,
    AgentEvent,
    AgentSkillInput,
    AgentToolSpec,
    ResumePayload,
    RunUsage,
} from './types'
import { parseToolArgs, TERMINAL_EVENT_TYPES } from './types'
import { getSessionPageBinding, type SessionPageBinding } from '../session-page-binding'
import { reducer, initialState } from './editor-agent-state'
import type {
    AgentStepRecord,
    EditorAgentPhase,
    EditorAgentState,
    SubRunRecord,
    ToolCallRecord,
} from './editor-agent-state'

// Re-exported so the existing public surface (@kn/common agent types) is
// unchanged after the state machine moved to its own module.
export type {
    AgentStepRecord,
    EditorAgentPhase,
    EditorAgentState,
    SubRunRecord,
    ToolCallRecord,
} from './editor-agent-state'

const MAX_ATTACH_RETRIES = 5

// ==================== hook ====================

export interface UseEditorAgentOptions {
    conversationId: string
    /** Client-declared editor tool specs (host builds them from its registry). */
    tools: AgentToolSpec[]
    /**
     * Live editor-bound tool executables keyed by name. The optional owner is a
     * delegated sub-run id; hosts that bind children to their own editor return
     * that agent's tools instead of the conversation's.
     */
    resolveTools: (owner?: string | null) => ToolsRecord | Promise<ToolsRecord>
    /**
     * Read-only classification (write-lease decision). Mutating calls from two
     * agents on the same document are serialized instead of interleaving.
     */
    isReadOnlyTool?: (name: string) => boolean
    skills?: AgentSkillInput[]
    /**
     * Extra system-prompt text appended by the backend after its base prompt.
     * Hosts pass their editor rules here (the backend cannot import them).
     */
    systemPrompt?: string
    spaceId?: string
    pageId?: string
    client?: AgentClient
    onToolExecution?: OnToolExecution
    /** Execute frontend tool calls automatically and resume (editor UX). */
    autoExecuteTools?: boolean
    /** Persist the run handle for refresh re-attach. */
    persist?: boolean
    /** Crash-recovery store; defaults to the host-registered persistence. */
    store?: AgentRunStore
    /** Cross-tab lock; defaults to the host-registered persistence. */
    lock?: AgentTabLock
    /**
     * Host resolver for the per-agent edit-target binding. Defaults to the
     * global registry for backward compatibility, but hosts should pass their
     * own so the SDK does not depend on a module-level singleton.
     */
    sessionBinding?: () => SessionPageBinding | null
}

export interface StartTurnOptions {
    model?: string
    mode?: 'execute' | 'plan'
    temperature?: number
    maxTokens?: number
    /**
     * Extra system-prompt text for THIS run only, appended after the host's
     * {@link UseEditorAgentOptions.systemPrompt}. It rides in the run's system
     * message (and checkpoint), never in the persisted user turn, so per-turn
     * context (e.g. the bound page) cannot leak into the visible transcript.
     */
    systemPrompt?: string
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
        conversationId, tools, resolveTools, skills, systemPrompt, spaceId, pageId, onToolExecution,
        autoExecuteTools = true, persist = true, store: providedStore, lock: providedLock,
    } = options
    const isReadOnlyTool = options.isReadOnlyTool

    const client = useMemo(() => options.client ?? new AgentClient(), [options.client])
    // Persistence is host-registered (contract in ./persistence); the SDK never
    // constructs browser storage itself.
    const persistence = useMemo(() => createAgentPersistence(), [])
    const store = useMemo(() => providedStore ?? persistence.store, [providedStore, persistence])
    const lock = useMemo(() => providedLock ?? persistence.lock, [providedLock, persistence])

    // Host binding is resolved through a ref so an identity-unstable getter (or
    // a host that registers its binding after mount) never recreates callbacks.
    const sessionBindingRef = useRef<() => SessionPageBinding | null>(
        options.sessionBinding ?? getSessionPageBinding
    )
    sessionBindingRef.current = options.sessionBinding ?? getSessionPageBinding
    /** Stable getter passed to collaborators (sub-run worker / executors). */
    const getSessionBinding = useCallback(() => sessionBindingRef.current(), [])

    const [state, dispatch] = useReducer(reducer, initialState)

    const abortRef = useRef<AbortController | null>(null)
    const mountedRef = useRef(true)
    const generationRef = useRef(0)
    const attachRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const attachRetryAttemptRef = useRef(0)
    const attachReplayThroughRef = useRef(0)
    const controlResumeRef = useRef<Promise<void> | null>(null)
    const startInFlightRef = useRef<Promise<void> | null>(null)
    const conversationRef = useRef(conversationId)
    const stateRef = useRef(state)
    const attachRef = useRef<(runId?: string) => Promise<boolean>>(async () => false)
    stateRef.current = state

    /**
     * Serialize mutating calls per document. The document is the page the owner
     * currently edits: the delegated child's own target when it has one, else
     * the conversation's target. No binding / no known page → no serialization
     * (single-editor hosts keep their existing behaviour).
     */
    const resolveDocumentId = useCallback((owner: string | null): string | null => {
        const binding = sessionBindingRef.current()
        if (!binding) return null
        // A forked (private) document is edited exclusively by its own agent, so
        // the shared-document write lease must not serialize it — that lease
        // exists for agents writing one document, which no longer happens.
        if (owner && binding.isOwnerIsolated?.(owner)) return null
        const page = (owner ? binding.getPageFor?.(owner) : binding.getPageFor?.(null))
            ?? binding.getBoundPage?.()
        const pageId = page?.pageId
        return pageId === undefined || pageId === null || pageId === '' ? null : String(pageId)
    }, [])

    const executor = useMemo(
        () => new EditorToolExecutor({
            resolveTools,
            isReadOnlyTool,
            resolveDocumentId,
            onExecution: onToolExecution,
            getSessionBinding,
        }),
        [resolveTools, isReadOnlyTool, resolveDocumentId, onToolExecution, getSessionBinding]
    )

    /**
     * Delegated children are driven by useSubRuns, not through the parent run:
     * each child gets its own stream + resume round-trips, so several children
     * can work (and touch their own documents) at the same time.
     */
    const { stopAll: stopSubRuns } = useSubRuns({
        client,
        store,
        executor,
        getSessionBinding,
        dispatch,
        subRuns: state.subRuns,
        toolCalls: state.toolCalls,
        mountedRef,
    })

    // Run SSE transport (live tail + reconnect + resume) is its own concern.
    const { startStream, resumeWith, resetReconnect, clearReconnectTimer } = useAgentStream({
        client,
        store,
        conversationId,
        persist,
        dispatch,
        stateRef,
        mountedRef,
        generationRef,
        abortRef,
    })

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
            resetPending()
            resetReconnect()
            if (attachRetryTimerRef.current) clearTimeout(attachRetryTimerRef.current)
            attachRetryAttemptRef.current = 0
            attachReplayThroughRef.current = 0
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
                // Host rules stay prefix-cacheable; a per-run fragment (the bound
                // page) is appended behind them for this run only.
                const runSystemPrompt = [systemPrompt, opts.systemPrompt]
                    .map(part => (part ?? '').trim())
                    .filter(part => part.length > 0)
                    .join('\n\n')
                const run = await client.createRun({
                    conversationId,
                    messages,
                    tools,
                    skills,
                    systemPrompt: runSystemPrompt.length > 0 ? runSystemPrompt : undefined,
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
        [client, conversationId, tools, skills, systemPrompt, spaceId, pageId, persist, store, lock, executor, startStream]
    )

    // Frontend tool execution is its own concern (see ./use-pending-tools).
    const { retryPendingTools, resetPending, clearRetryTimer } = usePendingToolExecution({
        client,
        store,
        executor,
        resumeWith,
        dispatch,
        state,
        stateRef,
        generationRef,
        mountedRef,
        attachReplayThroughRef,
        autoExecuteTools,
    })

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
                // The run is bound to its conversation, not to the page it was
                // started from: re-attaching on a different page is expected
                // (the agent survives navigation), so the old page-context
                // guard would wrongly strand a resumable run.
                if (view.status === 'COMPLETED' || view.status === 'FAILED' || view.status === 'CANCELLED') {
                    lock.release(acquiredClaim)
                    acquiredClaim = null
                    const generation = ++generationRef.current
                    attachReplayThroughRef.current = view.lastSeq
                    dispatch({
                        type: 'run-created',
                        runId: view.runId,
                        lastSeq: 0,
                        text: '',
                        phase: 'streaming',
                    })
                    startStream(view.runId, 0, generation)
                    attachRetryAttemptRef.current = 0
                    // Terminal run: drop the saved handle so a remount does not
                    // re-attach (and re-replay) the same finished run forever.
                    if (persist) store.clear(conversationId)
                    return true
                }
                resetReconnect()
                if (attachRetryTimerRef.current) clearTimeout(attachRetryTimerRef.current)
                clearRetryTimer()
                attachRetryAttemptRef.current = 0
                const generation = ++generationRef.current
                // An actively streaming run can be re-attached from the durable
                // watermark with the accumulated text, avoiding a full replay of
                // the event log (and its re-render). Paused runs need the
                // run.suspended/plan.proposed events to rebuild their state, so
                // they still replay from 0.
                if (view.status === 'RUNNING' && view.lastSeq > 0) {
                    attachReplayThroughRef.current = view.lastSeq
                    dispatch({
                        type: 'run-created',
                        runId: view.runId,
                        lastSeq: view.lastSeq,
                        text: view.assistantText ?? '',
                        phase: 'streaming',
                    })
                    startStream(view.runId, view.lastSeq, generation)
                } else {
                    attachReplayThroughRef.current = Math.max(view.lastSeq, view.replayThroughSeq)
                    dispatch({
                        type: 'run-created',
                        runId: view.runId,
                        lastSeq: 0,
                        text: '',
                        phase: 'streaming',
                    })
                    startStream(view.runId, 0, generation)
                }
                return true
            } catch (error: any) {
                if (acquiredClaim) lock.release(acquiredClaim)
                if (mountedRef.current && requestGeneration === generationRef.current) {
                    scheduleAttachRetry(runId, requestGeneration, error)
                }
                return false
            }
        },
        [client, conversationId, lock, scheduleAttachRetry, store, startStream]
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
        resetReconnect()
        attachRetryAttemptRef.current = 0
        dispatch({ type: 'retry-connection' })
        if (current.pendingToolIds.length > 0) {
            retryPendingTools()
        } else {
            startStream(current.runId, current.lastSeq, generationRef.current)
        }
    }, [startStream, resetReconnect, retryPendingTools])

    const cancel = useCallback(async () => {
        const current = stateRef.current
        const ownsConversation = lock.owns(conversationId)
        generationRef.current += 1
        startInFlightRef.current = null
        abortRef.current?.abort()
        resetPending()
        executor.clearCache()
        stopSubRuns()
        resetReconnect()
        if (attachRetryTimerRef.current) clearTimeout(attachRetryTimerRef.current)
        attachRetryAttemptRef.current = 0
        attachReplayThroughRef.current = 0
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
    }, [client, conversationId, lock, store, executor, stopSubRuns])

    const reset = useCallback(() => {
        const current = stateRef.current
        const ownsConversation = lock.owns(conversationId)
        const terminal = current.phase === 'completed' || current.phase === 'failed' || current.phase === 'cancelled'
        generationRef.current += 1
        startInFlightRef.current = null
        abortRef.current?.abort()
        resetPending()
        executor.clearCache()
        stopSubRuns()
        resetReconnect()
        if (attachRetryTimerRef.current) clearTimeout(attachRetryTimerRef.current)
        attachRetryAttemptRef.current = 0
        attachReplayThroughRef.current = 0
        if (current.runId && (ownsConversation || terminal)) store.clearToolResults(current.runId)
        lock.release()
        if (ownsConversation || terminal) store.clear(conversationId)
        dispatch({ type: 'reset' })
    }, [conversationId, lock, store, executor, stopSubRuns])

    // A single mounted chat component can switch conversations. Release only the
    // local stream/lock; keep the previous conversation's saved handle intact.
    useEffect(() => {
        if (conversationRef.current === conversationId) return
        generationRef.current += 1
        startInFlightRef.current = null
        abortRef.current?.abort()
        resetPending()
        executor.clearCache()
        resetReconnect()
        if (attachRetryTimerRef.current) clearTimeout(attachRetryTimerRef.current)
        attachRetryAttemptRef.current = 0
        attachReplayThroughRef.current = 0
        lock.release()
        stopSubRuns()
        conversationRef.current = conversationId
        dispatch({ type: 'reset' })
    }, [conversationId, executor, lock, stopSubRuns])

    // Cleanup on unmount: release the stream (keep the stored handle for re-attach).
    useEffect(() => {
        mountedRef.current = true
        return () => {
            mountedRef.current = false
            generationRef.current += 1
            startInFlightRef.current = null
            abortRef.current?.abort()
            attachReplayThroughRef.current = 0
            // Children keep running server-side; this tab simply stops driving
            // them (another tab / a later re-attach picks them up). useSubRuns
            // disposes its worker on unmount; usePendingToolExecution clears its
            // own retry timer.
            clearReconnectTimer()
            if (attachRetryTimerRef.current) clearTimeout(attachRetryTimerRef.current)
            lock.release()
        }
    }, [lock])

    return { state, start, attach, approvePlan, continueRun, retryConnection, cancel, reset }
}
