/**
 * useWorkspaceAgent — run the agent at `workspace` scope, with no editor.
 *
 * Runtime half of the kernel home. It owns one conversation, builds the
 * tool/skill catalog from the currently installed plugins (page-scoped document
 * tools are excluded by scope — see PluginManager#filterContributionByScope),
 * and drives the run through the same AgentCore SDK the editor panel uses.
 *
 * No editor means: document tools are simply absent from the catalog, and any
 * plugin tool declared `scope: 'any'` (e.g. plugin-studio) still works.
 */

import { useCallback, useMemo } from 'react'
import { useCapabilityProviders } from '../use-capability-providers'
import { buildAgentRunInputs } from '../capabilities'
import { filterAgentCatalog } from './filter-catalog'
import { useEditorAgent, type EditorAgentApi } from '../agent/use-editor-agent'
import type { AgentChatMessage } from '../agent/types'
import type { OnToolExecution } from '../types'
import { buildImageContentParts, type AgentImageData } from '../image/image-attachments'
import { WORKSPACE_AGENT_PROMPT } from './prompts'

export interface WorkspaceAgentOptions {
    /**
     * Conversation id. Session-managing hosts pass their active session id so
     * the engine thread (and therefore the transcript) survives a refresh.
     * Omit to get an ephemeral, per-mount conversation.
     */
    conversationId?: string
    /** Space the hero is scoped to, when the surface has one. */
    spaceId?: string
    /** Override the invariant host rules (defaults to WORKSPACE_AGENT_PROMPT). */
    systemPrompt?: string
    /**
     * Chat mode. `ask` offers no tools at all (read-only Q&A); `agent` (default)
     * ships the workspace catalog. Mirrors the editor chat's Ask/Agent toggle.
     */
    mode?: 'ask' | 'agent'
    onToolExecution?: OnToolExecution
}

export interface WorkspaceAgentApi {
    agent: EditorAgentApi
    conversationId: string
    /**
     * Send one user turn. No-op only when the turn has neither text nor images
     * (the backend receives images as multimodal content parts, never as text).
     */
    send: (
        text: string,
        options?: {
            model?: string
            mode?: 'execute' | 'plan'
            images?: AgentImageData[]
            /** Per-turn volatile context (e.g. the working target). */
            contextNote?: string
        },
    ) => Promise<void>
}

function newConversationId(): string {
    const cryptoRef = (globalThis as any).crypto
    if (cryptoRef?.randomUUID) return `ws-${cryptoRef.randomUUID()}`
    return `ws-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function useWorkspaceAgent(options: WorkspaceAgentOptions = {}): WorkspaceAgentApi {
    const generatedConversationId = useMemo(() => newConversationId(), [])
    const conversationId = options.conversationId ?? generatedConversationId

    // `null` editor: workspace scope. The provider resolves built-in tools plus
    // every plugin tool whose scope covers `workspace`.
    const providers = useCapabilityProviders(null, { onToolExecution: options.onToolExecution })

    // Workspace scope has no editor, so the frontend's built-in (editor-bound)
    // tools are excluded: the run is grounded in plugin-declared capabilities
    // plus the backend's own builtins (web_search, memory, …). Editor tools
    // arrive through their plugin's declaration instead of failing at call
    // time. Core-implemented workspace tools declared via `agent.include`
    // register as plugin tools, so they pass this filter.
    const isAvailableTool = useCallback((name: string) => {
        return providers.toolProvider.getToolMetadata(name)?.source === 'plugin'
    }, [providers.toolProvider])

    // getCatalog's identity changes with the provider version, so the catalog
    // (and therefore tools/skills) refreshes when plugins are installed.
    const catalog = useMemo(
        () => filterAgentCatalog(providers.getCatalog(), isAvailableTool),
        [providers.getCatalog, isAvailableTool],
    )
    const { tools, skills } = useMemo(() => buildAgentRunInputs(catalog), [catalog])

    // Ask mode ships no tools — a pure-text answer over whatever the model can
    // already see. Kept memoized so the tool arrays stay identity-stable.
    const isAskMode = options.mode === 'ask'
    const runTools = useMemo(() => (isAskMode ? [] : tools), [isAskMode, tools])
    const runSkills = useMemo(() => (isAskMode ? [] : skills), [isAskMode, skills])

    const agent = useEditorAgent({
        conversationId,
        tools: runTools,
        skills: runSkills,
        resolveTools: providers.resolveTools,
        isReadOnlyTool: providers.isReadOnlyTool,
        systemPrompt: options.systemPrompt ?? WORKSPACE_AGENT_PROMPT,
        spaceId: options.spaceId,
        // No page: this surface never binds a document.
        pageId: undefined,
        // Fresh surface: never adopt the dock's persisted run handle.
        persist: false,
    })

    const send = useCallback(async (
        text: string,
        startOptions?: {
            model?: string
            mode?: 'execute' | 'plan'
            images?: AgentImageData[]
            contextNote?: string
        },
    ) => {
        const content = text.trim()
        const images = startOptions?.images ?? []
        if (!content && images.length === 0) return
        // Images ride as multimodal content parts so the model's own vision sees
        // them; nothing here interprets an image locally.
        const contentParts = images.length > 0
            ? buildImageContentParts(content, images)
            : undefined
        const messages: AgentChatMessage[] = [{ role: 'user', content, contentParts }]
        await agent.start(messages, {
            model: startOptions?.model,
            mode: startOptions?.mode ?? 'execute',
            contextNote: startOptions?.contextNote,
        })
        // agent.start is stable for the life of the hook.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [agent])

    return { agent, conversationId, send }
}
