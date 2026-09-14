import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'

import type { Message } from './chat-types'
import {
    ChatSessionMeta,
    ChatTargetPage,
    deleteSessionMessages,
    deriveTitle,
    generateSessionId,
    getActiveId,
    loadIndex,
    loadSessionMessages,
    migrateLegacy,
    saveIndex,
    setActiveId,
} from './chat-sessions'
import {
    clearRemoteSession,
    deleteRemoteSession,
    getRemoteMessages,
    importRemoteSession,
    isSessionApiAvailable,
    listRemoteSessions,
    markSessionApiUnavailable,
    upsertRemoteSession,
} from './chat-session-api'

export interface UseChatSessionsResult {
    /** All known chat sessions, sorted by most-recent first. */
    sessions: ChatSessionMeta[]
    /** Metadata of the currently active session (null before initialization). */
    activeSession: ChatSessionMeta | null
    /** Local id of the active chat session. */
    activeSessionId: string
    /** Messages of the active session. */
    messages: Message[]
    setMessages: Dispatch<SetStateAction<Message[]>>
    /** Create a brand-new empty chat session and switch to it. */
    createSession: (boundPage?: ChatTargetPage) => string
    /** Switch the active chat to the given session id. */
    switchSession: (id: string) => void
    /** Delete a session. If it was active, switches to the next or creates a new one. */
    deleteSession: (id: string) => void
    /** Manually rename a session. */
    renameSession: (id: string, title: string) => void
    /** Clear all messages of the active session (keeps the session itself). */
    clearActiveMessages: () => void
    /** Page bound to the active session (@-mention), if any. */
    targetPage: ChatTargetPage | undefined
    /** Bind / unbind the active session's target page. */
    setTargetPage: (page: ChatTargetPage | null) => void
    /** Page the active session belongs to (auto-bound), if any. */
    boundPage: ChatTargetPage | undefined
    /** Bind / unbind the active session's owning page. */
    setBoundPage: (page: ChatTargetPage | null) => void
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
 * React hook managing multiple chat sessions in the AI side panel.
 *
 * Persistence model (engine-owned):
 * - the backend projects the transcript from the durable run log and the client
 *   only READS it (plus writes UI-only metadata: title, @-page bindings);
 * - localStorage holds the session index and any pre-migration transcript, used
 *   to boot instantly and to import once into the engine;
 * - the live turn is an optimistic in-memory echo until the engine projects it.
 *
 * Programmatic `setMessages` loads update `lastSyncedRef` to the exact array,
 * so the effect can distinguish them from user/agent changes without racing
 * React's batching.
 */
export function useChatSessions(): UseChatSessionsResult {
    // ── Lazy one-shot local seed (migration + ensure at least one session) ──
    const initial = useRef<{ sessions: ChatSessionMeta[]; activeId: string } | null>(null)
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
        initial.current = { sessions: index, activeId }
    }

    const [sessions, setSessions] = useState<ChatSessionMeta[]>(initial.current.sessions)
    const [activeSessionId, setActiveSessionIdState] = useState<string>(initial.current.activeId)
    const [messages, setMessages] = useState<Message[]>(() =>
        loadSessionMessages(initial.current!.activeId),
    )

    const sessionsRef = useRef(sessions)
    sessionsRef.current = sessions
    const activeIdRef = useRef(activeSessionId)
    activeIdRef.current = activeSessionId
    const messagesRef = useRef(messages)
    messagesRef.current = messages

    const messagesSessionRef = useRef(activeSessionId)
    const lastSyncedRef = useRef(messages)
    const userTouchedRef = useRef(false)

    // ── Engine transcript loading (with one-time import of local history) ──
    const applyTranscript = useCallback((id: string, transcript: Message[]) => {
        messagesSessionRef.current = id
        lastSyncedRef.current = transcript
        messagesRef.current = transcript
        setMessages(transcript)
    }, [])

