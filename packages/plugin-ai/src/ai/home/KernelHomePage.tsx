import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    Button,
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
    cn,
    useResponsive,
    useUiStyle,
} from '@kn/ui'
import { AtSign, PanelLeft, Plus } from '@kn/icon'
import {
    agentStreamBudgetSnapshot,
    agentTargetKey,
    AgentPaneHost,
    registerAgentPaneOpener,
    useAgentPane,
    useTranslation,
    type AgentArtifact,
    type ChatMode,
    type ChatModelParams,
} from '@kn/common'
import { ArtifactsShelf } from './ArtifactsShelf'
import { ChatHeaderActions } from '../menu/chat/ChatHeaderActions'
import { ChatTabStatusLight, type ChatTabStatus } from '../menu/chat/ChatTabs'
import { SessionSidebar, SessionSidebarSheet } from '../menu/chat/SessionSidebar'
import { sessionPageTitle } from '../menu/chat/session-list'
import { KernelConversation } from './KernelConversation'
import { useChatSessions } from '../menu/useChatSessions'
import { useSessionActions, type ChatPanelControls } from '../menu/use-session-actions'
import { MODEL_PARAMS_STORAGE_KEY, readModelParams } from '../menu/chat-helpers'
import { useModelPreference } from '../model-preference'
import type { Message } from '../menu/chat-types'
import type { ChatSessionMeta } from '../menu/chat-sessions'

/**
 * Kernel Home — the workspace-level AI surface, owned by the AI plugin.
 *
 * A page the AI plugin contributes (route + sider menu); plugin-main has no AI
 * code and does not know this surface exists. Removing the AI plugin removes
 * the surface.
 *
 * It is the same chat as the side dock, full width — the same tab strip, the
 * same empty state, the same composer, the same engine runs — plus the kernel
 * chrome: the artifacts shelf of the focused conversation and the working-target
 * side peek. Only two things differ from the dock:
 *  - the run is workspace-scoped (no editor), so document tools arrive by the
 *    conversation acquiring a page, not by binding the open editor;
 *  - the working target is per conversation and survives a reload with it.
 *
 * Session management is SHARED with the side dock: the same conversation list,
 * the same open conversations, the same engine-owned transcripts, so opening a
 * chat here and closing the dock shows the same thing.
 *
 * Layout note: the dock's session switcher is a tab strip (no room for a list in
 * a narrow panel); this full-width surface keeps sessions in a dedicated LEFT
 * COLUMN — new chat + every conversation grouped by recency, with the same run
 * status lights — instead of the strip. The header keeps only the focused
 * conversation's title and the shared action cluster.
 *
 * UI style: the route declares `fullBleed`, so the shell leaves the pane frame
 * to this page. In "modern" style the conversation column and the chat are two
 * floating panes (`kn-workspace-sidebar` / `kn-workspace-editor`) separated by
 * the shell's pane gap — the same language as the workspace page, and the
 * artifacts peek becomes a third pane. "Classic" style keeps the flat surface
 * with a single column divider, exactly as before.
 */

const PANE_WIDTH_KEY = 'kn_agent_pane_width'
const DEFAULT_PANE_WIDTH = 520
const PANE_MIN_WIDTH = 320
const PANE_MAX_RATIO = 0.68
const PANE_TRANSITION_MS = 200
/** Width of the conversation column (px). */
const SESSION_SIDEBAR_WIDTH = 232
/** Remembered open/collapsed state of the conversation column. */
const SESSION_SIDEBAR_KEY = 'kn_ai_session_sidebar_collapsed'

const clampPaneWidth = (value: number): number => {
    const max = typeof window === 'undefined'
        ? 900
        : Math.max(PANE_MIN_WIDTH, Math.floor(window.innerWidth * PANE_MAX_RATIO))
    return Math.min(Math.max(value, PANE_MIN_WIDTH), max)
}

