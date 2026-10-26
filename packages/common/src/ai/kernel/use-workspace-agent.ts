/**
 * useWorkspaceAgent — run the agent at `workspace` scope from the workbench.
 *
 * Runtime half of the kernel home. It owns one conversation, and its capability
 * set GROWS with the conversation: a run with no document offers the document-free
 * capabilities (search, file centre, `scope: 'any'` plugin tools), and as soon as
 * the agent creates or edits a page the surface acquires that page's hidden editor
 * ({@link useWorkspaceDocumentTarget}) and rebinds to it, which brings in the whole
 * document tool set plus every page-scoped plugin tool (charts, bitables, …).
 *
 * That growth is the point: the workbench's own starter prompts ask for pages to be
 * written, so a permanently editor-less run could not fulfil them — let alone
 * "做一份可视化报表".
 */

import { useCallback, useMemo } from 'react'
import { useCapabilityProviders } from '../use-capability-providers'
import { buildAgentRunInputs } from '../capabilities'
import { useLoadedSkills } from '../skills/use-loaded-skills'
import { agentToolAvailableAtScope, filterAgentCatalog } from './filter-catalog'
import { useEditorAgent, type EditorAgentApi } from '../agent/use-editor-agent'
import type { AgentChatMessage } from '../agent/types'
import type { OnToolExecution } from '../types'
import type { CustomAgent } from '../agent/custom-agents'
import type { BackgroundTaskView } from '../agent/background-tasks'
import { buildCustomAgentNote } from '../agent/custom-agents'
import { workspaceHomeSkill } from './surface-skills'
import { useWorkspaceDocumentTarget } from './use-workspace-document'
import { buildImageContentParts, type AgentImageData } from '../image/image-attachments'

export interface WorkspaceAgentOptions {
    /**
     * Conversation id. Session-managing hosts pass their active session id so
     * the engine thread (and therefore the transcript) survives a refresh.
     * Omit to get an ephemeral, per-mount conversation.
     */
    conversationId?: string
    /** Space the hero is scoped to, when the surface has one. */
    spaceId?: string
    /**
     * Custom agent whose guidance should ride along as per-turn context. The
     * agent's own prompt is backend-owned and selected from the `workspace` scope.
     */
    customAgent?: CustomAgent | null
    /**
     * Chat mode. `ask` offers no tools at all (read-only Q&A); `agent` (default)
     * ships the workspace catalog. Mirrors the editor chat's Ask/Agent toggle.
     */
    mode?: 'ask' | 'agent'
    onToolExecution?: OnToolExecution
    /**
     * A background task finished and the agent did not wait for it: the host
     * injects the note as a new turn. The workbench is where long builds happen,
     * so a surface that omits this loses the completion entirely (the result
     * still sits in `getBackgroundTask` / the artifacts shelf).
     */
    onBackgroundTaskSettled?: (tasks: BackgroundTaskView[], note: string) => void
}

