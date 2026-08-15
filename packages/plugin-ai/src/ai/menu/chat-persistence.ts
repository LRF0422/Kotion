import type { Message } from './chat-types'

// NOTE: the legacy loadMessages/saveMessages/clearPersistedMessages (single-
// session localStorage) were dead code AND collided with the legacy key that
// the multi-session store migrates away from — removed. Session persistence
// lives in chat-sessions.ts / useChatSessions.ts.

const MAX_AI_HISTORY = 20
const MAX_AI_TOKENS = 8000

// Rough token estimate: ~4 chars per token for mixed CJK/English
function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4)
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
