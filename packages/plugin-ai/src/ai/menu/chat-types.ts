// Types
export interface Message {
    id: string
    content: string
    /** Reasoning/thinking content from reasoning models (e.g. deepseek-reasoner) */
    reasoningContent?: string
    sender: "user" | "ai"
    timestamp: number
    steps?: ExecutionStep[]
    stopped?: boolean
    error?: boolean
}

export interface ExecutionStep {
    id: string
    toolName: string
    args: any
    result?: any
    error?: string
    status: 'running' | 'success' | 'error'
    timestamp: number
    duration?: number
}

// Pending user choice state
export interface PendingUserChoice {
    request: import("@kn/common").UserChoiceRequest
    resolve: (value: string) => void
    reject: (reason?: any) => void
}

// Error classification
export interface ChatError {
    type: 'network' | 'auth' | 'rate_limit' | 'timeout' | 'server' | 'unknown'
    message: string
    retryable: boolean
}

// Constants
export const AI_AVATAR_URL = undefined

export const AVATAR_FALLBACKS = {
    ai: "AI",
} as const

// Empty state is handled by the greeting UI component instead of a synthetic message
export const INITIAL_MESSAGES: Message[] = []

export function classifyError(err: any): ChatError {
    const status = err?.status || err?.response?.status
    const message = err?.message || ''

    if (err?.name === 'AbortError' || message.includes('abort')) {
        return { type: 'unknown', message: '生成已停止', retryable: false }
    }

    if (status === 401 || status === 403 || message.includes('auth') || message.includes('unauthorized')) {
        return { type: 'auth', message: '认证失败，请检查 API 密钥配置', retryable: false }
    }

    if (status === 429 || message.includes('rate') || message.includes('too many')) {
        return { type: 'rate_limit', message: '请求过于频繁，请稍后再试', retryable: true }
    }

    if (message.includes('timeout') || message.includes('ETIMEDOUT') || err?.code === 'ETIMEDOUT') {
        return { type: 'timeout', message: '请求超时，请稍后再试', retryable: true }
    }

    if (status >= 500 || message.includes('server') || message.includes('internal')) {
        return { type: 'server', message: '服务器错误，请稍后再试', retryable: true }
    }

    if (message.includes('network') || message.includes('fetch') || message.includes('Failed to fetch') || message.includes('ECONNREFUSED') || !navigator.onLine) {
        return { type: 'network', message: '网络连接失败，请检查网络设置', retryable: true }
    }

    return { type: 'unknown', message: '生成失败，请重试', retryable: true }
}

// Helper function to format tool names for display
export function formatToolName(toolName: string) {
    return toolName
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .trim()
}

// ============ AgentTeam Status Types ============

export type TeamMemberStatus = 'pending' | 'spawned' | 'working' | 'completed' | 'error'

export type TeamPhase = 'planning' | 'assembling' | 'executing' | 'synthesizing' | 'completed'

export interface TeamMember {
    id: string
    name: string
    subTask: string
    dependencyLevel: number
    status: TeamMemberStatus
    detail?: string
}

export interface TeamState {
    members: TeamMember[]
    phase: TeamPhase | ''
    orchestrationMessage: string
}

// ============ Spec-aligned Annotation Event Types ============
// These map directly to the FRONTEND_INTEGRATION.md spec Section 3.6

/** Agent status annotation (thinking/tool_calling) */
export interface AgentStatusEvent {
    type: 'agent_status'
    phase: 'thinking' | 'tool_calling'
    iteration?: number
    tool?: string
}

/** Delegate start annotation (sub-agent delegation begins) */
export interface DelegateStartEvent {
    type: 'delegate_start'
    subTaskCount: number
    subTasks: Array<{ agentId: string; description: string }>
}

/** Sub-agent status change */
export interface SubagentStatusEvent {
    type: 'subagent_status'
    agentId: string
    status: 'spawned' | 'working' | 'completed' | 'error'
    detail?: string
}

/** Sub-agent text output */
export interface SubagentOutputEvent {
    type: 'subagent_output'
    agentId: string
    content: string
}

/** Sub-agent tool call */
export interface SubagentToolCallEvent {
    type: 'subagent_tool_call'
    agentId: string
    toolName: string
    toolCallId: string
}

/** Sub-agent tool result */
export interface SubagentToolResultEvent {
    type: 'subagent_tool_result'
    agentId: string
    toolCallId: string
}

/** Delegate result (all sub-agents completed) */
export interface DelegateResultEvent {
    type: 'delegate_result'
    result: string
}

/** Context compressed annotation */
export interface ContextCompressedEvent {
    type: 'context_compressed'
    from: number
    to: number
}

/** All spec-aligned annotation types */
export type SpecAnnotationEvent =
    | AgentStatusEvent
    | DelegateStartEvent
    | SubagentStatusEvent
    | SubagentOutputEvent
    | SubagentToolCallEvent
    | SubagentToolResultEvent
    | DelegateResultEvent
    | ContextCompressedEvent

// ============ Legacy Compat Event Types ============
// These are kept for backward compatibility with existing UI

// Team assembled event
export interface TeamAssembledEvent {
    type: 'team_status'
    event: 'team_assembled'
    members: TeamMember[]
}

// Member status change event
export interface MemberStatusEvent {
    type: 'team_status'
    event: 'member_status'
    memberId: string
    memberName: string
    status: TeamMemberStatus
    detail?: string
}

// Team phase event
export interface TeamPhaseEvent {
    type: 'team_status'
    event: 'team_phase'
    phase: TeamPhase
}

// Orchestration status event (legacy compat)
export interface OrchestrationStatusEvent {
    type: 'orchestration_status'
    phase: TeamPhase
    message: string
}

export type TeamStatusEvent =
    | TeamAssembledEvent
    | MemberStatusEvent
    | TeamPhaseEvent
    | OrchestrationStatusEvent

// ============ Session Types ============

export interface SessionInfo {
    type?: 'session_info'    // Discriminant for union type narrowing
    sessionId: string
    conversationId: string
    executionMode?: 'SOLO' | 'TEAM'
    status?: 'RUNNING' | 'COMPLETED' | 'ERROR'
}

// ============ Stream Event Types ============

export interface StreamFinishEvent {
    finishReason: 'stop' | 'length' | 'tool-calls' | 'error'
    usage: {
        promptTokens: number
        completionTokens: number
    }
}

export interface StreamToolCallEvent {
    toolCallId: string
    toolName: string
    args: Record<string, any>
}

export interface StreamErrorEvent {
    error: string
}

// ============ Annotation Data Types ============

export type AnnotationData = TeamStatusEvent | SessionInfo | Record<string, any>
