import type { Editor, Node } from "@tiptap/core"

// ============ Configuration Constants ============
export const MAX_CHUNK_SIZE = 2000
export const MAX_NODES_PER_READ = 50
export const CONTEXT_WINDOW = 500

// ============ Block Types ============
export interface BlockInfo {
    pos: number
    size: number
    contentStart: number
    contentEnd: number
    type: string
    /** Truncated preview text (<= 80 chars) for display/serialization */
    text: string
    /** Full text content of the block, used for accurate text-based matching */
    fullText?: string
    level?: number
}

// ============ Node Types ============
export interface NodeInfo {
    from: number
    to: number
    position: number
    type: string
    attrs: Record<string, any>
    marks: any
    textContent?: string
    nodeSize: number
    textStartPos?: number
    textEndPos?: number
    blockId?: string
}

// ============ Document Structure ============
export interface DocumentStructure {
    totalSize: number
    headings: Array<{
        level: number
        text: string
        pos: number
        textInsertPos: number
    }>
    blocks: Array<{
        type: string
        pos: number
        size: number
        textInsertPos?: number
        /** Stable block id — survives edits, preferred for addressing blocks */
        blockId?: string
        /** Truncated text preview (<= 60 chars) so the agent can identify blocks without extra reads */
        textPreview?: string
        /** Nesting depth: 1 = top-level block, 2+ = nested inside a container */
        depth?: number
        /** Heading level (only present for heading blocks) */
        level?: number
    }>
}

// ============ Tool Execution Types ============
export interface ToolExecutionEvent {
    toolName: string
    args: any
    status: 'start' | 'success' | 'error'
    result?: any
    error?: string
    timestamp: number
    duration?: number
    /**
     * Stable tool-call id from the LLM/backend (toolCallId). Lets consumers
     * correlate start/end events even when the same tool runs concurrently.
     */
    callId?: string
}

export type OnToolExecution = (event: ToolExecutionEvent) => void

// ============ User Choice Types ============
export interface UserChoiceOption {
    id: string
    label: string
    description?: string
}

export interface UserChoiceRequest {
    id: string
    question: string
    options: UserChoiceOption[]
    allowCustomInput?: boolean
    timestamp: number
}

export type OnUserChoiceRequest = (request: UserChoiceRequest) => Promise<string>

// ============ Tool Definition Type ============
// Make ToolDefinition more flexible to accommodate various AI tool types
export interface ToolDefinition {
    description: string
    inputSchema: any  // Using any to avoid conflicts with AI library's schema types
    /**
     * Execute the tool. The optional second argument is the stable tool-call
     * id assigned by the backend — executors that surface {@link OnToolExecution}
     * events should include it so start/end events correlate even when the
     * same tool runs concurrently.
     */
    execute: (args: any, callId?: string) => Promise<any>
    // Allow additional properties that might be required by AI library
    [key: string]: any
}

export type ToolsRecord = Record<string, ToolDefinition>

// ============ Tool Context ============
export interface ToolContext {
    editor: Editor
    onUserChoiceRequest?: OnUserChoiceRequest
}

// ============ Tool Discovery Types ============
export type ToolCategory =
    | 'document-read'      // 文档读取
    | 'document-write'     // 文档写入
    | 'document-delete'    // 文档删除
    | 'document-structure' // 文档结构操作
    | 'layout'             // 布局操作
    | 'interaction'        // 用户交互
    | 'web'                // 网络操作
    | 'page'               // 页面级操作（跨页面）
    | 'plugin'             // 插件工具
    | 'discovery'          // 发现工具

export interface ToolMetadata {
    name: string
    category: ToolCategory
    description: string
    priority: number      // 1-10, 越高越重要
    tags: string[]
    loaded: boolean
    source: 'builtin' | 'plugin'
    pluginName?: string   // 来源插件名称
}

export interface CategoryInfo {
    category: ToolCategory
    description: string
    toolCount: number
    loadedCount: number
}

// ============ Skill Types ============
export interface Skill {
    name: string
    description: string
    requiredTools: string[]      // 必需工具
    optionalTools?: string[]     // 可选工具
    systemPromptFragment?: string // 专用 System Prompt 片段
    tags?: string[]
    domain?: string
    source: 'builtin' | 'plugin'
    pluginName?: string
}

export interface SkillActivationResult {
    success: boolean
    skillName: string
    loadedTools: string[]
    failedTools: string[]
    message: string
}

// ============ Provider Types ============
export type ReloadCallback = () => void

export interface ToolProviderState {
    version: number
    loadedTools: string[]
    categories: CategoryInfo[]
}

// ============ Chat Mode / Model Params ============

/** Chat mode: "ask" = Q&A only (read-only), "agent" = can operate the page. */
export type ChatMode = 'ask' | 'agent'

/**
 * User-tunable model parameters that ride along with every chat request.
 * Fields are all optional — an unset value falls back to the backend default.
 */
export type ChatModelParams = {
    /** Sampling temperature (typical range 0.0 – 2.0). */
    temperature?: number
    /** Cap on the response length in tokens. */
    maxTokens?: number
}
