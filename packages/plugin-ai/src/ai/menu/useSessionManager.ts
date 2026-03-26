import { useState, useCallback } from 'react'
import type { SessionInfo, AnnotationData } from './chat-types'

const SESSION_STORAGE_KEY = 'agent-session-id'
const SESSION_TIMESTAMP_KEY = 'agent-session-timestamp'
const CONVERSATION_STORAGE_KEY = 'agent-conversation-id'
const SESSION_TTL_MS = 30 * 60 * 1000 // 30 minutes

/**
 * Hook to manage Agent session and conversation IDs.
 * Handles localStorage persistence and TTL expiration.
 */
export function useSessionManager() {
    const [sessionId, setSessionId] = useState<string | null>(() => {
        return getStoredSessionId()
    })
    const [conversationId, setConversationId] = useState<string | null>(() => {
        return localStorage.getItem(CONVERSATION_STORAGE_KEY)
    })

    const saveSession = useCallback((sid: string, cid?: string) => {
        localStorage.setItem(SESSION_STORAGE_KEY, sid)
        localStorage.setItem(SESSION_TIMESTAMP_KEY, Date.now().toString())
        setSessionId(sid)
        if (cid) {
            localStorage.setItem(CONVERSATION_STORAGE_KEY, cid)
            setConversationId(cid)
        }
    }, [])

    const clearSession = useCallback(() => {
        localStorage.removeItem(SESSION_STORAGE_KEY)
        localStorage.removeItem(SESSION_TIMESTAMP_KEY)
        localStorage.removeItem(CONVERSATION_STORAGE_KEY)
        setSessionId(null)
        setConversationId(null)
    }, [])

    /**
     * Parse session info from annotation data (protocol code `8:` events).
     * Call this with each batch of annotation data received from the stream.
     */
    const parseAnnotations = useCallback((annotations: AnnotationData[]) => {
        for (const ann of annotations) {
            if ('sessionId' in ann && typeof ann.sessionId === 'string') {
                saveSession(ann.sessionId, (ann as SessionInfo).conversationId)
                break
            }
        }
    }, [saveSession])

    return {
        sessionId,
        conversationId,
        saveSession,
        clearSession,
        parseAnnotations,
    }
}

/**
 * Get stored session ID, checking TTL expiration.
 */
function getStoredSessionId(): string | null {
    const sid = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!sid) return null

    const timestamp = localStorage.getItem(SESSION_TIMESTAMP_KEY)
    if (!timestamp) return null

    const elapsed = Date.now() - parseInt(timestamp, 10)
    if (elapsed > SESSION_TTL_MS) {
        // Session expired, clean up
        localStorage.removeItem(SESSION_STORAGE_KEY)
        localStorage.removeItem(SESSION_TIMESTAMP_KEY)
        localStorage.removeItem(CONVERSATION_STORAGE_KEY)
        return null
    }

    return sid
}
