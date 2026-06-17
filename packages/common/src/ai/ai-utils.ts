/**
 * Legacy AI text helpers, now backed by the Knowledge Agent backend.
 *
 * Historically these called DeepSeek directly from the browser with an API key,
 * which never worked in production (no key / CORS). They now delegate to the
 * same backend SSE proxy the chat uses ({@link KnowledgeChatClient}), so every
 * caller (AI Tools, /ai block, /aicomplete, plugin uploader) shares one working
 * path. Prefer {@link streamKnowledgeText} / {@link KnowledgeChatClient} in new code.
 */

import { KnowledgeChatClient } from "./chat-client"
import type { ChatMessage } from "./chat-client/types"

export interface StreamTextOptions {
    /** Abort the underlying request. */
    signal?: AbortSignal
    /** Override the model (defaults to the backend's default, deepseek-chat). */
    model?: string
    /** Optional system instruction prepended before the user prompt. */
    system?: string
}

/**
 * Stream plain text from the Knowledge Agent backend given a full message list
 * (enables multi-turn / refine flows). Returns `{ textStream }` — an async
 * iterable of text deltas. Only `text-delta` events are surfaced; an `error`
 * event rejects the stream.
 */
export function streamKnowledgeChat(
    messages: ChatMessage[],
    options: Omit<StreamTextOptions, "system"> = {}
): { textStream: AsyncGenerator<string> } {
    const client = new KnowledgeChatClient()

    const request = {
        model: options.model,
        messages,
        stream: true as const,
        signal: options.signal,
    }

    async function* textStream(): AsyncGenerator<string> {
        for await (const event of client.chat(request)) {
            if (event.type === "text-delta") {
                yield event.content
            } else if (event.type === "error") {
                throw new Error(event.error)
            }
        }
    }

    return { textStream: textStream() }
}

/**
 * Stream plain text from a single prompt (optionally with a system instruction).
 * Thin wrapper over {@link streamKnowledgeChat}; drop-in for the old
 * `generateText().textStream` consumption pattern.
 */
export function streamKnowledgeText(
    prompt: string,
    options: StreamTextOptions = {}
): { textStream: AsyncGenerator<string> } {
    const messages: ChatMessage[] = []
    if (options.system) messages.push({ role: "system", content: options.system })
    messages.push({ role: "user", content: prompt })

    return streamKnowledgeChat(messages, { model: options.model, signal: options.signal })
}

/**
 * @deprecated Use {@link streamKnowledgeText} or {@link KnowledgeChatClient}.
 * Thin backwards-compatible wrapper kept for existing callers; the second
 * argument (previously `tools`) is ignored.
 */
const generateText = (prompt: string, _tools?: any): { textStream: AsyncGenerator<string> } => {
    return streamKnowledgeText(prompt)
}

export { generateText }
