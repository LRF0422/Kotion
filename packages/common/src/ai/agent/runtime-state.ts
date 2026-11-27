/**
 * Runtime-state contracts shared by the agent SDK and the host UI.
 *
 * These mirror the server-side `agent_tool_call` / `agent_form_request` /
 * active-run endpoints (V48). They are intentionally small: the server owns the
 * ledger, the client only needs enough to decide execute / resume / ask.
 */

export type AgentToolCallStatus =
    | 'pending'
    | 'awaiting_approval'
    | 'approved'
    | 'rejected'
    | 'started'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'uncertain'

/** One durable tool-call ledger row. */
export interface AgentToolCallView {
    callId: string
    runId: string
    conversationId?: string | null
    toolName: string
    status: AgentToolCallStatus
    argsHash?: string | null
    args?: unknown
    approval?: unknown
    approvalExpiresAt?: number | null
    approvalNote?: string | null
    result?: unknown
    resultTruncated?: boolean
    error?: string | null
    idempotencyKey?: string | null
    attempt?: number
    startedAt?: number | null
    finishedAt?: number | null
    createdAt?: number
}

export interface AgentToolCallStartInput {
    toolName: string
    args?: unknown
    argsHash?: string
    idempotencyKey?: string
}

export interface AgentToolCallCompleteInput {
    ok?: boolean
    result?: unknown
    error?: string
}

export interface AgentToolApprovalInput {
    toolName?: string
    argsHash?: string
    request: unknown
    timeoutMs?: number
}

export interface AgentToolDecisionInput {
    allowed: boolean
    note?: string
}

/** A non-terminal run returned by `GET /runs` for boot recovery. */
export interface AgentActiveRunView {
    runId: string
    conversationId?: string | null
    status: string
    suspendReason?: string | null
    lastSeq?: number
    updatedAt?: number
    createdAt?: number
}

export type AgentFormStatus = 'pending' | 'answered' | 'cancelled' | 'expired'

/** Server-side form inbox entry. */
export interface AgentFormRequestView {
    formId: string
    conversationId: string
    runId?: string | null
    callId?: string | null
    title: string
    schema?: unknown
    status: AgentFormStatus
    values?: unknown
    rows?: unknown
    cancelReason?: string | null
    createdAt?: number
    answeredAt?: number | null
    deliveredAt?: number | null
    expiresAt?: number | null
}

export interface AgentFormCreateInput {
    conversationId: string
    runId?: string
    callId?: string
    title: string
    schema: unknown
    expiresAt?: number
}

export interface AgentFormAnswerInput {
    values?: unknown
    rows?: unknown
}