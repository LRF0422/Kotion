import type { EditorView } from '@tiptap/pm/view'
import type { Node } from '@tiptap/pm/model'
import type { DragSharedState } from './dragable'
import { createColumnsFromNodes } from '../columns/utilities'
import { liftToReactRenderer, resolveDraggableBlock } from './dom-utils'

/** Delay before the indicator materialises — matches previous inlined value. */
const SHOW_DELAY_MS = 120

/**
 * Nodes that can't participate as bare column content on either side:
 *   - `listItem` / `taskItem`: not in the `block` group, so wrapping them in
 *     a `column` produces an invalid document.
 *   - `columns` / `column`: nesting columns confuses users and breaks the
 *     column commands.
 */
const NO_COLUMN_TYPES = new Set(['listItem', 'taskItem', 'columns', 'column'])

/** Threshold from the column border where a drop switches from
 *  "into the column" to "split next to the columns block". */
const COLUMN_BORDER_PX = 20

interface DropTarget {
    node: Node
    pos: number
    el: HTMLElement
    side: 'left' | 'right'
}

export interface ColumnDropController {
    /** Mount lifecycle hook — currently a no-op (indicator is created lazily). */
    attach: (view: EditorView) => void
    /** Removes the indicator DOM and clears any pending timer. */
    detach: () => void
    /** Hide the indicator (used by dragleave / dragend). */
    hide: () => void
    /** Called from `dragover` — analyses the pointer position and schedules the indicator. */
    onDragOver: (view: EditorView, event: DragEvent) => void
    /**
     * Called from `drop`. Consumes the drop event as a column split when a
     * valid target was highlighted; otherwise returns false so the caller
     * falls back to normal drag-drop.
     */
    tryConsumeDrop: (view: EditorView, event: DragEvent) => boolean
}

