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
import { SubRunWorker } from './sub-run-worker'
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
import { getSessionPageBinding } from '../session-page-binding'

const MAX_OUTER_RECONNECTS = 5
const MAX_TOOL_RESUME_RETRIES = 5
const MAX_ATTACH_RETRIES = 5
const RESUME_FIRST_EVENT_TIMEOUT_MS = 30_000

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

export interface AgentStepRecord {
    /** Monotonic event identity; unlike the display step number, never resets. */
    id: string
    step: number
    startedSeq: number
    reasoning: string
    text: string
}

export interface ToolCallRecord {
    callId: string
    tool: string
    args: Record<string, any>
    status: 'running' | 'success' | 'error'
    /**
     * Owning sub-agent run id for tools a delegated child invoked. The parent
     * run executes and routes them, but the UI must show them on the child's
     * node — never on the parent's step tape.
     */
    subRunId?: string
    step?: number
    stepId?: string
    startedSeq?: number
    completedSeq?: number
    result?: unknown
    error?: string
    durationMs?: number
}

export interface SubRunRecord {
    callId: string
    subRunId: string
    task?: string
    status: 'running' | 'completed' | 'failed' | 'cancelled'
    result?: unknown
    error?: string
    /**
     * The child's own live output, streamed from the child's run (the client
     * drives children directly). Trimmed to a preview for the tree.
     */
    text?: string
    reasoning?: string
    /**
     * The child's own step timeline, built from its event stream exactly like
     * the parent's. The sub-agent detail popover renders this with the same
     * timeline component as the main agent.
     */
    steps: AgentStepRecord[]
    /** Child step id chosen as the answer. */
    answerStepId?: string
    /** Internal: the child step currently receiving text/reasoning deltas. */
    activeStepId?: string
    /** The child's own token usage, reported when it settles. */
    usage?: RunUsage
    /** Private-document merge outcome, once the child settled. */
    merge?: {
        applied: number
        conflicts: number
        reorderDetected: boolean
        summary: string
    }
}

export interface EditorAgentState {
    phase: EditorAgentPhase
    runId: string | null
    lastSeq: number
    /** Accumulated assistant text (rebuilt from durable events on attach). */
    text: string
    reasoning: string
    step: number
    activeStepId: string | null
    answerStepId: string | null
    steps: AgentStepRecord[]
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
    activeStepId: null,
    answerStepId: null,
    steps: [],
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
    | { type: 'sub-event'; subRunId: string; event: AgentEvent }
    | { type: 'sub-merged'; subRunId: string; report: SubRunRecord['merge'] }
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
        case 'sub-event':
            return applySubRunEvent(state, action.subRunId, action.event)
        case 'sub-merged':
            return {
                ...state,
                subRuns: state.subRuns.map(sub =>
                    sub.subRunId === action.subRunId ? { ...sub, merge: action.report } : sub
                ),
            }
        default:
            return state
    }
}

/** Preview cap for a child's own streamed output in the tree. */
const SUB_RUN_PREVIEW_CHARS = 400

/** Per-field cap for a child's retained timeline steps (memory/backing store). */
const SUB_RUN_STEP_MAX_CHARS = 24000

/**
 * Fold a delegated child's own event into the parent state: its text/reasoning
 * preview live on the {@link SubRunRecord}, and its frontend tool calls join the
 * shared tool tape tagged with `subRunId` (so the tree attributes them and the
 * parent's own timeline filters them out).
 *
 * Only the events the UI needs are handled — parent-only bookkeeping (steps,
 * answer selection, pending ids) must never be touched by a child's stream.
 */
function updateSubRun(
    state: EditorAgentState,
    subRunId: string,
    updater: (sub: SubRunRecord) => SubRunRecord,
): EditorAgentState {
    return {
        ...state,
        subRuns: state.subRuns.map(sub => sub.subRunId === subRunId ? updater(sub) : sub),
    }
}

