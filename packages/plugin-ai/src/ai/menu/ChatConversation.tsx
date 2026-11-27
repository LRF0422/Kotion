import React, { useState, useCallback, useEffect, useMemo, useRef } from "react"
import type { MutableRefObject } from "react"
import {
    ExpandableChatBody,
    ExpandableChatFooter,
    Conversation,
    ConversationContent,
    ConversationScrollButton,
    Loader,
    PlanApprovalCard,
    cn,
} from "@kn/ui"
import { Editor } from "@kn/editor"
import {
    useEditorAgent,
    useCapabilityProviders,
    usePendingFormRequests,
    buildAgentRunInputs,
    useLoadedSkills,
    AgentPaneHost,
    getAgentDocumentBridge,
    getAgentEditor,
    findAgentEditor,
    getOffscreenEditorBridge,
    getPageNavigationBridge,
    resolveAgentPageTarget,
    subscribeAgentEditors,
    useCurrentPage,
    waitForAgentEditor,
    setSessionPageBinding,
    clearSessionPageBinding,
    revealBlockById,
    useTranslation,
    useAgentPane,
    buildCustomAgentNote,
    customAgentCapabilities,
    filterCatalogForCustomAgent,
    useCustomAgents,
    fileToAgentImage,
    buildImageContentParts,
    toImageDataUrl,
    documentTargetUnavailableMessage,
    componentPageTargetMessage,
    missingPageTypeTargetMessage,
    isComponentPageType,
    isSamePage,
    isLiveEditor,
    useAgentArtifactTargetProvider,
    usePageTypes,
} from "@kn/common"
import type {
    ChatMode,
    ChatModelParams,
    OffscreenEditorHandle,
    AgentChatMessage,
    EditorAgentApi,
    SessionPageBinding,
    SessionPageBindingPage,
    AgentImageData,
} from "@kn/common"

import {
    ChatError,
    classifyError,
} from "./chat-types"
import type { BlockReference, Message } from "./chat-types"
import type { ChatSessionMeta, ChatTargetPage } from "./chat-sessions"
import { useSessionTranscript } from "./use-session-transcript"
import {
    canYieldAgentSurface,
    claimAgentSurface,
    getAgentSurfaceOwner,
    releaseAgentSurface,
    useAgentSurfaceMounted,
    useAgentSurfaceOwner,
} from "./chat/agent-surface"
import { useOffscreenTargets } from "./use-offscreen-targets"
import { MessageBubble } from "./MessageBubble"
import { ErrorDisplay } from "./ErrorDisplay"
import { ChatEmptyState } from "./chat/ChatEmptyState"
import { ChatComposer } from "./chat/ChatComposer"
import { useModelVisionSupport } from "../components/model-catalog"
import type { TargetPageStatus } from "./chat/PageMentionPicker"
import { UserChoiceCard } from "./chat/UserChoiceCard"
import { FormRequestCard } from "./chat/FormRequestCard"
import {
    getChangeTracker,
    selectFinalAnswer,
    toolCallsToSteps,
} from "./chat-helpers"
import { useUserChoiceBridge } from "./use-user-choice-bridge"
import type { ChatPanelControls } from "./use-session-actions"
import type { ChatTabStatus } from "./chat/ChatTabs"

/** Phases in which a run is alive (drives the stop button + the tab spinner). */
const ACTIVE_PHASES = new Set([
    'creating', 'streaming', 'waiting-tools', 'waiting-approval', 'suspended',
])

export interface ChatConversationProps {
    /** Conversation this panel owns. Its agent, transcript and leases are all scoped to it. */
    sessionId: string
    session: ChatSessionMeta | undefined
    /**
     * True when this conversation's tab is focused. Only the focused panel
     * registers the app-global page binding / renders the side peek — background
     * tabs keep RUNNING, they just do not own the visible chrome.
     */
    active: boolean
    /**
     * True when the full-page `/ai` surface is on screen. The dock then yields
     * this conversation to it at a safe boundary (the run keeps going
     * server-side) instead of driving a second agent for the same conversation.
     */
    yieldToKernel?: boolean
    /** Active editor to bind document tools to (may disappear mid-run). */
    editor?: Editor
    selectedModel: string
    onModelChange: (model: string) => void
    chatMode: ChatMode
    onModeChange: (mode: ChatMode) => void
    modelParams: ChatModelParams
    onModelParamsChange: (params: ChatModelParams) => void
    /** Patch a conversation's metadata (bound page, target artifact). */
    onPatchSession: (sessionId: string, patch: Partial<ChatSessionMeta>) => void
    /** Report transcript activity so the container can auto-title the tab. */
    onMessagesChange: (sessionId: string, messages: Message[]) => void
    /** Report the run status for the tab strip. */
    onRunStatus: (sessionId: string, status: ChatTabStatus) => void
    /** Publish stop/clear controls so the container can drive this conversation. */
    controlsRef: MutableRefObject<Map<string, ChatPanelControls>>
    /** Open a page in the floating editor window (container-owned). */
    onOpenPageWindow: (pageId: string) => void
}

/**
 * One mounted conversation of the AI side dock.
 *
 * The tab strip renders one of these per open tab, all mounted at once: each
 * owns its own `useEditorAgent` (so each has its own engine run, stream, abort
 * controller and off-screen editor leases) and its own transcript. Switching
 * tabs is therefore pure visibility — nothing is cancelled, nothing is
 * re-loaded, and two conversations really do run at the same time.
 */
