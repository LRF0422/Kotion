// Types
export interface Message {
    id: string
    content: string
    sender: "user" | "ai"
    timestamp: number
    steps?: ExecutionStep[]
    stopped?: boolean
}

export interface ExecutionStep {
    id: string
    toolName: string
    args: any
    result?: any
    status: 'running' | 'success' | 'error'
    timestamp: number
    duration?: number
}

// Pending user choice state
export interface PendingUserChoice {
    request: import("@kn/core").UserChoiceRequest
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

export const INITIAL_MESSAGE: Message = {
    id: "initial-1",
    content: "Hello! I'm your AI assistant. I can help you edit documents, answer questions, and perform various tasks. How can I assist you today?",
    sender: "ai",
    timestamp: Date.now(),
}

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
