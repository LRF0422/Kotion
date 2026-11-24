import { Editor } from "@tiptap/core"
import {
    getAgentEditor,
    registerAgentEditor,
} from "../ai/agent-editor-registry"

/**
 * The editor of the currently active page tab.
 *
 * Views rendered outside the editor subtree (dock panels, side docks) cannot
 * reach the editor through React context, and the editor is owned by whichever
 * tab is active in the keep-alive pool. So the active tab publishes its editor
 * here and interested views subscribe.
 */

export interface ActiveEditorState {
    editor?: Editor
    pageId?: string
    spaceId?: string
}

let state: ActiveEditorState = {}
const listeners = new Set<(state: ActiveEditorState) => void>()

const notify = () => {
    listeners.forEach(fn => fn(state))
}

/**
 * The visible route editor is also a page claim for the agent: it is the page's
 * single writer while it is on screen. Bridging here (rather than in every
 * PageEditor caller) means the "current editor" that dock panels read and the
 * "current page's editor" that document tools resolve can never disagree.
 */
let visibleClaim: { pageId: string; editor: any; release: () => void } | null = null

const publishVisibleClaim = (editor?: Editor, pageId?: string, spaceId?: string): void => {
    if (visibleClaim && visibleClaim.editor === editor && visibleClaim.pageId === pageId) {
        if (!editor || getAgentEditor(pageId)?.editor === editor) return
    }
    visibleClaim?.release()
    visibleClaim = null
    if (!editor || !pageId) return
    visibleClaim = {
        pageId,
        editor,
        release: registerAgentEditor({
            pageId,
            editor,
            role: 'visible',
            spaceId,
        }),
    }
}

/**
 * Publish the active tab's editor. Called by the page editor once its content
 * is ready and whenever it becomes the active tab.
 */
export const setActiveEditor = (editor: Editor | undefined, meta?: { pageId?: string; spaceId?: string }) => {
    if (state.editor === editor && state.pageId === meta?.pageId && state.spaceId === meta?.spaceId) {
        publishVisibleClaim(editor, meta?.pageId, meta?.spaceId)
        return
    }
    state = { editor, pageId: meta?.pageId, spaceId: meta?.spaceId }
    publishVisibleClaim(editor, meta?.pageId, meta?.spaceId)
    notify()
}

/**
 * Clear the published editor, but only if it is still the one this caller owns —
 * a tab unmounting after another tab already took over must not wipe the new
 * editor (unmount cleanup order is not guaranteed).
 *
 * `editor` narrows the check to the exact instance. That matters when the same
 * page is open twice (the workspace tab and a standalone `/page/...` view): the
 * `pageId` alone cannot tell the two publications apart, so the outgoing view's
 * cleanup would clear the incoming one's editor.
 */
export const clearActiveEditor = (pageId?: string, editor?: Editor) => {
    if (pageId && state.pageId !== pageId) return
    if (editor && state.editor !== editor) return
    if (!state.editor && !state.pageId) return
    state = {}
    publishVisibleClaim(undefined)
    notify()
}

export const getActiveEditor = (): ActiveEditorState => state

export const subscribeActiveEditor = (listener: (state: ActiveEditorState) => void) => {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
}