/** Append a delta to the child's active step, creating it on first token. */
function appendChildStep(
    sub: SubRunRecord,
    seq: number,
    field: 'reasoning' | 'text',
    content: string,
): SubRunRecord {
    const activeId = sub.activeStepId ?? `step-${seq}`
    const index = sub.steps.findIndex(record => record.id === activeId)
    if (index === -1) {
        return {
            ...sub,
            activeStepId: activeId,
            steps: [...sub.steps, {
                id: activeId,
                step: 1,
                startedSeq: seq,
                reasoning: field === 'reasoning' ? content : '',
                text: field === 'text' ? content : '',
            }],
        }
    }
    const steps = sub.steps.slice()
    const merged = steps[index][field] + content
    steps[index] = {
        ...steps[index],
        [field]: merged.length > SUB_RUN_STEP_MAX_CHARS
            ? merged.slice(0, SUB_RUN_STEP_MAX_CHARS)
            : merged,
    }
    return { ...sub, activeStepId: activeId, steps }
}

function applySubRunEvent(state: EditorAgentState, subRunId: string, event: AgentEvent): EditorAgentState {
    const next = { ...state }
    const preview = (current: string | undefined, delta: string): string => {
        const merged = (current ?? '') + delta
        return merged.length > SUB_RUN_PREVIEW_CHARS ? merged.slice(-SUB_RUN_PREVIEW_CHARS) : merged
    }

    switch (event.type) {
        case 'step.started': {
            const id = `step-${event.seq}`
            return updateSubRun(next, subRunId, sub => {
                if (sub.steps.some(record => record.id === id)) {
                    return { ...sub, activeStepId: id }
                }
                return {
                    ...sub,
                    activeStepId: id,
                    steps: [...sub.steps, {
                        id,
                        step: event.step,
                        startedSeq: event.seq,
                        reasoning: '',
                        text: '',
                    }],
                }
            })
        }
        case 'text.delta':
            return updateSubRun(next, subRunId, sub => {
                const appended = appendChildStep(sub, event.seq, 'text', event.content)
                return { ...appended, text: preview(sub.text, event.content) }
            })
        case 'reasoning.delta':
            return updateSubRun(next, subRunId, sub => {
                const appended = appendChildStep(sub, event.seq, 'reasoning', event.content)
                return { ...appended, reasoning: preview(sub.reasoning, event.content) }
            })
        case 'tool.requested': {
            if (next.toolCalls.some(call => call.callId === event.callId)) return next
            const sub = next.subRuns.find(item => item.subRunId === subRunId)
            return {
                ...next,
                toolCalls: [
                    ...next.toolCalls,
                    {
                        callId: event.callId,
                        tool: event.tool,
                        args: parseToolArgs(event.args),
                        status: 'running',
                        subRunId,
                        stepId: sub?.activeStepId,
                        startedSeq: event.seq,
                    },
                ],
            }
        }
        case 'tool.completed': {
            const existing = next.toolCalls.find(call => call.callId === event.callId)
            const completed: ToolCallRecord = existing
                ? {
                    ...existing,
                    status: event.ok ? 'success' : 'error',
                    completedSeq: event.seq,
                    result: event.result,
                    error: event.error,
                    durationMs: event.durationMs,
                    subRunId,
                }
                : {
                    callId: event.callId,
                    tool: event.tool,
                    args: {},
                    status: event.ok ? 'success' : 'error',
                    subRunId,
                    startedSeq: event.seq,
                    completedSeq: event.seq,
                    result: event.result,
                    error: event.error,
                    durationMs: event.durationMs,
                }
            return {
                ...next,
                toolCalls: existing
                    ? next.toolCalls.map(call => call.callId === event.callId ? completed : call)
                    : [...next.toolCalls, completed],
            }
        }
        default:
            return next
    }
}

