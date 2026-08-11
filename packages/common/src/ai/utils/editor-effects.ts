import type { Editor } from "@tiptap/core"

/** Transaction meta key marking edits produced by AI tools. Consumers
 *  (auto-save, collab, UI badges) can distinguish AI edits from user edits. */
export const AI_TRANSACTION_META = 'aiOrigin'

/** Minimum interval between agent-driven scrolls, so multi-step edits don't
 *  make the viewport jump on every single tool call. */
const SCROLL_THROTTLE_MS = 800

const lastScrollAt = new WeakMap<Editor, number>()

/**
 * Scroll the editor viewport to show the specified position.
 * Sets the text selection at that position so the cursor acts as a visual hint.
 *
 * Throttled per editor: rapid successive tool calls only scroll once per
 * {@link SCROLL_THROTTLE_MS} window (pass `force` to bypass, e.g. for the
 * final operation of a batch).
 */
export const scrollToPosition = (editor: Editor, pos: number, force = false) => {
    const now = Date.now()
    const last = lastScrollAt.get(editor) ?? 0
    if (!force && now - last < SCROLL_THROTTLE_MS) return
    lastScrollAt.set(editor, now)

    const maxPos = editor.state.doc.content.size
    const safePos = Math.max(0, Math.min(pos, maxPos))
    editor.chain().setTextSelection(safePos).scrollIntoView().run()
}

/**
 * Locate a block by its stable id inside an arbitrary doc (state doc or a
 * transaction's mapped doc). Checks `attrs.id` with `attrs.blockId` fallback,
 * matching the editor's UniqueID conventions.
 */
export const findBlockPosById = (
    doc: any,
    blockId: string
): { node: any; pos: number } | null => {
    let found: { node: any; pos: number } | null = null
    doc.descendants((node: any, pos: number) => {
        if (found) return false
        const id = (node.attrs?.id ?? node.attrs?.blockId) as string | undefined
        if (id === blockId) {
            found = { node, pos }
            return false
        }
        return true
    })
    return found
}

/** Briefly flash a block's DOM node so the user's eye lands on it after a jump. */
const flashBlockDom = (el: HTMLElement) => {
    // Web Animations API — no stylesheet or doc mutation needed.
    el.animate?.(
        [
            { backgroundColor: 'rgba(99, 102, 241, 0.22)', borderRadius: '4px' },
            { backgroundColor: 'rgba(99, 102, 241, 0)', borderRadius: '4px' },
        ],
        { duration: 1600, easing: 'ease-out' }
    )
}

/**
 * Reveal a block by its stable id: scroll it into view (bypassing the agent
 * scroll throttle — this is a deliberate user navigation), place the cursor
 * inside it and flash its DOM node. Returns false when the block no longer
 * exists (deleted/moved away) so callers can surface a "not found" state.
 */
export const revealBlockById = (editor: Editor, blockId: string): boolean => {
    const found = findBlockPosById(editor.state.doc, blockId)
    if (!found) return false

    scrollToPosition(editor, found.pos, true)

    const dom = editor.view.nodeDOM(found.pos)
    if (dom instanceof HTMLElement) {
        flashBlockDom(dom)
    }
    return true
}

/**
 * Run a (possibly async) mutation with every dispatched transaction tagged
 * with {@link AI_TRANSACTION_META}. Used by the tool layer so ALL AI edits are
 * identifiable downstream without every tool having to set the meta itself.
 */
export const runWithAITransactionMeta = async <T>(
    editor: Editor | null | undefined,
    fn: () => Promise<T> | T
): Promise<T> => {
    const view: any = editor && (editor as any).view
    if (!view) return fn()

    const originalDispatch = view.dispatch.bind(view)
    view.dispatch = (tr: any) => {
        tr.setMeta(AI_TRANSACTION_META, true)
        return originalDispatch(tr)
    }
    try {
        return await fn()
    } finally {
        view.dispatch = originalDispatch
    }
}
