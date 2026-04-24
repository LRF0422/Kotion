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
 */
export function getHistoryForAI(
    messages: Message[],
): Array<{ role: 'user' | 'assistant'; content: string }> {
    const relevant = messages
        .slice(-MAX_AI_HISTORY)
        .map(msg => ({
            role: msg.sender === 'user' ? 'user' as const : 'assistant' as const,
            content: msg.content,
        }))

    // Trim from front until within token budget
    let totalTokens = relevant.reduce((sum, m) => sum + estimateTokens(m.content), 0)
    let startIdx = 0
    while (totalTokens > MAX_AI_TOKENS && startIdx < relevant.length - 1) {
        totalTokens -= estimateTokens(relevant[startIdx].content)
        startIdx++
    }

    return relevant.slice(startIdx)
}
