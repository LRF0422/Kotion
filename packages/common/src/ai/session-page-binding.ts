/**
 * SessionPageBinding — lets page tools steer the active chat conversation's
 * off-screen edit target.
 *
 * The conversation/session state is owned by the AI chat surface (plugin-ai),
 * while the page tools (createPage/openPage) live in @kn/core and only depend
 * on @kn/common. This tiny global registry bridges the two: when the agent
 * creates a page it can bind it to the conversation instead of navigating the
 * user away, and `openPage` can surface it in the floating editor window.
 *
 * Same registration pattern as page-navigation-bridge / offscreen-editor-bridge.
 */

export interface SessionPageBindingPage {
    pageId: string
    title?: string
    spaceId?: string
}

export interface SessionPageBinding {
    /** Make `page` the active conversation's off-screen edit target. */
    bindPage: (page: SessionPageBindingPage) => void
    /** The page the active conversation edits off-screen, if any. */
    getBoundPage: () => SessionPageBindingPage | null
    /** Open `pageId` in the floating editor window (no route navigation). */
    openPageWindow: (pageId: string) => void
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
