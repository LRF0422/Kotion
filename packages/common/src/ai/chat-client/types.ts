/**
 * Chat Client Types
 *
 * Type definitions for the backend-driven SSE chat client.
 * Based on the Knowledge Agent Frontend Integration spec.
 */

// ============ Chat Message Types ============

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool'
    content?: string
    /** Reasoning/thinking content from reasoning models (e.g. deepseek-reasoner).
     *  MUST be included when role='assistant' and tool_calls is present,
     *  otherwise DeepSeek API returns 400 error. */
    reasoning_content?: string
    tool_call_id?: string   // role=tool required
    name?: string            // role=tool tool name
    tool_calls?: ToolCall[]  // role=assistant tool calls
}

export interface ToolCall {
    id: string
    type: 'function'
    function: {
        name: string
        arguments: string   // JSON string
    }
}

export interface ToolCallDelta {
    index: number
    id?: string
    type?: 'function'
    function?: {
        name?: string
        arguments?: string
    }
}

// ============ Capability Catalog Types ============

/**
 * Skill payload sent to the backend as part of the capability catalog.
 * The backend uses this catalog to perform progressive discovery; the frontend
 * no longer tracks activation state.
 *
 * The `tools` field carries the full OpenAI-shaped definitions of the skill's
 * `requiredTools` (+ `optionalTools`). This lets the backend learn the schema
 * of plugin tools through the skill envelope — plugin tools are not shipped
 * in the top-level `tools[]` array.
 */
export interface SkillPayload {
    name: string
    description: string
    requiredTools: string[]
    optionalTools?: string[]
    /** Detailed OpenAI function-call definitions for this skill's required + optional tools. */
    tools?: ToolPayload[]
    systemPromptFragment?: string
    tags?: string[]
    source: 'builtin' | 'plugin' | 'user'
    pluginName?: string
}

/**
 * Tool payload sent to the backend as part of the capability catalog.
 * Uses the standard OpenAI function-call shape so the backend can forward
 * it directly to the LLM without conversion.
 * `parameters` carries a JSON Schema produced from the tool's Zod input schema.
 */
export interface ToolPayload {
    type: 'function'
    function: {
        name: string
        description: string
        parameters: any // JSON Schema
    }
}

// ============ Chat Request Types ============

export interface ChatRequest {
    /** Model name, e.g. 'deepseek-chat', 'gpt-4o' */
    model?: string
    /** Message list (OpenAI format) */
    messages: ChatMessage[]
    /** Whether to stream (default true) */
    stream?: boolean
    /** Sampling temperature (default 0.7) */
    temperature?: number
    /** Max output tokens */
    maxTokens?: number
    /** Conversation ID, auto-generated if not provided */
    conversationId?: string
    /** Agent session ID for context recovery */
    sessionId?: string
    /** User ID */
    userId?: number
    /**
     * Full frontend skill catalog (built-in + plugin + user-installed).
     * The backend is responsible for progressive activation; the frontend
     * sends the complete list every turn.
     */
    skills?: SkillPayload[]
    /**
     * Full frontend tool catalog in the standard OpenAI function-call shape
     * ({@link ToolPayload}). The backend forwards the subset it exposes to
     * the LLM without shape conversion.
     */
    tools?: ToolPayload[]
    /**
     * Stable hash of the (skills, tools) catalog. The backend may cache by
     * this value and skip re-parsing unchanged catalogs across turns.
     */
    capabilitiesVersion?: string
    /** Frontend passthrough metadata */
    data?: Record<string, any>
    /** Run mode: 'plan' (read-only research → plan → approval) or 'execute' (default). */
    mode?: 'plan' | 'execute'
    /** Abort signal for the fetch request (not sent to backend) */
    signal?: AbortSignal
}

// ============ Annotation Types (from spec Section 3.6) ============

export interface AgentStatusAnnotation {
    type: 'agent_status'
    phase: 'thinking' | 'tool_calling'
    iteration?: number
    tool?: string
}

