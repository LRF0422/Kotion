import type { Editor, Node } from "@kn/editor"

// ============ Configuration Constants ============
export const MAX_CHUNK_SIZE = 2000
export const MAX_NODES_PER_READ = 50
export const CONTEXT_WINDOW = 500
export const WEB_SEARCH_API_URL = '/api/web-search'
export const WEB_SEARCH_MAX_RESULTS = 10

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

// ============ Web Search Types ============
export interface WebSearchResult {
    title: string
    url: string
    snippet: string
    source?: string
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
export interface ToolDefinition {
    description: string
    inputSchema: any
    execute: (args: any) => Promise<any>
}

export type ToolsRecord = Record<string, ToolDefinition>

// ============ Tool Context ============
export interface ToolContext {
    editor: Editor
    onUserChoiceRequest?: OnUserChoiceRequest
}
