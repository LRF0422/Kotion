/**
 * Knowledge Chat Client
 *
 * Backend-driven chat client that communicates with the Knowledge Agent
 * via the SSE streaming endpoint (/api/v1/chat/completions).
 *
 * Based on the Knowledge Agent Frontend Integration spec.
 */

import { parseSSEStream, collectSSEEvents } from './sse-parser'
import type {
    ChatRequest,
    ChatResponse,
    ChatStreamEvent,
    ChatClientOptions,
    ChatMessage,
    Annotation,
    ToolCall,
} from './types'
import { getBearerHeader } from '../../utils/auth'

export { parseSSEStream, collectSSEEvents } from './sse-parser'
export type * from './types'

const DEFAULT_API_BASE = '/api/knowledge-agent/api/v1'
const DEFAULT_MODEL = 'deepseek-chat'

/**
 * Knowledge Chat Client
 *
 * Provides methods to interact with the Knowledge Agent backend API.
 */
export class KnowledgeChatClient {
    private apiBase: string
    private defaultModel: string
    private defaultTemperature: number
    private defaultMaxTokens: number | undefined

    constructor(options: ChatClientOptions = {}) {
        this.apiBase = options.apiBase || DEFAULT_API_BASE
        this.defaultModel = options.defaultModel || DEFAULT_MODEL
        this.defaultTemperature = options.defaultTemperature ?? 0.7
        this.defaultMaxTokens = options.defaultMaxTokens
    }

