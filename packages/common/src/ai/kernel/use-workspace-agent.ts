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
 * That growth is the point: the workbench's own starter prompts may ask for pages
 * to be written, so a permanently editor-less run could not fulfil them — let
 * alone "做一份可视化报表". Growth is not identity, though: with no document the
 * run is a GENERAL assistant and the document policy is an on-demand capability
 * (see `docs/AGENT_DOCUMENT_DECOUPLING.md`). Writing is one outcome the user can
 * ask for, not the default way to answer.
 */

import { useCallback, useMemo } from 'react'
import { useCapabilityProviders } from '../use-capability-providers'
import { buildAgentRunInputs } from '../capabilities'
import { useLoadedSkills } from '../skills/use-loaded-skills'
import { agentToolAvailableAtScope, filterAgentCatalog } from './filter-catalog'
import { useEditorAgent, type EditorAgentApi } from '../agent/use-editor-agent'
import type { AgentChatMessage } from '../agent/types'
import type { OnToolExecution, OnUserChoiceRequest } from '../types'
import type { CustomAgent } from '../agent/custom-agents'
import type { BackgroundTaskView } from '../agent/background-tasks'
import type { FormRequestView } from '../agent/form-requests'
import {
    buildCustomAgentNote,
    customAgentCapabilities,
    filterCatalogForCustomAgent,
} from '../agent/custom-agents'
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
    /**
     * The page the conversation's working target names (a page artifact shown
     * in the side peek). The workspace binds it as the document edit target, so
     * "open beside" and the agent's tools agree on ONE page. Null/undefined
     * leaves the current target alone (closing a pane ≠ clearing the target).
     */
    focusedPage?: { pageId: string; title?: string; spaceId?: string } | null
    onToolExecution?: OnToolExecution
    /**
     * How `askUserChoice` reaches the user.
     *
     * The workbench's default flow depends on it: "帮我写一份报告" with no
     * document must ASK where the content goes (new page / existing page / only
     * in chat) instead of silently creating a page. A surface that omits it
     * renders no choice UI, and the tool falls back to telling the model to ask
     * in plain text — never to picking an option on the user's behalf.
     */
    onUserChoiceRequest?: OnUserChoiceRequest
    /**
     * A background task finished and the agent did not wait for it: the host
     * injects the note as a new turn. The workbench is where long builds happen,
     * so a surface that omits this loses the completion entirely (the result
     * still sits in `getBackgroundTask` / the artifacts shelf).
     */
    onBackgroundTaskSettled?: (tasks: BackgroundTaskView[], note: string) => void
    /**
     * A filled dynamic form whose answer nobody was waiting for: the workbench is
     * where users fill forms while the run has moved on. Same contract as
     * `onBackgroundTaskSettled` — the host turns the note into a new turn.
     */
    onFormRequestAnswered?: (requests: FormRequestView[], note: string) => void
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
    const target = useWorkspaceDocumentTarget({
        // Ask mode has no tools, so acquiring a hidden editor for a page just to
        // answer a question would be a writer nobody asked for.
        focusedPage: options.mode === 'ask' ? null : options.focusedPage ?? null,
    })
    const sessionBinding = useMemo(() => () => target.binding, [target.binding])

    const providers = useCapabilityProviders(target.editor, {
        onToolExecution: options.onToolExecution,
        onUserChoiceRequest: options.onUserChoiceRequest,
        sessionBinding,
    })

    // A workspace run starts with no editor. Non-document, non-plugin tools are
    // dropped; DOCUMENT tools stay advertised because the run can acquire a
    // page mid-turn (createPage/editPage) and its tool list is frozen when the
    // run is created. Execution binds them to the exact target page or fails
    // with "createPage/editPage first" — a run that starts empty can still write
    // in the same turn. Core-implemented workspace tools declared via
    // `agent.include` register as plugin tools and flow through unchanged. The
    // rule itself lives in filter-catalog (and is checked there), because a
    // protocol tool dropped here is a capability the run was told about but
    // cannot reach.
    const hasDocument = target.editor !== null
    const isAvailableTool = useCallback((name: string) => {
        return agentToolAvailableAtScope(providers.toolProvider.getToolMetadata(name), hasDocument)
    }, [providers.toolProvider, hasDocument])

    // getCatalog's identity changes with the provider version, so the catalog
    // (and therefore tools/skills) refreshes when plugins are installed. The
    // selected custom agent's manual skill/tool configuration is applied LAST,
    // on top of what this scope can run: an agent cannot widen a surface's
    // capabilities, only pick a subset of them.
    const catalog = useMemo(
        () => filterCatalogForCustomAgent(
            filterAgentCatalog(providers.getCatalog(), isAvailableTool),
            options.customAgent,
        ),
        [providers.getCatalog, isAvailableTool, options.customAgent],
    )

    // The agent's skill allow-list, or null when it may use every skill. Handed
    // to `load_skill` so discovery cannot reach a skill the user switched off,
    // and to the run so tools outside the configuration are never advertised as
    // callable (the catalog above already excludes them).
    const agentCapabilities = useMemo(
        () => customAgentCapabilities(options.customAgent),
        [options.customAgent],
    )
    // `[]` is meaningful (an agent with no skills enabled), so it cannot double
    // as "unrestricted": null is the only "all skills" value.
    const allowedSkills = useMemo(
        () => (agentCapabilities ? agentCapabilities.skills : null),
        [agentCapabilities],
    )
    const allowedToolNames = useMemo(
        () => (agentCapabilities ? new Set(catalog.tools.map(tool => tool.function.name)) : null),
        [agentCapabilities, catalog],
    )
    const isRunToolAvailable = useCallback((name: string) => {
        if (allowedToolNames && !allowedToolNames.has(name)) return false
        return isAvailableTool(name)
    }, [allowedToolNames, isAvailableTool])
    // Same allow-list, used by the EXECUTOR: a transcript from before an agent
    // switch (or a delegated child) can ask for a tool the catalog no longer
    // advertises, and that call must be refused rather than run.
    const isRunToolAllowed = useCallback(
        (name: string) => !allowedToolNames || allowedToolNames.has(name),
        [allowedToolNames],
    )
    // What this conversation already discovered: the run ships those tools as
    // callable-but-deferred instead of withholding them for a second `load_skill`
    // round trip (see skills/loaded-skill-cache).
    const loadedSkills = useLoadedSkills(conversationId)
    const { tools, skills, deferredTools } = useMemo(
        () => buildAgentRunInputs(catalog, {
            loadedSkills,
            // No target yet = the workbench is a general run: the document
            // policy stays in the index and is loaded on demand, so the model
            // is not framed as a document editor while it answers, searches or
            // runs a build. Acquiring a page mid-run brings the pack in for the
            // NEXT turn; the `general-assistant` rule covers the current one by
            // asking `load_skill` before the first document write.
            activeCapabilities: hasDocument ? ['document'] : [],
        }),
        [catalog, loadedSkills, hasDocument],
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
        // run here); after `createPage` acquires one, they must be. The selected
        // custom agent's allow-list narrows it further.
        isToolAvailable: isRunToolAvailable,
        isToolAllowed: isRunToolAllowed,
        allowedSkills,
        // Persist the run handle: the dock and this page hand a conversation
        // back and forth at safe boundaries, and the receiving surface needs
        // the handle to attach/replay a run the other one started.
        persist: true,
        // Long tasks finish here too (a studio build runs in the workbench): the
        // host decides how the completion rejoins the conversation.
        onBackgroundTaskSettled: options.onBackgroundTaskSettled,
        // Filled forms arrive here the same way when no tool call is parked on
        // them (the user can answer from the unified inbox at any time).
        onFormRequestAnswered: options.onFormRequestAnswered,
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
