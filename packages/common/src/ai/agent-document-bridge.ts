/**
 * AgentDocumentBridge — per-agent private documents (fork → edit → merge).
 *
 * True parallelism for delegated agents needs more than concurrent dispatch: two
 * agents must not write the same live document. The engine behind this bridge
 * (in `@kn/core`, where the editor lives) forks the target page's content into a
 * private, non-collaborative editor per agent, and merges it back when the agent
 * finishes. Plugins only see this registry, mirroring `offscreen-editor-bridge`
 * and `session-page-binding`.
 */

import type { DocJson, MergeConflict } from './agent/document-merge'

export interface AgentDocumentMergeReport {
    /** Blocks written into the live document. */
    applied: number
    /** Blocks left alone because both sides changed them. */
    conflicts: number
    /** The agent reordered existing blocks; that part was skipped. */
    reorderDetected: boolean
    /** One-line summary for the UI. */
    summary: string
    details?: MergeConflict[]
}

export interface AgentDocumentHandle {
    owner: string
    pageId: string
    /** The agent's private, provider-less editor instance. */
    editor: any
    /** The page content the private document was forked from. */
    baseline: DocJson
}

export interface AgentDocumentBridge {
    /**
     * Fork `sourceEditor`'s current content into a private document for `owner`.
     * `sourceEditor` is only read (its JSON), never mutated.
     */
    fork: (
        owner: string,
        pageId: string,
        sourceEditor: any,
        title?: string
    ) => Promise<AgentDocumentHandle>
    /** The private document currently held for `owner`, if any. */
    get: (owner: string) => AgentDocumentHandle | null
    /** Merge `owner`'s private document into `liveEditor`. */
    commit: (owner: string, liveEditor: any) => Promise<AgentDocumentMergeReport | null>
    /** Destroy `owner`'s private document (its editor is unmounted). */
    release: (owner: string) => void
}

let current: AgentDocumentBridge | null = null

/** Register the engine implementation (called by core at startup). */
export const setAgentDocumentBridge = (bridge: AgentDocumentBridge): void => {
    current = bridge
}

/** Unregister the implementation (mainly teardown/tests). */
export const clearAgentDocumentBridge = (bridge?: AgentDocumentBridge): void => {
    if (!bridge || current === bridge) current = null
}

/** The active bridge, or null when the engine is not mounted. */
export const getAgentDocumentBridge = (): AgentDocumentBridge | null => current
