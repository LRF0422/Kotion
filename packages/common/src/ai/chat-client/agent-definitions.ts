/**
 * Custom Agent Definitions API client.
 *
 * CRUD against the V2 backend (`/api/v2/agent/definitions`). Definitions are
 * tenant-scoped; a definition applies a system prompt, model, backend tool
 * subset and iteration budget when selected for a chat (`agentId`) or used
 * as a delegation target (`delegate_task(agent_name)`).
 */

import { authorizedFetch } from '../../utils/session'

const DEFAULT_API_BASE = '/api/knowledge-agent/api/v2/agent/definitions'

// ============ Types ============

export interface AgentDefinition {
    id: number
    name: string
    description?: string
    systemPrompt: string
    modelName?: string
    /** Backend tool ids; empty/undefined = all backend tools. */
    toolIds?: string[]
    maxIterations?: number
    enabled?: boolean
    createTime?: string
    updateTime?: string
}

/** Create/update payload (id-less). */
export type AgentDefinitionInput = Omit<AgentDefinition, 'id' | 'createTime' | 'updateTime'>

/** Backend tool descriptor for the definition editor's tool multi-select. */
export interface AgentToolInfo {
    id: string
    description?: string
}

/** Backend R<T> envelope. */
interface RResponse<T> {
    code?: number
    success?: boolean
    data?: T
    msg?: string
}

// ============ Helpers ============

async function unwrap<T>(response: Response): Promise<T> {
    if (!response.ok) {
        const text = await response.text().catch(() => 'Unknown error')
        throw new Error(`Agent definitions API error (${response.status}): ${text}`)
    }
    const json: RResponse<T> = await response.json()
    if (json.success === false || (json.code != null && json.code !== 200)) {
        throw new Error(json.msg || 'Agent definitions API request failed')
    }
    return json.data as T
}

function jsonInit(method: string, body?: unknown): RequestInit {
    return {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }
}

// ============ API ============

/** List all custom agent definitions for the current tenant. */
export async function listAgentDefinitions(apiBase?: string): Promise<AgentDefinition[]> {
    const base = apiBase || DEFAULT_API_BASE
    const res = await authorizedFetch(base, { method: 'GET', headers: {} })
    return (await unwrap<AgentDefinition[]>(res)) || []
}

/** Create a custom agent definition. */
export async function createAgentDefinition(
    input: AgentDefinitionInput,
    apiBase?: string
): Promise<AgentDefinition> {
    const base = apiBase || DEFAULT_API_BASE
    const res = await authorizedFetch(base, jsonInit('POST', input))
    return unwrap<AgentDefinition>(res)
}

/** Update a custom agent definition. */
export async function updateAgentDefinition(
    id: number,
    input: AgentDefinitionInput,
    apiBase?: string
): Promise<AgentDefinition> {
    const base = apiBase || DEFAULT_API_BASE
    const res = await authorizedFetch(`${base}/${id}`, jsonInit('PUT', input))
    return unwrap<AgentDefinition>(res)
}

/** Delete a custom agent definition. */
export async function deleteAgentDefinition(id: number, apiBase?: string): Promise<void> {
    const base = apiBase || DEFAULT_API_BASE
    const res = await authorizedFetch(`${base}/${id}`, jsonInit('DELETE'))
    await unwrap<void>(res)
}

/** List backend tools selectable in a definition. */
export async function fetchAgentTools(apiBase?: string): Promise<AgentToolInfo[]> {
    const base = apiBase || DEFAULT_API_BASE
    const res = await authorizedFetch(`${base}/tools`, { method: 'GET', headers: {} })
    return (await unwrap<AgentToolInfo[]>(res)) || []
}
