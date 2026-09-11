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
