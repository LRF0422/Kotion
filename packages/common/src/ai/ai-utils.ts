/**
 * AI text helpers, backed by the Knowledge Agent V2 TASK API.
 *
 * These helpers stream plain text through the async task protocol
 * (POST /tasks → GET /tasks/{id}/events) instead of the legacy synchronous
 * /chat endpoint, so inline AI features share the durable, resumable agent
 * path. Only `text-delta` events are surfaced; an `error` event rejects the
 * stream.
 */

import { parseV2SSEStream } from "./chat-client/v2-sse-parser"
import type { ChatMessage } from "./chat-client/types"
import { authorizedFetch } from "../utils/session"

const TASK_API_BASE = "/api/knowledge-agent/api/v2/agent/tasks"

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
 * iterable of text deltas.
 */
export function streamKnowledgeChat(
    messages: ChatMessage[],
    options: Omit<StreamTextOptions, "system"> = {}
): { textStream: AsyncGenerator<string> } {
    async function* textStream(): AsyncGenerator<string> {
        // 1. Create the async task (returns immediately with a taskId).
        const createResponse = await authorizedFetch(TASK_API_BASE, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: options.model,
                messages,
                stream: true,
                temperature: 0.7,
                toolChoice: 'none',
            }),
            signal: options.signal,
        })
        if (!createResponse.ok) {
            throw new Error(`Agent API error (${createResponse.status})`)
        }
        const json = await createResponse.json().catch(() => ({} as any))
        const taskId = json?.data?.taskId as string | undefined
        if (!taskId) {
            throw new Error("Agent API returned no taskId")
        }

        // 2. Stream the task's events (replay + live).
        const response = await authorizedFetch(`${TASK_API_BASE}/${taskId}/events`, {
            method: "GET",
            headers: {},
            signal: options.signal,
        })
        if (!response.ok) {
            throw new Error(`Agent task events error (${response.status})`)
        }
        if (!response.body) {
            throw new Error("Agent task events response body is null")
        }

        for await (const event of parseV2SSEStream(response.body)) {
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
 * @deprecated Use {@link streamKnowledgeText}.
 * Thin backwards-compatible wrapper kept for existing callers; the second
 * argument (previously `tools`) is ignored.
 */
const generateText = (prompt: string, _tools?: any): { textStream: AsyncGenerator<string> } => {
    return streamKnowledgeText(prompt)
}

export { generateText }
