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

import type { AgentDocumentMergeReport } from './agent-document-bridge'

export interface SessionPageBindingPage {
    pageId: string
    title?: string
    spaceId?: string
    /**
     * Declared page type id (`acme:canvas`), when the caller knows it.
     *
     * The surface uses it to refuse a target that has no document body (a
     * full-page plugin component) with a message that names the real reason,
     * instead of waiting for an editor that can never be acquired.
     */
    pageType?: string
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
    /**
     * A host-rendered editor (the side pane / the floating window) claims a
     * page: the conversation's document tools must act on THIS editor, and the
     * page's hidden off-screen session is dropped so exactly ONE client writes.
     * Optional — hosts without such an editor never call it.
     */
    claimEditor?: (pageId: string, editor: any) => void
    /** Release a claim made by {@link claimEditor}. */
    releaseEditor?: (pageId: string, editor: any) => void
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
    /**
     * The editor backing the conversation's current edit target, if ready.
     *
     * This is the EXACT target editor, not "whatever the user is looking at":
     * when the conversation targets page A and the visible editor shows page B,
     * this must return null (or A's lease) — never B's editor. Consumers that
     * need a last-resort editor for a non-document tool may use the surface's
     * own visible editor; document tools must not.
     */
    getEditor?: () => any | null
    /**
     * The page a given agent edits. `owner` is a delegated sub-run id, or
     * null/undefined for the conversation's default (main agent) target.
     * Used by the client executor to scope the write lease per document.
     *
     * Implementations return null when the conversation has no explicit page
     * target (the visible page is then the implicit target).
     */
    getPageFor?: (owner?: string | null) => SessionPageBindingPage | null
    /**
     * The editor a given agent's document tools must act on. Returns null when
     * the owner has no ready editor — callers then resolve it through
     * {@link getEditorForAsync}. A child that never retargeted inherits the
     * conversation target.
     */
    getEditorFor?: (owner: string) => any | null
    /**
     * Async fallback that resolves the EXACT editor for a target page:
     *
     * - `owner` = a delegated sub-run id, or null/undefined for the
     *   conversation's own target.
     * - `mutating` tells the host a write is coming, which is the signal to
     *   fork a private document for a delegated agent when it does not have one
     *   yet (read-only calls can use the shared page).
     *
     * `null` means "this binding has no page target at all" (the surface rides
     * the visible editor). A target page whose editor cannot be materialized
     * must REJECT with an actionable error — resolving to the parent's or the
     * visible page's editor silently writes the wrong document, which is the
     * failure this method exists to stop.
     */
    getEditorForAsync?: (
        owner: string | null | undefined,
        options?: { mutating?: boolean },
    ) => Promise<any | null>
    /**
     * A live editor for an arbitrary page WITHOUT changing the conversation's
     * edit target.
     *
     * Cross-page tool actions (inserting a link into the parent page, editing a
     * page named by an argument) need an editor, not a target switch. Using
     * `editPage` for them silently moved the agent's target to whatever page the
     * tool happened to touch — the "lost target" class of bug. Returns null when
     * no editor can be obtained; the caller reports that.
     */
    getEditorForPage?: (
        page: SessionPageBindingPage,
        options?: { mutating?: boolean },
    ) => Promise<any | null>
    /**
     * Point ONE agent at a page without touching the conversation target: the
     * child gets its own off-screen editor lease and the parent's tools keep
     * acting on the parent's document.
     */
    editPageFor?: (owner: string, page: SessionPageBindingPage) => Promise<SessionPageEditorTarget>
    /**
     * Drop a delegated agent's target + editor lease (run terminal/reset).
     * `commit: false` discards the private document instead of merging it —
     * used when the child did not finish normally (timeout/cancel), so half-done
     * edits never land in the page. Returns the merge report when one was made.
     */
    releaseOwner?: (
        owner: string,
        options?: { commit?: boolean }
    ) => Promise<AgentDocumentMergeReport | null> | void
    /**
     * True while the owner edits a private forked document: it never touches the
     * shared page, so the shared write lease must not serialize it.
     */
    isOwnerIsolated?: (owner: string) => boolean
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