export const KernelHomePage: React.FC = () => {
    const { t } = useTranslation()
    // Device tier drives STRUCTURE here, not just styling: the conversation
    // column is inline from tablet up, and a left sheet on a phone.
    const { isMobile, isMobileOrTablet } = useResponsive()
    // Modern UI style lays a page out as floating panes (workspace-style). This
    // route declares `fullBleed`, so the shell leaves the pane frame to us.
    const { uiStyle } = useUiStyle()
    const isModernSurface = !isMobile && uiStyle === 'modern'

    // ─── Session index (shared with the dock) ────────────────────────
    const {
        sessions: allSessions,
        activeSessionId,
        openSessionIds,
        activeSession,
        patchSession,
        noteSessionMessages,
        activateSession,
        closeTab,
        createSession,
        deleteSession,
        clearSessionMessages,
    } = useChatSessions()

    const activeIdRef = useRef(activeSessionId)
    activeIdRef.current = activeSessionId

    const controlsRef = useRef<Map<string, ChatPanelControls>>(new Map())

    // ─── Conversation column (open by default on real desktop widths) ──
    // The stored preference wins; without one, narrow layouts start collapsed
    // so the chat is not squeezed before the user has expressed a preference.
    const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
        try {
            const stored = window.localStorage.getItem(SESSION_SIDEBAR_KEY)
            if (stored === '1') return true
            if (stored === '0') return false
        } catch { /* preference is best-effort */ }
        return isMobileOrTablet
    })
    const toggleSidebar = useCallback(() => {
        setSidebarCollapsed(prev => {
            const next = !prev
            try { window.localStorage.setItem(SESSION_SIDEBAR_KEY, next ? '1' : '0') } catch { /* ignore */ }
            return next
        })
    }, [])
    /** Phone only: the column becomes a left sheet. */
    const [historySheetOpen, setHistorySheetOpen] = useState(false)
    const openSessionList = useCallback(() => {
        if (isMobile) setHistorySheetOpen(true)
        else toggleSidebar()
    }, [isMobile, toggleSidebar])

    // ─── Shared preferences ──────────────────────────────────────────
    const [chatMode, setChatMode] = useState<ChatMode>('agent')
    const [selectedModel, setSelectedModel] = useModelPreference()
    const [modelParams, setModelParams] = useState<ChatModelParams>(() => readModelParams())
    const handleModelParamsChange = useCallback((params: ChatModelParams) => {
        setModelParams(params)
        try {
            window.localStorage.setItem(MODEL_PARAMS_STORAGE_KEY, JSON.stringify(params))
        } catch {
            /* preference is best-effort */
        }
    }, [])

    // ─── Tab status / artifacts, reported by the panels ──────────────
    const [runStatus, setRunStatus] = useState<Record<string, ChatTabStatus>>({})
    const [messageCounts, setMessageCounts] = useState<Record<string, number>>({})
    const [artifactsByTab, setArtifactsByTab] = useState<Record<string, AgentArtifact[]>>({})

    const handleRunStatus = useCallback((id: string, status: ChatTabStatus) => {
        setRunStatus(prev => (prev[id] === status ? prev : { ...prev, [id]: status }))
    }, [])

    useEffect(() => {
        setRunStatus(prev => {
            const current = prev[activeSessionId]
            if (current !== 'done' && current !== 'failed') return prev
            return { ...prev, [activeSessionId]: 'idle' }
        })
    }, [activeSessionId])

    const handleMessagesChange = useCallback((id: string, messages: Message[]) => {
        setMessageCounts(prev => (prev[id] === messages.length ? prev : { ...prev, [id]: messages.length }))
        noteSessionMessages(id, messages)
    }, [noteSessionMessages])

    const handlePatchSession = useCallback((id: string, patch: Partial<ChatSessionMeta>) => {
        patchSession(id, patch)
    }, [patchSession])

    const handleArtifacts = useCallback((id: string, artifacts: AgentArtifact[]) => {
        setArtifactsByTab(prev => (prev[id] === artifacts ? prev : { ...prev, [id]: artifacts }))
    }, [])

    const anyRunning = openSessionIds.some(id => {
        const status = runStatus[id]
        return status === 'running' || status === 'attention'
    })

    // The engine caps concurrent live streams; past the cap a tab attaches from
    // its durable log a little later. Say so instead of looking stuck.
    const [queuedCount, setQueuedCount] = useState(0)
    useEffect(() => {
        if (!anyRunning) {
            setQueuedCount(0)
            return
        }
        const read = () => setQueuedCount(agentStreamBudgetSnapshot().queuedRoot)
        read()
        const timer = setInterval(read, 1000)
        return () => clearInterval(timer)
    }, [anyRunning])

    // ─── Side peek: enter/exit animation + drag-to-resize ────────────
    // The surface owns the request snapshot so the column can animate out while
    // still rendering its content (see AgentPaneHostProps).
    const pane = useAgentPane()
    const [paneWidth, setPaneWidth] = useState(() => {
        try {
            const stored = Number(window.localStorage.getItem(PANE_WIDTH_KEY))
            return Number.isFinite(stored) && stored > 0 ? clampPaneWidth(stored) : DEFAULT_PANE_WIDTH
        } catch {
            return DEFAULT_PANE_WIDTH
        }
    })
    const [paneOpen, setPaneOpen] = useState(false)
    const [paneDisplay, setPaneDisplay] = useState<AgentArtifact | null>(null)
    const [resizing, setResizing] = useState(false)
    // Narrow viewports have no room for a split: the pane takes over the
    // surface (push navigation) instead of squeezing the conversation.

    useEffect(() => {
        if (pane.open && pane.target) {
            setPaneDisplay(pane.target)
            // Mount at width 0 first, then transition to the target width.
            const raf = requestAnimationFrame(() => setPaneOpen(true))
            return () => cancelAnimationFrame(raf)
        }
        setPaneOpen(false)
        const timer = setTimeout(() => setPaneDisplay(null), PANE_TRANSITION_MS)
        return () => clearTimeout(timer)
    }, [pane.open, pane.target])

    // ─── Working target survives a refresh, per conversation ──────────
    // The target belongs to the CONVERSATION, so it is stored with the session
    // metadata. Restoring runs on tab switch only: re-running it on every target
    // change would fight the user's own pane interactions.
    const paneOpenArtifact = pane.openArtifact
    const paneClearTarget = pane.clearTarget
    const targetArtifact = activeSession?.targetArtifact
    /** Suppress the persist effect for the restore a tab switch performs. */
    const skipPersistRef = useRef(false)
    const restoreSessionRef = useRef<string | null>(null)
    useEffect(() => {
        if (restoreSessionRef.current === activeSessionId) return
        restoreSessionRef.current = activeSessionId
        skipPersistRef.current = true
        // A new conversation starts with no target (spec: session switch clears).
        if (targetArtifact) paneOpenArtifact(targetArtifact)
        else paneClearTarget()
        // Deliberately keyed on the session id: this is a restore, not a sync.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeSessionId])

    // Persist changes the agent or the user makes (close keeps the target).
    useEffect(() => {
        if (skipPersistRef.current) {
            skipPersistRef.current = false
            return
        }
        patchSession(activeIdRef.current, { targetArtifact: pane.target ?? undefined })
    }, [pane.target, activeSessionId, patchSession])

    // Agent tools (`openPageSide` / `focusArtifact`) run outside React and only
    // know their conversation id: an artifact of a background tab becomes THAT
    // tab's working target instead of hijacking the visible pane.
    const openArtifact = pane.openArtifact
    useEffect(() => {
        const unregister = openSessionIds.map(id => registerAgentPaneOpener(id, (artifact: AgentArtifact) => {
            patchSession(id, { targetArtifact: artifact })
            if (id === activeIdRef.current) openArtifact(artifact)
        }))
        return () => { unregister.forEach(fn => fn()) }
    }, [openSessionIds, openArtifact, patchSession])

    const handleResizeStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        event.preventDefault()
        setResizing(true)
        const startX = event.clientX
        const startWidth = paneWidth
        const previousUserSelect = document.body.style.userSelect
        document.body.style.userSelect = 'none'

        const handleMove = (moveEvent: PointerEvent) => {
            setPaneWidth(clampPaneWidth(startWidth - (moveEvent.clientX - startX)))
        }
        const handleUp = () => {
            setResizing(false)
            document.body.style.userSelect = previousUserSelect
            window.removeEventListener('pointermove', handleMove)
            window.removeEventListener('pointerup', handleUp)
            // Persist the settled width (updater form reads the latest value).
            setPaneWidth(width => {
                try { window.localStorage.setItem(PANE_WIDTH_KEY, String(width)) } catch { /* best-effort */ }
                return width
            })
        }
        window.addEventListener('pointermove', handleMove)
        window.addEventListener('pointerup', handleUp)
    }, [paneWidth])

    // ─── Session commands (shared with the dock) ────────────────────
    // No tab strip on this surface, so `handleCloseTab` is unused: the dock is
    // the only place where closing an open conversation (and stopping its run)
    // is a user gesture.
    const {
        handleClearChat,
        handleNewSession,
        handleSelectSession,
        handleDeleteSession,
    } = useSessionActions({
        activeSessionId,
        controlsRef,
        clearSessionMessages,
        activateSession,
        closeTab,
        createSession,
        deleteSession,
    })

    const handleClear = useCallback(async () => {
        // The working target belongs to the conversation being cleared.
        pane.clearTarget()
        await handleClearChat()
    }, [pane, handleClearChat])

    // ─── Artifacts shelf of the FOCUSED conversation ─────────────────
    // Derived from that conversation's transcript (engine-persisted), so it
    // survives a refresh for free and can never drift from the chat.
    const activeArtifacts = artifactsByTab[activeSessionId] ?? []
    const shelfActiveKey = agentTargetKey(pane.target)

    // ─── Focused conversation, as the header shows it ───────────────
    const sessionListLabel = isMobile
        ? t('ai.chat.sessions.open', { defaultValue: '会话历史' })
        : sidebarCollapsed
            ? t('ai.chat.sessions.expand', { defaultValue: '展开会话列表' })
            : t('ai.chat.sessions.collapse', { defaultValue: '收起会话列表' })
    const activeTitle = activeSession?.title || t('ai.chat.newChat')
    const activePageTitle = sessionPageTitle(activeSession)
    const activeStatus = runStatus[activeSessionId] ?? 'idle'
    const hasActiveMessages = (messageCounts[activeSessionId] ?? 0) > 0
    // A finished turn may have rewritten the open-task snapshot of ANY open
    // conversation, not only the focused one: key the task index on the whole
    // run-status map so the badge never goes stale in the background.
    const tasksRefreshKey = useMemo(
        () => openSessionIds.map(id => `${id}:${runStatus[id] ?? 'idle'}`).join('|'),
        [openSessionIds, runStatus],
    )
    // Only conversations mounted HERE can report a live status. A row whose tab
    // was closed (or evicted by the open-tab ceiling) must show no marker
    // rather than a stale "running" light nobody can clear.
    const sessionStatuses = useMemo(() => {
        const visible: Record<string, ChatTabStatus> = {}
        for (const id of openSessionIds) {
            const status = runStatus[id]
            if (status) visible[id] = status
        }
        return visible
    }, [openSessionIds, runStatus])

    return (
        <div
            className={cn(
                'flex h-full min-h-0 w-full',
                // Modern: the pane shell's gap separates the conversation pane
                // from the chat pane, exactly like the workspace page.
                isModernSurface ? 'kn-workspace-shell bg-muted/40' : 'bg-background',
            )}
        >
            {/* ── Conversation column (session management) ──────────────
                Full-page chat only: the narrow dock keeps its tab strip. The
                column is ALWAYS mounted so its collapsed width is a painted
                state and expanding animates from it; the inner layer keeps the
                full width so rows never reflow while the width transitions. */}
            {!isMobile && (
                <aside
                    aria-hidden={sidebarCollapsed}
                    aria-label={t('ai.chat.sessions.title', { defaultValue: '会话' })}
                    className={cn(
                        'relative flex shrink-0 flex-col overflow-hidden',
                        isModernSurface
                            ? 'kn-workspace-sidebar h-full min-h-0'
                            : 'border-r',
                        sidebarCollapsed && 'border-0',
                    )}
                    style={{
                        width: sidebarCollapsed ? 0 : SESSION_SIDEBAR_WIDTH,
                        // Collapsed, the pane keeps its (zero) width but the
                        // MODERN pane gap would still offset the chat pane;
                        // cancel it. Classic has no pane gap (the variable is
                        // inherited even there), so applying this margin would
                        // pull the chat left and clip it under the shell.
                        marginRight: sidebarCollapsed && isModernSurface
                            ? 'calc(-1 * var(--kn-workspace-gap, 0px))'
                            : 0,
                        // Width alone keeps the rows keyboard-focusable while
                        // invisible; visibility takes the subtree out of both
                        // the a11y and the tab order.
                        visibility: sidebarCollapsed ? 'hidden' : 'visible',
                        transition: 'width 160ms ease-out',
                    }}
                >
                    <div className="h-full min-h-0" style={{ width: SESSION_SIDEBAR_WIDTH }}>
                        <SessionSidebar
                            sessions={allSessions}
                            activeSessionId={activeSessionId}
                            runStatus={sessionStatuses}
                            onSelect={handleSelectSession}
                            onNewSession={handleNewSession}
                            onDelete={handleDeleteSession}
                            // A floating pane already separates the list from
                            // the chat; the tint is only needed in the flat
                            // (classic) layout.
                            className={isModernSurface ? 'bg-background' : 'bg-muted/20'}
                        />
                    </div>
                </aside>
            )}

            {/* Phone: the same list arrives as a left sheet from the header. */}
            {isMobile && (
                <SessionSidebarSheet
                    open={historySheetOpen}
                    onOpenChange={setHistorySheetOpen}
                    content={
                        <SessionSidebar
                            sessions={allSessions}
                            activeSessionId={activeSessionId}
                            runStatus={sessionStatuses}
                            onSelect={handleSelectSession}
                            onNewSession={handleNewSession}
                            onDelete={handleDeleteSession}
                            onNavigate={() => setHistorySheetOpen(false)}
                            onClose={() => setHistorySheetOpen(false)}
                            className="bg-background"
                        />
                    }
                />
            )}

            <div className={cn(
                'flex min-w-0 flex-1 flex-col',
                isModernSurface && 'kn-workspace-editor h-full min-h-0 overflow-hidden',
                paneOpen && isMobile && 'hidden',
            )}>
                {/* Header: conversation list toggle + the FOCUSED conversation's
                    title, then the shared action cluster (tasks / clear) and the
                    artifacts shelf. The tab strip lives only in the dock now. */}
                <div className="flex h-9 shrink-0 items-center gap-1 border-b bg-background/95 pl-1.5 pr-2 backdrop-blur-sm">
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={openSessionList}
                                    aria-label={sessionListLabel}
                                    aria-expanded={isMobile ? historySheetOpen : !sidebarCollapsed}
                                    className="h-6 w-6 shrink-0 p-0 text-muted-foreground transition-colors hover:text-foreground"
                                >
                                    <PanelLeft className="h-3.5 w-3.5" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-xs">
                                {sessionListLabel}
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleNewSession}
                                    aria-label={t('ai.chat.newChat')}
                                    className="h-6 w-6 shrink-0 p-0 text-muted-foreground transition-colors hover:text-foreground"
                                >
                                    <Plus className="h-3.5 w-3.5" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-xs">
                                {t('ai.chat.newChat')}
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                        <ChatTabStatusLight status={activeStatus} />
                        <span className="truncate text-xs font-medium" title={activeTitle}>
                            {activeTitle}
                        </span>
                        {activePageTitle && (
                            <span className="flex min-w-0 max-w-[40%] shrink-0 items-center gap-0.5 text-[10px] text-muted-foreground">
                                <AtSign className="h-2.5 w-2.5 shrink-0" />
                                <span className="truncate">{activePageTitle}</span>
                            </span>
                        )}
                    </div>
                    <ArtifactsShelf
                        artifacts={activeArtifacts}
                        activeKey={shelfActiveKey}
                        onOpen={pane.openArtifact}
                    />
                    <ChatHeaderActions
                        sessions={allSessions}
                        activeSessionId={activeSessionId}
                        hasMessages={hasActiveMessages}
                        onSwitch={handleSelectSession}
                        onNewSession={handleNewSession}
                        onDelete={handleDeleteSession}
                        onClear={handleClear}
                        showHistory={false}
                        tasksRefreshKey={tasksRefreshKey}
                        queuedCount={queuedCount}
                    />
                </div>

                {/* One mounted conversation per open tab: a background tab is
                    only hidden, so its run keeps going in parallel. */}
                {openSessionIds.map(id => (
                    <div
                        key={id}
                        className={cn('flex min-h-0 w-full flex-1 flex-col', id !== activeSessionId && 'hidden')}
                        aria-hidden={id !== activeSessionId}
                    >
                        <KernelConversation
                            sessionId={id}
                            session={allSessions.find(session => session.id === id)}
                            selectedModel={selectedModel}
                            onModelChange={setSelectedModel}
                            chatMode={chatMode}
                            onModeChange={setChatMode}
                            modelParams={modelParams}
                            onModelParamsChange={handleModelParamsChange}
                            onPatchSession={handlePatchSession}
                            onMessagesChange={handleMessagesChange}
                            onRunStatus={handleRunStatus}
                            onArtifacts={handleArtifacts}
                            controlsRef={controlsRef}
                        />
                    </div>
                ))}
            </div>

            {/* The column is ALWAYS mounted so its closed width is a painted
                state; opening then animates from it. A freshly-mounted aside
                would be painted straight at its target width (no transition).
                Transitions are inline on purpose: arbitrary Tailwind utilities
                like `transition-[width]` are not guaranteed to be scanned
                from a plugin bundle, and a missing class silently disables the
                animation. */}
            <aside
                aria-hidden={!paneOpen}
                className={cn(
                    'relative flex shrink-0 overflow-hidden bg-background',
                    paneOpen && !isModernSurface && 'border-l border-border',
                    paneOpen && isModernSurface && 'kn-workspace-editor h-full min-h-0',
                )}
                style={{
                    // Mobile: full-width pane (the conversation is hidden above).
                    // Desktop: the resizable inline column (side peek).
                    width: paneOpen ? (isMobile ? '100%' : paneWidth) : 0,
                    // A closed pane is still a flex child of the modern pane
                    // shell: its gap would inset the chat pane's right edge by
                    // one gutter even though nothing is there. Cancel it once
                    // the collapse animation has fully let go of the space.
                    marginLeft: isModernSurface && !paneOpen && !paneDisplay
                        ? 'calc(-1 * var(--kn-workspace-gap, 0px))'
                        : 0,
                    transition: resizing ? 'none' : 'width 200ms ease-out',
                }}
            >
                {paneDisplay && (
                    <>
                        {/* Drag handle on the leading edge. */}
                        <div
                            role="separator"
                            aria-orientation="vertical"
                            aria-label={t('ai.artifacts.resizePane')}
                            onPointerDown={handleResizeStart}
                            className={cn(
                                'absolute left-0 top-0 z-10 h-full w-1.5 cursor-col-resize',
                                resizing ? 'bg-primary/50' : 'hover:bg-border',
                            )}
                        />
                        {/* Fixed-width inner layer: content never reflows while
                            the column width animates; it fades in/out with it. */}
                        <div
                            className="h-full"
                            style={{
                                width: paneWidth,
                                opacity: paneOpen ? 1 : 0,
                                transition: 'opacity 200ms ease-out',
                            }}
                        >
                            <AgentPaneHost
                                artifact={paneDisplay}
                                onClose={pane.close}
                                onOpenInPage={pane.openInPage}
                                canOpenInPage={pane.canOpenInPage(paneDisplay)}
                            />
                        </div>
                    </>
                )}
            </aside>
        </div>
    )
}
