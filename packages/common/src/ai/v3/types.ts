/** V3 agent SDK contracts. UI must depend only on these types. */
export type AgentTaskStatus =
    | 'CREATED'
    | 'QUEUED'
    | 'RUNNING'
    | 'WAITING_TOOLS'
    | 'WAITING_APPROVAL'
    | 'SUSPENDED'
    | 'COMPLETED'
    | 'FAILED'
    | 'CANCELLED'

export interface CreateAgentTaskInput {
    conversationId: string
    model?: string
    messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content?: string }>
    tools?: unknown[]
    mode?: 'execute' | 'plan'
    metadata?: Record<string, unknown>
}

export interface AgentTaskState {
    taskId: string
    conversationId: string
    status: AgentTaskStatus
    finishReason?: string
    errorMessage?: string
    assistantText?: string
    lastSeq: number
    pendingTools: Array<{ toolCallId: string; toolName: string; arguments?: string }>
}

export interface AgentTaskEvent {
    seq: number
    type: string
    data: Record<string, unknown>
}

export interface ResumeAgentTaskInput {
    toolResults?: Array<{ toolCallId: string; toolName: string; result: string; success: boolean }>
    action?: 'continue'
    decision?: 'approved' | 'rejected'
    feedback?: string
}