export interface DelegateStartAnnotation {
    type: 'delegate_start'
    subTaskCount: number
    subTasks: Array<{
        agentId: string
        description: string
        /** Custom agent name from AgentSpec.name (orchestrator-spawned agents). */
        agentName?: string
    }>
    /** Spawner agent id (null = root). */
    parentAgentId?: string | null
    /** Depth of the spawned sub-agents (root spawn = 1). */
    depth?: number
}

/**
 * Common identity header carried by every sub-agent annotation, used to build
 * the sub-agent tree on the frontend.
 */
export interface SubagentHeader {
    agentId: string
    /** Spawner agent id; null/undefined = root. */
    parentAgentId?: string | null
    /** Delegation depth (root spawn = 1). */
    depth?: number
}

/** A sub-agent has been created. */
export interface SubagentSpawnedAnnotation extends SubagentHeader {
    type: 'subagent_spawned'
    task?: string
    capabilities?: string[]
    /** Custom agent name from AgentSpec.name (e.g. "Document Reader", "Translator").
     *  Present when the sub-agent was spawned by the OrchestratorAgent / TeamExecutor. */
    agentName?: string
    /** The agent's task description from AgentSpec.description. */
    description?: string
}

export interface SubagentStatusAnnotation extends SubagentHeader {
    type: 'subagent_status'
    status: 'spawned' | 'running' | 'working' | 'completed' | 'error'
    detail?: string
}

/** Live text delta produced by a sub-agent. */
export interface SubagentOutputAnnotation extends SubagentHeader {
    type: 'subagent_output'
    content: string
}

/** Live reasoning/thinking delta produced by a sub-agent. */
export interface SubagentReasoningAnnotation extends SubagentHeader {
    type: 'subagent_reasoning'
    content: string
}

export interface SubagentToolCallAnnotation extends SubagentHeader {
    type: 'subagent_tool_call'
    toolName: string
    toolCallId: string
    args?: unknown
}

export interface SubagentToolResultAnnotation extends SubagentHeader {
    type: 'subagent_tool_result'
    toolCallId: string
    result?: unknown
    error?: string
}

/** A sub-agent's own iteration status (thinking / tool_calling). */
export interface SubagentProgressAnnotation extends SubagentHeader {
    type: 'subagent_progress'
    detail?: unknown
}

export interface SubagentErrorAnnotation extends SubagentHeader {
    type: 'subagent_error'
    error: string
}

/** A sub-agent has finished. */
export interface SubagentFinishAnnotation extends SubagentHeader {
    type: 'subagent_finish'
    finishReason?: string
    status?: 'completed' | 'error'
    usage?: { promptTokens: number; completionTokens: number }
}

export interface DelegateResultAnnotation {
    type: 'delegate_result'
    result: string
}

export interface ContextCompressedAnnotation {
    type: 'context_compressed'
    from: number
    to: number
}

// ---- Plan mode (P7) ----

/** Structured plan the agent submits via `present_plan` for approval. */
export interface PlanArtifact {
    title?: string
    summary: string
    steps: Array<{
        id?: number
        action: string
        tools?: string[]
        risk?: 'low' | 'medium' | 'high'
    }>
    openQuestions?: string[]
    estimatedMutations?: number
}

/** Emitted when the run enters plan mode. */
export interface PlanModeEnteredAnnotation {
    type: 'plan_mode_entered'
    trigger?: 'request' | 'agent'
}

/** The agent has proposed a plan and is waiting for the user's decision. */
export interface PlanProposedAnnotation {
    type: 'plan_proposed'
    plan: PlanArtifact
    planId?: string
}

/** The user's decision on a proposed plan has been applied. */
export interface PlanResolvedAnnotation {
    type: 'plan_resolved'
    planId?: string
    decision?: 'approved' | 'rejected'
    feedback?: string
}

/** Incremental progress of a long-running backend tool. */
export interface ToolProgressAnnotation {
    type: 'tool_progress'
    toolCallId?: string
    toolName?: string
    progress?: number
    message?: string
}

