import type { Editor, Node } from "@kn/editor"

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
    text: string
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
    execute: (args: any) => Promise<any>
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
