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

// Constructed lazily: AgentClient resolves the host transport on first use, and
// this module may be imported before the app registers the runtime.
let defaultClient: AgentClient | null = null
const getDefaultClient = (): AgentClient => (defaultClient ??= new AgentClient())

/**
 * Stream plain text from the AgentCore backend given a full message list
 * (enables multi-turn / refine flows).
 */
export function streamKnowledgeChat(
    messages: AgentChatMessage[],
    options: Omit<StreamTextOptions, 'system'> = {}
): { textStream: AsyncGenerator<string> } {
    const client = getDefaultClient()

    // The AgentCore backend owns the model log: it builds its own system message
    // and silently drops any system-role entry found in messages. Inline callers
    // (translate/polish/... and the AI block) therefore MUST hoist their
    // instruction into the top-level systemPrompt option; leaving it in the
    // message list ran the whole editor-agent base prompt with the instruction
    // lost, which made the model answer with a raw tool-call instead of text.
    const systemInstruction = messages
        .filter((message) => message?.role === 'system' && !!message.content)
        .map((message) => message.content!.trim())
        .filter(Boolean)
        .join('\n\n')
    const conversation = messages.filter((message) => message?.role !== 'system')

    async function* textStream(): AsyncGenerator<string> {
        if (options.signal?.aborted) return

        const conversationId = 'inline-' + Math.random().toString(36).slice(2)
        let runId: string | null = null
        let cancellation: Promise<void> | null = null
        const cancelRun = (): Promise<void> | null => {
            if (!runId) return null
            cancellation ??= client.cancelRun(runId).catch(() => undefined)
            return cancellation
        }
        const handleAbort = () => {
            void cancelRun()
        }
        options.signal?.addEventListener('abort', handleAbort, { once: true })

        try {
            const run = await client.createRun({
                conversationId,
                model: options.model,
                mode: 'execute',
                messages: conversation,
                systemPrompt: systemInstruction || undefined,
                tools: [],
                skills: [],
                noTools: true,
            })
            runId = run.runId
            if (options.signal?.aborted) {
                await cancelRun()
                return
            }

            for await (const event of client.streamEvents(runId, 0, options.signal)) {
                if (event.type === 'text.delta') {
                    yield event.content
                } else if (event.type === 'run.failed') {
                    throw new Error(event.error ?? event.code ?? 'agent failed')
                }
            }
        } finally {
            options.signal?.removeEventListener('abort', handleAbort)
            if (options.signal?.aborted) await cancelRun()
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
