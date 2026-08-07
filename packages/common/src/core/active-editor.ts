import { Editor } from "@tiptap/core"

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
 * Publish the active tab's editor. Called by the page editor once its content
 * is ready and whenever it becomes the active tab.
 */
export const setActiveEditor = (editor: Editor | undefined, meta?: { pageId?: string; spaceId?: string }) => {
    if (state.editor === editor && state.pageId === meta?.pageId) return
    state = { editor, pageId: meta?.pageId, spaceId: meta?.spaceId }
    notify()
}

/**
 * Clear the published editor, but only if it is still the one `pageId` owns —
 * a tab unmounting after another tab already took over must not wipe the new
 * editor (unmount cleanup order is not guaranteed).
 */
export const clearActiveEditor = (pageId?: string) => {
    if (pageId && state.pageId !== pageId) return
    if (!state.editor && !state.pageId) return
    state = {}
    notify()
}

export const getActiveEditor = (): ActiveEditorState => state

export const subscribeActiveEditor = (listener: (state: ActiveEditorState) => void) => {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
}
