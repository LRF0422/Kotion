/**
 * SessionPageBinding — lets page tools steer the active chat conversation's
 * off-screen edit target.
 *
 * The conversation/session state is owned by the AI chat surface (plugin-ai),
 * while the page tools (createPage/openPage/editPage) live in @kn/core and only
 * depend on @kn/common. This tiny global registry bridges the two: when the
 * agent creates a page it can bind it to the conversation instead of navigating
 * the user away, and `openPage` can surface it in the floating editor window.
 *
 * Same registration pattern as page-navigation-bridge / offscreen-editor-bridge.
 */

export interface SessionPageBindingPage {
    pageId: string
    title?: string
    spaceId?: string
}

/** A ready off-screen edit target: the page plus its live editor instance. */
export interface SessionPageEditorTarget extends SessionPageBindingPage {
    /** Tiptap Editor bound to the page's collaborative Y.Doc. */
    editor: any
}

export interface SessionPageBinding {
    /** Make `page` the active conversation's off-screen edit target (sync, no readiness wait). */
    bindPage: (page: SessionPageBindingPage) => void
    /** The page the active conversation edits off-screen, if any. */
    getBoundPage: () => SessionPageBindingPage | null
    /** Open `pageId` in the floating editor window (no route navigation). */
    openPageWindow: (pageId: string) => void
    /**
     * Make `page` the conversation's edit target the safe way: acquire (or
     * reuse) its hidden collaborative editor, rebind the document tools, and
     * resolve once the editor is ready to receive programmatic edits. When the
     * page is the one already open in the visible editor, no off-screen
     * session is created and the visible editor is returned.
     *
     * Optional so hosts that predate page-tree editing keep working; page
     * tools fall back to `bindPage` when it is missing.
     */
    editPage?: (page: SessionPageBindingPage) => Promise<SessionPageEditorTarget>
    /** The editor backing the conversation's current edit target, if ready. */
    getEditor?: () => any | null
    /**
     * The page a given agent edits. `owner` is a delegated sub-run id, or
     * null/undefined for the conversation's default (main agent) target.
     * Used by the client executor to scope the write lease per document.
     */
    getPageFor?: (owner?: string | null) => SessionPageBindingPage | null
    /**
     * The editor a given agent's document tools must act on. Returns null when
     * the owner has no dedicated editor — callers then fall back to the
     * conversation target. A child that never retargeted inherits the parent's.
     */
    getEditorFor?: (owner: string) => any | null
    /**
     * Async variant used when the owner has a target but no editor yet (it was
     * pointed at the page the user had open and the user navigated away):
     * resolves once that agent's own editor is ready. Returning the wrong
     * document silently is worse than waiting.
     */
    getEditorForAsync?: (owner: string) => Promise<any | null>
    /**
     * Point ONE agent at a page without touching the conversation target: the
     * child gets its own off-screen editor lease and the parent's tools keep
     * acting on the parent's document.
     */
    editPageFor?: (owner: string, page: SessionPageBindingPage) => Promise<SessionPageEditorTarget>
    /** Drop a delegated agent's target + editor lease (run terminal/reset). */
    releaseOwner?: (owner: string) => void
    /**
     * The page a given editor instance is the agent's target of. Editor-bound
     * tools only carry their editor, so this is how they resolve the same
     * per-agent target the executor routed them with.
     */
    getPageForEditor?: (editor: any) => SessionPageBindingPage | null
}

let current: SessionPageBinding | null = null

/** Register the chat surface's implementation. */
export const setSessionPageBinding = (binding: SessionPageBinding): void => {
    current = binding
}

/** Unregister the implementation (mainly teardown). */
export const clearSessionPageBinding = (binding?: SessionPageBinding): void => {
    if (!binding || current === binding) {
        current = null
    }
}

/** The active binding, or null when no chat conversation is mounted. */
export const getSessionPageBinding = (): SessionPageBinding | null => current
