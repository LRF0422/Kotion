/**
 * AI text helpers — backed by AgentCore (the redesigned agent API).
 *
 * These helpers stream plain text through the new run protocol
 * (POST /api/agent/v1/runs, then GET /runs/{id}/events) with tools disabled,
 * so inline AI features share the durable, resumable agent path. Only
 * text-delta events are surfaced; run.failed rejects the stream.
 */

import { AgentClient } from './agent'
import type { AgentChatMessage } from './agent/types'

export interface StreamTextOptions {
    /** Abort the underlying request. */
    signal?: AbortSignal
    /** Override the model (defaults to the backend's default, deepseek-chat). */
    model?: string
    /** Optional system instruction prepended before the user prompt. */
    system?: string
}

const defaultClient = new AgentClient()

/**
 * Stream plain text from the AgentCore backend given a full message list
 * (enables multi-turn / refine flows).
 */
export function streamKnowledgeChat(
    messages: AgentChatMessage[],
    options: Omit<StreamTextOptions, 'system'> = {}
): { textStream: AsyncGenerator<string> } {
    const client = defaultClient

    async function* textStream(): AsyncGenerator<string> {
        const conversationId = 'inline-' + Math.random().toString(36).slice(2)
        const run = await client.createRun({
            conversationId,
            model: options.model,
            mode: 'execute',
            messages,
            tools: [],
            skills: [],
            noTools: true,
        })
        for await (const event of client.streamEvents(run.runId, 0, options.signal)) {
            if (event.type === 'text.delta') {
                yield event.content
            } else if (event.type === 'run.failed') {
                throw new Error(event.error ?? event.code ?? 'agent failed')
            }
        }
    }

    return { textStream: textStream() }
}

/**
 * Stream plain text from a single prompt (optionally with a system
 * instruction). Thin wrapper over streamKnowledgeChat.
 */
export function streamKnowledgeText(
    prompt: string,
    options: StreamTextOptions = {}
): { textStream: AsyncGenerator<string> } {
    const messages: AgentChatMessage[] = []
    if (options.system) messages.push({ role: 'system', content: options.system })
    messages.push({ role: 'user', content: prompt })

    return streamKnowledgeChat(messages, { model: options.model, signal: options.signal })
}

/**
 * @deprecated Use streamKnowledgeText.
 * Thin backwards-compatible wrapper kept for existing callers; the second
 * argument (previously tools) is ignored.
 */
const generateText = (prompt: string, _tools?: any): { textStream: AsyncGenerator<string> } => {
    return streamKnowledgeText(prompt)
}

export { generateText }
