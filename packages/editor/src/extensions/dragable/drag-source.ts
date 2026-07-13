import { NodeSelection } from '@tiptap/pm/state'
import { Slice, Fragment } from '@tiptap/pm/model'
import type { DragSharedState } from './dragable'

export interface DragSourceHandlers {
    /** Fired when the grip is pressed — establishes selection + captures the dragged node. */
    onGripMouseDown: () => void
    /** Fired when the grip is released without a drop happening (drag cancelled). */
    onGripMouseUp: () => void
    /** Fired at native `dragstart` on the grip — populates the dataTransfer + view.dragging. */
    onGripDragStart: (event: DragEvent) => void
}

/**
 * Grip event handlers wired into the React `DragHandle` component. Encapsulates
 * the write-side of the drag lifecycle: which node is being dragged, whether
 * a NodeSelection was created, and the serialised slice on the event's
 * dataTransfer.
 *
 * Reads and writes on the shared state must line up with the reset points in
 * the orchestrator (drop / dragend). Keep any semantic changes in lock-step
 * with `dragable.ts`.
 */
export function createDragSource(params: {
    shared: DragSharedState
    /** Called from mouseUp so the column-drop indicator doesn't linger. */
    hideDropIndicator: () => void
}): DragSourceHandlers {
    const { shared, hideDropIndicator } = params

    return {
        onGripMouseDown: () => {
            const node = shared.activeNode
            const view = shared.view
            if (!node || !view) return

            const nodePos = node.$pos.pos - node.offset
            shared.draggedNodeInfo = { node: node.node, pos: nodePos }

            if (NodeSelection.isSelectable(node.node)) {
                const nodeSelection = NodeSelection.create(view.state.doc, nodePos)
                view.dispatch(view.state.tr.setSelection(nodeSelection))
                view.focus()
                shared.activeSelection = nodeSelection
                return
            }

            // For non-selectable nodes (paragraphs, headings, etc.) we still
            // keep `draggedNodeInfo` so the column-drop path works — the
            // slice is built from the node directly at dragstart.
        },

        onGripMouseUp: () => {
            if (!shared.dragging) return
            shared.dragging = false
            shared.activeSelection = null
            shared.activeNode = null
            shared.draggedNodeInfo = null
            hideDropIndicator()
        },

        onGripDragStart: (event) => {
            shared.dragging = true
            const view = shared.view
            const info = shared.draggedNodeInfo
            if (!event.dataTransfer || !info || !view) return

            // Non-selectable nodes (paragraphs, headings) can't produce a
            // NodeSelection so we synthesise a single-node slice manually.
            const slice = shared.activeSelection && NodeSelection.isSelectable(info.node)
                ? shared.activeSelection.content()
                : new Slice(Fragment.from(info.node), 0, 0)

            event.dataTransfer.effectAllowed = 'copyMove'
            const { dom, text } = view.serializeForClipboard(slice)
            event.dataTransfer.clearData()
            event.dataTransfer.setData('text/html', dom.innerHTML)
            event.dataTransfer.setData('text/plain', text)
            if (shared.activeNode?.el) {
                event.dataTransfer.setDragImage(shared.activeNode.el, 0, 0)
            }

            view.dragging = { slice, move: true }
        },
    }
}
