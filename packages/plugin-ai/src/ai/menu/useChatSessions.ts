import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'

import type { AnnotationData, Message, SessionInfo } from './chat-types'
import {
    ChatSessionMeta,
    ChatTargetPage,
    deleteSessionMessages,
    deriveTitle,
    generateSessionId,
    getActiveId,
    isBackendSessionFresh,
    loadIndex,
    loadSessionMessages,
    migrateLegacy,
    saveIndex,
    saveSessionMessages,
    setActiveId,
} from './chat-sessions'

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
    /** Backend Agent ids — only provided if still within TTL. */
    backendSessionId: string | undefined
    backendConversationId: string | undefined
    /** Create a brand-new empty chat session and switch to it. */
    createSession: () => string
    /** Switch the active chat to the given session id. */
    switchSession: (id: string) => void
    /** Delete a session. If it was active, switches to the next or creates a new one. */
    deleteSession: (id: string) => void
    /** Manually rename a session. */
    renameSession: (id: string, title: string) => void
    /** Clear all messages & backend ids of the active session (keeps the session itself). */
    clearActiveMessages: () => void
    /** Page bound to the active session (@-mention), if any. */
    targetPage: ChatTargetPage | undefined
    /** Bind / unbind the active session's target page. */
    setTargetPage: (page: ChatTargetPage | null) => void
    /** Absorb backend session/conversation ids emitted in streaming annotations. */
    parseAnnotations: (annotations: AnnotationData[]) => void
}

/**
 * React hook managing multiple chat sessions in the AI side panel.
 *
 * Responsibilities:
 * - Persists a session index + per-session messages in localStorage.
 * - Tracks the active session and exposes its messages.
 * - Maps backend Agent session/conversation ids onto the active chat session.
 * - Migrates legacy single-session storage on first run.
 */
