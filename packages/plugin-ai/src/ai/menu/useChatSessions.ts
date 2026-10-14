import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { Message } from './chat-types'
import {
    ChatSessionMeta,
    ChatTargetPage,
    MAX_OPEN_TABS,
    deleteSessionMessages,
    deriveTitle,
    generateSessionId,
    getActiveId,
    loadIndex,
    loadOpenTabs,
    migrateLegacy,
    saveIndex,
    saveOpenTabs,
    setActiveId,
} from './chat-sessions'
import {
    clearRemoteSession,
    deleteRemoteSession,
    isSessionApiAvailable,
    listRemoteSessions,
    markSessionApiUnavailable,
    upsertRemoteSession,
} from './chat-session-api'

export interface UseChatSessionsResult {
    /** All known chat sessions, sorted by most-recent first. */
    sessions: ChatSessionMeta[]
    /** Metadata of the currently focused session (null before initialization). */
    activeSession: ChatSessionMeta | null
    /** Local id of the focused chat session. */
    activeSessionId: string
    /**
     * Ids of the conversations with an OPEN TAB, in display order. Every open
     * tab keeps its own mounted conversation (and therefore its own live run):
     * switching tabs never cancels anything.
     */
    openSessionIds: string[]
    /** Open a conversation as a tab (when closed) and focus it. */
    activateSession: (id: string) => void
    /** Close a tab. The conversation itself is kept — it stays in history. */
    closeTab: (id: string) => void
    /** Create a brand-new conversation, open it as a tab and focus it. */
    createSession: (boundPage?: ChatTargetPage) => string
    /** Delete a conversation and close its tab. */
    deleteSession: (id: string) => void
    /** Manually rename a session. */
    renameSession: (id: string, title: string) => void
    /** Auto-title / touch one session from its own transcript activity. */
    noteSessionMessages: (id: string, messages: Message[]) => void
    /** Reset one session's transcript (engine copy, local cache, title). */
    clearSessionMessages: (id: string) => void
    /** Patch one session's metadata (bound page, working target). */
    patchSession: (id: string, patch: Partial<ChatSessionMeta>) => void
}

/** Upper bound on sessions fetched from the backend. */
const SESSION_LIST_LIMIT = 100

function createMeta(id: string, boundPage?: ChatTargetPage): ChatSessionMeta {
    const now = Date.now()
    return { id, title: 'New chat', createdAt: now, updatedAt: now, boundPage }
}

/**
 * Union of backend and local-cache session metadata.
 *
 * Only METADATA is cached locally now: the transcript is engine-owned and read
 * from `/api/agent/v1/sessions`. The local cache keeps the session list snappy
 * on boot and holds pre-migration transcripts solely as an import source.
 */
