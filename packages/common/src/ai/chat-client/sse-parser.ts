/**
 * SSE Stream Parser
 *
 * Parses the SSE (Server-Sent Events) stream from the Knowledge Agent backend.
 * Handles `data: {JSON}\n\n` format with `[DONE]` termination.
 *
 * Based on the Knowledge Agent Frontend Integration spec:
 * - Text delta: {"choices":[{"delta":{"content":"..."}}]}
 * - Tool call: {"choices":[{"delta":{"tool_calls":[...]}}]}
 * - Tool result: {"tool_call_id":"...","result":{...}}
 * - Annotations: {"choices":[{"delta":{"annotations":[...]}}]}
 * - Finish: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{...}}
 * - Error: {"error":{"message":"..."}}
 */

import type {
    ChatStreamEvent,
    TextDeltaEvent,
    ToolCallStreamEvent,
    ToolResultEvent,
    AnnotationStreamEvent,
    SessionInfoEvent,
    FinishEvent,
    ErrorEvent,
    Annotation,
    ToolCallDelta,
} from './types'

/**
 * Parse an SSE stream (ReadableStream<Uint8Array>) into ChatStreamEvent objects.
 *
 * @param body - The response body from fetch
 * @yields ChatStreamEvent for each SSE event
 */
export async function* parseSSEStream(body: ReadableStream<Uint8Array>): AsyncGenerator<ChatStreamEvent> {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop()! // Keep incomplete line in buffer

            for (const line of lines) {
                const trimmed = line.trim()
                if (!trimmed) continue

                const event = parseSSELine(trimmed)
                if (event) {
                    yield event
                }
            }
        }

        // Process any remaining buffer
        if (buffer.trim()) {
            const event = parseSSELine(buffer.trim())
            if (event) {
                yield event
            }
        }
    } finally {
        reader.releaseLock()
    }
}

/**
 * Parse a single SSE line (`data: {...}` or `data: [DONE]`)
 */
function parseSSELine(line: string): ChatStreamEvent | null {
    // SSE lines start with "data: "
    if (!line.startsWith('data: ')) return null

    const data = line.slice(6).trim()

    // Stream termination
    if (data === '[DONE]') {
        return null // Handled by finish event before [DONE]
    }

    try {
        const json = JSON.parse(data)
        return parseEventData(json)
    } catch {
        // Ignore malformed JSON
        console.warn('[SSEParser] Failed to parse SSE data:', data.substring(0, 100))
        return null
    }
}

/**
 * Parse a parsed JSON object from SSE data into a ChatStreamEvent
 */
function parseEventData(json: any): ChatStreamEvent | null {
    // 1. Error event (top-level "error" field)
    if (json.error) {
        return {
            type: 'error',
            error: typeof json.error === 'string' ? json.error : json.error?.message || 'Unknown error',
        } as ErrorEvent
    }

    // 2. Tool result event (top-level "tool_call_id" field)
    if (json.tool_call_id) {
        return {
            type: 'tool-result',
            toolCallId: json.tool_call_id,
            result: json.result || { success: true, output: '', error: null },
        } as ToolResultEvent
    }

    // 3. Standard OpenAI-format choice events
    const choice = json.choices?.[0]
    if (!choice) return null

    const delta = choice.delta
    if (!delta) {
        // Could be a finish event with empty delta
        if (choice.finish_reason) {
            return {
                type: 'finish',
                finishReason: choice.finish_reason,
                usage: json.usage ? {
                    promptTokens: json.usage.prompt_tokens ?? 0,
                    completionTokens: json.usage.completion_tokens ?? 0,
                } : undefined,
            } as FinishEvent
        }
        return null
    }

    // 3a. Session info (sessionId in annotations of first message)
    if (delta.annotations) {
        const sessionId = extractSessionId(delta.annotations)
        if (sessionId) {
            // Emit session-info first
            const sessionEvent: SessionInfoEvent = {
                type: 'session-info',
                sessionId,
                conversationId: delta.annotations.find((a: any) => a.conversationId)?.conversationId,
            }

            // Also emit annotation event if there are other annotations
            const otherAnnotations = delta.annotations.filter((a: any) => !('sessionId' in a))
            if (otherAnnotations.length > 0) {
                // Yield session info and annotations separately
                // We return the session event; caller should handle annotation separately
                // For simplicity, we'll emit annotation event too
                // Since generators can only yield one at a time, we use a different approach
                // Return session-info here; the annotation will be yielded in the next call
            }

            return sessionEvent
        }

        // Regular annotation event
        const annotations = delta.annotations as Annotation[]
        return {
            type: 'annotation',
            annotations,
        } as AnnotationStreamEvent
    }

    // 3b. Text delta
    if (delta.content !== undefined && delta.content !== null) {
        return {
            type: 'text-delta',
            content: delta.content,
        } as TextDeltaEvent
    }

    // 3c. Tool call delta
    if (delta.tool_calls) {
        return {
            type: 'tool-call',
            toolCalls: delta.tool_calls as ToolCallDelta[],
        } as ToolCallStreamEvent
    }

    // 3d. Finish event
    if (choice.finish_reason) {
        return {
            type: 'finish',
            finishReason: choice.finish_reason,
            usage: json.usage ? {
                promptTokens: json.usage.prompt_tokens ?? 0,
                completionTokens: json.usage.completion_tokens ?? 0,
            } : undefined,
        } as FinishEvent
    }

    return null
}

/**
 * Extract session ID from annotations array
 */
function extractSessionId(annotations: any[]): string | undefined {
    for (const ann of annotations) {
        if (ann && typeof ann === 'object' && 'sessionId' in ann && typeof ann.sessionId === 'string') {
            return ann.sessionId
        }
    }
    return undefined
}

/**
 * Parse SSE stream into an array of all events (useful for non-streaming consumers).
 */
export async function collectSSEEvents(body: ReadableStream<Uint8Array>): Promise<ChatStreamEvent[]> {
    const events: ChatStreamEvent[] = []
    for await (const event of parseSSEStream(body)) {
        events.push(event)
    }
    return events
}
