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
    ChatStreamEvent,
    ChatClientOptions,
    ChatMessage,
    ModelInfo,
    ModelsResponse,
} from './types'
import { authorizedFetch } from '../../utils/session'

export { parseSSEStream, collectSSEEvents } from './sse-parser'
export { parseV2SSEStream } from './v2-sse-parser'
export { V2ChatClient } from './v2-client'
export type { V2ChatClientOptions, ToolResultPayload } from './v2-client'
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
        skills?: import('./types').SkillPayload[]
        tools?: import('./types').ToolPayload[]
        capabilitiesVersion?: string
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
        skills: options?.skills,
        tools: options?.tools,
        capabilitiesVersion: options?.capabilitiesVersion,
        data: options?.data,
        signal: options?.signal,
    }
}

// ============ Model Discovery ============

/**
 * Fetch available models from the backend /api/v1/models endpoint.
 *
 * Follows the OpenAI-compatible models API format.
 * Falls back to an empty list on failure.
 *
 * @param apiBase - Optional API base URL (default: '/api/knowledge-agent/api/v1')
 */
export async function fetchModels(apiBase?: string): Promise<ModelInfo[]> {
    const base = apiBase || DEFAULT_API_BASE
    try {
        const response = await authorizedFetch(`${base}/models`, {
            method: 'GET',
            headers: {},
        })

        if (!response.ok) {
            console.warn(`[Models] Failed to fetch models (${response.status})`)
            return []
        }

        const json: ModelsResponse = await response.json()

        // Support both { data: [...] } and flat array formats
        const models = Array.isArray(json) ? json : (json.data || [])
        return models
    } catch (error) {
        console.warn('[Models] Failed to fetch models:', error)
        return []
    }
}
