/**
 * useSessionActions — the chat session lifecycle commands (clear / new /
 * switch / delete). Each first abandons any in-flight run so a switch never
 * leaves a run driving tools against the wrong conversation. Extracted from
 * Chat.tsx to keep the panel about rendering + composition.
 */

import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { ChatError } from './chat-types'

export interface UseSessionActionsOptions {
    activeSessionId: string
    /** Cancel + reset the active run before switching conversations. */
    abandonAgent: () => Promise<void>
    clearActiveMessages: () => void
    createSession: () => string
    switchSession: (id: string) => void
    deleteSession: (id: string) => void
    setError: Dispatch<SetStateAction<ChatError | null>>
}

export interface UseSessionActionsApi {
    handleClearChat: () => Promise<void>
    handleNewSession: () => Promise<void>
    handleSwitchSession: (id: string) => Promise<void>
    handleDeleteSession: (id: string) => Promise<void>
}

export function useSessionActions(options: UseSessionActionsOptions): UseSessionActionsApi {
    const {
        activeSessionId, abandonAgent, clearActiveMessages,
        createSession, switchSession, deleteSession, setError,
    } = options

    const handleClearChat = useCallback(async () => {
        await abandonAgent()
        setError(null)
        clearActiveMessages()
    }, [abandonAgent, clearActiveMessages, setError])

    const handleNewSession = useCallback(async () => {
        await abandonAgent()
        setError(null)
        createSession()
    }, [abandonAgent, createSession, setError])

    const handleSwitchSession = useCallback(async (id: string) => {
        if (id === activeSessionId) return
        await abandonAgent()
        setError(null)
        switchSession(id)
    }, [activeSessionId, abandonAgent, switchSession, setError])

    const handleDeleteSession = useCallback(async (id: string) => {
        if (id === activeSessionId) {
            await abandonAgent()
            setError(null)
        }
        deleteSession(id)
    }, [activeSessionId, abandonAgent, deleteSession, setError])

    return { handleClearChat, handleNewSession, handleSwitchSession, handleDeleteSession }
}
