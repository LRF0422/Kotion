/**
 * Custom agents — user-defined frontend agents (name + custom guidance).
 *
 * A custom agent is a lightweight persona/instruction set the user can pick
 * when chatting. It is deliberately *not* a skill: skills ship tool schemas and
 * fragments the backend activates, while a custom agent is just a named block of
 * guidance appended to the run's system prompt.
 *
 * Persistence goes through the plugin-config store (server first, localStorage
 * fallback) under a dedicated key. Keeping both the definitions and the current
 * selection in that one config avoids any browser-storage policy in this SDK
 * module (the agent SDK must stay free of localStorage / Web Locks).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PluginConfigStore } from '../../services/plugin-config-service'
import type { PluginConfigData } from '../../services/plugin-config-service'

// ─── Types ──────────────────────────────────────────────────────────

/** A user-configured agent. 'instructions' is the custom guidance. */
export interface CustomAgent {
    id: string
    name: string
    description?: string
    /** Optional illustrated avatar id (see @kn/ui AGENT_AVATAR_IDS). */
    avatar?: string
    /** Optional single emoji shown in pickers/cards (legacy / fallback). */
    emoji?: string
    /** Custom guidance appended to the agent's system prompt. */
    instructions: string
    createdAt: number
    updatedAt: number
}

export interface CustomAgentsConfig extends PluginConfigData {
    agents: CustomAgent[]
    /** Currently selected agent id, persisted with the definitions. */
    selectedAgentId?: string
}

/** Plugin-config key holding the user's custom agents + selection. */
export const CUSTOM_AGENTS_PLUGIN_KEY = 'ai-custom-agents'

/** Upper bounds keep a runaway config from bloating every run's prompt. */
export const MAX_CUSTOM_AGENTS = 50
export const MAX_AGENT_NAME_LENGTH = 60
export const MAX_AGENT_DESCRIPTION_LENGTH = 200
export const MAX_AGENT_INSTRUCTIONS_LENGTH = 20000

// ─── Pure helpers ───────────────────────────────────────────────────

/** Stable-enough unique id for a locally created agent. */
export function createCustomAgentId(): string {
    return 'agent-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
}