export function useChatSessions(): UseChatSessionsResult {
    // ── Lazy one-shot initialization (migration + ensure at least one session) ──
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
                const now = Date.now()
                const meta: ChatSessionMeta = {
                    id: activeId,
                    title: 'New chat',
                    createdAt: now,
                    updatedAt: now,
                }
                index = [meta]
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

    // Track which session each `messages` snapshot belongs to, so we don't
    // accidentally persist a just-switched session's state back into the
    // previous session on the render that happens before `messages` is reset.
    const messagesSessionRef = useRef(activeSessionId)

    // Persist messages + bump session metadata when messages change.
    useEffect(() => {
        if (!activeSessionId) return
        // Ignore the transient render right after a session switch, where
        // `activeSessionId` has changed but `messages` still holds the prior
        // session's snapshot. The effect will fire again once `setMessages`
        // catches up.
        if (messagesSessionRef.current !== activeSessionId) {
            messagesSessionRef.current = activeSessionId
            return
        }

        saveSessionMessages(activeSessionId, messages)
        setSessions(prev => {
            let changed = false
            const next = prev.map(s => {
                if (s.id !== activeSessionId) return s
                // Auto-title only if still on the default title.
                const shouldAutoTitle = !s.title || s.title === 'New chat'
                const title = shouldAutoTitle ? deriveTitle(messages) : s.title
                if (title === s.title && s.updatedAt > Date.now() - 500) return s
                changed = true
                return { ...s, title, updatedAt: Date.now() }
            })
            if (!changed) return prev
            saveIndex(next)
            return next
        })
    }, [messages, activeSessionId])

    const activeSession = useMemo(
        () => sessions.find(s => s.id === activeSessionId) || null,
        [sessions, activeSessionId],
    )

    // Only expose backend ids while they are fresh; otherwise the caller
    // should start a new backend session.
    const { backendSessionId, backendConversationId } = useMemo(() => {
        if (!activeSession || !isBackendSessionFresh(activeSession)) {
            return { backendSessionId: undefined, backendConversationId: undefined }
        }
        return {
            backendSessionId: activeSession.backendSessionId,
            backendConversationId: activeSession.backendConversationId,
        }
    }, [activeSession])

    const updateMeta = useCallback(
        (id: string, patch: (s: ChatSessionMeta) => ChatSessionMeta) => {
            setSessions(prev => {
                const next = prev.map(s => (s.id === id ? patch(s) : s))
                saveIndex(next)
                return next
            })
        },
        [],
    )

    const createSession = useCallback((): string => {
        const id = generateSessionId()
        const now = Date.now()
        const meta: ChatSessionMeta = {
            id,
            title: 'New chat',
            createdAt: now,
            updatedAt: now,
        }
        setSessions(prev => {
            const next = [meta, ...prev]
            saveIndex(next)
            return next
        })
        messagesSessionRef.current = id
        setActiveId(id)
        setActiveSessionIdState(id)
        setMessages([])
        return id
    }, [])

    const switchSession = useCallback(
        (id: string) => {
            if (!id || id === activeSessionId) return
            messagesSessionRef.current = id
            setActiveId(id)
            setActiveSessionIdState(id)
            setMessages(loadSessionMessages(id))
        },
        [activeSessionId],
    )

    const deleteSession = useCallback(
        (id: string) => {
            if (!id) return
            deleteSessionMessages(id)
            setSessions(prev => {
                const remaining = prev.filter(s => s.id !== id)
                if (id === activeSessionId) {
                    if (remaining.length > 0) {
                        const nextId = remaining[0].id
                        messagesSessionRef.current = nextId
                        setActiveId(nextId)
                        setActiveSessionIdState(nextId)
                        setMessages(loadSessionMessages(nextId))
                        saveIndex(remaining)
                        return remaining
                    }
                    // No sessions left — create a fresh empty one.
                    const newId = generateSessionId()
                    const now = Date.now()
                    const fresh: ChatSessionMeta = {
                        id: newId,
                        title: 'New chat',
                        createdAt: now,
                        updatedAt: now,
                    }
                    const withFresh = [fresh]
                    saveIndex(withFresh)
                    messagesSessionRef.current = newId
                    setActiveId(newId)
                    setActiveSessionIdState(newId)
                    setMessages([])
                    return withFresh
                }
                saveIndex(remaining)
                return remaining
            })
        },
        [activeSessionId],
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
        setMessages([])
        updateMeta(activeSessionId, s => ({
            ...s,
            title: 'New chat',
            backendSessionId: undefined,
            backendConversationId: undefined,
            backendSessionUpdatedAt: undefined,
            updatedAt: Date.now(),
        }))
    }, [activeSessionId, updateMeta])

    const targetPage = activeSession?.targetPage

    const setTargetPage = useCallback(
        (page: ChatTargetPage | null) => {
            updateMeta(activeSessionId, s => ({
                ...s,
                targetPage: page ?? undefined,
                updatedAt: Date.now(),
            }))
        },
        [activeSessionId, updateMeta],
    )

    const parseAnnotations = useCallback(
        (annotations: AnnotationData[]) => {
            for (const ann of annotations) {
                let sid: string | undefined
                let cid: string | undefined
                if (
                    'type' in ann &&
                    (ann as any).type === 'session-info' &&
                    typeof (ann as any).sessionId === 'string'
                ) {
                    sid = (ann as any).sessionId
                    cid = (ann as any).conversationId
                } else if ('sessionId' in ann && typeof (ann as any).sessionId === 'string') {
                    sid = (ann as SessionInfo).sessionId
                    cid = (ann as SessionInfo).conversationId
                }
                if (sid) {
                    updateMeta(activeSessionId, s => ({
                        ...s,
                        backendSessionId: sid,
                        backendConversationId: cid ?? s.backendConversationId,
                        backendSessionUpdatedAt: Date.now(),
                        updatedAt: Date.now(),
                    }))
                    break
                }
            }
        },
        [activeSessionId, updateMeta],
    )

    return {
        sessions,
        activeSession,
        activeSessionId,
        messages,
        setMessages,
        backendSessionId,
        backendConversationId,
        createSession,
        switchSession,
        deleteSession,
        renameSession,
        clearActiveMessages,
        targetPage,
        setTargetPage,
        parseAnnotations,
    }
}