    /**
     * Send a chat request and stream the response as ChatStreamEvent objects.
     *
     * @param request - Chat request matching the spec
     * @yields ChatStreamEvent for each SSE event from the backend
     */
    async *chat(request: ChatRequest): AsyncGenerator<ChatStreamEvent> {
        const body = this.buildRequestBody(request)

        const response = await this.fetchWithRetry(`${this.apiBase}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...getBearerHeader(),
            },
            body: JSON.stringify(body),
            signal: request.signal,
        })

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error')
            throw new Error(`Knowledge API error (${response.status}): ${errorText}`)
        }

        if (!response.body) {
            throw new Error('Response body is null')
        }

        yield* parseSSEStream(response.body)
    }

    /**
     * Send a chat request and collect all events into a ChatResponse.
     *
     * @param request - Chat request matching the spec
     * @returns Aggregated chat response
     */
    async chatComplete(request: ChatRequest): Promise<ChatResponse> {
        const result: ChatResponse = {
            text: '',
            toolCalls: [],
            annotations: [],
        }

        for await (const event of this.chat(request)) {
            switch (event.type) {
                case 'text-delta':
                    result.text += event.content
                    break

                case 'tool-call':
                    // Accumulate tool call deltas into complete tool calls
                    for (const tc of event.toolCalls) {
                        const existing = result.toolCalls.find(t => t.id === tc.id)
                        if (existing) {
                            // Append delta
                            if (tc.function?.name) existing.function.name = tc.function.name
                            if (tc.function?.arguments) existing.function.arguments = (existing.function.arguments || '') + tc.function.arguments
                        } else if (tc.id && tc.function?.name) {
                            // New complete tool call
                            result.toolCalls.push({
                                id: tc.id,
                                type: 'function',
                                function: {
                                    name: tc.function.name,
                                    arguments: tc.function.arguments || '',
                                },
                            })
                        }
                    }
                    break

                case 'tool-result':
                    // Tool results are informational for the frontend
                    break

                case 'annotation':
                    result.annotations.push(...event.annotations)
                    break

                case 'session-info':
                    result.sessionId = event.sessionId
                    result.conversationId = event.conversationId
                    break

                case 'finish':
                    result.finishReason = event.finishReason
                    result.usage = event.usage
                    break

                case 'error':
                    throw new Error(event.error)
            }
        }

        return result
    }

    /**
     * Create a text stream from a chat request (async iterable of strings).
     * Useful for backward compatibility with existing streaming consumers.
     *
     * @param request - Chat request
     * @returns Object with textStream (async iterable of strings) and event metadata
     */
    async chatTextStream(request: ChatRequest): Promise<{
        textStream: AsyncIterable<string>
        sessionId?: string
        annotations: Annotation[]
        finishReason?: string
        toolCalls: ToolCall[]
    }> {
        // We need to collect metadata while streaming text
        const metadata = {
            sessionId: undefined as string | undefined,
            annotations: [] as Annotation[],
            finishReason: undefined as string | undefined,
            toolCalls: [] as ToolCall[],
        }

        const self = this

        const textStream = {
            [Symbol.asyncIterator]() {
                return this
            },

            async next() {
                // This approach doesn't work well for a single iterator
                // We'll use a different approach below
                return { done: true as const, value: undefined }
            },
        }

        // Better approach: use the chat generator and wrap it
        const chatGen = self.chat(request)

        const textGenerator = async function* (): AsyncGenerator<string> {
            for await (const event of chatGen) {
                switch (event.type) {
                    case 'text-delta':
                        yield event.content
                        break

                    case 'tool-call':
                        for (const tc of event.toolCalls) {
                            const existing = metadata.toolCalls.find(t => t.id === tc.id)
                            if (existing) {
                                if (tc.function?.name) existing.function.name = tc.function.name
                                if (tc.function?.arguments) existing.function.arguments = (existing.function.arguments || '') + tc.function.arguments
                            } else if (tc.id && tc.function?.name) {
                                metadata.toolCalls.push({
                                    id: tc.id,
                                    type: 'function',
                                    function: {
                                        name: tc.function.name,
                                        arguments: tc.function.arguments || '',
                                    },
                                })
                            }
                        }
                        break

                    case 'annotation':
                        metadata.annotations.push(...event.annotations)
                        break

                    case 'session-info':
                        metadata.sessionId = event.sessionId
                        break

                    case 'finish':
                        metadata.finishReason = event.finishReason
                        break

                    case 'error':
                        throw new Error(event.error)

                    case 'tool-result':
                        // Informational, no text output
                        break
                }
            }
        }

        return {
            textStream: textGenerator(),
            get sessionId() { return metadata.sessionId },
            get annotations() { return metadata.annotations },
            get finishReason() { return metadata.finishReason },
            get toolCalls() { return metadata.toolCalls },
        }
    }

    /**
     * Build the request body from ChatRequest, applying defaults
     */
    private buildRequestBody(request: ChatRequest): Record<string, any> {
        const body: Record<string, any> = {
            model: request.model || this.defaultModel,
            messages: request.messages,
            stream: request.stream !== false,
            temperature: request.temperature ?? this.defaultTemperature,
        }

        if (request.maxTokens ?? this.defaultMaxTokens) {
            body.maxTokens = request.maxTokens ?? this.defaultMaxTokens
        }

        if (request.conversationId) {
            body.conversationId = request.conversationId
        }

        if (request.sessionId) {
            body.sessionId = request.sessionId
        }

        if (request.userId) {
            body.userId = request.userId
        }

        if (request.tools && request.tools.length > 0) {
            body.tools = request.tools
        }

        if (request.data) {
            body.data = request.data
        }

        return body
    }

    /**
     * Fetch with retry logic and exponential backoff.
     * Retries on 429 (rate limit), 502, 503 (server errors), and network errors.
     */
    private async fetchWithRetry(
        url: string,
        options: RequestInit,
        maxRetries = 3
    ): Promise<Response> {
        let lastError: Error | null = null

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const res = await fetch(url, options)

                if (res.status === 429 || res.status === 502 || res.status === 503) {
                    if (attempt < maxRetries) {
                        const delay = Math.min(1000 * Math.pow(2, attempt), 10000)
                        await new Promise(r => setTimeout(r, delay))
                        continue
                    }
                }

                return res
            } catch (e: any) {
                lastError = e

                if (e.name === 'AbortError') throw e

                if (attempt < maxRetries) {
                    const delay = Math.min(1000 * Math.pow(2, attempt), 10000)
                    await new Promise(r => setTimeout(r, delay))
                    continue
                }
            }
        }

        throw lastError || new Error('Request failed after retries')
    }
}

// ============ Helper: Create a chat request from simple input ============

/**
 * Create a ChatRequest from a simple user prompt and optional history.
 */
export function createChatRequest(
    prompt: string,
    options?: {
        messages?: ChatMessage[]
        sessionId?: string
        conversationId?: string
        model?: string
        userId?: number
        tools?: any[]
        data?: Record<string, any>
        signal?: AbortSignal
    }
): ChatRequest {
    const messages: ChatMessage[] = [
        ...(options?.messages || []),
        { role: 'user', content: prompt },
    ]

    return {
        model: options?.model,
        messages,
        stream: true,
        sessionId: options?.sessionId,
        conversationId: options?.conversationId,
        userId: options?.userId,
        tools: options?.tools,
        data: options?.data,
        signal: options?.signal,
    }
}
