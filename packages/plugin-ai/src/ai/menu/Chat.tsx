import React, { useState, useCallback, useEffect, useMemo, useRef } from "react"
import { Sparkles } from "@kn/icon"
import {
    ExpandableChat,
    ExpandableChatHeader,
    ExpandableChatBody,
    ExpandableChatFooter,
    ChatMessageList,
} from "@kn/ui"
import { Editor } from "@kn/editor"
import type { ChangeTrackerStorage } from "@kn/editor"
import {
    useEditorAgent,
    useCapabilityProviders,
    buildAgentRunInputs,
    getAgentDocumentBridge,
    getOffscreenEditorBridge,
    getPageNavigationBridge,
    setSessionPageBinding,
    clearSessionPageBinding,
    revealBlockById,
    PageEditWindow,
    event,
    useTranslation,
    DOCK_PANEL_RUNNING,
    EDITOR_AGENT_PROMPT,
} from "@kn/common"
import type {
    AgentDocumentMergeReport,
    ChatMode,
    ChatModelParams,
    OffscreenEditorHandle,
    UserChoiceRequest,
    AgentChatMessage,
    AgentStepRecord,
    ToolCallRecord,
    SessionPageBinding,
    SessionPageBindingPage,
} from "@kn/common"

import { PlanApprovalCard } from "@kn/ui"
import {
    ExecutionStep, PendingUserChoice, ChatError,
    classifyError, sanitizeToolPayload,
} from "./chat-types"
import type { BlockReference, Message } from "./chat-types"
import type { ChatTargetPage } from "./chat-sessions"
import { useChatSessions } from "./useChatSessions"
import { MessageBubble } from "./MessageBubble"
import { ErrorDisplay } from "./ErrorDisplay"
import { ChatHeader } from "./chat/ChatHeader"
import { ChatEmptyState } from "./chat/ChatEmptyState"
import { ChatComposer } from "./chat/ChatComposer"
import type { TargetPageStatus } from "./chat/PageMentionPicker"
import { UserChoiceCard } from "./chat/UserChoiceCard"
import { useModelPreference } from "../model-preference"

// ─── Persistence keys ──────────────────────────────────────────────

const MODE_STORAGE_KEY = 'kn_chat_mode'
const MODEL_PARAMS_STORAGE_KEY = 'kn_chat_model_params'

/** Max off-screen edit targets held at once (matches the off-screen engine's session cap). */
const MAX_OFFSCREEN_TARGETS = 3

/** Parse persisted model-param JSON, ignoring malformed or out-of-range values. */
const readModelParams = (): ChatModelParams => {
    try {
        const raw = localStorage.getItem(MODEL_PARAMS_STORAGE_KEY)
        if (!raw) return {}
        const parsed = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object') return {}
        const out: ChatModelParams = {}
        if (typeof parsed.temperature === 'number' && Number.isFinite(parsed.temperature)) {
            out.temperature = parsed.temperature
        }
        if (typeof parsed.maxTokens === 'number' && Number.isFinite(parsed.maxTokens) && parsed.maxTokens > 0) {
            out.maxTokens = Math.floor(parsed.maxTokens)
        }
        return out
    } catch {
        return {}
    }
}

/** The editor's change-tracker storage, when the extension is mounted. */
const getChangeTracker = (editor: Editor | null | undefined): ChangeTrackerStorage | undefined =>
    (editor?.storage as any)?.changeTracker as ChangeTrackerStorage | undefined

/** Map AgentCore tool-call records onto the chat UI's execution-step tape. */
const toolCallsToSteps = (calls: ToolCallRecord[]): ExecutionStep[] =>
    calls.map(tc => ({
        id: tc.callId,
        callId: tc.callId,
        toolName: tc.tool,
        args: sanitizeToolPayload(tc.args),
        result: sanitizeToolPayload(tc.result),
        error: sanitizeToolPayload(tc.error) as string | undefined,
        status: tc.status,
        timestamp: 0,
        step: tc.step,
        stepId: tc.stepId,
        sequence: tc.startedSeq ?? tc.completedSeq,
        duration: tc.durationMs,
        subRunId: tc.subRunId,
    }))

/** Read the canonical user-facing answer chosen by the shared Agent state. */
const selectFinalAnswer = (
    activitySteps: AgentStepRecord[],
    answerStepId: string | null | undefined,
    fallback: string,
): string => {
    if (activitySteps.length === 0) return fallback
    const answer = answerStepId
        ? activitySteps.find(step => step.id === answerStepId)
        : undefined
    return answer?.text ?? ''
}

// ─── Chat ──────────────────────────────────────────────────────────

/**
 * Main Chat surface for the AI plugin.  This component owns state and
 * orchestrates the run lifecycle via the AgentCore SDK (useEditorAgent); the
 * visual pieces (header, empty state, composer, user-choice card, message
 * bubbles) live in dedicated files under ./chat and ./ so this file stays
 * readable.
 *
 * `embedded` drops the floating shell so a host container (the side dock) can
 * own the frame; `onClose` is what that host's close affordance should do.
 */
