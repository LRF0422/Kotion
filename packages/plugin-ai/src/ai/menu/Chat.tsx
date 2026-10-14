import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Sparkles } from "@kn/icon"
import { ExpandableChat, ExpandableChatHeader, cn } from "@kn/ui"
import { Editor } from "@kn/editor"
import {
    agentStreamBudgetSnapshot,
    event,
    DOCK_PANEL_RUNNING,
    PageEditWindow,
    registerAgentPaneOpener,
    useAgentPane,
    useTranslation,
} from "@kn/common"
import type {
    AgentArtifact,
    ChatMode,
    ChatModelParams,
} from "@kn/common"

import type { Message } from "./chat-types"
import type { ChatSessionMeta } from "./chat-sessions"
import { ChatHeader } from "./chat/ChatHeader"
import type { ChatTabInfo, ChatTabStatus } from "./chat/ChatTabs"
import { ChatConversation } from "./ChatConversation"
import { readModelParams, MODEL_PARAMS_STORAGE_KEY } from "./chat-helpers"
import { useModelPreference } from "../model-preference"
import { useChatSessions } from "./useChatSessions"
import { useSessionActions, type ChatPanelControls } from "./use-session-actions"

// ─── Persistence keys ──────────────────────────────────────────────

const MODE_STORAGE_KEY = 'kn_chat_mode'
/** How often the queued-stream hint refreshes while any tab is running. */
const BUDGET_POLL_MS = 1000