/** All annotation types from the spec */
export type Annotation =
    | AgentStatusAnnotation
    | DelegateStartAnnotation
    | SubagentSpawnedAnnotation
    | SubagentStatusAnnotation
    | SubagentOutputAnnotation
    | SubagentReasoningAnnotation
    | SubagentToolCallAnnotation
    | SubagentToolResultAnnotation
    | SubagentProgressAnnotation
    | SubagentErrorAnnotation
    | SubagentFinishAnnotation
    | DelegateResultAnnotation
    | ContextCompressedAnnotation
    | PlanModeEnteredAnnotation
    | PlanProposedAnnotation
    | PlanResolvedAnnotation
    | ToolProgressAnnotation

// ============ Stream Event Types ============

export interface TextDeltaEvent {
    type: 'text-delta'
    content: string
}

export interface ReasoningDeltaEvent {
    type: 'reasoning-delta'
    content: string
}

export interface ToolCallStreamEvent {
    type: 'tool-call'
    toolCalls: ToolCallDelta[]
}

export interface ToolResultEvent {
    type: 'tool-result'
    toolCallId: string
    result: {
        success: boolean
        output?: string
        error?: string | null
    }
}

export interface AnnotationStreamEvent {
    type: 'annotation'
    annotations: Annotation[]
}

export interface SessionInfoEvent {
    type: 'session-info'
    sessionId: string
    conversationId?: string
}

export interface FinishEvent {
    type: 'finish'
    finishReason: 'stop' | 'tool-calls' | 'max_iterations' | 'error' | 'length' | 'plan-approval'
    usage?: {
        promptTokens: number
        completionTokens: number
    }
}

export interface ErrorEvent {
    type: 'error'
    error: string
    /**
     * Machine-readable error class (mirrors backend `AgentErrorCode`, e.g.
     * 'LLM_RATE_LIMIT', 'TOOL_TIMEOUT'). Optional — absent on legacy/unclassified
     * errors. Lets the UI decide whether to offer a retry.
     */
    code?: string
    /** Whether the client may retry this request. Optional. */
    retriable?: boolean
}

/** All stream event types */
export type ChatStreamEvent =
    | TextDeltaEvent
    | ReasoningDeltaEvent
    | ToolCallStreamEvent
    | ToolResultEvent
    | AnnotationStreamEvent
    | SessionInfoEvent
    | FinishEvent
    | ErrorEvent

// ============ Chat Response Types ============

export interface ChatResponse {
    /** Full text content accumulated */
    text: string
    /** Reasoning/thinking content accumulated (from reasoning models) */
    reasoningContent?: string
    /** Tool calls made during the stream */
    toolCalls: ToolCall[]
    /** All annotations received */
    annotations: Annotation[]
    /** Session ID from the first SSE event */
    sessionId?: string
    /** Conversation ID */
    conversationId?: string
    /** Finish reason */
    finishReason?: string
    /** Usage statistics */
    usage?: {
        promptTokens: number
        completionTokens: number
    }
}

// ============ Chat Client Options ============

export interface ChatClientOptions {
    /** API base URL (default: '/api/knowledge-agent/api/v1') */
    apiBase?: string
    /** Default model */
    defaultModel?: string
    /** Default temperature */
    defaultTemperature?: number
    /** Default max tokens */
    defaultMaxTokens?: number
}

// ============ Model Info Types ============

export interface ModelInfo {
    /** Model identifier (e.g. 'deepseek-chat', 'gpt-4o') */
    id: string
    /** Human-readable model name */
    name?: string
    /** Provider name (e.g. 'deepseek', 'openai', 'anthropic') */
    provider?: string
    /** Whether this model supports tool calling */
    supportsToolCalling?: boolean
    /** Whether this model supports streaming */
    supportsStreaming?: boolean
    /** Maximum context length */
    contextLength?: number
}

export interface ModelsResponse {
    /** List of available models */
    data: ModelInfo[]
}