export const ExpandableChatDemo: React.FC<{
    /**
     * Active editor to bind document tools to. Optional: the chat stays mounted
     * (and any in-flight run keeps going) while no page editor is published.
     */
    editor?: Editor
    embedded?: boolean
    onClose?: () => void
}> = ({ editor, embedded, onClose }) => {
    const { t } = useTranslation()

    // ─── Model / mode preferences (persisted) ─────────────────────
    const [selectedModel, handleModelChange] = useModelPreference()

    const [chatMode, setChatMode] = useState<ChatMode>(() => {
        try {
            const stored = localStorage.getItem(MODE_STORAGE_KEY)
            return stored === 'ask' || stored === 'agent' ? stored : 'agent'
        } catch { return 'agent' }
    })
    const handleModeChange = useCallback((mode: ChatMode) => {
        setChatMode(mode)
        try { localStorage.setItem(MODE_STORAGE_KEY, mode) } catch { /* ignore */ }
    }, [])

    // Sampling params (temperature, maxTokens). Empty object = fall back to
    // whatever the backend model defaults to; persisted so tweaks survive reloads.
    const [modelParams, setModelParams] = useState<ChatModelParams>(readModelParams)
    const handleModelParamsChange = useCallback((next: ChatModelParams) => {
        setModelParams(next)
        try {
            if (next.temperature === undefined && next.maxTokens === undefined) {
                localStorage.removeItem(MODEL_PARAMS_STORAGE_KEY)
            } else {
                localStorage.setItem(MODEL_PARAMS_STORAGE_KEY, JSON.stringify(next))
            }
        } catch { /* ignore */ }
    }, [])

    // ─── User-choice bridge ───────────────────────────────────────
    const [pendingChoice, setPendingChoice] = useState<PendingUserChoice | null>(null)
    const [customInput, setCustomInput] = useState("")
    const pendingChoiceRef = useRef<PendingUserChoice | null>(null)

    const handleUserChoiceRequest = useCallback((request: UserChoiceRequest): Promise<string> => {
        return new Promise((resolve, reject) => {
            const choice: PendingUserChoice = { request, resolve, reject }
            pendingChoiceRef.current = choice
            setPendingChoice(choice)
        })
    }, [])

    const handleOptionSelect = useCallback((optionId: string) => {
        if (pendingChoiceRef.current) {
            pendingChoiceRef.current.resolve(optionId)
            pendingChoiceRef.current = null
            setPendingChoice(null)
            setCustomInput("")
        }
    }, [])

    const handleCustomSubmit = useCallback(() => {
        if (pendingChoiceRef.current && customInput.trim()) {
            pendingChoiceRef.current.resolve(customInput.trim())
            pendingChoiceRef.current = null
            setPendingChoice(null)
            setCustomInput("")
        }
    }, [customInput])

    const handleCancelChoice = useCallback(() => {
        if (pendingChoiceRef.current) {
            pendingChoiceRef.current.reject(new Error('User cancelled the choice'))
            pendingChoiceRef.current = null
            setPendingChoice(null)
            setCustomInput("")
        }
    }, [])

    // ─── Multi-session store ──────────────────────────────────────
    const {
        sessions,
        activeSessionId,
        messages,
        setMessages,
        createSession,
        switchSession,
        deleteSession,
        clearActiveMessages,
        targetPage,
        setTargetPage,
    } = useChatSessions()

    // ─── Off-screen target editor (@-page binding) ──────────────
    const [offscreenHandle, setOffscreenHandle] = useState<OffscreenEditorHandle | null>(null)
    const [targetStatus, setTargetStatus] = useState<TargetPageStatus>('idle')
    const offscreenHandleRef = useRef<OffscreenEditorHandle | null>(null)
    offscreenHandleRef.current = offscreenHandle
    const [acquireAttempt, setAcquireAttempt] = useState(0)

    const offscreenTargetsRef = useRef<Map<string, OffscreenEditorHandle>>(new Map())

    /**
     * Per-agent (delegated sub-run) edit targets. The main agent keeps using the
     * conversation target; a child that calls `editPage` gets its own page — and
     * its own editor lease — so parallel agents stop fighting over one target
     * and one document.
     */
    const ownerTargetsRef = useRef<Map<string, ChatTargetPage>>(new Map())
    const ownerHandlesRef = useRef<Map<string, OffscreenEditorHandle>>(new Map())
    /** In-flight per-agent acquisitions, so concurrent calls share one lease. */
    const ownerAcquireRef = useRef<Map<string, Promise<{ pageId: string; editor: any }>>>(new Map())

    const releaseTarget = useCallback((pageId: string) => {
        const handle = offscreenTargetsRef.current.get(pageId)
        if (!handle) return
        offscreenTargetsRef.current.delete(pageId)
        try { handle.release() } catch { /* already released */ }
    }, [])

    const releaseAllTargets = useCallback(() => {
        const handles = [...offscreenTargetsRef.current.values()]
        offscreenTargetsRef.current.clear()
        handles.forEach(handle => { try { handle.release() } catch { /* ignore */ } })
    }, [])

    /** True while any delegated agent still edits this page. */
    const pageHeldByOwner = useCallback((pageId: string): boolean => {
        const wanted = String(pageId)
        for (const target of ownerTargetsRef.current.values()) {
            if (String(target.pageId) === wanted) return true
        }
        return false
    }, [])

    /**
     * Point ONE agent at a page: acquire (or reuse) the editor its document
     * tools must act on, without touching the conversation target. Concurrent
     * requests for the same agent share one acquisition (the pool is
     * ref-counted; two acquires would leak a reference).
     */
    const acquireOwnerTarget = useCallback(async (
        owner: string,
        page: SessionPageBindingPage,
    ): Promise<{ pageId: string; title?: string; spaceId?: string; editor: any }> => {
        const pageId = String(page.pageId)
        const pending = ownerAcquireRef.current.get(owner)
        if (pending) {
            const acquired = await pending
            if (String(acquired.pageId) === pageId) return acquired
        }

        const run = (async () => {
            const target: ChatTargetPage = {
                pageId,
                title: page.title || '',
                spaceId: page.spaceId,
            }
            const existing = ownerHandlesRef.current.get(owner)
            if (existing && existing.pageId === pageId) {
                ownerTargetsRef.current.set(owner, target)
                return { ...target, editor: existing.editor }
            }
            if (existing) {
                // Retargeting an owner that held a shared lease: drop that lease
                // inline (releaseOwner is declared later in this component).
                ownerHandlesRef.current.delete(owner)
                try { existing.release() } catch { /* already released */ }
            }
            ownerTargetsRef.current.set(owner, target)

            const currentPageId = getPageNavigationBridge()?.getCurrentPage()?.pageId
            if (currentPageId !== undefined && String(currentPageId) === pageId) {
                // The page the user has open is its own editor.
                return { ...target, editor }
            }
            const bridge = getOffscreenEditorBridge()
            if (!bridge) throw new Error('离屏编辑器不可用')
            const handle = await bridge.acquire(pageId)
            ownerHandlesRef.current.set(owner, handle)
            return { ...target, editor: handle.editor }
        })()

        ownerAcquireRef.current.set(owner, run)
        try {
            return await run
        } finally {
            if (ownerAcquireRef.current.get(owner) === run) ownerAcquireRef.current.delete(owner)
        }
    }, [editor])

    /** The page a given agent edits (owner null → the conversation target). */
    const getPageFor = useCallback((owner?: string | null): SessionPageBindingPage | null => {
        if (owner) {
            const target = ownerTargetsRef.current.get(owner)
            if (target) return { ...target }
        }
        return boundPageRef.current ? { ...boundPageRef.current } : null
    }, [])

    /** Acquire (or reuse) the live off-screen editor for a page. */
    const activateOffscreenTarget = useCallback(async (page: ChatTargetPage): Promise<OffscreenEditorHandle> => {
        const pageId = String(page.pageId)
        const cached = offscreenTargetsRef.current.get(pageId)
        if (cached) {
            // Refresh recency so eviction drops the least-recently *used* target.
            offscreenTargetsRef.current.delete(pageId)
            offscreenTargetsRef.current.set(pageId, cached)
            return cached
        }
        const bridge = getOffscreenEditorBridge()
        if (!bridge) throw new Error('离屏编辑器不可用')
        // Never exceed the engine's session cap: drop the oldest other target
        // before acquiring so the engine's own LRU can reclaim it. A page a
        // delegated agent is still editing is never dropped.
        if (offscreenTargetsRef.current.size >= MAX_OFFSCREEN_TARGETS) {
            const oldest = [...offscreenTargetsRef.current.keys()]
                .find(id => id !== pageId && !pageHeldByOwner(id))
            if (oldest) releaseTarget(oldest)
        }
        const handle = await bridge.acquire(pageId)
        offscreenTargetsRef.current.set(pageId, handle)
        return handle
    }, [releaseTarget, pageHeldByOwner])

    /**
     * The shared (live) editor for a page: the visible editor when the page is
     * open, otherwise its off-screen session. Used both to fork a private
     * document and as the merge target when an agent finishes.
     */
    const resolveSharedEditorForPage = useCallback(async (page: ChatTargetPage): Promise<any | null> => {
        const currentPageId = getPageNavigationBridge()?.getCurrentPage()?.pageId
        if (currentPageId !== undefined && String(currentPageId) === String(page.pageId)) return editor
        try {
            const handle = await activateOffscreenTarget(page)
            return handle?.editor ?? null
        } catch (error) {
            console.error('Failed to acquire the shared editor for the page:', error)
            return null
        }
    }, [editor, activateOffscreenTarget])

    /**
     * Drop one delegated agent: merge its private document back into the live
     * page (report returned), then release every editor it held.
     */
    const releaseOwner = useCallback(async (
        owner: string,
        options?: { commit?: boolean },
    ): Promise<AgentDocumentMergeReport | null> => {
        const docBridge = getAgentDocumentBridge()
        const page = ownerTargetsRef.current.get(owner) ?? null
        let report: AgentDocumentMergeReport | null = null
        const shouldCommit = options?.commit !== false

        if (shouldCommit && docBridge?.get(owner) && page) {
            const liveEditor = await resolveSharedEditorForPage(page)
            if (liveEditor) {
                try {
                    report = await docBridge.commit(owner, liveEditor)
                } catch (error) {
                    console.error('Failed to merge the agent document:', error)
                }
            }
        }
        if (docBridge?.get(owner)) docBridge.release(owner)

        // Fallback path (no private document): release the shared lease.
        const handle = ownerHandlesRef.current.get(owner)
        ownerHandlesRef.current.delete(owner)
        ownerTargetsRef.current.delete(owner)
        ownerAcquireRef.current.delete(owner)
        if (handle) {
            try { handle.release() } catch { /* already released */ }
        }
        return report
    }, [resolveSharedEditorForPage])

    // Teardown (panel close / conversation switch): discard rather than merge.
    // A private document lives in this tab only, and writing a half-finished
    // child document into the page is worse than losing it — the child run
    // itself keeps running server-side.
    const releaseAllOwners = useCallback(() => {
        const owners = [...ownerTargetsRef.current.keys()]
        owners.forEach(owner => { void releaseOwner(owner, { commit: false }) })
    }, [releaseOwner])


    const targetPageRef = useRef<ChatTargetPage | undefined>(targetPage)
    targetPageRef.current = targetPage
    const targetPageId = targetPage?.pageId

    // Run-scoped edit target: a turn freezes the page it edits. While the run
    // is active, browsing other pages must not redirect its document tools. The
    // pin is expressed through targetPage (so the existing off-screen machinery
    // keeps an editor on it) and released at the terminal phase, unless the
    // target changed meanwhile (user pick / agent editPage).
    const autoPinnedPageIdRef = useRef<string | null>(null)
    const releaseRunTargetPin = useCallback(() => {
        const pinned = autoPinnedPageIdRef.current
        if (!pinned) return
        autoPinnedPageIdRef.current = null
        if (targetPageRef.current?.pageId === pinned) setTargetPage(null)
    }, [setTargetPage])

    useEffect(() => {
        const requested = targetPageRef.current
        if (!targetPageId || !requested) {
            setOffscreenHandle(null)
            setTargetStatus('idle')
            return
        }
        const currentPageId = getPageNavigationBridge()?.getCurrentPage()?.pageId
        if (currentPageId && String(currentPageId) === String(targetPageId)) {
            // The open page is its own editor — drop any off-screen handle so
            // document tools act on the visible editor.
            setOffscreenHandle(null)
            setTargetStatus('current')
            return
        }
        // Already acquired (e.g. through the editPage tool) → reuse it without
        // flashing through 'connecting' and briefly disabling auto-execution.
        const cached = offscreenTargetsRef.current.get(String(targetPageId))
        if (cached) {
            setOffscreenHandle(cached)
            setTargetStatus('ready')
            return
        }
        let cancelled = false
        setTargetStatus('connecting')
        activateOffscreenTarget(requested)
            .then(handle => {
                if (cancelled) return
                setOffscreenHandle(handle)
                setTargetStatus('ready')
            })
            .catch(err => {
                console.error('Failed to acquire off-screen editor:', err)
                if (!cancelled) setTargetStatus('error')
            })
        return () => { cancelled = true }
    }, [activeSessionId, targetPageId, acquireAttempt, editor, activateOffscreenTarget])

    // Off-screen sessions are shared per page and survive target switches; only
    // release them when the conversation changes or the panel unmounts. The same
    // goes for delegated agents' targets: their owner ids are run-scoped and a
    // new conversation can never reuse them.
    useEffect(() => () => {
        releaseAllOwners()
        releaseAllTargets()
    }, [activeSessionId, releaseAllOwners, releaseAllTargets])

    const handleRetryPage = useCallback(() => setAcquireAttempt(n => n + 1), [])

    const [currentPage, setCurrentPage] = useState<ChatTargetPage | undefined>()
    useEffect(() => {
        let tries = 0
        const read = () => {
            const info = getPageNavigationBridge()?.getCurrentPage()
            if (!info?.pageId) return false
            setCurrentPage({
                pageId: String(info.pageId),
                title: info.title || '',
                spaceId: info.spaceId,
            })
            return !!info.title
        }
        if (read()) return
        const timer = setInterval(() => {
            if (read() || ++tries >= 20) clearInterval(timer)
        }, 500)
        return () => clearInterval(timer)
    }, [editor])

    const [editWindowPageId, setEditWindowPageId] = useState<string | null>(null)
    const handleOpenPageWindow = useCallback(() => {
        if (targetPage) setEditWindowPageId(targetPage.pageId)
    }, [targetPage])

    // ─── Session page binding bridge ─────────────────────────────
    // Page tools (createPage / openPage / editPage) live in core and cannot
    // reach this session's state. They call through this registry so a page the
    // agent targets becomes the conversation's off-screen edit target instead
    // of navigating away.
    const boundPageRef = useRef<ChatTargetPage | undefined>(targetPage)
    boundPageRef.current = targetPage

    const bindTargetPage = useCallback((page: SessionPageBindingPage): ChatTargetPage => {
        const record: ChatTargetPage = {
            pageId: String(page.pageId),
            title: page.title || '',
            spaceId: page.spaceId,
        }
        // Update synchronously so a tool later in the same batch already sees it.
        boundPageRef.current = record
        targetPageRef.current = record
        setTargetPage(record)
        return record
    }, [setTargetPage])

    const switchEditTarget = useCallback(async (page: SessionPageBindingPage): Promise<{ record: ChatTargetPage; handle: OffscreenEditorHandle | null }> => {
        const record: ChatTargetPage = {
            pageId: String(page.pageId),
            title: page.title || '',
            spaceId: page.spaceId,
        }
        const visiblePageId = getPageNavigationBridge()?.getCurrentPage()?.pageId
        if (visiblePageId !== undefined && String(visiblePageId) === record.pageId) {
            return { record, handle: null }
        }
        const handle = await activateOffscreenTarget(record)
        return { record, handle }
    }, [activateOffscreenTarget])

    // ─── Block reference navigation ─────────────────────────────
    const [pendingReveal, setPendingReveal] = useState<{ pageId: string; blockId: string } | null>(null)

    const handleRevealReference = useCallback((ref: BlockReference) => {
        if (ref.found === false) return
        if (editor && revealBlockById(editor, ref.blockId)) return
        if (targetPage) {
            const currentPageId = getPageNavigationBridge()?.getCurrentPage()?.pageId
            if (currentPageId !== undefined && String(currentPageId) === targetPage.pageId) return
            setPendingReveal({ pageId: targetPage.pageId, blockId: ref.blockId })
            getPageNavigationBridge()?.openPage(targetPage.pageId, targetPage.spaceId)
        }
    }, [editor, targetPage])

    useEffect(() => {
        if (!pendingReveal) return
        let tries = 0
        const timer = setInterval(() => {
            const currentPageId = getPageNavigationBridge()?.getCurrentPage()?.pageId
            const arrived = currentPageId !== undefined && String(currentPageId) === pendingReveal.pageId
            if (arrived && editor && revealBlockById(editor, pendingReveal.blockId)) {
                clearInterval(timer)
                setPendingReveal(null)
                return
            }
            if (++tries >= 20) {
                clearInterval(timer)
                setPendingReveal(null)
            }
        }, 300)
        return () => clearInterval(timer)
    }, [pendingReveal, editor])

    const agentEditor = (offscreenHandle?.editor as Editor) ?? editor
    const agentEditorRef = useRef<Editor | undefined>(editor)
    agentEditorRef.current = agentEditor

    // ─── Change tracking ──────────────────────────────────────────
    const [tracking, setTracking] = useState(false)
    useEffect(() => {
        const storage = getChangeTracker(agentEditor)
        if (!storage) {
            setTracking(false)
            return
        }
        setTracking(storage.enabled)
        return storage.subscribe(() => setTracking(storage.enabled))
    }, [agentEditor])

    const handleToggleTracking = useCallback(() => {
        const storage = getChangeTracker(agentEditorRef.current)
        if (!storage) return
        if (storage.enabled) storage.stop()
        else storage.start()
    }, [])

    // ─── AgentCore driver ─────────────────────────────────────────
    const isAskMode = chatMode === 'ask'
    const { getCatalog, rebindEditor, resolveTools, isReadOnlyTool } = useCapabilityProviders(agentEditor, {
        onUserChoiceRequest: handleUserChoiceRequest,
    })
    const catalog = useMemo(() => getCatalog(), [getCatalog])
    // tools[] carries the always-on schemas; skill-owned tools ride inside
    // skills[] and stay deferred until the model calls one.
    const { tools: toolSpecs, skills } = useMemo(() => buildAgentRunInputs(catalog), [catalog])

    // ─── Session page binding bridge ─────────────────────────────
    // Registered after the capability hook so editPage can rebind the live tool
    // set synchronously. Page tools (createPage / openPage / editPage) live in
    // core and cannot reach this session's state; they call through this registry
    // so a page the agent targets becomes the conversation's off-screen edit
    // target instead of navigating away.
    useEffect(() => {
        const binding: SessionPageBinding = {
            bindPage: (page) => { bindTargetPage(page) },
            getBoundPage: () => (boundPageRef.current ? { ...boundPageRef.current } : null),
            openPageWindow: (pageId) => setEditWindowPageId(String(pageId)),
            editPage: async (page) => {
                const { record, handle } = await switchEditTarget(page)
                const targetEditor = (handle?.editor as Editor) ?? editor
                // Rebind built-in AND plugin tools to the target editor in one
                // synchronous step so document tools later in the same backend
                // batch already act on it — no stale-editor window.
                rebindEditor(targetEditor)
                offscreenHandleRef.current = handle
                if (handle) {
                    setOffscreenHandle(handle)
                    setTargetStatus('ready')
                } else {
                    setOffscreenHandle(null)
                    setTargetStatus('current')
                }
                bindTargetPage(record)
                return { ...record, editor: targetEditor }
            },
            getEditor: () => (offscreenHandleRef.current?.editor as Editor) ?? editor,
            // ─── Per-agent (delegated child) targeting ───────────────
            getPageFor,
            getEditorFor: (owner: string) => {
                // A forked private document wins: its tools must act on the
                // agent's own copy, never the shared page.
                const privateDoc = getAgentDocumentBridge()?.get(owner)?.editor
                if (privateDoc) return privateDoc
                const handle = ownerHandlesRef.current.get(owner)
                if (handle?.editor) return handle.editor
                const target = ownerTargetsRef.current.get(owner)
                if (target) {
                    const currentPageId = getPageNavigationBridge()?.getCurrentPage()?.pageId
                    if (currentPageId !== undefined && String(currentPageId) === String(target.pageId)) {
                        return editor
                    }
                }
                // Nothing yet: the async path decides (fork on writes, live page
                // for reads).
                return null
            },
            // The synchronous lookup above cannot acquire; when a child has a
            // target but no editor yet (it pointed at the page the user had open
            // and the user navigated away), wait for its own session instead of
            // silently letting its tools hit the conversation document.
            getEditorForAsync: async (owner: string, options?: { mutating?: boolean }) => {
                const docBridge = getAgentDocumentBridge()
                const existing = docBridge?.get(owner)?.editor
                if (existing) return existing

                const target = ownerTargetsRef.current.get(owner) ?? boundPageRef.current
                if (!target) return null
                // Read-only work reads the live page: no fork, no snapshot cost,
                // and no staleness for research-style children.
                if (!options?.mutating || !docBridge) return null

                const source = await resolveSharedEditorForPage(target)
                if (!source) return null
                try {
                    const handle = await docBridge.fork(
                        owner,
                        String(target.pageId),
                        source,
                        target.title,
                    )
                    ownerTargetsRef.current.set(owner, target)
                    return handle.editor
                } catch (error) {
                    // Over the fork cap (or a bad source): degrade to the shared
                    // document, which the write lease still serializes.
                    console.warn('[agent] private document unavailable, using the shared document:', error)
                    return null
                }
            },
            editPageFor: async (owner: string, page: SessionPageBindingPage) => {
                const target: ChatTargetPage = {
                    pageId: String(page.pageId),
                    title: page.title || '',
                    spaceId: page.spaceId,
                }
                ownerTargetsRef.current.set(owner, target)
                const docBridge = getAgentDocumentBridge()
                const source = await resolveSharedEditorForPage(target)
                if (docBridge && source) {
                    try {
                        const handle = await docBridge.fork(owner, target.pageId, source, target.title)
                        return { ...target, editor: handle.editor }
                    } catch (error) {
                        console.warn('[agent] private document unavailable, using the shared document:', error)
                    }
                }
                if (!source) throw new Error('离屏编辑器不可用')
                // Degraded path: the shared editor for that page (+ write lease).
                return { ...target, editor: source }
            },
            releaseOwner,
            isOwnerIsolated: (owner: string) => Boolean(getAgentDocumentBridge()?.get(owner)),
            getPageForEditor: (targetEditor: any) => {
                if (!targetEditor) return null
                // A forked private document belongs to one agent's page.
                const docBridge = getAgentDocumentBridge()
                if (docBridge) {
                    for (const [owner, target] of ownerTargetsRef.current) {
                        if (docBridge.get(owner)?.editor === targetEditor) return { ...target }
                    }
                }
                for (const [owner, handle] of ownerHandlesRef.current) {
                    if (handle?.editor === targetEditor) {
                        const target = ownerTargetsRef.current.get(owner)
                        if (target) return { ...target }
                    }
                }
                // A child bound to the page the user has open uses the visible
                // editor, which the parent may share: resolving by *page* keeps
                // both agents on the same (correct) document.
                if (targetEditor === editor) {
                    const currentPageId = getPageNavigationBridge()?.getCurrentPage()?.pageId
                    if (currentPageId !== undefined) {
                        for (const target of ownerTargetsRef.current.values()) {
                            if (String(target.pageId) === String(currentPageId)) return { ...target }
                        }
                    }
                }
                return null
            },
        }
        setSessionPageBinding(binding)
        return () => clearSessionPageBinding(binding)
    }, [bindTargetPage, switchEditTarget, rebindEditor, editor, getPageFor, acquireOwnerTarget, releaseOwner])
    const liveCurrentPageId = getPageNavigationBridge()?.getCurrentPage()?.pageId
    const targetToolsReady = !targetPageId
        ? !!currentPage?.pageId
        : ((targetStatus === 'current' && String(liveCurrentPageId) === targetPageId)
            || (targetStatus === 'ready' && offscreenHandle?.pageId === targetPageId))

    // A child bound to the page the user had open must keep its own editor if
    // the user navigates away: promote it to an off-screen session eagerly, so
    // its next tool call does not have to wait for the acquisition.
    useEffect(() => {
        for (const [owner, target] of ownerTargetsRef.current) {
            if (ownerHandlesRef.current.has(owner) || ownerAcquireRef.current.has(owner)) continue
            if (liveCurrentPageId !== undefined && String(liveCurrentPageId) === String(target.pageId)) continue
            void acquireOwnerTarget(owner, target).catch(error => {
                console.error('Failed to promote delegated agent target off-screen:', error)
            })
        }
    }, [liveCurrentPageId, acquireOwnerTarget])

    const agent = useEditorAgent({
        conversationId: activeSessionId,
        tools: isAskMode ? [] : toolSpecs,
        skills: isAskMode ? [] : skills,
        // Editor rules the backend cannot import; appended to its base prompt.
        systemPrompt: isAskMode ? undefined : EDITOR_AGENT_PROMPT,
        resolveTools,
        // Mutating calls are serialized per document (write lease), and a
        // delegated child resolves its tools against its own editor.
        isReadOnlyTool,
        // A page switch transiently unbinds the editor; defer a pending tool
        // batch until the new editor is published instead of failing it.
        autoExecuteTools: targetToolsReady && !!agentEditor,
        spaceId: targetPage?.spaceId ?? currentPage?.spaceId,
        pageId: targetPage?.pageId ?? currentPage?.pageId,
    })

    // Re-attach at most once per session activation. Without this guard, resetting
    // a completed run immediately triggers another attach while the backend is
    // still clearing thread.activeRunId, replaying the same assistant output.
    const attachAttemptedSessionRef = useRef<string | null>(null)
    useEffect(() => {
        if (!targetToolsReady || agent.state.phase !== 'idle' || agent.state.runId) return
        if (attachAttemptedSessionRef.current === activeSessionId) return
        attachAttemptedSessionRef.current = activeSessionId
        void agent.attach()
    }, [activeSessionId, targetToolsReady, agent.state.phase, agent.state.runId, agent.attach])

    // ─── Composer state ───────────────────────────────────────────
    const [input, setInput] = useState("")
    const [error, setError] = useState<ChatError | null>(null)

    const isActive =
        agent.state.phase === 'creating' ||
        agent.state.phase === 'streaming' ||
        agent.state.phase === 'waiting-tools' ||
        agent.state.phase === 'waiting-approval' ||
        agent.state.phase === 'suspended'

    const currentSteps = useMemo(() => toolCallsToSteps(agent.state.toolCalls), [agent.state.toolCalls])
    const liveMessage = useMemo<Message>(() => ({
        id: 'active-agent-turn',
        content: selectFinalAnswer(agent.state.steps, agent.state.answerStepId, agent.state.text),
        reasoningContent: agent.state.reasoning || undefined,
        activitySteps: agent.state.steps,
        answerStepId: agent.state.answerStepId ?? undefined,
        sender: 'ai',
        timestamp: Date.now(),
        steps: currentSteps,
        subRuns: agent.state.subRuns,
    }), [agent.state.answerStepId, agent.state.reasoning, agent.state.steps, agent.state.subRuns, agent.state.text, currentSteps])

    useEffect(() => {
        event.emit(DOCK_PANEL_RUNNING, { id: 'agent', running: isActive })
    }, [isActive])

    useEffect(() => {
        return () => { event.emit(DOCK_PANEL_RUNNING, { id: 'agent', running: false }) }
    }, [])

    const lastUserMessageRef = useRef<string>("")
    const composerRef = useRef<HTMLTextAreaElement>(null)

    const generateMessageId = useCallback(
        () => 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        [],
    )

    // ─── Run lifecycle: snapshot terminal turns into history ─────
    const abandoningRef = useRef(false)
    const lastPhaseRef = useRef(agent.state.phase)
    useEffect(() => {
        const phase = agent.state.phase
        if (lastPhaseRef.current === phase) return
        lastPhaseRef.current = phase
        if (phase === 'completed' || phase === 'failed' || phase === 'cancelled') {
            releaseRunTargetPin()
            if (abandoningRef.current) {
                agent.reset()
                return
            }
            const steps = toolCallsToSteps(agent.state.toolCalls)
            const content = selectFinalAnswer(agent.state.steps, agent.state.answerStepId, agent.state.text)
            const classifiedError = phase === 'failed'
                ? classifyError(new Error(agent.state.error ?? ''))
                : undefined
            const hasContent = Boolean(
                content.trim() || steps.length > 0 || agent.state.steps.length > 0
                || agent.state.subRuns.length > 0 || classifiedError
            )
            if (hasContent) {
                const snapshot: Message = {
                    id: generateMessageId(),
                    content,
                    reasoningContent: agent.state.reasoning || undefined,
                    activitySteps: agent.state.steps.map(step => ({ ...step })),
                    answerStepId: agent.state.answerStepId ?? undefined,
                    sender: 'ai',
                    timestamp: Date.now(),
                    steps,
                    subRuns: agent.state.subRuns.slice(),
                    usage: agent.state.usage ?? undefined,
                    error: phase === 'failed',
                    errorType: classifiedError?.type,
                    errorMessage: classifiedError?.message,
                }
                setMessages(prev => [...prev, snapshot])
            }
            agent.reset()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [agent.state.phase])

    const abandonAgent = useCallback(async () => {
        abandoningRef.current = true
        // Release before switching sessions so the pin is cleared on the
        // session that owns it, not the one we are about to activate.
        releaseRunTargetPin()
        const cancelled = await agent.cancel().catch(() => false)
        if (cancelled) agent.reset()
        abandoningRef.current = false
    }, [agent, releaseRunTargetPin])

    // ─── Submit ───────────────────────────────────────────────────
    const submitMessage = useCallback(async (messageText: string) => {
        const userMessage: Message = {
            id: generateMessageId(),
            content: messageText,
            sender: "user",
            timestamp: Date.now(),
        }
        setMessages((prev) => [...prev, userMessage])
        lastUserMessageRef.current = messageText
        setError(null)

        // Freeze the page this turn edits. Navigation during the run then only
        // moves the viewport; the agent keeps editing the same page (through an
        // off-screen editor once it is no longer the visible one).
        const runTarget = targetPage ?? (currentPage?.pageId
            ? { pageId: currentPage.pageId, title: currentPage.title, spaceId: currentPage.spaceId }
            : undefined)
        if (!targetPage && runTarget) {
            autoPinnedPageIdRef.current = runTarget.pageId
            setTargetPage(runTarget)
        }

        const prompt = runTarget
            ? t('ai.chat.boundPagePrefix', { title: runTarget.title }) + '\n' + messageText
            : messageText

        // Conversation history is engine-owned (session model log); the client
        // only sends the new turn.
        const agentMessages: AgentChatMessage[] = [{ role: 'user', content: prompt }]

        try {
            await agent.start(agentMessages, {
                model: selectedModel || undefined,
                mode: 'execute',
                temperature: modelParams.temperature,
                maxTokens: modelParams.maxTokens,
            })
        } catch (err: any) {
            setError(classifyError(err))
        }
    }, [
        agent, generateMessageId, targetPage, currentPage, setTargetPage,
        selectedModel, modelParams, setMessages, t,
    ])

    const handleSend = useCallback(() => {
        const text = input.trim()
        if (!text || isActive || !targetToolsReady) return
        setInput("")
        submitMessage(text)
        requestAnimationFrame(() => {
            if (composerRef.current) composerRef.current.style.height = 'auto'
            composerRef.current?.focus()
        })
    }, [input, isActive, targetToolsReady, submitMessage])

    const handleInputChange = useCallback((value: string) => {
        setInput(value)
        if (error) setError(null)
    }, [error])

    const handleQuickSubmit = useCallback((prompt: string) => {
        if (isActive) return
        submitMessage(prompt)
    }, [isActive, submitMessage])

    const handleRetry = useCallback(() => {
        if (!lastUserMessageRef.current || isActive) return
        setError(null)
        submitMessage(lastUserMessageRef.current)
    }, [isActive, submitMessage])

    // ─── Session lifecycle ────────────────────────────────────────
    const handleClearChat = useCallback(async () => {
        await abandonAgent()
        setError(null)
        clearActiveMessages()
    }, [abandonAgent, clearActiveMessages])

    const handleNewSession = useCallback(async () => {
        await abandonAgent()
        setError(null)
        createSession()
    }, [abandonAgent, createSession])

    const handleSwitchSession = useCallback(async (id: string) => {
        if (id === activeSessionId) return
        await abandonAgent()
        setError(null)
        switchSession(id)
    }, [activeSessionId, abandonAgent, switchSession])

    const handleDeleteSession = useCallback(async (id: string) => {
        if (id === activeSessionId) {
            await abandonAgent()
            setError(null)
        }
        deleteSession(id)
    }, [activeSessionId, abandonAgent, deleteSession])

    // ─── Page-independent conversation ─────────────────────────
    // The agent is not bound to the open page. Switching pages keeps the
    // active conversation (and any run it owns) untouched instead of swapping
    // to a page-owned thread, so navigation can never cancel or strand
    // in-flight work. The @-mention target (targetPage) remains the only
    // explicit page binding the user can set.

    // ─── Derived UI flags ─────────────────────────────────────────
    const isEmpty = messages.length === 0 && !isActive

    // ─── Render ───────────────────────────────────────────────────
    return (
        <ExpandableChat
            size="lg"
            embedded={embedded}
            onClose={onClose}
            icon={
                <div className="relative flex items-center justify-center">
                    {isActive && (
                        <span
                            aria-hidden
                            className="absolute -inset-1.5 rounded-full animate-spin"
                            style={{
                                background:
                                    'conic-gradient(from 0deg, transparent 0deg, transparent 220deg, currentColor 340deg, transparent 360deg)',
                                WebkitMask:
                                    'radial-gradient(circle, transparent 58%, #000 60%)',
                                mask: 'radial-gradient(circle, transparent 58%, #000 60%)',
                                animationDuration: '1.1s',
                            }}
                        />
                    )}
                    <Sparkles
                        className={`h-6 w-6 relative z-10 transition-transform duration-500 ${isActive ? 'scale-95 drop-shadow-[0_0_6px_currentColor]' : ''}`}
                    />
                </div>
            }
        >
            <ExpandableChatHeader className="p-0 border-0">
                <ChatHeader
                    sessions={sessions}
                    activeSessionId={activeSessionId}
                    hasMessages={messages.length > 0}
                    onSwitch={handleSwitchSession}
                    onNewSession={handleNewSession}
                    onDelete={handleDeleteSession}
                    onClear={handleClearChat}
                />
            </ExpandableChatHeader>

            <ExpandableChatBody className="bg-muted/20 dark:bg-background overflow-x-hidden">
                <ChatMessageList>
                    {isEmpty && (
                        <ChatEmptyState mode={chatMode} onSubmit={handleQuickSubmit} />
                    )}

                    {messages.map((message) => (
                        <MessageBubble
                            key={message.id}
                            message={message}
                            onRevealReference={handleRevealReference}
                        />
                    ))}

                    {isActive && (
                        <MessageBubble
                            message={liveMessage}
                            isStreaming
                            onRevealReference={handleRevealReference}
                        />
                    )}

                    {agent.state.phase === 'waiting-approval' && agent.state.plan && (
                        <div className="mx-2 my-1.5">
                            <PlanApprovalCard
                                planText={agent.state.plan.text}
                                onDecision={(approved, feedback) => agent.approvePlan(approved, feedback)}
                            />
                        </div>
                    )}

                    {agent.state.phase === 'suspended' && agent.state.suspendReason === 'budget' && (
                        <div className="mx-2 my-1.5 flex items-center gap-2 rounded-lg border border-border/60 bg-card p-2.5 text-[12px] text-muted-foreground">
                            <span>{t('ai.chat.budgetPaused')}</span>
                            <button
                                type="button"
                                className="ml-auto shrink-0 rounded-md bg-primary px-2.5 py-1 text-[12px] font-medium text-primary-foreground hover:opacity-90"
                                onClick={() => void agent.continueRun()}
                            >
                                {t('ai.chat.continueRun')}
                            </button>
                        </div>
                    )}

                    {agent.state.error && agent.state.phase !== 'failed' && (
                        <div className="mx-2 my-1.5 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-700 dark:text-amber-300">
                            <span className="min-w-0 flex-1">{t('ai.chat.unavailable', { error: agent.state.error })}</span>
                            {agent.state.phase === 'suspended' && (
                                <button
                                    type="button"
                                    className="shrink-0 rounded-md border border-amber-500/30 px-2 py-1 font-medium hover:bg-amber-500/10"
                                    onClick={agent.retryConnection}
                                >
                                    {t('ai.chat.retry')}
                                </button>
                            )}
                        </div>
                    )}

                    {pendingChoice && (
                        <UserChoiceCard
                            choice={pendingChoice}
                            customInput={customInput}
                            onCustomInputChange={setCustomInput}
                            onSelect={handleOptionSelect}
                            onCustomSubmit={handleCustomSubmit}
                            onCancel={handleCancelChoice}
                        />
                    )}

                    {error && (
                        <ErrorDisplay
                            error={error}
                            onRetry={handleRetry}
                            onDismiss={() => setError(null)}
                        />
                    )}
                </ChatMessageList>
            </ExpandableChatBody>

            <ExpandableChatFooter className="border-t bg-background p-2">
                <ChatComposer
                    ref={composerRef}
                    value={input}
                    onChange={handleInputChange}
                    onSubmit={handleSend}
                    onStop={() => void agent.cancel()}
                    isLoading={isActive}
                    mode={chatMode}
                    onModeChange={handleModeChange}
                    model={selectedModel}
                    onModelChange={handleModelChange}
                    modelParams={modelParams}
                    onModelParamsChange={handleModelParamsChange}
                    targetPage={targetPage}
                    currentPage={currentPage}
                    targetStatus={!targetPage && !currentPage?.pageId ? 'connecting' : targetStatus}
                    onPickPage={setTargetPage}
                    onClearPage={() => setTargetPage(null)}
                    onRetryPage={handleRetryPage}
                    onOpenPageWindow={handleOpenPageWindow}
                    tracking={tracking}
                    onToggleTracking={handleToggleTracking}
                />
                <div className="h-safe-bottom lg:hidden" aria-hidden />
            </ExpandableChatFooter>

            {editWindowPageId && (
                <PageEditWindow
                    pageId={editWindowPageId}
                    onClose={() => setEditWindowPageId(null)}
                />
            )}
        </ExpandableChat>
    )
}