export const ChatConversation: React.FC<ChatConversationProps> = ({
    sessionId,
    session,
    active,
    yieldToKernel = false,
    editor,
    selectedModel,
    onModelChange,
    chatMode,
    onModeChange,
    modelParams,
    onModelParamsChange,
    onPatchSession,
    onMessagesChange,
    onRunStatus,
    controlsRef,
    onOpenPageWindow,
}) => {
    const { t } = useTranslation()

    // Who is driving this conversation right now: the dock or the `/ai` page.
    // The dock yields the run at a safe boundary when `/ai` is on screen; it
    // never mounts a second agent for a conversation the page owns.
    const surfaceOwner = useAgentSurfaceOwner(sessionId)
    // The /ai page may be on screen but not have mounted this conversation yet
    // (the two session indexes can briefly disagree). Only yield to a surface
    // that can actually take it over, otherwise the run would vanish from both.
    const kernelMounted = useAgentSurfaceMounted(sessionId, 'kernel')
    const shouldYield = yieldToKernel && kernelMounted
    const isHandedOff = surfaceOwner === 'kernel' || (shouldYield && surfaceOwner !== 'dock')
    const detachedRef = useRef(false)
    const attachingRef = useRef(false)

    // Vision guard: knowing up front whether the selected model can see images
    // is what lets the composer refuse an upload instead of letting the backend
    // silently drop the parts and the model answer "看不到图片".
    const modelVision = useModelVisionSupport(selectedModel)
    const visionBlocked = modelVision.known && !modelVision.supportsVision

    // ─── User-choice bridge ───────────────────────────────────────
    const {
        pendingChoice,
        customInput,
        setCustomInput,
        handleUserChoiceRequest,
        handleOptionSelect,
        handleCustomSubmit,
        handleCancelChoice,
    } = useUserChoiceBridge()

    // Dynamic forms the agent asked for in THIS conversation that still need an
    // answer. They stay here until answered/cancelled; the unified board in the
    // header shows the same requests across conversations.
    const pendingForms = usePendingFormRequests(sessionId)

    // ─── This conversation's transcript ───────────────────────────
    const {
        messages,
        setMessages,
        loadingTranscript,
        resetTranscript,
    } = useSessionTranscript({
        sessionId,
        boundPageTitle: session?.targetPage?.title,
        meta: session,
    })

    // Every SETTLED transcript change is reported to the container: it needs the
    // size for the clear affordance, derives the auto title and bumps the
    // conversation's recency. The load itself is held back (`loadingTranscript`)
    // so that opening an old chat is a baseline, not "the user just took a turn".
    useEffect(() => {
        if (loadingTranscript) return
        onMessagesChange(sessionId, messages)
    }, [loadingTranscript, messages, onMessagesChange, sessionId])

    const targetPage = session?.targetPage
    const setTargetPage = useCallback((page: ChatTargetPage | null) => {
        // A user-chosen target IS user activity: it promotes the conversation.
        onPatchSession(sessionId, { targetPage: page ?? undefined, updatedAt: Date.now() })
    }, [onPatchSession, sessionId])

    // The conversation's bound page. Page tools reach it through the binding
    // registry below; the off-screen target manager reads it as the fallback
    // page when a tool acts without an owner.
    const boundPageRef = useRef<ChatTargetPage | undefined>(targetPage)
    boundPageRef.current = targetPage

    // ─── Off-screen target editor (@-page binding) ──────────────
    // Leases for the conversation target and each delegated sub-run live in the
    // hook; the panel keeps only the state the composer renders.
    const {
        offscreenTargetsRef,
        ownerTargetsRef,
        ownerHandlesRef,
        ownerAcquireRef,
        releaseTarget,
        releaseAllTargets,
        acquireOwnerTarget,
        getPageFor,
        activateOffscreenTarget,
        resolveSharedEditorForPage,
        releaseOwner,
        releaseAllOwners,
        claimEditor,
        releaseEditor,
    } = useOffscreenTargets({ editor, boundPageRef })

    const [offscreenHandle, setOffscreenHandle] = useState<OffscreenEditorHandle | null>(null)
    const [targetStatus, setTargetStatus] = useState<TargetPageStatus>('idle')
    const offscreenHandleRef = useRef<OffscreenEditorHandle | null>(null)
    offscreenHandleRef.current = offscreenHandle
    const [acquireAttempt, setAcquireAttempt] = useState(0)
    /**
     * Bumped whenever a visible editor claims/releases a page. The target effect
     * and `agentEditor` read the app-global claim registry, so a pane opened
     * before this conversation mounted (or by another surface) is honoured
     * without waiting for a session-binding callback that never comes.
     */
    const [claimVersion, setClaimVersion] = useState(0)
    useEffect(() => subscribeAgentEditors(() => setClaimVersion(version => version + 1)), [])
    /** Automatic re-acquire after a transient target failure (max 2 retries). */
    const targetRetryRef = useRef<{ key: string; attempts: number; timer: ReturnType<typeof setTimeout> | null }>({
        key: '', attempts: 0, timer: null,
    })
    useEffect(() => () => {
        if (targetRetryRef.current.timer) clearTimeout(targetRetryRef.current.timer)
    }, [])

    const targetPageRef = useRef<ChatTargetPage | undefined>(targetPage)
    targetPageRef.current = targetPage
    const targetPageId = targetPage?.pageId

    // Run-scoped edit target: a turn freezes the page it edits. While the run
    // is active, browsing other pages must not redirect its document tools.
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
        const retry = targetRetryRef.current
        if (retry.key !== String(targetPageId)) {
            if (retry.timer) clearTimeout(retry.timer)
            targetRetryRef.current = { key: String(targetPageId), attempts: 0, timer: null }
        }

        // A visible editor (the side pane / floating window) is the page's
        // single writer. This check MUST come before acquiring a hidden session:
        // otherwise a page that is literally on screen gets a second, hidden
        // writer and the two fight over the document.
        if (getAgentEditor(targetPageId)?.editor) {
            const claimedId = String(targetPageId)
            releaseTarget(claimedId)
            for (const [owner, target] of ownerTargetsRef.current) {
                if (!isSamePage(target.pageId, claimedId)) continue
                const handle = ownerHandlesRef.current.get(owner)
                if (!handle) continue
                ownerHandlesRef.current.delete(owner)
                try { handle.release() } catch { /* already released */ }
            }
            getOffscreenEditorBridge()?.destroyIdle?.(claimedId)
            offscreenHandleRef.current = null
            setOffscreenHandle(null)
            setTargetStatus('current')
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
        // A lease whose editor was destroyed (HMR/remount/session teardown)
        // must be dropped: reusing it made every document tool fail with
        // "无法取得编辑目标…的编辑器" until the conversation was reopened.
        const cached = offscreenTargetsRef.current.get(String(targetPageId))
        if (cached && isLiveEditor(cached.editor)) {
            if (offscreenHandleRef.current !== cached) setOffscreenHandle(cached)
            setTargetStatus('ready')
            return
        }
        if (cached) releaseTarget(String(targetPageId))
        let cancelled = false
        setTargetStatus('connecting')
        activateOffscreenTarget(requested)
            .then(handle => {
                if (cancelled) return
                targetRetryRef.current = { key: String(targetPageId), attempts: 0, timer: null }
                setOffscreenHandle(handle)
                setTargetStatus('ready')
            })
            .catch(err => {
                console.error('Failed to acquire off-screen editor:', err)
                if (cancelled) return
                setTargetStatus('error')
                // The session engine deletes failed records, so a later acquire
                // really retries. Two bounded retries cover the common transient
                // causes (room not synced yet, a page row still settling right
                // after createPage) without hammering a permanently bad page.
                const state = targetRetryRef.current
                if (state.key !== String(targetPageId)) return
                if (state.attempts >= 2) return
                const attempt = state.attempts
                state.attempts = attempt + 1
                if (state.timer) clearTimeout(state.timer)
                state.timer = setTimeout(() => {
                    state.timer = null
                    setAcquireAttempt(n => n + 1)
                }, 1_500 * (attempt + 1))
            })
        return () => { cancelled = true }
    }, [targetPageId, acquireAttempt, editor, activateOffscreenTarget, claimVersion, releaseTarget])

    // Off-screen sessions are shared per page and survive target switches; only
    // release them when the conversation closes. The same goes for delegated
    // agents' targets: their owner ids are run-scoped.
    useEffect(() => () => {
        releaseAllOwners()
        releaseAllTargets()
    }, [releaseAllOwners, releaseAllTargets])

    const handleRetryPage = useCallback(() => {
        targetRetryRef.current = { key: '', attempts: 0, timer: null }
        setAcquireAttempt(n => n + 1)
    }, [])

    // The page the user is looking at. It is published by the visible page
    // surface (`PageHost`) and *subscribed* to, so the "当前页面" chip and the
    // implicit default target follow navigation instead of freezing at mount.
    const visiblePage = useCurrentPage()
    const currentPage = useMemo<ChatTargetPage | undefined>(() => {
        if (!visiblePage?.pageId) return undefined
        return {
            pageId: String(visiblePage.pageId),
            title: visiblePage.title || '',
            spaceId: visiblePage.spaceId,
        }
    }, [visiblePage])

    // ─── Working-target pane (artifact cards → preview) ───────────
    // The dock is a narrow panel, so it splits its behaviour by what the
    // artifact needs: a PAGE opens in the full floating editor; every other kind
    // renders in the inline side peek. Only the FOCUSED tab may show the peek:
    // there is one pane per surface, and it belongs to the conversation the user
    // is looking at.
    const pane = useAgentPane()
    const paneTarget = pane.open ? pane.target : null
    const paneIsPage = paneTarget?.kind === 'page'
    const inlinePaneArtifact = active && paneTarget && !paneIsPage ? paneTarget : null
    // A non-page side-peek artifact (space, chart, file list, …) is this
    // conversation's operation target too; page artifacts become the document
    // target below and are reported by the core page provider.
    useAgentArtifactTargetProvider(sessionId, inlinePaneArtifact)

    useEffect(() => {
        if (!active) return
        if (!paneIsPage || !paneTarget) return
        onOpenPageWindow(String(paneTarget.id))
        // The floating window IS the preview for a page, so the inline column
        // must not also open — that would be two editors for one document.
        pane.close()
    }, [active, paneIsPage, paneTarget, pane.close, onOpenPageWindow])

    // ─── Session page binding bridge ─────────────────────────────
    // Page tools (createPage / openPage / editPage) live in core and cannot
    // reach this session's state. They call through this registry so a page the
    // agent targets becomes the conversation's off-screen edit target instead
    // of navigating away.
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

    // Opening a PAGE artifact as this conversation's preview is an explicit
    // focus action: bind it as the edit target so the tools and the visible
    // editor cannot diverge. Runs after `bindTargetPage` exists (effects run
    // after render; the window effect above only handles presentation).
    useEffect(() => {
        if (!active || !paneIsPage || !paneTarget) return
        const id = String(paneTarget.id)
        if (isSamePage(boundPageRef.current?.pageId, id)) return
        bindTargetPage({
            pageId: id,
            title: paneTarget.title,
            spaceId: paneTarget.spaceId,
        })
    }, [active, paneIsPage, paneTarget, bindTargetPage])

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
            try {
                getPageNavigationBridge()?.openPage(targetPage.pageId, targetPage.spaceId)
            } catch (error) {
                // A guest collaboration bridge refuses pages outside the
                // invitation; there is nowhere to reveal this reference.
                console.warn('[agent] could not reveal reference:', error)
                setPendingReveal(null)
            }
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

    /**
     * The ONE editor the conversation's tools may bind to.
     *
     * It is resolved by target identity, not by taking whatever editor happens
     * to be published: a bound page that is not on screen must use its claim or
     * hidden lease, and if neither exists this is `undefined` (document tools
     * then report that the target is not ready instead of silently editing the
     * page the user navigated to).
     */
    const agentEditor = useMemo<Editor | undefined>(() => {
        if (!targetPage) return editor
        const claimed = getAgentEditor(targetPage.pageId)?.editor as Editor | undefined
        if (claimed) return claimed
        const handle = offscreenHandle && isSamePage(offscreenHandle.pageId, targetPage.pageId)
            ? offscreenHandle
            : offscreenTargetsRef.current.get(String(targetPage.pageId))
        if (handle && isLiveEditor(handle.editor)) return handle.editor as Editor
        const livePageId = getPageNavigationBridge()?.getCurrentPage()?.pageId
        if (editor && isSamePage(livePageId, targetPage.pageId)) return editor
        return undefined
        // claimVersion is the registry's change signal; reading the registry is
        // not reactive on its own.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [targetPage, editor, offscreenHandle, claimVersion])
    const agentEditorRef = useRef<Editor | undefined>(editor)
    agentEditorRef.current = agentEditor

    // A read-only surface must not be writable *through the agent*: document
    // tools drive the editor programmatically, which still mutates the shared
    // Y.Doc even though the visible editor refuses user input — and an online
    // collaborator host would persist those edits. The executor vetoes mutating
    // calls while this returns false; read-only tools stay available so the
    // agent can still read/summarize the page.
    const canMutateNow = useCallback((): boolean => {
        const boundId = boundPageRef.current?.pageId
        // The unified page model knows whether this page's access is read-only
        // (a READ collaboration invitation) even before an editor is bound.
        const pageTarget = resolveAgentPageTarget(boundId ?? null)
        if (pageTarget && pageTarget.canEdit === false) return false
        // Exact binding only: a read-only visible editor for another page must
        // not veto (or authorize) the target document.
        const target = agentEditorRef.current as Editor | undefined
        return !target || target.isEditable !== false
    }, [])

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

    // ─── AgentCore driver ─────────────────────────────────────────
    const isAskMode = chatMode === 'ask'

    const sessionBindingRef = useRef<SessionPageBinding | null>(null)
    /** Stable getter: the SDK and every tool execution read the LIVE binding. */
    const getSessionBinding = useCallback(() => sessionBindingRef.current, [])

    const { getCatalog, rebindEditor, resolveTools, isReadOnlyTool, needsEditor } = useCapabilityProviders(agentEditor ?? null, {
        onUserChoiceRequest: handleUserChoiceRequest,
        sessionBinding: getSessionBinding,
    })
    // 自定义 Agent 的技能/工具白名单：作用在本界面能跑的能力目录之上（最后一层
    // 过滤）。必须先拿到它再构建 run 输入，否则模型仍会看到被关掉的工具。
    const { selectedAgent } = useCustomAgents()
    // Page types decide whether a target can be edited at all: a full-page
    // component (`renderer.type === 'component'`) has no document body, so no
    // editor will ever appear for it. Held in a ref because the session binding
    // below is a long-lived object and must read the live (hot-reloadable)
    // registry instead of the snapshot from its creation render.
    const pageTypes = usePageTypes()
    const pageTypesRef = useRef(pageTypes)
    pageTypesRef.current = pageTypes
    const catalog = useMemo(
        () => filterCatalogForCustomAgent(getCatalog(), selectedAgent),
        [getCatalog, selectedAgent],
    )
    const agentCapabilities = useMemo(
        () => customAgentCapabilities(selectedAgent),
        [selectedAgent],
    )
    const allowedSkills = useMemo(
        () => (agentCapabilities ? agentCapabilities.skills : null),
        [agentCapabilities],
    )
    // load_skill 只回答白名单里的技能；执行器也用同一份白名单挡住旧 transcript
    // 带来的调用（目录已不宣传，但名字可能还在历史消息里）。
    const allowedToolNames = useMemo(
        () => (agentCapabilities ? new Set(catalog.tools.map(tool => tool.function.name)) : null),
        [agentCapabilities, catalog],
    )
    const isToolAllowedByAgent = useCallback(
        (name: string) => !allowedToolNames || allowedToolNames.has(name),
        [allowedToolNames],
    )
    // Document editing is a CAPABILITY PACK, not this conversation's identity:
    // its policy prose is eager only while the conversation actually has a
    // document in play (a bound target, or the visible editor it acts on).
    // With no target the same skill travels as an index entry and is delivered
    // by `load_skill` when the user asks for document work.
    const documentCapabilityActive = !!(targetPage || agentEditor)
    const loadedSkills = useLoadedSkills(sessionId)
    const { tools: toolSpecs, skills, deferredTools } = useMemo(
        () => buildAgentRunInputs(catalog, {
            loadedSkills,
            activeCapabilities: documentCapabilityActive ? ['document'] : [],
        }),
        [catalog, loadedSkills, documentCapabilityActive],
    )

    useEffect(() => {
        const livePageId = (): string | undefined => {
            const id = getPageNavigationBridge()?.getCurrentPage()?.pageId
            return id === undefined || id === null ? undefined : String(id)
        }
        /** The exact editor for a page, if one is already resident. */
        const readyEditorForPage = (page: SessionPageBindingPage): any | null => {
            const pageId = String(page.pageId)
            const claimed = getAgentEditor(pageId)?.editor
            if (isLiveEditor(claimed)) return claimed
            if (isSamePage(livePageId(), pageId) && isLiveEditor(editor)) return editor
            const handle = offscreenTargetsRef.current.get(pageId)
            if (handle && isLiveEditor(handle.editor)) return handle.editor
            return null
        }
        const recordOf = (page: SessionPageBindingPage): ChatTargetPage => ({
            pageId: String(page.pageId),
            title: page.title || '',
            spaceId: page.spaceId,
        })

        /**
         * Refuse a target that has no document body BEFORE acquiring anything.
         *
         * A full-page plugin component (a canvas, a board) never has an editor,
         * so acquisition is guaranteed to fail — and the generic "请稍后重试"
         * error then sent the model into a retry loop on an impossible target.
         * The refusal is permanent and names the only working routes instead.
         * An unknown page type (its plugin is not active) is the same dead end.
         */
        const documentUnavailableFor = (
            page: SessionPageBindingPage,
            pageId: string,
        ): Error | null => {
            const pageTypeId = page.pageType?.trim()
            if (!pageTypeId) return null
            const target = { pageId, title: page.title }
            const resolved = pageTypesRef.current.find(type => type.id === pageTypeId)
            if (!resolved) return new Error(missingPageTypeTargetMessage(target, pageTypeId))
            if (isComponentPageType(resolved)) {
                return new Error(componentPageTargetMessage(target, {
                    // Labels are i18n keys for some page types; never show a
                    // raw key to the model when a translation exists.
                    pageTypeLabel: t(resolved.label, resolved.label),
                    pageTypeId,
                }))
            }
            return null
        }

        const binding: SessionPageBinding = {
            bindPage: (page) => { bindTargetPage(page) },
            getBoundPage: () => (boundPageRef.current ? { ...boundPageRef.current } : null),
            // Claims are app-global now (agent-editor-registry); these two remain
            // for hosts that express the claim through the binding. The pane and
            // floating window register directly, so a claim is visible even when
            // this conversation did not exist yet.
            claimEditor: (pageId, claimedEditor) => {
                claimEditor(pageId, claimedEditor)
            },
            releaseEditor: (pageId, releasedEditor) => {
                releaseEditor(pageId, releasedEditor)
            },
            openPageWindow: (pageId) => {
                const id = String(pageId)
                // Opening a page in the conversation's editor window is a user
                // act of focusing it: make it the target, otherwise the window
                // shows one page while the tools keep editing another.
                if (!isSamePage(boundPageRef.current?.pageId, id)) {
                    bindTargetPage({ pageId: id })
                }
                onOpenPageWindow(id)
            },
            editPage: async (page) => {
                const pageId = String(page.pageId)
                const blocked = documentUnavailableFor(page, pageId)
                if (blocked) throw blocked
                // A visible editor (side pane / floating window) owns this page:
                // use it directly instead of acquiring a hidden second writer.
                const claimed = getAgentEditor(pageId)?.editor
                if (isLiveEditor(claimed)) {
                    rebindEditor(claimed)
                    offscreenHandleRef.current = null
                    setOffscreenHandle(null)
                    setTargetStatus('current')
                    const record = bindTargetPage(page)
                    return { ...record, editor: claimed }
                }
                // The page is already on screen: its visible editor is the target.
                // The editor is published one render after the page surface
                // mounts, so a target right after navigation used to fail with
                // "editor not ready" even though it was about to be claimed.
                // Wait briefly for the claim instead of mounting a hidden writer.
                if (isSamePage(livePageId(), pageId)) {
                    const visible = isLiveEditor(editor)
                        ? editor
                        : await waitForAgentEditor(pageId)
                    if (!isLiveEditor(visible)) {
                        // The page is on screen but no editor ever appeared:
                        // this is now a real failure, with the reason named.
                        throw new Error(documentTargetUnavailableMessage(
                            { pageId, title: page.title },
                            '页面还在加载，可用的文档编辑器尚未就绪',
                        ))
                    }
                    rebindEditor(visible)
                    offscreenHandleRef.current = null
                    setOffscreenHandle(null)
                    setTargetStatus('current')
                    const record = bindTargetPage(page)
                    return { ...record, editor: visible }
                }
                const { record, handle } = await switchEditTarget(page)
                if (!handle?.editor) {
                    // `switchEditTarget` only returns no handle for the visible
                    // page (handled above), so this is an unusable target.
                    throw new Error(documentTargetUnavailableMessage(
                        { pageId, title: record.title },
                        new Error('目标页面没有返回可用的编辑器'),
                    ))
                }
                const targetEditor = handle.editor as Editor
                // Rebind built-in AND plugin tools to the target editor in one
                // synchronous step so document tools later in the same backend
                // batch already act on it — no stale-editor window.
                rebindEditor(targetEditor)
                offscreenHandleRef.current = handle
                setOffscreenHandle(handle)
                setTargetStatus('ready')
                bindTargetPage(record)
                return { ...record, editor: targetEditor }
            },
            getEditor: () => {
                const bound = boundPageRef.current
                if (!bound) {
                    return isLiveEditor(editor) ? editor : null
                }
                // Never fall back to the visible editor when it is a DIFFERENT
                // page: that is the silent wrong-document write.
                return readyEditorForPage(bound)
            },
            // Cross-page actions get an editor without moving the conversation
            // target (see SessionPageBinding#getEditorForPage).
            getEditorForPage: async (page) => resolveSharedEditorForPage(recordOf(page)),
            // ─── Per-agent (delegated child) targeting ───────────────
            getPageFor,
            getEditorFor: (owner: string) => {
                // A forked private document wins: its tools must act on the
                // agent's own copy, never the shared page.
                const privateDoc = getAgentDocumentBridge()?.get(owner)?.editor
                if (isLiveEditor(privateDoc)) return privateDoc
                const target = ownerTargetsRef.current.get(owner) ?? boundPageRef.current
                if (!target) return null
                const claimed = getAgentEditor(target.pageId)?.editor
                if (isLiveEditor(claimed)) return claimed
                if (isSamePage(livePageId(), target.pageId) && isLiveEditor(editor)) return editor
                const handle = ownerHandlesRef.current.get(owner)
                if (handle && isLiveEditor(handle.editor)) return handle.editor
                // A child that never retargeted may share the conversation's
                // lease for the same page (the write lease still serializes).
                if (isSamePage(boundPageRef.current?.pageId, target.pageId)) {
                    const shared = offscreenTargetsRef.current.get(String(target.pageId))
                    if (shared && isLiveEditor(shared.editor)) return shared.editor
                }
                // Nothing yet: the async path acquires/forks the exact editor.
                return null
            },
            // Resolve the EXACT editor for a target, acquiring or forking when
            // needed. Never resolves to another page's editor: a child with a
            // target but no editor used to receive the parent's document here.
            getEditorForAsync: async (
                owner: string | null | undefined,
                options?: { mutating?: boolean },
            ) => {
                if (owner) {
                    const docBridge = getAgentDocumentBridge()
                    const existing = docBridge?.get(owner)?.editor
                    if (isLiveEditor(existing)) return existing
                    const target = ownerTargetsRef.current.get(owner) ?? boundPageRef.current
                    if (!target) return null
                    const ready = readyEditorForPage(target)
                    if (ready) return ready
                    // Rejects with the host's reason when no editor can be
                    // obtained; the caller names the page around it.
                    const source = await resolveSharedEditorForPage(target)
                    if (options?.mutating && docBridge) {
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
                            // Over the fork cap (or a bad source): degrade to the
                            // shared document for THIS page, which the write lease
                            // still serializes. Never to the parent's document.
                            console.warn('[agent] private document unavailable, using the shared document:', error)
                        }
                    }
                    return source
                }

                const target = boundPageRef.current
                if (!target) {
                    // No explicit target: the visible editor is the implicit one.
                    return isLiveEditor(editor) ? editor : null
                }
                const ready = readyEditorForPage(target)
                if (ready) return ready
                // The target is the page on screen: give its visible editor a
                // short window to publish its claim before falling back to a
                // hidden session (which would be a second writer for the page
                // the user is looking at).
                if (isSamePage(livePageId(), target.pageId)) {
                    const claimed = await waitForAgentEditor(String(target.pageId))
                    if (isLiveEditor(claimed)) {
                        rebindEditor(claimed)
                        offscreenHandleRef.current = null
                        setOffscreenHandle(null)
                        setTargetStatus('current')
                        return claimed
                    }
                }
                // Rejects with the acquisition reason ("this page type has no
                // document", "room did not sync", …): the caller adds the page
                // identity around it.
                const { handle } = await switchEditTarget(target)
                if (!handle || !isLiveEditor(handle.editor)) {
                    throw new Error('编辑目标没有返回可用的编辑器')
                }
                // Keep the surface/render state in sync with what the tool batch
                // is using, even when the acquisition was triggered from a call.
                offscreenHandleRef.current = handle
                setOffscreenHandle(handle)
                setTargetStatus('ready')
                rebindEditor(handle.editor)
                return handle.editor
            },
            editPageFor: async (owner: string, page: SessionPageBindingPage) => {
                const blocked = documentUnavailableFor(page, String(page.pageId))
                if (blocked) throw blocked
                const target = recordOf(page)
                ownerTargetsRef.current.set(owner, target)
                const docBridge = getAgentDocumentBridge()
                let source: any
                try {
                    source = await resolveSharedEditorForPage(target)
                } catch (error) {
                    // Keep the host's reason (page type, read-only invitation,
                    // room not synced) while naming the page we refused to
                    // write into.
                    throw new Error(documentTargetUnavailableMessage(target, error))
                }
                if (!isLiveEditor(source)) {
                    throw new Error(documentTargetUnavailableMessage(target))
                }
                if (docBridge) {
                    try {
                        const handle = await docBridge.fork(owner, target.pageId, source, target.title)
                        return { ...target, editor: handle.editor }
                    } catch (error) {
                        console.warn('[agent] private document unavailable, using the shared document:', error)
                    }
                }
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
                // A claimed editor names its page directly, regardless of which
                // surface mounted it or which conversation is focused.
                const claim = findAgentEditor(targetEditor)
                if (claim) {
                    return { pageId: claim.pageId, title: claim.title, spaceId: claim.spaceId }
                }
                for (const [owner, handle] of ownerHandlesRef.current) {
                    if (handle?.editor === targetEditor) {
                        const target = ownerTargetsRef.current.get(owner)
                        if (target) return { ...target }
                    }
                }
                for (const [pageId, handle] of offscreenTargetsRef.current) {
                    if (handle?.editor === targetEditor) {
                        const target = boundPageRef.current
                        return {
                            pageId,
                            title: isSamePage(target?.pageId, pageId) ? target?.title : undefined,
                            spaceId: isSamePage(target?.pageId, pageId) ? target?.spaceId : undefined,
                        }
                    }
                }
                // The route's visible editor: only the CURRENT page describes it.
                if (targetEditor === editor) {
                    const current = getPageNavigationBridge()?.getCurrentPage()
                    if (current?.pageId !== undefined && current.pageId !== null) {
                        return {
                            pageId: String(current.pageId),
                            title: current.title,
                            spaceId: current.spaceId === undefined ? undefined : String(current.spaceId),
                        }
                    }
                }
                return null
            },
        }
        sessionBindingRef.current = binding
        if (!active) return () => { sessionBindingRef.current = null }
        // Only the FOCUSED conversation publishes the app-global binding (page
        // tools that run outside a tool context read it). Background tabs keep
        // their own binding private — they must never steer the visible
        // document's tools.
        setSessionPageBinding(binding)
        return () => clearSessionPageBinding(binding)
        // `t` names a page type in the refusal message; the registry itself is
        // read through a ref so a hot-reloaded plugin does not rebuild the
        // binding (and drop in-flight run state) on every change.
    }, [active, bindTargetPage, switchEditTarget, rebindEditor, editor, getPageFor, releaseOwner, claimEditor, releaseEditor, onOpenPageWindow, resolveSharedEditorForPage, t])

    /**
     * A visible editor claimed a page (side pane / floating window). Hand the
     * page over immediately: drop the conversation's and every delegated
     * agent's hidden lease for it, and rebind the live tool map to the claimant.
     *
     * This is subscription-driven rather than routed through the binding
     * callback because the pane can mount before this conversation, on another
     * surface, or while a different tab is focused.
     */
    useEffect(() => {
        if (claimVersion === 0) return
        const claimed = new Set<string>()
        for (const pageId of offscreenTargetsRef.current.keys()) {
            if (getAgentEditor(pageId)?.editor) claimed.add(String(pageId))
        }
        for (const target of ownerTargetsRef.current.values()) {
            if (getAgentEditor(target.pageId)?.editor) claimed.add(String(target.pageId))
        }
        if (claimed.size === 0) return

        for (const pageId of claimed) {
            releaseTarget(pageId)
            if (isSamePage(offscreenHandleRef.current?.pageId, pageId)) {
                offscreenHandleRef.current = null
                setOffscreenHandle(null)
            }
            for (const [owner, target] of ownerTargetsRef.current) {
                if (!isSamePage(target.pageId, pageId)) continue
                const handle = ownerHandlesRef.current.get(owner)
                if (!handle) continue
                ownerHandlesRef.current.delete(owner)
                try { handle.release() } catch { /* already released */ }
            }
            // Destroy only after every holder is gone (destroyIdle refuses held
            // sessions), so a page that is on screen stops having a hidden writer
            // at once instead of after the idle timeout.
            getOffscreenEditorBridge()?.destroyIdle?.(pageId)
        }

        const bound = boundPageRef.current
        const claim = bound ? getAgentEditor(bound.pageId)?.editor : null
        if (claim) {
            setTargetStatus('current')
            rebindEditor(claim)
        }
    }, [claimVersion, releaseTarget, rebindEditor])

    const liveCurrentPageId = getPageNavigationBridge()?.getCurrentPage()?.pageId
    // A conversation without an explicit @-page target rides on the page the
    // user has open, so waiting for that context only makes sense while a
    // document editor is actually published.
    const currentPagePending = !!editor && !currentPage?.pageId
    const targetClaimed = !!(targetPageId && getAgentEditor(targetPageId)?.editor)
    const targetToolsReady = !targetPageId
        ? !currentPagePending
        : ((targetStatus === 'current'
                && (isSamePage(liveCurrentPageId, targetPageId) || targetClaimed))
            || (targetStatus === 'ready' && isSamePage(offscreenHandle?.pageId, targetPageId)))

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

    /* selectedAgent 已在上方（能力目录过滤处）取出。 */

    /** Set right after `useEditorAgent`: the completion callback needs `start`. */
    const agentRef = useRef<EditorAgentApi | null>(null)

    const agent = useEditorAgent({
        conversationId: sessionId,
        tools: isAskMode ? [] : toolSpecs,
        skills: isAskMode ? [] : skills,
        deferredTools: isAskMode ? [] : deferredTools,
        resolveTools,
        // Mutating calls are serialized per document (write lease), and a
        // delegated child resolves its tools against its own editor.
        isReadOnlyTool,
        // 自定义 Agent 的白名单：不在其中的工具不可调用（目录已不宣传，这里再挡
        // 一层，让 load_skill 也按同一规则回答）。
        isToolAvailable: isToolAllowedByAgent,
        isToolAllowed: isToolAllowedByAgent,
        allowedSkills,
        // Refuse mutating tools while the bound editor is read-only (READ
        // collaboration invitation / read-only page).
        canMutate: canMutateNow,
        // Editor dependency of each tool, from the live provider metadata. The SDK
        // can only see built-ins without this, so plugin-declared `scope: 'any'`
        // tools (plugin-studio file writes, builds) would be treated as
        // editor-bound — and then held behind an edit target that this panel may
        // not have at all (a plugin route with no document), which is the gate the
        // batch watchdog exists to survive, not a reason to wait for it.
        needsEditor,
        // A page switch transiently unbinds the editor; defer a pending tool
        // batch until the new editor is published instead of failing it. The
        // 'error' case stays open so recovery tools (editPage / createPage) and
        // target-resolving document tools run and report a real error instead of
        // silently parking the run until the watchdog fires.
        autoExecuteTools: targetToolsReady || targetStatus === 'error',
        spaceId: targetPage?.spaceId ?? currentPage?.spaceId,
        pageId: targetPage?.pageId ?? currentPage?.pageId,
        // THIS conversation's binding — never the module-level singleton, which
        // another mounted tab may own.
        sessionBinding: getSessionBinding,
        // 长任务（background: true 的构建/装依赖/发布）跑完，而 agent 没有在等它时，
        // 把结果作为一条通知推进对话：否则那条工具调用的"结果"永远不会回到会话里。
        // 回调属于 hook 的 OPTIONS，拿不到 hook 的返回值，用 ref 桥接。
        onBackgroundTaskSettled: surfaceOwner === 'dock' && !shouldYield ? (_tasks, note) => {
            setMessages(prev => [...prev, {
                id: 'background-' + Date.now().toString(36),
                sender: 'user' as const,
                content: note,
                timestamp: Date.now(),
            }])
            void agentRef.current
                ?.start([{ role: 'user', content: note } as AgentChatMessage], {
                    model: selectedModel || undefined,
                    mode: 'execute',
                    temperature: modelParams.temperature,
                    maxTokens: modelParams.maxTokens,
                    contextNote: buildCustomAgentNote(selectedAgent) || undefined,
                })
                .catch(err => setError(classifyError(err)))
        } : undefined,
        // 动态表单：用户在「填写请求」面板里补填了一张已经没人等的表单时，把答案作为
        // 一条通知推进对话——否则用户填了，agent 却永远不知道。结构与上面的长任务
        // 回调完全一致（追加一条用户消息 + 用同一套模型/上下文参数续跑）。
        onFormRequestAnswered: surfaceOwner === 'dock' && !shouldYield ? (_requests, note) => {
            setMessages(prev => [...prev, {
                id: 'form-' + Date.now().toString(36),
                sender: 'user' as const,
                content: note,
                timestamp: Date.now(),
            }])
            void agentRef.current
                ?.start([{ role: 'user', content: note } as AgentChatMessage], {
                    model: selectedModel || undefined,
                    mode: 'execute',
                    temperature: modelParams.temperature,
                    maxTokens: modelParams.maxTokens,
                    contextNote: buildCustomAgentNote(selectedAgent) || undefined,
                })
                .catch(err => setError(classifyError(err)))
        } : undefined,
    })
    agentRef.current = agent

    /**
     * Surface handoff. The dock is the home for a conversation on workspace
     * routes; on `/ai` it yields at a safe boundary (the backend run keeps
     * going) and re-attaches when it gets the conversation back. A run waiting
     * on a tool/approval keeps the dock as owner — the page then shows a banner
     * instead of mounting a second agent.
     */
    useEffect(() => {
        const pendingApproval = agent.state.toolCalls.some(call => call.approval?.status === 'pending')
        const safe = canYieldAgentSurface(agent.state.phase, agent.state.pendingToolIds, pendingApproval)

        if (shouldYield) {
            if (surfaceOwner !== 'dock' || !safe) return
            if (agent.detach()) {
                detachedRef.current = true
                releaseAgentSurface(sessionId, 'dock')
            }
            return
        }

        const reattach = () => {
            if (attachingRef.current) return
            attachingRef.current = true
            detachedRef.current = false
            void agent.attach().finally(() => { attachingRef.current = false })
        }

        if (surfaceOwner === 'dock') {
            if (detachedRef.current && safe) reattach()
            return
        }
        if (surfaceOwner === null && claimAgentSurface(sessionId, 'dock')) {
            // First activation, or the /ai page just handed the conversation
            // back. Attach even when this surface never detached: the run may
            // have been driven by the other surface until now.
            if (detachedRef.current || (agent.state.phase === 'idle' && !agent.state.runId)) {
                reattach()
            }
        }
    }, [
        shouldYield, surfaceOwner, sessionId, agent.attach, agent.detach,
        agent.state.phase, agent.state.pendingToolIds, agent.state.toolCalls,
    ])

    // A dock panel that unmounts (tab closed, plugin reload) must not leave a
    // stale owner that keeps the /ai page in its "running elsewhere" banner.
    useEffect(() => () => {
        if (getAgentSurfaceOwner(sessionId) === 'dock') releaseAgentSurface(sessionId, 'dock')
    }, [sessionId])

    // ─── Composer state ───────────────────────────────────────────
    const [input, setInput] = useState("")
    const [pendingImages, setPendingImages] = useState<AgentImageData[]>([])
    const [imageError, setImageError] = useState<string | null>(null)
    const [error, setError] = useState<ChatError | null>(null)

    const handleAddImages = useCallback(async (files: File[]) => {
        // A model the backend knows cannot see images would have the parts
        // dropped server-side; refuse the attachment here and say why.
        if (visionBlocked) {
            setImageError(t('ai.chat.visionUnsupportedError', {
                model: selectedModel,
                defaultValue: '当前模型「{{model}}」不支持图片输入，图片未添加。请切换到支持识图的模型。',
            }))
            return
        }
        const images: AgentImageData[] = []
        for (const file of files) {
            try {
                images.push(await fileToAgentImage(file))
            } catch (err: any) {
                setImageError(err?.message ?? String(err))
            }
        }
        if (images.length > 0) {
            setPendingImages(prev => [...prev, ...images])
            setImageError(null)
        }
    }, [visionBlocked, selectedModel, t])

    const handleRemoveImage = useCallback((index: number) => {
        setPendingImages(prev => prev.filter((_, i) => i !== index))
    }, [])

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
        todos: agent.state.todos,
    }), [agent.state.answerStepId, agent.state.reasoning, agent.state.steps, agent.state.subRuns, agent.state.text, agent.state.todos, currentSteps])

    // ─── Tab status reporting ─────────────────────────────────────
    // Report only MEANINGFUL transitions: the container owns unread/failed
    // clearing (it knows which tab the user is looking at), so a run that ends
    // in a background tab leaves a dot instead of vanishing.
    const reportedStatusRef = useRef<ChatTabStatus>('idle')
    useEffect(() => {
        // A handed-off conversation is driven by the /ai page. Reporting its
        // frozen "streaming" state would keep the dock pinned open forever.
        if (isHandedOff) {
            if (reportedStatusRef.current !== 'idle') {
                reportedStatusRef.current = 'idle'
                onRunStatus(sessionId, 'idle')
            }
            return
        }
        const phase = agent.state.phase
        const status: ChatTabStatus =
            pendingChoice || phase === 'waiting-approval' || phase === 'suspended'
                ? 'attention'
                : phase === 'failed'
                    ? 'failed'
                    : ACTIVE_PHASES.has(phase)
                        ? 'running'
                        : phase === 'completed' || phase === 'cancelled'
                            ? 'done'
                            : 'idle'
        if (status === reportedStatusRef.current) return
        reportedStatusRef.current = status
        if (status === 'idle') return
        onRunStatus(sessionId, status)
    }, [agent.state.phase, pendingChoice, onRunStatus, sessionId, isHandedOff])

    const lastUserMessageRef = useRef<string>("")
    const composerRef = useRef<HTMLTextAreaElement>(null)

    const generateMessageId = useCallback(
        () => 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        [],
    )

    /**
     * Set or clear a user bubble's steered flag. It is set when the turn is
     * typed (so the bubble renders below the streaming answer right away, no
     * jump once the request lands) and cleared if the run refuses it — a
     * refused turn is re-sent as a fresh run and belongs back in the history.
     */
    const setSteered = useCallback((id: string, steered: boolean) => {
        setMessages(prev => prev.map(m => (m.id === id ? { ...m, steered } : m)))
    }, [setMessages])

    /**
     * Turns typed while the run was already past its last safe boundary. They
     * are answered as fresh runs, one per turn, in the order they were typed:
     * the first one after this run finishes, the next after that run finishes.
     * A single slot used to overwrite the older turn and silently drop it.
     */
    const queuedTurnRef = useRef<AgentChatMessage[][]>([])

    /**
     * Start a fresh run for one user turn: freeze the page this turn edits and
     * attach the per-turn context note. Shared by a normal send and by the flush
     * of a turn that arrived while the previous run was already finishing.
     */
    const startTurn = useCallback(async (agentMessages: AgentChatMessage[]) => {
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

        // The bound-page notice is volatile model context, not part of the
        // user turn and not an invariant system rule. Send it as contextNote so
        // the backend persists it as an append-only <context> block behind the
        // cacheable history.
        const boundPageNote = runTarget
            ? t('ai.chat.boundPagePrefix', { title: runTarget.title })
            : undefined
        // Per-turn context only: the bound page, and a selected custom agent's
        // guidance (which must not be able to rewrite the backend's prompt).
        const contextNote = [boundPageNote, buildCustomAgentNote(selectedAgent)]
            .filter(Boolean)
            .join('\n\n') || undefined

        try {
            await agent.start(agentMessages, {
                model: selectedModel || undefined,
                mode: 'execute',
                temperature: modelParams.temperature,
                maxTokens: modelParams.maxTokens,
                contextNote,
            })
        } catch (err: any) {
            setError(classifyError(err))
        }
    }, [
        agent, targetPage, currentPage, setTargetPage,
        selectedModel, modelParams, t, selectedAgent,
    ])

    const flushQueuedTurn = useCallback(() => {
        const [next, ...rest] = queuedTurnRef.current
        if (!next) return
        queuedTurnRef.current = rest
        void startTurn(next)
    }, [startTurn])

    // ─── Run lifecycle: snapshot terminal turns into history ─────
    const abandoningRef = useRef(false)
    const lastPhaseRef = useRef(agent.state.phase)
    useEffect(() => {
        const phase = agent.state.phase
        if (lastPhaseRef.current === phase) return
        lastPhaseRef.current = phase
        if (phase === 'completed' || phase === 'failed' || phase === 'cancelled') {
            releaseRunTargetPin()
            // The steered turns belong to the run that just ended: the engine has
            // persisted them in place, so the live view drops the pending marker
            // too. Keeping it would drag them below whatever runs NEXT, and would
            // disagree with a reload (the transcript comes from the backend).
            setMessages(prev => prev.some(m => m.steered)
                ? prev.map(m => (m.steered ? { ...m, steered: false } : m))
                : prev)
            if (abandoningRef.current) {
                queuedTurnRef.current = []
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
                    todos: agent.state.todos.slice(),
                    usage: agent.state.usage ?? undefined,
                    error: phase === 'failed',
                    errorType: classifiedError?.type,
                    errorMessage: classifiedError?.message,
                }
                setMessages(prev => [...prev, snapshot])
            }
            agent.reset()
            flushQueuedTurn()
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

    // The container drives stop/clear through these; there is no "active agent"
    // any more, only per-conversation controls.
    useEffect(() => {
        const controls = controlsRef.current
        // The surface that owns the run owns its controls. A handed-off dock
        // panel must not offer stop/clear: `cancel()` would otherwise mark the
        // run cancelled locally while the /ai page keeps driving it.
        if (isHandedOff) {
            controls.delete(sessionId)
            return
        }
        controls.set(sessionId, {
            cancel: async () => {
                const cancelled = await agent.cancel().catch(() => false)
                if (cancelled) agent.reset()
                return cancelled
            },
            clear: async () => {
                await abandonAgent()
                resetTranscript()
                setError(null)
                setInput('')
                setPendingImages([])
                setImageError(null)
            },
        })
        return () => { controls.delete(sessionId) }
    }, [sessionId, agent, abandonAgent, resetTranscript, controlsRef, isHandedOff])

    // ─── Submit ───────────────────────────────────────────────────
    const submitMessage = useCallback(async (messageText: string, images: AgentImageData[] = []) => {
        const userMessage: Message = {
            id: generateMessageId(),
            content: messageText,
            images: images.length > 0 ? images.map(toImageDataUrl) : undefined,
            sender: "user",
            timestamp: Date.now(),
            // Typed mid-run: shown below the streaming answer until the run
            // either takes it or refuses it (see the branch below).
            steered: isActive,
        }
        setMessages((prev) => [...prev, userMessage])
        lastUserMessageRef.current = messageText
        setError(null)

        // Conversation history is engine-owned (session model log); the client
        // only sends the new turn. Images ride as multimodal content parts so
        // the model's own vision sees them (never interpreted here).
        const contentParts = images.length > 0
            ? buildImageContentParts(messageText, images)
            : undefined
        const agentMessages: AgentChatMessage[] = [{
            role: 'user',
            content: messageText,
            contentParts,
        }]

        // A run is already executing: hand the turn to it instead of waiting for
        // it to finish. The loop folds it in between two model calls, so the
        // answer keeps streaming into the same run and no run is cancelled.
        //
        // `runId` is part of the test: a `suspended`/`creating` surface may be
        // active with no run yet (attach failed, or the create round-trip is in
        // flight). Steering that has no target used to park the turn in the
        // queue forever, so let `start()` create a run (or wait for the create
        // already in flight and fold the turn into it).
        if (isActive && agent.state.runId) {
            if (await agent.steer(agentMessages)) return
            // It crossed its last safe boundary between typing and sending: keep
            // the turn (its bubble is already on screen) and answer it as the
            // next run once this one publishes its terminal state.
            setSteered(userMessage.id, false)
            queuedTurnRef.current = [...queuedTurnRef.current, agentMessages]
            return
        }

        await startTurn(agentMessages)
    }, [agent, agent.state.runId, generateMessageId, isActive, setMessages, setSteered, startTurn])

    const handleSend = useCallback(() => {
        const text = input.trim()
        const images = pendingImages
        // Sending while a run is in flight is allowed: the turn is handed to that
        // run (see submitMessage), so the composer is never a waiting room.
        if ((!text && images.length === 0) || !targetToolsReady) return
        // Images attached before switching to a non-vision model: don't send a
        // turn whose attachments the backend would strip.
        if (visionBlocked && images.length > 0) {
            setImageError(t('ai.chat.visionUnsupportedError', {
                model: selectedModel,
                defaultValue: '当前模型「{{model}}」不支持图片输入，图片未添加。请切换到支持识图的模型。',
            }))
            return
        }
        setInput("")
        setPendingImages([])
        submitMessage(text, images)
        requestAnimationFrame(() => {
            if (composerRef.current) composerRef.current.style.height = 'auto'
            composerRef.current?.focus()
        })
    }, [input, pendingImages, targetToolsReady, submitMessage, visionBlocked, selectedModel, t])

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

    // ─── Derived UI flags ─────────────────────────────────────────
    const isEmpty = messages.length === 0 && !isActive && !loadingTranscript
    // The document the next turn would act on: an explicit target wins, the
    // open page is the default. It also ranks the empty state's suggestions.
    const starterPage = targetPage ?? currentPage

    // ─── Render ───────────────────────────────────────────────────
    // The /ai page owns this conversation. Keep the tab mounted (its run is
    // being driven there) but do not render a second composer/approval card
    // whose actions would target a detached agent.
    if (isHandedOff) {
        return (
            <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-2 p-6 text-center">
                <p className="text-sm font-medium text-foreground">
                    {t('ai.chat.runningInKernel', { defaultValue: '该会话正在 /ai 页面运行' })}
                </p>
                <p className="max-w-sm text-xs text-muted-foreground">
                    {t('ai.chat.runningInKernelHint', {
                        defaultValue: '可能在等待工具或审批。回到 /ai 页面即可继续；切回工作区后会自动接回这里。',
                    })}
                </p>
            </div>
        )
    }

    return (
        <>
            <ExpandableChatBody className="flex-row overflow-x-hidden bg-background">
                {/* On mobile the pane takes over the panel (push navigation);
                    on desktop it is an inline side peek next to the chat. */}
                <div className={cn('flex min-h-0 min-w-0 flex-1 flex-col', inlinePaneArtifact && 'hidden md:flex')}>
                    <Conversation>
                        <ConversationContent className="flex flex-col gap-0.5 p-2">
                            {loadingTranscript && messages.length === 0 && (
                                <div
                                    role="status"
                                    aria-live="polite"
                                    className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground"
                                >
                                    <Loader size={18} />
                                    <span className="text-xs">{t('ai.chat.loadingSession')}</span>
                                </div>
                            )}

                            {isEmpty && (
                                <ChatEmptyState mode={chatMode} onSubmit={handleQuickSubmit} page={starterPage} />
                            )}

                            {/* A steered turn is only handled after the step that is
                                still running, so while the run is live it is rendered
                                BELOW the streaming answer instead of being spliced into
                                the history above it. */}
                            {messages.map((message) => (
                                isActive && message.steered ? null : (
                                    <MessageBubble
                                        key={message.id}
                                        message={message}
                                        onRevealReference={handleRevealReference}
                                    />
                                )
                            ))}

                            {isActive && (
                                <MessageBubble
                                    message={liveMessage}
                                    isStreaming
                                    onRevealReference={handleRevealReference}
                                />
                            )}

                            {isActive && messages.filter(message => message.steered).map((message) => (
                                <MessageBubble
                                    key={message.id}
                                    message={message}
                                    onRevealReference={handleRevealReference}
                                />
                            ))}

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

                            {pendingForms.map(request => (
                                <div key={request.id} className="mx-2 my-1.5">
                                    <FormRequestCard request={request} />
                                </div>
                            ))}

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
                        </ConversationContent>
                        <ConversationScrollButton label={t('ai.chat.scrollToBottom')} />
                    </Conversation>
                </div>
                {inlinePaneArtifact && (
                    <aside className="flex min-h-0 min-w-0 flex-1 flex-col border-l border-border bg-background md:w-3/5 md:flex-none">
                        <AgentPaneHost
                            artifact={inlinePaneArtifact}
                            onClose={pane.close}
                            onOpenInPage={pane.openInPage}
                            canOpenInPage={pane.canOpenInPage(inlinePaneArtifact)}
                        />
                    </aside>
                )}
            </ExpandableChatBody>

            {/* No top divider — same as the kernel home page: the composer
                already draws its own outline. */}
            <ExpandableChatFooter divided={false} className="bg-background p-2">
                <ChatComposer
                    ref={composerRef}
                    value={input}
                    onChange={handleInputChange}
                    onSubmit={handleSend}
                    onStop={() => void agent.cancel()}
                    isLoading={isActive}
                    mode={chatMode}
                    onModeChange={onModeChange}
                    model={selectedModel}
                    onModelChange={onModelChange}
                    modelParams={modelParams}
                    onModelParamsChange={onModelParamsChange}
                    targetPage={targetPage}
                    currentPage={currentPage}
                    targetStatus={!targetPage && currentPagePending ? 'connecting' : targetStatus}
                    onPickPage={setTargetPage}
                    onClearPage={() => setTargetPage(null)}
                    onRetryPage={handleRetryPage}
                    onOpenPageWindow={() => { if (targetPage) onOpenPageWindow(targetPage.pageId) }}
                    tracking={tracking}
                    images={pendingImages.map(toImageDataUrl)}
                    onAddImages={handleAddImages}
                    onRemoveImage={handleRemoveImage}
                    visionSupported={modelVision.known ? modelVision.supportsVision : undefined}
                    visionModelLabel={selectedModel}
                />
                {imageError && (
                    <div className="px-2 pt-1 text-[11px] text-destructive">{imageError}</div>
                )}
                <div className="h-safe-bottom lg:hidden" aria-hidden />
            </ExpandableChatFooter>
        </>
    )
}
