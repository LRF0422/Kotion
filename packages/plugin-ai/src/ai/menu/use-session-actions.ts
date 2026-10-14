/**
 * useSessionActions — the chat surface's session/TAB commands, shared by the
 * side dock and the kernel home page.
 *
 * The tab model changes what these commands mean:
 *  - selecting a conversation ACTIVATES it (opening a tab when needed) and never
 *    touches the runs of other tabs — that is what makes parallel execution
 *    possible at all;
 *  - closing a tab only removes it from the strip (the conversation stays in
 *    history) and stops the run that lived in it, so nothing is left running
 *    invisibly;
 *  - clearing / deleting act on ONE conversation.
 *
 * Everything that needs a conversation's live agent (stop, clear) goes through
 * the controls the mounted tab panel registered — never through a single
 * "active agent", which no longer exists.
 */

import { useCallback } from 'react'
import type { MutableRefObject } from 'react'
import { forgetLoadedSkills } from '@kn/common'

export interface ChatPanelControls {
    /** Stop this conversation's in-flight run; the transcript is kept. */
    cancel: () => Promise<boolean>
    /** Stop the run and drop this conversation's in-memory transcript. */
    clear: () => Promise<void>
}

export interface UseSessionActionsOptions {
    activeSessionId: string
    /** Live per-conversation controls, registered by the mounted tab panels. */
    controlsRef: MutableRefObject<Map<string, ChatPanelControls>>
    /** Drop one conversation's transcript (engine copy included). */
    clearSessionMessages: (id: string) => void
    /** Focus a conversation, opening its tab when it is closed. */
    activateSession: (id: string) => void
    /** Remove one conversation's tab (the conversation itself is kept). */
    closeTab: (id: string) => void
    /** Create a conversation and open its tab. */
    createSession: () => string
    /** Delete a conversation for good. */
    deleteSession: (id: string) => void
}

export interface UseSessionActionsApi {
    handleClearChat: () => Promise<void>
    handleNewSession: () => void
    handleSelectSession: (id: string) => void
    handleCloseTab: (id: string) => void
    handleDeleteSession: (id: string) => void
}

export function useSessionActions(options: UseSessionActionsOptions): UseSessionActionsApi {
    const {
        activeSessionId, controlsRef, clearSessionMessages,
        activateSession, closeTab, createSession, deleteSession,
    } = options

    /** Stop one conversation's run without touching its transcript. */
    const cancelSession = useCallback((id: string) => {
        const controls = controlsRef.current.get(id)
        if (controls) void controls.cancel().catch(() => undefined)
    }, [controlsRef])

    const handleClearChat = useCallback(async () => {
        // The panel owns the transcript state, so it clears first (and cancels
        // its run with the "abandoning" flag set, so the cancelled turn is not
        // snapshotted back into the chat). Storage + title follow.
        await controlsRef.current.get(activeSessionId)?.clear().catch(() => undefined)
        clearSessionMessages(activeSessionId)
        // The cleared transcript is the new context: the tool schemas a
        // `load_skill` result had put in it are gone, so the remembered skills go
        // with it (one `load_skill` call re-establishes both).
        forgetLoadedSkills(activeSessionId)
    }, [activeSessionId, controlsRef, clearSessionMessages])

    const handleNewSession = useCallback(() => {
        // No abandonment: opening a new tab must not disturb the runs already
        // going in the others.
        createSession()
    }, [createSession])

    const handleSelectSession = useCallback((id: string) => {
        activateSession(id)
    }, [activateSession])

    const handleCloseTab = useCallback((id: string) => {
        // Stop the run BEFORE unmounting: the panel's own teardown only drops
        // the local stream, which would leave the engine working with no UI.
        cancelSession(id)
        closeTab(id)
    }, [cancelSession, closeTab])

    const handleDeleteSession = useCallback((id: string) => {
        cancelSession(id)
        deleteSession(id)
        forgetLoadedSkills(id)
    }, [cancelSession, deleteSession])

    return {
        handleClearChat,
        handleNewSession,
        handleSelectSession,
        handleCloseTab,
        handleDeleteSession,
    }
}
