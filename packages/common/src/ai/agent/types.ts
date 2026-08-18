/**
 * AgentCore frontend SDK types — the client-side mirror of the redesigned
 * agent contract (docs/agent-redesign.md §8/§10).
 */

// ============ Messages ============

export interface AgentToolCallInfo {
    id: string
    type?: 'function'
    function?: { name: string; arguments: string }
}

export interface AgentChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool'
    content?: string
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
}

export interface RunView {
    runId: string
    conversationId: string
    parentRunId?: string
    model?: string
    mode: 'execute' | 'plan'
    status: RunStatus
    finishReason?: string
    suspendReason?: 'plan_approval' | 'budget'
    errorCode?: string
    errorMessage?: string
    lastSeq: number
    promptTokens: number
    completionTokens: number
    assistantText?: string
    pendingTools: PendingToolCall[]
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

// ============ Events ============

export interface RunUsage {
    promptTokens: number
    completionTokens: number
}

export type AgentEvent =
    | { seq: number; type: 'run.created'; runId: string; conversationId: string; model?: string; mode?: string }
    | { seq: number; type: 'step.started'; step: number }
    | { seq: number; type: 'text.delta'; content: string }
    | { seq: number; type: 'reasoning.delta'; content: string }
    | { seq: number; type: 'tool.requested'; callId: string; tool: string; args: string }
    | { seq: number; type: 'tool.completed'; callId: string; tool: string; ok: boolean; result?: unknown; error?: string; durationMs?: number }
    | { seq: number; type: 'sub.spawned'; callId: string; subRunId: string; task?: string }
    | { seq: number; type: 'sub.completed'; callId: string; subRunId: string; ok: boolean; result?: unknown }
    | { seq: number; type: 'sub.failed'; callId: string; subRunId: string; ok: false; error?: string }
    | { seq: number; type: 'plan.proposed'; callId: string; plan: string }
    | { seq: number; type: 'run.suspended'; reason: 'waiting_tools' | 'plan_approval' | 'budget'; pendingCallIds?: string[] }
    | { seq: number; type: 'run.completed'; finishReason?: string; usage?: RunUsage }
    | { seq: number; type: 'run.failed'; code?: string; error?: string }
    | { seq: number; type: 'run.cancelled' }

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