export interface WorkspaceAgentApi {
    agent: EditorAgentApi
    conversationId: string
    /**
     * Send one user turn. No-op only when the turn has neither text nor images
     * (the backend receives images as multimodal content parts, never as text).
     *
     * Resolves `true` when the turn was steered into a run that was already
     * executing, `false` when it started a new one — the surface uses this to
     * mark the bubble as an interruption rather than a fresh prompt.
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
    ) => Promise<boolean>
}

function newConversationId(): string {
    const cryptoRef = (globalThis as any).crypto
    if (cryptoRef?.randomUUID) return `ws-${cryptoRef.randomUUID()}`
    return `ws-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function useWorkspaceAgent(options: WorkspaceAgentOptions = {}): WorkspaceAgentApi {
    const generatedConversationId = useMemo(() => newConversationId(), [])
    const conversationId = options.conversationId ?? generatedConversationId

    // The document the agent may work on. Null until it creates or opens a page;
    // `createPage` / `editPage` then acquire that page's hidden editor and this
    // rebinds, which is what makes document and page-scoped plugin tools appear.
    const target = useWorkspaceDocumentTarget()
    const sessionBinding = useMemo(() => () => target.binding, [target.binding])

    const providers = useCapabilityProviders(target.editor, {
        onToolExecution: options.onToolExecution,
        sessionBinding,
    })

    // Workspace scope has no editor, so the frontend's built-in (editor-bound)
    // tools are excluded: the run is grounded in plugin-declared capabilities
    // plus the backend's own builtins (web_search, memory, …). Editor tools
    // arrive through their plugin's declaration instead of failing at call
    // time. Core-implemented workspace tools declared via `agent.include`
    // register as plugin tools, so they pass this filter. The rule itself lives
    // in filter-catalog (and is checked there), because a protocol tool dropped
    // here is a capability the run was told about but cannot reach.
    const hasDocument = target.editor !== null
    const isAvailableTool = useCallback((name: string) => {
        return agentToolAvailableAtScope(providers.toolProvider.getToolMetadata(name), hasDocument)
    }, [providers.toolProvider, hasDocument])

    // getCatalog's identity changes with the provider version, so the catalog
    // (and therefore tools/skills) refreshes when plugins are installed.
    const catalog = useMemo(
        () => filterAgentCatalog(providers.getCatalog(), isAvailableTool),
        [providers.getCatalog, isAvailableTool],
    )
    // What this conversation already discovered: the run ships those tools as
    // callable-but-deferred instead of withholding them for a second `load_skill`
    // round trip (see skills/loaded-skill-cache).
    const loadedSkills = useLoadedSkills(conversationId)
    const { tools, skills, deferredTools } = useMemo(
        () => buildAgentRunInputs(catalog, { loadedSkills }),
        [catalog, loadedSkills],
    )

    // Ask mode ships no tools — a pure-text answer over whatever the model can
    // already see. Kept memoized so the tool arrays stay identity-stable.
    const isAskMode = options.mode === 'ask'
    const runTools = useMemo(() => (isAskMode ? [] : tools), [isAskMode, tools])
    // The surface's own framing rides as a prompt-only skill; the shared catalog
    // must not describe the workbench to a document-scoped run.
    const runSkills = useMemo(
        () => (isAskMode ? [] : [workspaceHomeSkill, ...skills]),
        [isAskMode, skills],
    )
    // Overflow past the provider's tool ceiling: callable, schema on first call.
    const runDeferredTools = useMemo(
        () => (isAskMode ? [] : deferredTools),
        [isAskMode, deferredTools],
    )

    const agent = useEditorAgent({
        conversationId,
        tools: runTools,
        skills: runSkills,
        deferredTools: runDeferredTools,
        resolveTools: providers.resolveTools,
        isReadOnlyTool: providers.isReadOnlyTool,
        spaceId: options.spaceId,
        // The page the agent is working on, once it has one.
        pageId: target.pageId,
        // The run steers its own hidden edit target (page tools bind/retarget it).
        sessionBinding,
        // Discovery answers for THIS run: before it has a document, its page-scoped
        // tools must not be offered (they are registered in the client but cannot
        // run here); after `createPage` acquires one, they must be.
        isToolAvailable: isAvailableTool,
        // Fresh surface: never adopt the dock's persisted run handle.
        persist: false,
        // Long tasks finish here too (a studio build runs in the workbench): the
        // host decides how the completion rejoins the conversation.
        onBackgroundTaskSettled: options.onBackgroundTaskSettled,
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
        if (!content && images.length === 0) return false
        // Images ride as multimodal content parts so the model's own vision sees
        // them; nothing here interprets an image locally.
        const contentParts = images.length > 0
            ? buildImageContentParts(content, images)
            : undefined
        const messages: AgentChatMessage[] = [{ role: 'user', content, contentParts }]
        // A run is already executing: hand the turn to it instead of starting a
        // second one (which would cancel it mid-work). The loop folds the turn in
        // at its next safe boundary. Idle → no run id → immediate false, no request.
        if (await agent.steer(messages)) return true
        // A selected custom agent's guidance is context, never part of the prompt.
        const contextNote = [startOptions?.contextNote, buildCustomAgentNote(options.customAgent)]
            .filter(Boolean)
            .join('\n\n') || undefined
        await agent.start(messages, {
            model: startOptions?.model,
            mode: startOptions?.mode ?? 'execute',
            contextNote,
        })
        // agent.start is stable for the life of the hook.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        return false
    }, [agent])

    return { agent, conversationId, send }
}
