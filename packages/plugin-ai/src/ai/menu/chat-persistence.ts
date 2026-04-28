import { Message, INITIAL_MESSAGES } from './chat-types'

const STORAGE_KEY = 'kn-ai-chat-messages'
const MAX_PERSISTED = 50
const MAX_AI_HISTORY = 20
const MAX_AI_TOKENS = 8000

// Rough token estimate: ~4 chars per token for mixed CJK/English
function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4)
}

export function loadMessages(): Message[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return [...INITIAL_MESSAGES]
        const parsed = JSON.parse(raw) as Message[]
        if (!Array.isArray(parsed) || parsed.length === 0) return [...INITIAL_MESSAGES]
        return parsed
    } catch {
        return [...INITIAL_MESSAGES]
    }
}

export function saveMessages(messages: Message[]): void {
    try {
        const toSave = messages.slice(-MAX_PERSISTED)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
    } catch {
        // Storage full or unavailable — silently ignore
    }
}

export function clearPersistedMessages(): void {
    try {
        localStorage.removeItem(STORAGE_KEY)
    } catch {
        // Silently ignore
    }
}

/**
 * Build history for AI context: take recent messages,
 * and trim from the front if total tokens exceed budget.
 *
 * NOTE: For DeepSeek thinking-mode (deepseek-reasoner) and similar
 * reasoning models, the `reasoning_content` of previous assistant
 * turns MUST be preserved when sending the conversation back to the
 * backend, otherwise the provider returns 400 invalid_request_error:
 *   "The `reasoning_content` in the thinking mode must be passed back to the API."
 */
export function getHistoryForAI(
    messages: Message[],
): Array<{ role: 'user' | 'assistant'; content: string; reasoning_content?: string }> {
    const relevant = messages
        .slice(-MAX_AI_HISTORY)
        .map(msg => {
            const role = msg.sender === 'user' ? 'user' as const : 'assistant' as const
            const entry: { role: 'user' | 'assistant'; content: string; reasoning_content?: string } = {
                role,
                content: msg.content,
            }
            // Preserve reasoning content for assistant turns produced by
            // reasoning models so the backend can forward it to providers
            // that require it (e.g. DeepSeek thinking mode).
            if (role === 'assistant' && msg.reasoningContent) {
                entry.reasoning_content = msg.reasoningContent
            }
            return entry
        })

    // Trim from front until within token budget (count reasoning_content too
    // since it is sent over the wire for assistant messages).
    const tokensOf = (m: { content: string; reasoning_content?: string }) =>
        estimateTokens(m.content) + (m.reasoning_content ? estimateTokens(m.reasoning_content) : 0)
    let totalTokens = relevant.reduce((sum, m) => sum + tokensOf(m), 0)
    let startIdx = 0
    while (totalTokens > MAX_AI_TOKENS && startIdx < relevant.length - 1) {
        totalTokens -= tokensOf(relevant[startIdx])
        startIdx++
    }

    return relevant.slice(startIdx)
}