/**
 * The AI side dock's chat surface.
 *
 * It is a TAB CONTAINER, not a chat: it owns the session/tab index, the shared
 * model/mode preferences and the window chrome, and renders ONE mounted
 * {@link ChatConversation} per open tab. Because every tab stays mounted, its
 * agent keeps streaming while the user reads another one — switching tabs is
 * visibility, never cancellation.
 *
 * Run status flows UP (each panel reports), commands flow DOWN (the header and
 * the tab strip drive per-conversation controls), and the transcript/agent state
 * stays inside the panel that owns it.
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

    // ─── Model / mode preferences (persisted, shared by every tab) ──
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

    // ─── Session + tab index ──────────────────────────────────────
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

    // Per-conversation stop/clear controls, published by the mounted panels.
    const controlsRef = useRef<Map<string, ChatPanelControls>>(new Map())

    // ─── Tab status (running / needs-you / unread / failed) ───────
    const [runStatus, setRunStatus] = useState<Record<string, ChatTabStatus>>({})
    const [messageCounts, setMessageCounts] = useState<Record<string, number>>({})
    const [editWindowPageId, setEditWindowPageId] = useState<string | null>(null)

    const handleRunStatus = useCallback((id: string, status: ChatTabStatus) => {
        setRunStatus(prev => (prev[id] === status ? prev : { ...prev, [id]: status }))
    }, [])

    // Focusing a tab consumes its marker: the user has now seen the result (or
    // the failure). `attention` deliberately survives — that still needs an answer.
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

    const handleOpenPageWindow = useCallback((pageId: string) => {
        setEditWindowPageId(String(pageId))
    }, [])

    // ─── Session/tab commands (shared with the kernel surface) ────
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

    const anyRunning = openSessionIds.some(id => {
        const status = runStatus[id]
        return status === 'running' || status === 'attention'
    })

    // ─── Queued-stream notice ─────────────────────────────────────
    // The engine caps concurrent live streams (each one holds an HTTP
    // connection). Tabs past the cap attach later from the durable log, so the
    // honest thing is to SAY so rather than show a spinner that looks stuck.
    const [queuedCount, setQueuedCount] = useState(0)
    useEffect(() => {
        if (!anyRunning) {
            setQueuedCount(0)
            return
        }
        const read = () => setQueuedCount(agentStreamBudgetSnapshot().queuedRoot)
        read()
        const timer = setInterval(read, BUDGET_POLL_MS)
        return () => clearInterval(timer)
    }, [anyRunning])

    // The dock rail animates while ANY tab works.
    useEffect(() => {
        event.emit(DOCK_PANEL_RUNNING, { id: 'agent', running: anyRunning })
    }, [anyRunning])
    useEffect(() => {
        return () => { event.emit(DOCK_PANEL_RUNNING, { id: 'agent', running: false }) }
    }, [])

    // ─── Working target (artifact pane) ───────────────────────────
    // The target belongs to the CONVERSATION (it is stored with the session
    // metadata), so a tab switch restores it — and only the focused tab may own
    // the (single, app-level) pane.
    const pane = useAgentPane()
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
        if (targetArtifact) paneOpenArtifact(targetArtifact)
        else paneClearTarget()
        // Deliberately keyed on the session id: this is a restore, not a sync.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeSessionId])

    useEffect(() => {
        // A tab switch has just rewritten the pane from the new session's own
        // target; persisting that back would be a no-op on a good day and would
        // carry the previous tab's target into the new one on a race.
        if (skipPersistRef.current) {
            skipPersistRef.current = false
            return
        }
        patchSession(activeIdRef.current, { targetArtifact: pane.target ?? undefined })
    }, [pane.target, activeSessionId, patchSession])

    // Agent tools (`openPageSide` / `focusArtifact`) run outside React and only
    // know their conversation id: route the artifact to the conversation that
    // produced it instead of into whichever tab happens to be visible.
    const openArtifact = pane.openArtifact
    useEffect(() => {
        const unregister = openSessionIds.map(id => registerAgentPaneOpener(id, (artifact: AgentArtifact) => {
            patchSession(id, { targetArtifact: artifact })
            if (id === activeIdRef.current) openArtifact(artifact)
        }))
        return () => { unregister.forEach(fn => fn()) }
    }, [openSessionIds, openArtifact, patchSession])

    const tabs = useMemo<ChatTabInfo[]>(() => openSessionIds.map(id => {
        const meta = allSessions.find(session => session.id === id)
        return {
            id,
            title: meta?.title || t('ai.chat.newChat'),
            pageTitle: meta?.boundPage?.title || meta?.targetPage?.title,
            status: runStatus[id] ?? 'idle',
        }
    }), [openSessionIds, allSessions, runStatus, t])

    // ─── Render ───────────────────────────────────────────────────
    return (
        <ExpandableChat
            size="lg"
            embedded={embedded}
            onClose={onClose}
            icon={
                <div className="relative flex items-center justify-center">
                    {anyRunning && (
                        <span
                            aria-hidden
                            className="absolute -inset-1.5 rounded-full animate-spin"
                            style={{
                                background:
                                    'conic-gradient(from 0deg, transparent 0deg, transparent 220deg, currentColor 340deg, transparent 360deg)',
                                WebkitMask:
                                    'radial-gradient(circle, transparent 58%, #000 60%)',
                                mask:
                                    'radial-gradient(circle, transparent 58%, #000 60%)',
                                animationDuration: '1.1s',
                            }}
                        />
                    )}
                    <Sparkles
                        className={`h-6 w-6 relative z-10 transition-transform duration-500 ${anyRunning ? 'scale-95 drop-shadow-[0_0_6px_currentColor]' : ''}`}
                    />
                </div>
            }
        >
            <ExpandableChatHeader className="p-0 border-0">
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
                    onClear={handleClearChat}
                    queuedCount={queuedCount}
                />
            </ExpandableChatHeader>

            {/* One mounted conversation per open tab. A background tab is only
                hidden, never unmounted: its agent, stream and off-screen editor
                leases stay alive so the run continues in parallel. */}
            {openSessionIds.map(id => (
                <div
                    key={id}
                    className={cn(
                        'flex min-h-0 min-w-0 flex-1 flex-col',
                        id !== activeSessionId && 'hidden',
                    )}
                    aria-hidden={id !== activeSessionId}
                >
                    <ChatConversation
                        sessionId={id}
                        session={allSessions.find(session => session.id === id)}
                        active={id === activeSessionId}
                        editor={editor}
                        selectedModel={selectedModel}
                        onModelChange={handleModelChange}
                        chatMode={chatMode}
                        onModeChange={handleModeChange}
                        modelParams={modelParams}
                        onModelParamsChange={handleModelParamsChange}
                        onPatchSession={handlePatchSession}
                        onMessagesChange={handleMessagesChange}
                        onRunStatus={handleRunStatus}
                        controlsRef={controlsRef}
                        onOpenPageWindow={handleOpenPageWindow}
                    />
                </div>
            ))}

            {editWindowPageId && (
                <PageEditWindow
                    pageId={editWindowPageId}
                    onClose={() => setEditWindowPageId(null)}
                />
            )}
        </ExpandableChat>
    )
}
