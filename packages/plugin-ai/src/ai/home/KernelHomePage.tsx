import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn, useResponsive } from '@kn/ui'
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
import { ChatHeader } from '../menu/chat/ChatHeader'
import type { ChatTabInfo, ChatTabStatus } from '../menu/chat/ChatTabs'
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
 * Session AND TAB management is SHARED with the side dock: the same
 * conversation list, the same open tabs, the same engine-owned transcripts, so
 * opening a chat here and closing the dock shows the same thing.
 */

const PANE_WIDTH_KEY = 'kn_agent_pane_width'
const DEFAULT_PANE_WIDTH = 520
const PANE_MIN_WIDTH = 320
const PANE_MAX_RATIO = 0.68
const PANE_TRANSITION_MS = 200

const clampPaneWidth = (value: number): number => {
    const max = typeof window === 'undefined'
        ? 900
        : Math.max(PANE_MIN_WIDTH, Math.floor(window.innerWidth * PANE_MAX_RATIO))
    return Math.min(Math.max(value, PANE_MIN_WIDTH), max)
}

export const KernelHomePage: React.FC = () => {
    const { t } = useTranslation()

    // ─── Session + tab index (shared with the dock) ──────────────────
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
    const { isMobile } = useResponsive()

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

    // ─── Session/tab commands (shared with the dock) ─────────────────
    const {
        handleClearChat,
        handleNewSession,
        handleSelectSession,
        handleCloseTab,
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

    const tabs = useMemo<ChatTabInfo[]>(() => openSessionIds.map(id => {
        const meta = allSessions.find(session => session.id === id)
        return {
            id,
            title: meta?.title || t('ai.chat.newChat'),
            pageTitle: meta?.boundPage?.title || meta?.targetPage?.title,
            status: runStatus[id] ?? 'idle',
        }
    }), [openSessionIds, allSessions, runStatus, t])

    return (
        <div className="flex h-full min-h-0 bg-background">
            <div className={cn('flex min-w-0 flex-1 flex-col', paneOpen && isMobile && 'hidden')}>
                <div className="flex shrink-0 items-center gap-1 border-b pr-2">
                    <div className="min-w-0 flex-1">
                        <ChatHeader
                            tabs={tabs}
                            activeTabId={activeSessionId}
                            onSelectTab={handleSelectSession}
                            onCloseTab={handleCloseTab}
                            onNewTab={handleNewSession}
                            sessions={allSessions}
                            hasMessages={(messageCounts[activeSessionId] ?? 0) > 0}
                            onSwitch={handleSelectSession}
                            onDelete={handleDeleteSession}
                            onClear={handleClear}
                            queuedCount={queuedCount}
                            // This row owns the divider so it can span the artifacts
                            // shelf too; the header must not draw a second one.
                            divided={false}
                        />
                    </div>
                    <ArtifactsShelf
                        artifacts={activeArtifacts}
                        activeKey={shelfActiveKey}
                        onOpen={pane.openArtifact}
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
                    paneOpen && 'border-l border-border',
                )}
                style={{
                    // Mobile: full-width pane (the conversation is hidden above).
                    // Desktop: the resizable inline column (side peek).
                    width: paneOpen ? (isMobile ? '100%' : paneWidth) : 0,
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
