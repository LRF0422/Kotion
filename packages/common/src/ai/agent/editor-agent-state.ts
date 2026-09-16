/**
 * Editor agent state machine — pure types and reducer for one run.
 *
 * Extracted from useEditorAgent so the SDK keeps transport/hook mechanics
 * separate from view-state derivation; this module has no React or I/O deps.
 */

import type { AgentEvent, RunUsage } from './types'
import { parseToolArgs } from './types'

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
    /** Human-friendly name the backend assigned to this child, when known. */
    name?: string
    /** One-line role/description for the child, when known. */
    description?: string
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

export const initialState: EditorAgentState = {
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

export type Action =
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

export function reducer(state: EditorAgentState, action: Action): EditorAgentState {
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
                        name: event.agentName,
                        description: event.description,
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