function appendToCurrentStep(
    steps: AgentStepRecord[],
    activeStepId: string | null,
    step: number,
    seq: number,
    field: 'reasoning' | 'text',
    content: string,
): { steps: AgentStepRecord[]; stepId: string } {
    const stepId = activeStepId ?? `step-${seq}`
    const lastIndex = steps.length - 1
    const index = lastIndex >= 0 && steps[lastIndex].id === stepId
        ? lastIndex
        : steps.findIndex(record => record.id === stepId)
    if (index === -1) {
        return {
            stepId,
            steps: [
                ...steps,
                {
                    id: stepId,
                    step: step > 0 ? step : 1,
                    startedSeq: seq,
                    reasoning: field === 'reasoning' ? content : '',
                    text: field === 'text' ? content : '',
                },
            ],
        }
    }
    const updated = steps.slice()
    const record = updated[index]
    updated[index] = { ...record, [field]: record[field] + content }
    return { stepId, steps: updated }
}

function resolveAnswerStepId(state: EditorAgentState): string | null {
    if (state.answerStepId) return state.answerStepId
    return [...state.steps].reverse().find(step => step.text.trim())?.id ?? null
}

function applyEvent(state: EditorAgentState, event: AgentEvent): EditorAgentState {
    const next = { ...state, lastSeq: Math.max(state.lastSeq, event.seq) }
    switch (event.type) {
        case 'run.created':
            return { ...next, runId: event.runId, phase: 'streaming' }
        case 'step.started': {
            const stepId = `step-${event.seq}`
            const exists = next.steps.some(record => record.id === stepId)
            return {
                ...next,
                step: event.step,
                activeStepId: stepId,
                steps: exists
                    ? next.steps
                    : [...next.steps, { id: stepId, step: event.step, startedSeq: event.seq, reasoning: '', text: '' }],
                phase: 'streaming',
                suspendReason: null,
            }
        }
        case 'text.delta': {
            const appended = appendToCurrentStep(
                next.steps, next.activeStepId, next.step, event.seq, 'text', event.content
            )
            return {
                ...next,
                text: next.text + event.content,
                activeStepId: appended.stepId,
                answerStepId: appended.stepId,
                steps: appended.steps,
            }
        }
        case 'reasoning.delta': {
            const appended = appendToCurrentStep(
                next.steps, next.activeStepId, next.step, event.seq, 'reasoning', event.content
            )
            return {
                ...next,
                reasoning: next.reasoning + event.content,
                activeStepId: appended.stepId,
                steps: appended.steps,
            }
        }
        case 'tool.requested': {
            const existing = next.toolCalls.find(call => call.callId === event.callId)
            if (existing) return next
            return {
                ...next,
                answerStepId: next.answerStepId === next.activeStepId ? null : next.answerStepId,
                toolCalls: [
                    ...next.toolCalls,
                    {
                        callId: event.callId,
                        tool: event.tool,
                        args: parseToolArgs(event.args),
                        status: 'running',
                        subRunId: event.subRunId,
                        step: next.step || undefined,
                        stepId: next.activeStepId ?? undefined,
                        startedSeq: event.seq,
                    },
                ],
            }
        }
        case 'tool.completed': {
            const existing = next.toolCalls.find(call => call.callId === event.callId)
            const completed: ToolCallRecord = existing
                ? {
                    ...existing,
                    status: event.ok ? 'success' : 'error',
                    completedSeq: event.seq,
                    result: event.result,
                    error: event.error,
                    durationMs: event.durationMs,
                    subRunId: existing.subRunId ?? event.subRunId,
                }
                : {
                    callId: event.callId,
                    tool: event.tool,
                    args: {},
                    status: event.ok ? 'success' : 'error',
                    subRunId: event.subRunId,
                    step: next.step || undefined,
                    stepId: next.activeStepId ?? undefined,
                    startedSeq: event.seq,
                    completedSeq: event.seq,
                    result: event.result,
                    error: event.error,
                    durationMs: event.durationMs,
                }
            return {
                ...next,
                error: null,
                answerStepId: existing
                    ? next.answerStepId
                    : (next.answerStepId === next.activeStepId ? null : next.answerStepId),
                pendingToolIds: next.pendingToolIds.filter(id => id !== event.callId),
                toolCalls: existing
                    ? next.toolCalls.map(call => call.callId === event.callId ? completed : call)
                    : [...next.toolCalls, completed],
            }
        }
        case 'sub.spawned': {
            // Replayed/reconnected streams can re-deliver the same spawn.
            if (next.subRuns.some(sub => sub.subRunId === event.subRunId)) return next
            return {
                ...next,
                subRuns: [
                    ...next.subRuns,
                    {
                        callId: event.callId,
                        subRunId: event.subRunId,
                        task: event.task,
                        status: 'running',
                        steps: [],
                    },
                ],
            }
        }
        case 'sub.completed': {
            const usage = (event.result as { usage?: RunUsage } | null | undefined)?.usage
            return {
                ...next,
                subRuns: next.subRuns.map(sub =>
                    sub.subRunId === event.subRunId
                        ? {
                            ...sub,
                            status: event.ok ? 'completed' : 'failed',
                            result: event.result,
                            usage: usage ?? sub.usage,
                            answerStepId: sub.answerStepId
                                ?? [...sub.steps].reverse().find(step => step.text.trim())?.id,
                        }
                        : sub
                ),
            }
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
                answerStepId: resolveAnswerStepId(next),
                finishReason: event.finishReason ?? 'stop',
                usage: event.usage ?? next.usage,
            }
        case 'run.failed':
            return {
                ...next,
                phase: 'failed',
                answerStepId: resolveAnswerStepId(next),
                error: event.error ?? event.code ?? 'unknown error',
            }
        case 'run.cancelled':
            return {
                ...next,
                phase: 'cancelled',
                answerStepId: resolveAnswerStepId(next),
                // Cancelling the parent cascades to children server-side; stop
                // their spinners immediately instead of showing "running" forever.
                subRuns: next.subRuns.map(sub =>
                    sub.status === 'running' ? { ...sub, status: 'cancelled' } : sub
                ),
            }
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
        conversationId, tools, resolveTools, skills, systemPrompt, spaceId, pageId, onToolExecution,
        autoExecuteTools = true, persist = true, store: providedStore,
    } = options
    const isReadOnlyTool = options.isReadOnlyTool

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

    /**
     * Serialize mutating calls per document. The document is the page the owner
     * currently edits: the delegated child's own target when it has one, else
     * the conversation's target. No binding / no known page → no serialization
     * (single-editor hosts keep their existing behaviour).
     */
    const resolveDocumentId = useCallback((owner: string | null): string | null => {
        const binding = getSessionPageBinding()
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
        () => new EditorToolExecutor({ resolveTools, isReadOnlyTool, resolveDocumentId, onExecution: onToolExecution }),
        [resolveTools, isReadOnlyTool, resolveDocumentId, onToolExecution]
    )

    /** Delegated agents seen in this turn, so their editor targets can be freed. */
    const ownedAgentIdsRef = useRef<Set<string>>(new Set())
    const releaseOwnerTarget = useCallback((owner: string, options?: { commit?: boolean }) => {
        ownedAgentIdsRef.current.delete(owner)
        const binding = getSessionPageBinding()
        // `releaseOwner` merges the agent's private document back into the live
        // page and hands back the report; the tree shows it on the child.
        void Promise.resolve(binding?.releaseOwner?.(owner, options))
            .then(report => {
                if (report && mountedRef.current) {
                    dispatch({ type: 'sub-merged', subRunId: owner, report })
                }
            })
            .catch(() => { /* the tree already shows the child's own error */ })
    }, [])
    const releaseAllOwnerTargets = useCallback(() => {
        const ids = [...ownedAgentIdsRef.current]
        ownedAgentIdsRef.current.clear()
        const binding = getSessionPageBinding()
        if (!binding?.releaseOwner) return
        // A cancelled/reset turn discards private documents: merging half-done
        // work into the page would be worse than losing it.
        for (const owner of ids) void binding.releaseOwner?.(owner, { commit: false })
    }, [])

    /**
     * Delegated children are driven from here, not through the parent run: each
     * child gets its own stream + resume round-trips, so several children can
     * work (and touch their own documents) at the same time.
     */
    const subRunWorker = useMemo(() => new SubRunWorker({
        client,
        store,
        executeTool: (callId, tool, args, owner) => executor.execute(callId, tool, args, owner),
        onEvent: (runId, event) => dispatch({ type: 'sub-event', subRunId: runId, event }),
        onSettled: (runId, settlement) => {
            // The child can no longer edit anything: hand its editor back, drop
            // its tool-result journal, and merge its private document — but only
            // when it finished normally (a cancelled/timed-out child's partial
            // edits are discarded rather than written into the page).
            ownedAgentIdsRef.current.delete(runId)
            void Promise.resolve(
                getSessionPageBinding()?.releaseOwner?.(runId, { commit: settlement === 'completed' })
            ).then(report => {
                if (report && mountedRef.current) {
                    dispatch({ type: 'sub-merged', subRunId: runId, report })
                }
            }).catch(() => { /* the tree already shows the child's own error */ })
            store.clearToolResults(runId)
        },
    }), [client, store, executor])

    // A delegated child's editor target dies with it: releasing on terminal
    // avoids pinning an off-screen session (and its editor) for an agent that
    // can no longer edit anything. A call that is still executing keeps the
    // target alive until its result is applied — destroying the editor under a
    // running tool is worse than holding the session a moment longer. Live
    // children are attached to the sub-run worker here, which is also how a
    // re-attached parent resumes driving children it did not spawn in this tab.
    useEffect(() => {
        for (const sub of state.subRuns) {
            if (sub.status === 'running') {
                ownedAgentIdsRef.current.add(sub.subRunId)
                subRunWorker.attach(sub.subRunId)
                continue
            }
            if (!ownedAgentIdsRef.current.has(sub.subRunId)) continue
            const stillRunning = state.toolCalls.some(
                call => call.subRunId === sub.subRunId && call.status === 'running'
            )
            if (stillRunning) continue
            // Pass the real settlement so the worker's onSettled performs the
            // merge/discard with the correct commit flag. Detaching as
            // 'detached' here raced the worker and could discard a completed
            // child's private-document merge.
            subRunWorker.detach(
                sub.subRunId,
                sub.status === 'completed' ? 'completed'
                    : sub.status === 'failed' ? 'failed' : 'cancelled'
            )
            releaseOwnerTarget(sub.subRunId, { commit: sub.status === 'completed' })
        }
    }, [state.subRuns, state.toolCalls, releaseOwnerTarget, subRunWorker])

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
                    systemPrompt,
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
                if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
                if (attachRetryTimerRef.current) clearTimeout(attachRetryTimerRef.current)
                if (toolRetryTimerRef.current) clearTimeout(toolRetryTimerRef.current)
                reconnectAttemptRef.current = 0
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
        subRunWorker.stopAll()
        releaseAllOwnerTargets()
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
        subRunWorker.stopAll()
        releaseAllOwnerTargets()
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
    }, [conversationId, lock, store, executor, releaseAllOwnerTargets, subRunWorker])

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
        subRunWorker.stopAll()
        releaseAllOwnerTargets()
        conversationRef.current = conversationId
        dispatch({ type: 'reset' })
    }, [conversationId, executor, lock, releaseAllOwnerTargets, subRunWorker])

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
            // Children keep running server-side; this tab simply stops driving
            // them (another tab / a later re-attach picks them up).
            subRunWorker.dispose()
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
            if (attachRetryTimerRef.current) clearTimeout(attachRetryTimerRef.current)
            if (toolRetryTimerRef.current) clearTimeout(toolRetryTimerRef.current)
            lock.release()
        }
    }, [lock, subRunWorker])

    return { state, start, attach, approvePlan, continueRun, retryConnection, cancel, reset }
}