function cleanString(value: unknown, max: number): string {
    return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

/** Coerce raw stored JSON into a safe, de-duplicated agent list. */
export function normalizeCustomAgents(value: unknown): CustomAgent[] {
    if (!Array.isArray(value)) return []
    const seen = new Set<string>()
    const out: CustomAgent[] = []
    for (const raw of value) {
        if (!raw || typeof raw !== 'object') continue
        const item = raw as Record<string, unknown>
        const name = cleanString(item.name, MAX_AGENT_NAME_LENGTH)
        // A nameless agent would be unselectable; drop it rather than guess.
        if (!name) continue
        let id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : createCustomAgentId()
        if (seen.has(id)) id = createCustomAgentId()
        seen.add(id)
        const description = cleanString(item.description, MAX_AGENT_DESCRIPTION_LENGTH)
        const emoji = typeof item.emoji === 'string' ? item.emoji.trim().slice(0, 8) : ''
        const avatar = typeof item.avatar === 'string' ? item.avatar.trim().slice(0, 40) : ''
        out.push({
            id,
            name,
            description: description || undefined,
            avatar: avatar || undefined,
            emoji: emoji || undefined,
            instructions: typeof item.instructions === 'string'
                ? item.instructions.slice(0, MAX_AGENT_INSTRUCTIONS_LENGTH)
                : '',
            createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
            updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
        })
        if (out.length >= MAX_CUSTOM_AGENTS) break
    }
    return out
}

/** A selection is only valid while it points at a live agent. */
export function normalizeSelectedAgentId(
    agents: readonly CustomAgent[],
    value: unknown,
): string | null {
    if (typeof value !== 'string' || !value) return null
    return agents.some(agent => agent.id === value) ? value : null
}

/** Look up an agent by id from an already-normalized list. */
export function findCustomAgent(
    agents: readonly CustomAgent[],
    id: string | null | undefined,
): CustomAgent | undefined {
    if (!id) return undefined
    return agents.find(agent => agent.id === id)
}

/**
 * Append a custom agent's guidance to the base frontend system prompt.
 *
 * The base prompt stays first so the provider's prefix cache keeps hitting; the
 * custom block is appended and explicitly told it cannot override the critical
 * editing rules, since it is user-authored text.
 */
export function composeAgentSystemPrompt(
    basePrompt: string | undefined,
    agent: CustomAgent | null | undefined,
): string | undefined {
    const parts: string[] = []
    const base = (basePrompt ?? '').trim()
    if (base) parts.push(base)
    const instructions = (agent?.instructions ?? '').trim()
    if (agent && instructions) {
        const name = agent.name.trim()
        const heading = '# CUSTOM AGENT' + (name ? ': ' + name : '')
        const note = 'The user configured the following guidance for this agent. '
            + 'Follow it in addition to the rules above; if it conflicts with the CRITICAL RULES '
            + 'or the document-safety rules, the rules win.'
        parts.push(heading + '\n\n' + note + '\n\n' + instructions)
    }
    return parts.length > 0 ? parts.join('\n\n') : undefined
}

// ─── Custom-agent registry hook ─────────────────────────────────────

export interface UseCustomAgentsResult {
    agents: CustomAgent[]
    /** Id of the currently selected agent, or null for the default. */
    selectedAgentId: string | null
    /** Resolved selected agent, when it still exists. */
    selectedAgent: CustomAgent | undefined
    loading: boolean
    saving: boolean
    error: string | null
    /** Insert or update one agent (matched by id). */
    saveAgent: (agent: CustomAgent) => Promise<void>
    deleteAgent: (id: string) => Promise<void>
    /** Choose the agent applied to subsequent runs (null = default). */
    selectAgent: (id: string | null) => void
    /** Reload from storage. */
    refresh: () => Promise<void>
}

const EMPTY_AGENTS: CustomAgent[] = []

/**
 * Reactive access to the user's custom agents backed by the plugin-config
 * store. Multiple mounted consumers stay in sync: a save from the settings UI
 * notifies every picker through the store's subscription.
 */
export function useCustomAgents(): UseCustomAgentsResult {
    const store = useMemo(() => PluginConfigStore.getInstance(), [])
    const [agents, setAgents] = useState<CustomAgent[]>(EMPTY_AGENTS)
    const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const agentsRef = useRef(agents)
    agentsRef.current = agents
    const selectedRef = useRef(selectedAgentId)
    selectedRef.current = selectedAgentId

    const applyConfig = useCallback((config: unknown) => {
        const source = config as CustomAgentsConfig | null | undefined
        const list = normalizeCustomAgents(source?.agents)
        setAgents(list)
        setSelectedAgentId(normalizeSelectedAgentId(list, source?.selectedAgentId))
    }, [])

    useEffect(() => {
        let cancelled = false
        void (async () => {
            try {
                const config = await store.getConfig<CustomAgentsConfig>(CUSTOM_AGENTS_PLUGIN_KEY)
                if (!cancelled) applyConfig(config)
            } catch (err: any) {
                if (!cancelled) setError(err?.message ?? String(err))
            } finally {
                if (!cancelled) setLoading(false)
            }
        })()

        const unsubscribe = store.subscribe(CUSTOM_AGENTS_PLUGIN_KEY, updated => {
            if (!cancelled) applyConfig(updated)
        })
        return () => {
            cancelled = true
            unsubscribe()
        }
    }, [store, applyConfig])

    const persist = useCallback(async (nextAgents: CustomAgent[], nextSelected: string | null) => {
        setSaving(true)
        setError(null)
        // Optimistic: the hybrid store writes localStorage before the server, so
        // the list stays usable even when the API call fails.
        setAgents(nextAgents)
        setSelectedAgentId(nextSelected)
        try {
            const payload: CustomAgentsConfig = { agents: nextAgents }
            if (nextSelected) payload.selectedAgentId = nextSelected
            await store.saveConfig(CUSTOM_AGENTS_PLUGIN_KEY, payload)
        } catch (err: any) {
            setError(err?.message ?? String(err))
        } finally {
            setSaving(false)
        }
    }, [store])

    const saveAgent = useCallback(async (agent: CustomAgent) => {
        const current = agentsRef.current
        const exists = current.some(item => item.id === agent.id)
        const hasRoom = exists || current.length < MAX_CUSTOM_AGENTS
        const next = exists
            ? current.map(item => (item.id === agent.id ? agent : item))
            : hasRoom
                ? [...current, agent]
                : current
        // The first agent a user creates becomes active, so they can chat with
        // it immediately without a second step.
        const created = !exists && next !== current
        const nextSelected = selectedRef.current ?? (created ? agent.id : null)
        await persist(next, nextSelected)
    }, [persist])

    const deleteAgent = useCallback(async (id: string) => {
        const next = agentsRef.current.filter(agent => agent.id !== id)
        await persist(next, selectedRef.current === id ? null : selectedRef.current)
    }, [persist])

    const selectAgent = useCallback((id: string | null) => {
        const next = id && agentsRef.current.some(agent => agent.id === id) ? id : null
        if (next === selectedRef.current) return
        void persist(agentsRef.current, next)
    }, [persist])

    const refresh = useCallback(async () => {
        try {
            const config = await store.getConfig<CustomAgentsConfig>(CUSTOM_AGENTS_PLUGIN_KEY)
            applyConfig(config)
            setError(null)
        } catch (err: any) {
            setError(err?.message ?? String(err))
        }
    }, [store, applyConfig])

    const selectedAgent = useMemo(
        () => findCustomAgent(agents, selectedAgentId),
        [agents, selectedAgentId],
    )

    return {
        agents,
        selectedAgentId,
        selectedAgent,
        loading,
        saving,
        error,
        saveAgent,
        deleteAgent,
        selectAgent,
        refresh,
    }
}

/** Selection-only convenience over {@link useCustomAgents}. */
export function useSelectedCustomAgentId(): [string | null, (id: string | null) => void] {
    const { selectedAgentId, selectAgent } = useCustomAgents()
    return [selectedAgentId, selectAgent]
}
