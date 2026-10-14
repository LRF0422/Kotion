import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'

import type { Message } from './chat-types'
import {
    ChatSessionMeta,
    deleteSessionMessages,
    loadSessionMessages,
    stripLegacyBoundPagePrefix,
} from './chat-sessions'
import {
    getRemoteMessages,
    importRemoteSession,
    markSessionApiUnavailable,
} from './chat-session-api'

export interface UseSessionTranscriptOptions {
    /** Conversation whose transcript this instance owns (one per open tab). */
    sessionId: string
    /** Bound page title, used to strip the pre-engine in-content notice. */
    boundPageTitle?: string
    /**
     * Session metadata, read once for the local→engine import. Held in a ref so
     * a metadata update (title, target page) never re-runs a load.
     */
    meta?: ChatSessionMeta
}

export interface SessionTranscript {
    messages: Message[]
    /** Append/update messages (marks the transcript as user-touched). */
    setMessages: Dispatch<SetStateAction<Message[]>>
    /** True while this session's engine transcript is being fetched. */
    loadingTranscript: boolean
    /** Drop the in-memory transcript without echoing it as user activity. */
    resetTranscript: () => void
}

/**
 * Owns ONE conversation's transcript.
 *
 * Sessions used to share a single hook that swapped the active transcript on
 * every switch. Tabs keep every open conversation mounted at once, so the
 * transcript is now per session: each tab loads (and re-loads) only its own
 * history, and a slow fetch can never land on the conversation the user has
 * since switched to.
 *
 * Persistence model is unchanged — the engine owns the transcript; the local
 * copy is a pre-migration import source and a boot-time cache.
 */
export function useSessionTranscript({
    sessionId,
    boundPageTitle,
    meta,
}: UseSessionTranscriptOptions): SessionTranscript {
    // The local cache is the boot-time transcript (the engine's projection
    // replaces it below). Seeded once per session: the panel that owns this hook
    // is keyed by sessionId, so the id never changes under it.
    const seedRef = useRef<{ sessionId: string; messages: Message[] } | null>(null)
    if (seedRef.current === null || seedRef.current.sessionId !== sessionId) {
        seedRef.current = { sessionId, messages: loadSessionMessages(sessionId) }
    }
    const [messages, setMessagesState] = useState<Message[]>(seedRef.current.messages)
    const [loadingTranscript, setLoadingTranscript] = useState(true)

    const metaRef = useRef(meta)
    metaRef.current = meta
    const boundPageTitleRef = useRef(boundPageTitle)
    boundPageTitleRef.current = boundPageTitle

    const messagesRef = useRef(messages)
    messagesRef.current = messages

    const applyTranscript = useCallback((next: Message[]) => {
        const cleaned = stripLegacyBoundPagePrefix(next, boundPageTitleRef.current)
        messagesRef.current = cleaned
        setMessagesState(cleaned)
    }, [])

    const setMessages = useCallback<Dispatch<SetStateAction<Message[]>>>(updater => {
        setMessagesState(prev => {
            const next = typeof updater === 'function'
                ? (updater as (previous: Message[]) => Message[])(prev)
                : updater
            messagesRef.current = next
            return next
        })
    }, [])

    const resetTranscript = useCallback(() => {
        applyTranscript([])
    }, [applyTranscript])

    // One load per session: the panel is keyed by sessionId, so this is mount.
    useEffect(() => {
        let cancelled = false
        // Same array the state already holds (see the seed above), which is what
        // lets `settle` tell "still untouched" from "the user typed meanwhile".
        const local = seedRef.current?.messages ?? []
        messagesRef.current = local
        setLoadingTranscript(true)

        /** Apply the engine transcript unless the user typed meanwhile. */
        const settle = (transcript: Message[]) => {
            if (cancelled) return
            if (messagesRef.current !== local) return
            if (transcript !== local) applyTranscript(transcript)
        }

        void (async () => {
            let remote: Message[] | null = null
            try {
                remote = await getRemoteMessages(sessionId)
            } catch {
                markSessionApiUnavailable()
                if (!cancelled) setLoadingTranscript(false)
                return
            }
            if (cancelled) return
            if (remote && remote.length > 0 && local.length <= remote.length) {
                settle(remote)
            } else if (local.length > 0) {
                // Engine has no transcript (or a shorter, window-seeded one):
                // migrate the richer local history once. The backend accepts a
                // strictly longer import and reports whether it used it.
                const current = metaRef.current
                if (current) {
                    void importRemoteSession(current, local)
                        .then(imported => {
                            // Drop the pre-migration local copy once the engine
                            // owns it, so it cannot be re-imported or linger.
                            if (imported) deleteSessionMessages(sessionId)
                        })
                        .catch(() => markSessionApiUnavailable())
                }
            }
            if (!cancelled) setLoadingTranscript(false)
        })()

        return () => { cancelled = true }
    }, [sessionId, applyTranscript])

    return { messages, setMessages, loadingTranscript, resetTranscript }
}
