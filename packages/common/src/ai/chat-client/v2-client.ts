/**
 * V2 Chat Client
 *
 * Chat client that communicates with the V2 Agent engine via the semantic
 * SSE endpoint (/api/v2/agent/chat). Yields the same ChatStreamEvent union
 * as the V1 client so the AgentHarness works unchanged.
 *
 * Key differences from V1:
 * - Endpoint: /api/v2/agent/chat (POST)
 * - SSE format: Named events (event: think.delta) instead of OpenAI data-only
 * - Session lifecycle: Explicit session.created / session.completed events
 * - Tool execution: Backend handles tool routing; frontend only handles FRONTEND tools
 *
 * Usage:
 * ```ts
 * const client = new V2ChatClient()
 * for await (const event of client.chat(request)) {
 *   // Same ChatStreamEvent types as V1
 * }
 * ```
 */

import { parseV2SSEStream } from './v2-sse-parser'
import type {
    ChatRequest,
    ChatStreamEvent,
    ChatClientOptions,
    ChatMessage,
} from './types'
import { authorizedFetch } from '../../utils/session'

const DEFAULT_V2_API_BASE = '/api/knowledge-agent/api/v2/agent'

export interface V2ChatClientOptions extends ChatClientOptions {
    /** API base URL for V2 (default: '/api/knowledge-agent/api/v2/agent') */
    apiBase?: string
}

/**
 * V2 Chat Client
 *
 * Connects to the V2 semantic SSE endpoint and yields ChatStreamEvent objects
 * compatible with the existing harness and hook infrastructure.
 */
export class V2ChatClient {
    private apiBase: string
    private defaultModel: string
    private defaultTemperature: number
    private defaultMaxTokens: number | undefined

    constructor(options: V2ChatClientOptions = {}) {
        this.apiBase = options.apiBase || DEFAULT_V2_API_BASE
        this.defaultModel = options.defaultModel || 'deepseek-chat'
        this.defaultTemperature = options.defaultTemperature ?? 0.7
        this.defaultMaxTokens = options.defaultMaxTokens
    }

    /**
     * Send a chat request to the V2 endpoint and stream the response.
     *
     * The response uses the V2 semantic SSE protocol (named events) which
     * is transparently mapped to ChatStreamEvent for backward compatibility.
     *
     * @param request - Chat request (same format as V1)
     * @yields ChatStreamEvent for each SSE event from the V2 backend
     */
    async *chat(request: ChatRequest): AsyncGenerator<ChatStreamEvent> {
        const body = this.buildRequestBody(request)

        const response = await this.fetchWithRetry(`${this.apiBase}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            signal: request.signal,
        })

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error')
            throw new Error(`V2 Agent API error (${response.status}): ${errorText}`)
        }

        if (!response.body) {
            throw new Error('Response body is null')
        }

        yield* parseV2SSEStream(response.body)
    }

    /**
     * Send tool execution results back to the V2 backend to resume a suspended session.
     *
     * When the V2 engine dispatches a FRONTEND tool and enters SUSPENDED state,
     * the frontend executes the tool locally and posts the result here to resume.
     *
     * @param sessionId - The suspended session ID
     * @param toolResults - Array of tool results to send back
     */
    async resumeSession(sessionId: string, toolResults: ToolResultPayload[]): Promise<AsyncGenerator<ChatStreamEvent>> {
        const response = await this.fetchWithRetry(`${this.apiBase}/chat/resume`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                sessionId,
                toolResults,
            }),
        })

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error')
            throw new Error(`V2 resume error (${response.status}): ${errorText}`)
        }

        if (!response.body) {
            throw new Error('Response body is null')
        }

        return parseV2SSEStream(response.body)
    }

    /**
     * Build the request body for V2. Uses the same format as V1's
     * ChatCompletionRequest for easy migration.
     */
    private buildRequestBody(request: ChatRequest): Record<string, any> {
        const body: Record<string, any> = {
            model: request.model || this.defaultModel,
            messages: request.messages,
            stream: true, // V2 always streams
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

        if (request.skills && request.skills.length > 0) {
            body.skills = request.skills
        }

        if (request.tools && request.tools.length > 0) {
            body.tools = request.tools
        }

        if (request.capabilitiesVersion) {
            body.capabilitiesVersion = request.capabilitiesVersion
        }

        if (request.mode) {
            body.mode = request.mode
        }

        if (request.data) {
            body.data = request.data
        }

        return body
    }

    /**
     * Fetch with retry logic and exponential backoff.
     */
    private async fetchWithRetry(
        url: string,
        options: RequestInit,
        maxRetries = 3
    ): Promise<Response> {
        let lastError: Error | null = null

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const res = await authorizedFetch(url, options)

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

// ============ Types ============

export interface ToolResultPayload {
    toolCallId: string
    toolName: string
    result: string
    success: boolean
}
