/**
 * OffscreenEditorBridge — decouples off-screen page editing from consumers.
 *
 * The engine (hidden collaborative editor sessions bound to `page:${pageId}`
 * rooms with incremental PATCH persistence) lives in @kn/core; plugins such
 * as the AI chat depend on @kn/common only, so they reach the engine through
 * this tiny global registry — same pattern as page-bridge / tool-factory-
 * registry. Core registers an implementation at startup.
 */

/**
 * A live off-screen editing session for one page. The `editor` is a full
 * Tiptap editor bound to the page's collaborative Y.Doc, so every editor
 * tool (blockId edits, structure reads…) works against it unchanged.
 */
export interface OffscreenEditorHandle {
    pageId: string
    title?: string
    /** Tiptap Editor instance (typed loosely — common doesn't depend on @kn/editor). */
    editor: any
    /** Persist pending changes now (incremental PATCH). */
    flush: () => Promise<void>
    /** Return the session; the engine destroys it after an idle timeout. */
    release: () => void
}

export interface OffscreenEditorBridge {
    /**
     * Acquire (or reuse) an off-screen editor session for the page. Resolves
     * once the collaborative doc has synced (or the sync-timeout fallback
     * fired) and the content is ready for programmatic edits.
     */
    acquire: (pageId: string) => Promise<OffscreenEditorHandle>
}

let currentBridge: OffscreenEditorBridge | null = null

/** Register the engine implementation (called by core at startup). */
export const setOffscreenEditorBridge = (bridge: OffscreenEditorBridge): void => {
    currentBridge = bridge
}

/** Unregister the engine (mainly for tests / teardown). */
export const clearOffscreenEditorBridge = (bridge?: OffscreenEditorBridge): void => {
    if (!bridge || currentBridge === bridge) {
        currentBridge = null
    }
}

/** The active bridge, or null when the engine isn't available. */
export const getOffscreenEditorBridge = (): OffscreenEditorBridge | null => currentBridge
