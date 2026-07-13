import type { EditorView } from '@tiptap/pm/view'
import { ActiveNode, selectAncestorNodeByDom } from '../../utilities/select-node-by-dom'

/**
 * Types that own a DOM subtree but never a drag handle. Filtering them out
 * here (instead of at each call site) keeps the block-resolution logic in
 * one place — mousemove and dragover previously duplicated this check.
 */
const NON_BLOCK_TYPES = new Set(['doc', 'title', 'tableOfContents'])

/**
 * Custom nodes render inside a `.react-renderer` wrapper. Callers that start
 * from a leaf DOM node (a mousemove/dragover event target) need to be lifted
 * to that wrapper so `selectAncestorNodeByDom` can resolve the ProseMirror
 * node correctly. `node-columns` is deliberately not lifted — collapsing the
 * whole columns block into a single unit would break drop-into-column.
 *
 * Returns the original `dom` when there is no react-renderer ancestor.
 */
export function liftToReactRenderer(dom: HTMLElement | null): HTMLElement | null {
    if (!dom) return null
    let cur: HTMLElement | null = dom
    while (cur && !cur.classList?.contains('react-renderer')) {
        cur = cur.parentElement
    }
    if (cur && !cur.classList?.contains('node-columns')) return cur
    return dom
}

/**
 * Resolve a DOM element under the editor to the enclosing top-level block
 * that can own a drag handle. Returns `null` when the DOM lives under
 * `doc` / `title` / `tableOfContents` (which shouldn't be draggable) or
 * when no top-level ancestor can be resolved at all.
 */
export function resolveDraggableBlock(dom: HTMLElement, view: EditorView): ActiveNode | null {
    const lifted = liftToReactRenderer(dom) ?? dom
    const result = selectAncestorNodeByDom(lifted, view)
    if (!result) return null
    if (NON_BLOCK_TYPES.has(result.node.type.name)) return null
    return result
}
