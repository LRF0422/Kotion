/**
 * Knowledge Chat Client — public surface
 *
 * V2-only: the backend-driven agent chat goes through {@link V2ChatClient}
 * (/api/v2/agent/chat semantic SSE). This module also hosts model discovery
 * against the kept /api/v1/models endpoint.
 */

import type { ModelInfo, ModelsResponse } from './types'
import { authorizedFetch } from '../../utils/session'

export { parseV2SSEStream } from './v2-sse-parser'
export { V2ChatClient } from './v2-client'
export type { V2ChatClientOptions, ToolResultPayload } from './v2-client'
export type * from './types'
export * from './agent-definitions'

const DEFAULT_API_BASE = '/api/knowledge-agent/api/v1'

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
