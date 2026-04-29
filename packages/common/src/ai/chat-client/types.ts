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
    }>
}

export interface SubagentStatusAnnotation {
    type: 'subagent_status'
    agentId: string
    status: 'spawned' | 'working' | 'completed' | 'error'
    detail?: string
}

export interface SubagentOutputAnnotation {
    type: 'subagent_output'
    agentId: string
    content: string
}

export interface SubagentToolCallAnnotation {
    type: 'subagent_tool_call'
    agentId: string
    toolName: string
    toolCallId: string
}

export interface SubagentToolResultAnnotation {
    type: 'subagent_tool_result'
    agentId: string
    toolCallId: string
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

/** All annotation types from the spec */
export type Annotation =
    | AgentStatusAnnotation
    | DelegateStartAnnotation
    | SubagentStatusAnnotation
    | SubagentOutputAnnotation
    | SubagentToolCallAnnotation
    | SubagentToolResultAnnotation
    | DelegateResultAnnotation
    | ContextCompressedAnnotation

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
    finishReason: 'stop' | 'tool-calls' | 'max_iterations' | 'error' | 'length'
    usage?: {
        promptTokens: number
        completionTokens: number
    }
}

export interface ErrorEvent {
    type: 'error'
    error: string
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
