/**
 * Model discovery — the kept /api/v1/models endpoint (ModelController).
 *
 * The legacy chat-client owned model discovery; after its removal this small
 * helper keeps the OpenAI-compatible models list available to the AI plugin.
 */

import { authorizedFetch } from '../utils/session'

export interface ModelInfo {
    /** Model identifier (e.g. 'deepseek-chat', 'gpt-4o') */
    id: string
    /** Human-readable model name */
    name?: string
    /** Provider name (e.g. 'deepseek', 'openai', 'anthropic') */
    provider?: string
    /** Whether this model supports tool calling */
    supportsToolCalling?: boolean
    /** Whether this model supports streaming */
    supportsStreaming?: boolean
    /** Maximum context length */
    contextLength?: number
}

export interface ModelsResponse {
    /** List of available models */
    data: ModelInfo[]
}

/**
 * Fetch available models from the backend /api/v1/models endpoint
 * (ModelController contract is unchanged: { object, data: [{ id, provider, ... }] }).
 *
 * Falls back to an empty list on failure.
 */
export async function fetchModels(): Promise<ModelInfo[]> {
    try {
        const response = await authorizedFetch('/api/knowledge-agent/api/v1/models', {
            method: 'GET',
            headers: {},
        })

        if (!response.ok) {
            console.warn(`[Models] Failed to fetch models (${response.status})`)
            return []
        }

        const json: ModelsResponse | ModelInfo[] = await response.json()

        // Support both { data: [...] } and flat array formats
        const models = Array.isArray(json) ? json : (json.data || [])
        return models
    } catch (error) {
        console.warn('[Models] Failed to fetch models:', error)
        return []
    }
}