export function createColumnDropController(shared: DragSharedState): ColumnDropController {
    let indicator: HTMLElement | null = null
    let target: DropTarget | null = null
    let timer: any = null

    const ensureIndicator = (view: EditorView): HTMLElement | null => {
        if (indicator) return indicator
        const parent = view.dom.parentElement
        if (!parent) return null
        indicator = document.createElement('div')
        indicator.className = 'column-drop-indicator'
        parent.appendChild(indicator)
        return indicator
    }

    const showIndicator = (view: EditorView, t: DropTarget) => {
        const el = ensureIndicator(view)
        const root = view.dom.parentElement
        if (!el || !root) return

        // A thin vertical bar pinned to the target block's left or right edge.
        // Width / glow live in CSS; the top / left / height CSS transitions in
        // slide smoothly when the side flips between left and right.
        const targetRect = t.el.getBoundingClientRect()
        const rootRect = root.getBoundingClientRect()
        const top = targetRect.top - rootRect.top + root.scrollTop
        const left = t.side === 'left'
            ? targetRect.left - rootRect.left - 3
            : targetRect.right - rootRect.left - 1

        el.style.top = `${top}px`
        el.style.height = `${targetRect.height}px`
        el.style.left = `${left}px`
        el.className = `column-drop-indicator ${t.side}`
        el.style.display = 'block'
    }

    const hide = () => {
        if (indicator) indicator.style.display = 'none'
        target = null
        if (timer != null) {
            clearTimeout(timer)
            timer = null
        }
    }

    const detectSide = (event: DragEvent, el: HTMLElement): 'left' | 'right' => {
        const rect = el.getBoundingClientRect()
        return event.clientX < rect.left + rect.width / 2 ? 'left' : 'right'
    }

    return {
        attach: () => { /* indicator is created on first show */ },

        detach: () => {
            if (timer != null) {
                clearTimeout(timer)
                timer = null
            }
            indicator?.remove()
            indicator = null
            target = null
        },

        hide,

        onDragOver: (view, event) => {
            if (!view.editable || !shared.dragging || !shared.draggedNodeInfo) return

            const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })
            if (!pos || pos.pos === 0) { hide(); return }

            // Skip text nodes when resolving the target DOM.
            let targetDom: HTMLElement | null = event.target as HTMLElement
            while (targetDom && targetDom.nodeType === 3) targetDom = targetDom.parentElement
            if (!targetDom || targetDom === view.dom) { hide(); return }

            // Pointer over the interior of a column → let normal drop happen.
            // Only when we're within `COLUMN_BORDER_PX` of the column's edge do
            // we consider offering a column-split.
            const columnContent = targetDom.closest('.node-column') as HTMLElement | null
            if (columnContent) {
                const columnRect = columnContent.getBoundingClientRect()
                const isNearBorder =
                    event.clientX < columnRect.left + COLUMN_BORDER_PX ||
                    event.clientX > columnRect.right - COLUMN_BORDER_PX
                if (!isNearBorder) { hide(); return }
            }

            // Resolve to the enclosing top-level block using the same rules
            // as the hover handle (react-renderer lift + top-level walk).
            // A bespoke tag-whitelist would miss many block types (code /
            // quote / nested wrappers).
            const blockDom = liftToReactRenderer(targetDom) ?? targetDom
            const result = resolveDraggableBlock(blockDom, view)
            if (!result) { hide(); return }

            const draggedType = shared.draggedNodeInfo.node.type.name
            if (NO_COLUMN_TYPES.has(result.node.type.name) || NO_COLUMN_TYPES.has(draggedType)) {
                hide(); return
            }

            const draggedPos = shared.draggedNodeInfo.pos
            const targetPos = result.$pos.pos - result.offset

            // Don't drop onto self, parent, or child of the dragged node.
            if (targetPos === draggedPos) { hide(); return }
            const draggedNode = shared.draggedNodeInfo.node
            const draggedEnd = draggedPos + draggedNode.nodeSize
            if (targetPos >= draggedPos && targetPos < draggedEnd) { hide(); return }
            const targetEnd = targetPos + result.node.nodeSize
            if (draggedPos >= targetPos && draggedPos < targetEnd) { hide(); return }

            const side = detectSide(event, result.el)
            if (!target || target.pos !== targetPos || target.side !== side) {
                if (timer != null) clearTimeout(timer)
                target = { node: result.node, pos: targetPos, el: result.el, side }
                const captured = target
                timer = setTimeout(() => {
                    // Only show if the target is still the one we scheduled.
                    if (target === captured) showIndicator(view, captured)
                }, SHOW_DELAY_MS)
            }
        },

        tryConsumeDrop: (view, event) => {
            // Always clear the pending timer regardless of outcome.
            if (timer != null) {
                clearTimeout(timer)
                timer = null
            }

            if (!target || !shared.draggedNodeInfo) {
                hide()
                return false
            }

            const draggedNode = shared.draggedNodeInfo.node
            const columnsNode = createColumnsFromNodes(
                view.state.schema,
                target.side === 'left' ? draggedNode.toJSON() : target.node.toJSON(),
                target.side === 'left' ? target.node.toJSON() : draggedNode.toJSON()
            )

            if (!columnsNode) {
                // Couldn't build the layout — clear the indicator and let the
                // caller fall back to a normal drop.
                hide()
                return false
            }

            event.preventDefault()
            event.stopPropagation()

            try {
                const tr = view.state.tr
                const draggedPos = shared.draggedNodeInfo.pos
                const targetPos = target.pos

                if (draggedPos < targetPos) {
                    // Delete the dragged node first, then map + replace the target.
                    tr.delete(draggedPos, draggedPos + draggedNode.nodeSize)
                    const adjustedTargetPos = tr.mapping.map(targetPos)
                    const adjustedTargetNode = tr.doc.nodeAt(adjustedTargetPos)
                    if (adjustedTargetNode) {
                        tr.replaceWith(
                            adjustedTargetPos,
                            adjustedTargetPos + adjustedTargetNode.nodeSize,
                            columnsNode
                        )
                    }
                } else {
                    // Replace the target first, then map + delete the dragged node.
                    tr.replaceWith(targetPos, targetPos + target.node.nodeSize, columnsNode)
                    const adjustedDraggedPos = tr.mapping.map(draggedPos)
                    tr.delete(adjustedDraggedPos, adjustedDraggedPos + draggedNode.nodeSize)
                }

                view.dispatch(tr)
            } catch (err) {
                console.error('Error creating columns:', err)
            }

            hide()
            return true
        },
    }
}