function mergeSessions(remote: ChatSessionMeta[], local: ChatSessionMeta[]): ChatSessionMeta[] {
    const byId = new Map<string, ChatSessionMeta>()
    for (const session of remote) byId.set(session.id, session)
    for (const session of local) {
        const existing = byId.get(session.id)
        if (!existing || (session.updatedAt || 0) > (existing.updatedAt || 0)) {
            byId.set(session.id, session)
        }
    }
    return [...byId.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
}

/**
 * The AI chat's session + TAB index, shared by the side dock and the kernel
 * home page.
 *
 * It owns three things and nothing else:
 *  - the conversation index (metadata: title, page bindings, working target);
 *  - which conversations have an open tab, and which one is focused;
 *  - persistence of both (a localStorage index for boot, the engine for the
 *    authoritative list).
 *
 * The TRANSCRIPT is deliberately not here any more: with tabs, every open
 * conversation stays mounted, so each of them owns its own transcript through
 * {@link useSessionTranscript}. This hook therefore never swaps or resets
 * message state — only the panel that owns a conversation can cancel it.
 */
export function useChatSessions(): UseChatSessionsResult {
    // ── Lazy one-shot local seed (migration + ensure one session + one tab) ──
    const initial = useRef<{ sessions: ChatSessionMeta[]; activeId: string; tabs: string[] } | null>(null)
    if (initial.current === null) {
        migrateLegacy()
        let index = loadIndex()
        let activeId = getActiveId() || ''
        if (!activeId || !index.some(s => s.id === activeId)) {
            if (index.length > 0) {
                activeId = index[0].id
            } else {
                activeId = generateSessionId()
                index = [createMeta(activeId)]
                saveIndex(index)
            }
            setActiveId(activeId)
        }
        const tabs = loadOpenTabs().filter(id => index.some(s => s.id === id))
        if (!tabs.includes(activeId)) tabs.unshift(activeId)
        initial.current = { sessions: index, activeId, tabs }
    }

    const [sessions, setSessions] = useState<ChatSessionMeta[]>(initial.current.sessions)
    const [activeSessionId, setActiveSessionIdState] = useState<string>(initial.current.activeId)
    const [openSessionIds, setOpenSessionIds] = useState<string[]>(initial.current.tabs)

    const sessionsRef = useRef(sessions)
    sessionsRef.current = sessions
    const activeIdRef = useRef(activeSessionId)
    activeIdRef.current = activeSessionId
    const tabsRef = useRef(openSessionIds)
    tabsRef.current = openSessionIds

    const commitTabs = useCallback((next: string[]) => {
        tabsRef.current = next
        saveOpenTabs(next)
        setOpenSessionIds(next)
    }, [])

    const focus = useCallback((id: string) => {
        activeIdRef.current = id
        setActiveId(id)
        setActiveSessionIdState(id)
    }, [])

    /** Open `id` as a tab (evicting the oldest other tab at the ceiling). */
    const openTab = useCallback((id: string) => {
        const tabs = tabsRef.current
        if (tabs.includes(id)) return
        const next = [...tabs]
        if (next.length >= MAX_OPEN_TABS) {
            const evictable = next.findIndex(tabId => tabId !== activeIdRef.current)
            next.splice(evictable >= 0 ? evictable : 0, 1)
        }
        next.push(id)
        commitTabs(next)
    }, [commitTabs])

    const activateSession = useCallback((id: string) => {
        if (!id) return
        openTab(id)
        focus(id)
    }, [focus, openTab])

    // ── Engine metadata sync (session list) ─────────────────────────
    const updateMeta = useCallback(
        (id: string, patch: (session: ChatSessionMeta) => ChatSessionMeta) => {
            const prev = sessionsRef.current
            const next = prev.map(session => (session.id === id ? patch(session) : session))
            sessionsRef.current = next
            saveIndex(next)
            setSessions(next)
            const updated = next.find(session => session.id === id)
            if (updated && isSessionApiAvailable()) {
                void upsertRemoteSession(updated).catch(() => markSessionApiUnavailable())
            }
        },
        [],
    )

    useEffect(() => {
        const hydrate = async () => {
            let remote: ChatSessionMeta[] = []
            try {
                remote = await listRemoteSessions(SESSION_LIST_LIMIT)
            } catch {
                // Keep the local index: the transcript read is a different
                // endpoint and may succeed even when the list call failed.
                markSessionApiUnavailable()
            }
            const merged = mergeSessions(remote, loadIndex())
            let nextActive = getActiveId() || ''
            if (!nextActive || !merged.some(s => s.id === nextActive)) {
                nextActive = merged[0]?.id || activeIdRef.current
            }
            if (!merged.some(s => s.id === nextActive)) {
                const fresh = createMeta(generateSessionId())
                merged.push(fresh)
                nextActive = fresh.id
            }
            sessionsRef.current = merged
            setSessions(merged)
            focus(nextActive)
            saveIndex(merged)

            // Restore the open tabs against the merged list: a tab whose
            // conversation no longer exists anywhere is dropped rather than
            // reopening an empty ghost.
            const restored = tabsRef.current.filter(id => merged.some(s => s.id === id))
            if (!restored.includes(nextActive)) restored.unshift(nextActive)
            commitTabs(restored)

            // Push local-only / newer metadata so the server list matches.
            const remoteById = new Map(remote.map(s => [s.id, s]))
            for (const meta of merged) {
                const known = remoteById.get(meta.id)
                if (known && (meta.updatedAt || 0) <= (known.updatedAt || 0)) continue
                void upsertRemoteSession(meta).catch(() => markSessionApiUnavailable())
            }
        }
        void hydrate()
        return () => {
            /* no-op */
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const activeSession = useMemo(
        () => sessions.find(session => session.id === activeSessionId) || null,
        [sessions, activeSessionId],
    )

    const createSession = useCallback((boundPage?: ChatTargetPage): string => {
        const id = generateSessionId()
        const meta = createMeta(id, boundPage)
        const next = [meta, ...sessionsRef.current]
        sessionsRef.current = next
        saveIndex(next)
        setSessions(next)
        openTab(id)
        focus(id)
        if (isSessionApiAvailable()) {
            void upsertRemoteSession(meta).catch(() => markSessionApiUnavailable())
        }
        return id
    }, [focus, openTab])

    const closeTab = useCallback((id: string) => {
        if (!id) return
        const tabs = tabsRef.current
        const index = tabs.indexOf(id)
        if (index < 0) return
        const next = tabs.filter(tabId => tabId !== id)
        if (next.length === 0) {
            // The strip is never empty: closing the last tab starts a fresh
            // conversation instead (the closed one stays in history).
            const fresh = createMeta(generateSessionId())
            const merged = [fresh, ...sessionsRef.current]
            sessionsRef.current = merged
            saveIndex(merged)
            setSessions(merged)
            focus(fresh.id)
            commitTabs([fresh.id])
            if (isSessionApiAvailable()) {
                void upsertRemoteSession(fresh).catch(() => markSessionApiUnavailable())
            }
            return
        }
        commitTabs(next)
        if (id === activeIdRef.current) {
            const neighbour = next[Math.min(index, next.length - 1)]
            focus(neighbour)
        }
    }, [commitTabs, focus])

    const deleteSession = useCallback((id: string) => {
        if (!id) return
        deleteSessionMessages(id)
        // Destructive ops are never pre-empted by a stale availability flag.
        void deleteRemoteSession(id).catch(() => markSessionApiUnavailable())

        const remaining = sessionsRef.current.filter(session => session.id !== id)
        sessionsRef.current = remaining
        saveIndex(remaining)
        setSessions(remaining)

        const tabs = tabsRef.current
        const index = tabs.indexOf(id)
        const nextTabs = tabs.filter(tabId => tabId !== id)
        if (id === activeIdRef.current) {
            if (nextTabs.length > 0) {
                focus(nextTabs[Math.min(index < 0 ? 0 : index, nextTabs.length - 1)])
                commitTabs(nextTabs)
            } else {
                const fresh = createMeta(generateSessionId())
                const merged = [fresh, ...remaining]
                sessionsRef.current = merged
                saveIndex(merged)
                setSessions(merged)
                focus(fresh.id)
                commitTabs([fresh.id])
                if (isSessionApiAvailable()) {
                    void upsertRemoteSession(fresh).catch(() => markSessionApiUnavailable())
                }
            }
        } else {
            commitTabs(nextTabs)
        }
    }, [commitTabs, focus])

    const renameSession = useCallback((id: string, title: string) => {
        const trimmed = title.trim()
        if (!trimmed) return
        updateMeta(id, session => ({ ...session, title: trimmed, updatedAt: Date.now() }))
    }, [updateMeta])

    /**
     * Reflect a conversation's transcript activity: derive the auto title on the
     * first user turn and keep "most recent" ordering honest. Called by the tab
     * panel that owns the transcript, so a busy background tab also promotes
     * itself in the history list without stealing focus.
     */
    const noteSessionMessages = useCallback((id: string, messages: Message[]) => {
        const current = sessionsRef.current.find(session => session.id === id)
        if (!current) return
        const shouldAutoTitle = !current.title || current.title === 'New chat'
        const title = shouldAutoTitle ? deriveTitle(messages) : current.title
        if (title === current.title) return
        updateMeta(id, session => ({ ...session, title, updatedAt: Date.now() }))
    }, [updateMeta])

    const clearSessionMessages = useCallback((id: string) => {
        deleteSessionMessages(id)
        void clearRemoteSession(id).catch(() => markSessionApiUnavailable())
        updateMeta(id, session => ({
            ...session,
            title: 'New chat',
            targetPage: undefined,
            updatedAt: Date.now(),
        }))
    }, [updateMeta])

    const patchSession = useCallback((id: string, patch: Partial<ChatSessionMeta>) => {
        updateMeta(id, session => ({ ...session, ...patch }))
    }, [updateMeta])

    return {
        sessions,
        activeSession,
        activeSessionId,
        openSessionIds,
        activateSession,
        closeTab,
        createSession,
        deleteSession,
        renameSession,
        noteSessionMessages,
        clearSessionMessages,
        patchSession,
    }
}
