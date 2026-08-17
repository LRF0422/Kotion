import type { SubRunRecord } from '@kn/common'

// Types
export interface Message {
    id: string
    content: string
    /** Reasoning/thinking content from reasoning models (e.g. deepseek-reasoner) */
    reasoningContent?: string
    sender: "user" | "ai"
    timestamp: number
    steps?: ExecutionStep[]
    /** Sub-agent delegation records (AgentCore SubRunRecord). */
    subRuns?: SubRunRecord[]
    stopped?: boolean
    error?: boolean
}

export interface ExecutionStep {
    id: string
    /** Stable tool-call id from the backend (correlates start/end events). */
    callId?: string
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
    const message = err?.message || ''
    // The streaming clients throw plain Errors like `V2 Agent API error (401): ...`,
    // so the HTTP status is only recoverable from the message text in that case.
    const statusInMessage = Number(message.match(/\((\d{3})\)/)?.[1])
    const status = err?.status || err?.response?.status || (Number.isNaN(statusInMessage) ? undefined : statusInMessage)

    if (err?.name === 'AbortError' || message.includes('abort')) {
        return { type: 'unknown', message: '生成已停止', retryable: false }
    }

    if (status === 401 || status === 403 || message.includes('auth') || message.includes('unauthorized')) {
        return { type: 'auth', message: '登录状态已失效，请重新登录', retryable: false }
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

// ============ Block Reference Types ============

/** Tool name that produces document-block citations. */
export const REFERENCE_TOOL_NAME = 'referenceBlocks'

/** A single document-block citation produced by the referenceBlocks tool. */
export interface BlockReference {
    blockId: string
    /** Why the agent cited this block (one-liner from the tool call). */
    note?: string
    /** False when the tool couldn't resolve the blockId (deleted/moved). */
    found?: boolean
    blockType?: string
    textPreview?: string
    error?: string
}

/**
 * Collect block references from a message's tool-execution tape. Successful
 * referenceBlocks calls carry the resolved display metadata in
 * `result.references`; entries are deduped by blockId, first occurrence wins.
 */
export function extractBlockReferences(steps?: ExecutionStep[]): BlockReference[] {
    if (!steps) return []
    const seen = new Set<string>()
    const refs: BlockReference[] = []
    for (const step of steps) {
        if (step.toolName !== REFERENCE_TOOL_NAME || step.status !== 'success') continue
        const list = (step.result as any)?.references
        if (!Array.isArray(list)) continue
        for (const ref of list) {
            if (!ref?.blockId || seen.has(ref.blockId)) continue
            seen.add(ref.blockId)
            refs.push(ref)
        }
    }
    return refs
}

// Helper function to format tool names for display
export function formatToolName(toolName: string) {
    return toolName
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .trim()
}

