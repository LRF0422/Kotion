/**
 * Agent pane + Working Target — the kernel's single source of truth for "which
 * artifact is this conversation working on".
 *
 * SPEC (see docs/agent-kernel-spec.md):
 *  - A conversation has at most ONE working target (`target`), which is an
 *    {@link AgentArtifact} or null.
 *  - Setting the target and showing the pane are related but distinct: closing
 *    the pane HIDES it, it does not drop the target — the agent keeps working on
 *    the same object.
 *  - Every entry point (a card's "open beside", the artifacts shelf, an agent
 *    tool through `openAgentArtifact`) goes through `openArtifact`, so the UI
 *    highlight and the model's view can never disagree.
 *  - The surface injects the target into each turn's `contextNote` (never the
 *    system prefix), so the model always knows what it is operating on and a
 *    switch cannot invalidate the prompt cache.
 *
 * The pane is a SIDE PEEK, not an overlay: it is an inline column the surface
 * lays out next to its content. The chrome is registered once by @kn/core
 * (which owns @kn/ui), mirroring the PageEditWindow bridge.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ComponentType } from 'react'
import { getPageNavigationBridge } from '../page-navigation-bridge'
import type { AgentArtifact } from '../plugin-agent'

export interface AgentPaneApi {
    /** The conversation's working target, or null (nothing focused). */
    target: AgentArtifact | null
    /** Whether the side pane is currently showing the target. */
    open: boolean
    /** Set the target AND show it in the side pane (the canonical entry). */
    openArtifact: (artifact: AgentArtifact) => void
    /** Leave the conversation to edit the artifact's page (clears the target). */
    openInPage: (artifact: AgentArtifact) => void
    /** Hide the pane. The target is kept — the agent is still on it. */
    close: () => void
    /** Forget the target too (session switch / explicit reset). */
    clearTarget: () => void
}

const NOOP_PANE_API: AgentPaneApi = {
    target: null,
    open: false,
    openArtifact: () => { /* no provider in this subtree */ },
    openInPage: () => { /* no navigation bridge available */ },
    close: () => { /* nothing open */ },
    clearTarget: () => { /* nothing to clear */ },
}

const AgentPaneContext = createContext<AgentPaneApi | null>(null)

export function useAgentPane(): AgentPaneApi {
    return useContext(AgentPaneContext) ?? NOOP_PANE_API
}

/**
 * Props for the pane chrome. The surface owns the target snapshot so an exit
 * animation can keep rendering the content while the column collapses.
 */
export interface AgentPaneHostProps {
    artifact: AgentArtifact
    onClose: () => void
    onOpenInPage: (artifact: AgentArtifact) => void
}

/** The chrome (header/close/frame) is provided by @kn/core. */
let hostImpl: ComponentType<AgentPaneHostProps> | null = null

/** Called once at application startup by @kn/core; not for plugins. */
export function setAgentPaneHostImpl(impl: ComponentType<AgentPaneHostProps> | null): void {
    hostImpl = impl
}

/**
 * Mount this inside a surface's split layout, next to the conversation. Renders
 * nothing when the app shell registered no host.
 */
export const AgentPaneHost: React.FC<AgentPaneHostProps> = (props) => {
    const Impl = hostImpl
    return Impl ? <Impl {...props} /> : null
}

/**
 * Imperative entry for non-React callers — notably agent tools, which execute
 * outside the React tree. Returns false when no surface mounted a provider, so
 * a tool can report a clear error instead of silently doing nothing.
 */
let paneOpener: ((artifact: AgentArtifact) => void) | null = null

export function openAgentArtifact(artifact: AgentArtifact): boolean {
    if (!paneOpener) return false
    paneOpener(artifact)
    return true
}

export const AgentPaneProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [target, setTarget] = useState<AgentArtifact | null>(null)
    const [open, setOpen] = useState(false)

    const openArtifact = useCallback((next: AgentArtifact) => {
        setTarget(next)
        setOpen(true)
    }, [])
    const close = useCallback(() => setOpen(false), [])
    const clearTarget = useCallback(() => {
        setTarget(null)
        setOpen(false)
    }, [])
    const openInPage = useCallback((next: AgentArtifact) => {
        if (next.kind !== 'page') return
        const bridge = getPageNavigationBridge()
        if (!bridge) return
        setTarget(null)
        setOpen(false)
        void bridge.openPage(next.id, next.spaceId)
    }, [])

    // Expose the opener to non-React callers (agent tools).
    useEffect(() => {
        paneOpener = openArtifact
        return () => { paneOpener = null }
    }, [openArtifact])

    const api = useMemo<AgentPaneApi>(
        () => ({ target, open, openArtifact, openInPage, close, clearTarget }),
        [target, open, openArtifact, openInPage, close, clearTarget],
    )

    return <AgentPaneContext.Provider value={api}>{children}</AgentPaneContext.Provider>
}
