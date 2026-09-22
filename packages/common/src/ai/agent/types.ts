/**
 * AgentCore frontend SDK types — the client-side mirror of the redesigned
 * agent contract (docs/agent-redesign.md §8/§10).
 */

// ============ Messages ============

import type { AgentContentPart } from '../image/image-attachments'

export interface AgentToolCallInfo {
    id: string
    type?: 'function'
    function?: { name: string; arguments: string }
}

export interface AgentChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool'
    content?: string
    /**
     * Multimodal content parts (text + images). When present the backend sends
     * these as the message's `content` array so a vision model sees the images
     * natively. `content` stays as the plain-text fallback.
     */
    contentParts?: AgentContentPart[]
    tool_call_id?: string
    name?: string
    tool_calls?: AgentToolCallInfo[]
    reasoning_content?: string
}

// ============ Tools ============

export interface AgentToolSpec {
    name: string
    description: string
    /** JSON Schema object for the arguments. */
    inputSchema: Record<string, any>
    /** 'frontend' for client-declared editor tools. */
    kind: 'frontend' | 'backend'
    readOnly: boolean
    source: 'client' | 'builtin' | 'skill'
}

export interface AgentSkillInput {
    name: string
    systemPromptFragment?: string
    /**
     * Tools this skill owns. The backend registers them as *deferred*: callable,
     * but their schemas stay out of the model's tool list until first use (only
     * name + description are advertised in the system prompt). Tools that are
     * also in the run's top-level `tools` are ignored here.
     */
    tools?: AgentToolSpec[]
}

// ============ Runs ============

export type RunStatus =
    | 'QUEUED' | 'RUNNING' | 'WAITING_TOOLS' | 'SUSPENDED'
    | 'COMPLETED' | 'FAILED' | 'CANCELLED'

export interface PendingToolCall {
    callId: string
    tool: string
    argsJson: string
    requestedAt: number
    /**
     * Set when this call belongs to a delegated sub-agent run. The parent run
     * owns the pause, but the result is routed back to the child, and the UI
     * attributes the call to that child's node.
     */
    subRunId?: string
}

export interface RunView {
    runId: string
    conversationId: string
    parentRunId?: string
    model?: string
    mode: 'execute' | 'plan'
    status: RunStatus
    finishReason?: string
    /**
     * Why a SUSPENDED run is parked: plan approval, budget grant, or waiting on
     * delegated children (`children` — the main agent keeps working first and
     * only parks when it actually needs their results).
     */
    suspendReason?: 'plan_approval' | 'budget' | 'children'
    errorCode?: string
    errorMessage?: string
    lastSeq: number
    replayThroughSeq: number
    promptTokens: number
    completionTokens: number
    /** Prompt tokens served from the provider's context cache (subset of promptTokens). */
    cachedPromptTokens: number
    assistantText?: string
    pendingTools: PendingToolCall[]
    pendingPlanCallId?: string
    pendingPlan?: string
    spaceId?: string
    pageId?: string
    createTime: number
    updateTime: number
}

export interface CreateRunInput {
    conversationId: string
    model?: string
    mode?: 'execute' | 'plan'
    messages: AgentChatMessage[]
    tools?: AgentToolSpec[]
    skills?: AgentSkillInput[]
    /**
     * Extra system-prompt text appended after the backend's base prompt —
     * the client's editor rules and page/document guidance.
     */
    systemPrompt?: string
    temperature?: number
    maxTokens?: number
    /** Pure-text mode: no tools offered to the model at all. */
    noTools?: boolean
    spaceId?: string
    pageId?: string
}

export interface ResumeToolResult {
    callId: string
    ok: boolean
    result?: unknown
    error?: string
}

export interface ResumePayload {
    action: 'tool_results' | 'approve_plan' | 'continue'
    toolResults?: ResumeToolResult[]
    planDecision?: { approved: boolean; feedback?: string }
}

export interface ThreadView {
    threadId: string
    title?: string
    summary?: string
    activeRunId?: string
    createTime?: number
    updateTime?: number
}

/**
 * One persisted chat session returned by /api/agent/v1/sessions. The payload
 * is intentionally loose (messages/pages are passed through as raw JSON) so
 * the wire type does not depend on the UI's Message/ChatTargetPage shape.
 */
export interface AgentChatSession {
    sessionId: string
    title?: string
    targetPage?: unknown
    boundPage?: unknown
    /** Present only on the detail endpoint, never on the index list. */
    messages?: unknown
    messageCount?: number
    createdAt?: number
    updatedAt?: number
}