    const loadTranscript = useCallback(async (id: string, local: Message[]): Promise<Message[]> => {
        if (!isSessionApiAvailable()) return local
        let remote: Message[] | null = null
        try {
            remote = await getRemoteMessages(id)
        } catch {
            markSessionApiUnavailable()
            return local
        }
        if (remote && remote.length > 0 && local.length <= remote.length) {
            return remote
        }
        // Engine has no transcript (or a shorter, window-seeded one): migrate the
        // richer local history once. The backend accepts a strictly longer import.
        if (local.length > 0) {
            const meta = sessionsRef.current.find(s => s.id === id)
            if (meta) {
                void importRemoteSession(meta, local).catch(() => markSessionApiUnavailable())
            }
            return local
        }
        return remote ?? local
    }, [])

    useEffect(() => {
        const hydrate = async () => {
            if (!isSessionApiAvailable()) return
            let remote: ChatSessionMeta[]
            try {
                remote = await listRemoteSessions(SESSION_LIST_LIMIT)
            } catch {
                markSessionApiUnavailable()
                return
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
            setActiveId(nextActive)
            setActiveSessionIdState(nextActive)
            saveIndex(merged)
            // Push local-only / newer metadata so the server list matches.
            const remoteById = new Map(remote.map(s => [s.id, s]))
            for (const meta of merged) {
                const known = remoteById.get(meta.id)
                if (known && (meta.updatedAt || 0) <= (known.updatedAt || 0)) continue
                void upsertRemoteSession(meta).catch(() => markSessionApiUnavailable())
            }

            if (userTouchedRef.current) {
                // The user started typing before hydration settled: keep it.
                messagesSessionRef.current = nextActive
                return
            }
            const local = loadSessionMessages(nextActive)
            applyTranscript(nextActive, local)
            const transcript = await loadTranscript(nextActive, local)
            if (messagesSessionRef.current !== nextActive) return
            if (messagesRef.current !== local) return
            if (transcript !== local) {
                applyTranscript(nextActive, transcript)
            }
        }
        void hydrate()
        return () => {
            /* no-op */
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const activeSession = useMemo(
        () => sessions.find(s => s.id === activeSessionId) || null,
        [sessions, activeSessionId],
    )

    const updateMeta = useCallback(
        (id: string, patch: (s: ChatSessionMeta) => ChatSessionMeta) => {
            const prev = sessionsRef.current
            const next = prev.map(s => (s.id === id ? patch(s) : s))
            sessionsRef.current = next
            saveIndex(next)
            setSessions(next)
            const updated = next.find(s => s.id === id)
            if (updated && isSessionApiAvailable()) {
                void upsertRemoteSession(updated).catch(() => markSessionApiUnavailable())
            }
        },
        [],
    )

    // Keep the local title in sync with the conversation (metadata only — the
    // transcript itself is written by the engine at run terminal).
    useEffect(() => {
        if (!activeSessionId) return
        if (messagesSessionRef.current !== activeSessionId) {
            messagesSessionRef.current = activeSessionId
            lastSyncedRef.current = messages
            return
        }
        if (lastSyncedRef.current === messages) return
        lastSyncedRef.current = messages
        userTouchedRef.current = true

        const current = sessionsRef.current.find(s => s.id === activeSessionId)
        if (!current) return
        const shouldAutoTitle = !current.title || current.title === 'New chat'
        const title = shouldAutoTitle ? deriveTitle(messages) : current.title
        if (title !== current.title) {
            updateMeta(activeSessionId, s => ({ ...s, title, updatedAt: Date.now() }))
        }
    }, [messages, activeSessionId, updateMeta])

    const createSession = useCallback((boundPage?: ChatTargetPage): string => {
        const id = generateSessionId()
        const meta = createMeta(id, boundPage)
        const next = [meta, ...sessionsRef.current]
        sessionsRef.current = next
        saveIndex(next)
        setSessions(next)

        const empty: Message[] = []
        messagesSessionRef.current = id
        lastSyncedRef.current = empty
        messagesRef.current = empty
        setActiveId(id)
        setActiveSessionIdState(id)
        setMessages(empty)
        if (isSessionApiAvailable()) {
            void upsertRemoteSession(meta).catch(() => markSessionApiUnavailable())
        }
        return id
    }, [])

    const switchSession = useCallback(
        (id: string) => {
            if (!id || id === activeIdRef.current) return
            const local = loadSessionMessages(id)
            setActiveId(id)
            setActiveSessionIdState(id)
            applyTranscript(id, local)

            if (!isSessionApiAvailable()) return
            void (async () => {
                const transcript = await loadTranscript(id, local)
                if (messagesSessionRef.current !== id) return
                if (messagesRef.current !== local) return // user typed meanwhile
                if (transcript !== local) {
                    applyTranscript(id, transcript)
                }
            })()
        },
        [applyTranscript, loadTranscript],
    )

    const deleteSession = useCallback(
        (id: string) => {
            if (!id) return
            deleteSessionMessages(id)
            if (isSessionApiAvailable()) {
                void deleteRemoteSession(id).catch(() => markSessionApiUnavailable())
            }

            const remaining = sessionsRef.current.filter(s => s.id !== id)
            if (id === activeIdRef.current) {
                if (remaining.length > 0) {
                    const nextId = remaining[0].id
                    applyTranscript(nextId, loadSessionMessages(nextId))
                    setActiveId(nextId)
                    setActiveSessionIdState(nextId)
                    if (isSessionApiAvailable()) {
                        void (async () => {
                            const transcript = await loadTranscript(nextId, messagesRef.current)
                            if (messagesSessionRef.current === nextId) {
                                applyTranscript(nextId, transcript)
                            }
                        })()
                    }
                } else {
                    const fresh = createMeta(generateSessionId())
                    remaining.push(fresh)
                    applyTranscript(fresh.id, [])
                    setActiveId(fresh.id)
                    setActiveSessionIdState(fresh.id)
                    if (isSessionApiAvailable()) {
                        void upsertRemoteSession(fresh).catch(() => markSessionApiUnavailable())
                    }
                }
            }
            sessionsRef.current = remaining
            saveIndex(remaining)
            setSessions(remaining)
        },
        [applyTranscript, loadTranscript],
    )

    const renameSession = useCallback(
        (id: string, title: string) => {
            const trimmed = title.trim()
            if (!trimmed) return
            updateMeta(id, s => ({ ...s, title: trimmed, updatedAt: Date.now() }))
        },
        [updateMeta],
    )

    const clearActiveMessages = useCallback(() => {
        const id = activeIdRef.current
        applyTranscript(id, [])
        deleteSessionMessages(id)
        updateMeta(id, s => ({ ...s, title: 'New chat', updatedAt: Date.now() }))
        if (isSessionApiAvailable()) {
            void clearRemoteSession(id).catch(() => markSessionApiUnavailable())
        }
    }, [applyTranscript, updateMeta])

    const targetPage = activeSession?.targetPage
    const boundPage = activeSession?.boundPage

    const setTargetPage = useCallback(
        (page: ChatTargetPage | null) => {
            updateMeta(activeIdRef.current, s => ({
                ...s,
                targetPage: page ?? undefined,
                updatedAt: Date.now(),
            }))
        },
        [updateMeta],
    )

    const setBoundPage = useCallback(
        (page: ChatTargetPage | null) => {
            // Binding is not user activity — leave updatedAt alone so merely
            // browsing pages cannot promote a stale chat to "most recent".
            updateMeta(activeIdRef.current, s => ({ ...s, boundPage: page ?? undefined }))
        },
        [updateMeta],
    )

    return {
        sessions,
        activeSession,
        activeSessionId,
        messages,
        setMessages,
        createSession,
        switchSession,
        deleteSession,
        renameSession,
        clearActiveMessages,
        targetPage,
        setTargetPage,
        boundPage,
        setBoundPage,
    }
}