/**
 * Client-writable session metadata only — the transcript is engine-owned and
 * must not travel through this payload.
 */
export interface SaveAgentChatSessionInput {
    title?: string
    targetPage?: unknown
    boundPage?: unknown
    createdAt?: number
    updatedAt?: number
}

/**
 * One-time migration upload of a pre-existing local transcript. The backend
 * accepts it only when it has no engine-owned transcript for the session.
 */
export interface ImportAgentChatSessionInput {
    title?: string
    targetPage?: unknown
    boundPage?: unknown
    messages: unknown[]
    createdAt?: number
}

export interface MemoryItem {
    memoryId: string
    scope: string
    type: 'fact' | 'preference' | 'note' | 'episode'
    content: string
    importance: number
    tags?: string[]
    createTime: number
    lastAccessTime: number
}

/**
 * One derived low-sensitivity user-profile trait. Read/edit/delete from
 * /api/agent/v1/profile; never carries raw evidence (that is a separate call).
 */
export interface AgentProfileTrait {
    traitId: string
    dimension: string
    dimensionLabel?: string
    value: string
    confidence: number
    source: 'inferred' | 'user'
    status: 'active' | 'suppressed'
    locked: boolean
    evidenceCount: number
    firstSeen: number
    lastSeen: number
    updateTime: number
}

/** The caller's own profile plus the opt-in state. */
export interface AgentProfile {
    consent: boolean
    count: number
    traits: AgentProfileTrait[]
    dimensions: string[]
}

/** Redacted supporting text behind one trait (owner only). */
export interface AgentProfileEvidence {
    excerpt?: string
    sessionId?: string
    observedAt?: number
}

// ============ Events ============

export interface RunUsage {
    promptTokens: number
    completionTokens: number
    /**
     * Prompt tokens the provider served from its context cache (subset of
     * promptTokens) — 0 when the provider reports no cache accounting.
     */
    cachedPromptTokens: number
}

/**
 * Share of prompt tokens served from the model's context cache (0–1), or null
 * when the run reported no prompt tokens / no cache accounting at all.
 */
export function cacheHitRate(usage?: RunUsage | null): number | null {
    if (!usage || usage.promptTokens <= 0) return null
    if (!Number.isFinite(usage.cachedPromptTokens) || usage.cachedPromptTokens <= 0) return null
    return Math.min(1, usage.cachedPromptTokens / usage.promptTokens)
}

export type AgentEvent =
    | { seq: number; type: 'run.created'; runId: string; conversationId: string; model?: string; mode?: string }
    | { seq: number; type: 'step.started'; step: number }
    | { seq: number; type: 'text.delta'; content: string }
    | { seq: number; type: 'reasoning.delta'; content: string }
    | { seq: number; type: 'tool.requested'; callId: string; tool: string; args: string; subRunId?: string }
    | { seq: number; type: 'tool.completed'; callId: string; tool: string; ok: boolean; result?: unknown; error?: string; durationMs?: number; subRunId?: string }
    | {
        seq: number
        type: 'sub.spawned'
        callId: string
        subRunId: string
        task?: string
        /** Human-friendly name the backend assigned to this child, when known. */
        agentName?: string
        /** One-line role/description for the child, when known. */
        description?: string
    }
    | { seq: number; type: 'sub.completed'; callId: string; subRunId: string; ok: boolean; result?: unknown }
    | { seq: number; type: 'sub.failed'; callId: string; subRunId: string; ok: false; error?: string }
    | { seq: number; type: 'plan.proposed'; callId: string; plan: string }
    | { seq: number; type: 'run.suspended'; reason: 'waiting_tools' | 'plan_approval' | 'budget' | 'children'; pendingCallIds?: string[] }
    | { seq: number; type: 'run.completed'; finishReason?: string; usage?: RunUsage }
    | { seq: number; type: 'run.failed'; code?: string; error?: string }
    | { seq: number; type: 'run.cancelled' }
    | { seq: 0; type: 'control.error'; code: string; error?: string }

export const TERMINAL_EVENT_TYPES: ReadonlySet<AgentEvent['type']> = new Set([
    'run.completed', 'run.failed', 'run.cancelled',
])

/** Parse a tool.requested args payload (JSON string) into an object. */
export function parseToolArgs(args: string): Record<string, any> {
    if (!args) return {}
    try {
        const parsed = JSON.parse(args)
        return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
        return {}
    }
}
