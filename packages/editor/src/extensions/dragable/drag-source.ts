import { NodeSelection } from '@tiptap/pm/state'
import { Slice, Fragment } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'
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

            // For nodes declaring `selectable: false` we still keep
            // `draggedNodeInfo` so the column-drop path works — the slice is
            // built from the node directly at dragstart.
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

            // Re-derive the NodeSelection from `draggedNodeInfo` instead of
            // trusting `shared.activeSelection`: the live selection can have
            // been replaced between grip mousedown and dragstart (deferred
            // post-drop cleanup, a remote collaboration transaction, a menu
            // stealing focus...), and ProseMirror needs a selection that
            // really points at the dragged node — see below.
            const nodeSelection =
                NodeSelection.isSelectable(info.node) && view.state.doc.nodeAt(info.pos) === info.node
                    ? NodeSelection.create(view.state.doc, info.pos)
                    : null

            // Nodes that can't produce a NodeSelection (`selectable: false`)
            // still need a slice, so synthesise a single-node one manually.
            const slice = nodeSelection
                ? nodeSelection.content()
                : new Slice(Fragment.from(info.node), 0, 0)

            event.dataTransfer.effectAllowed = 'copyMove'
            const { dom, text } = view.serializeForClipboard(slice)
            event.dataTransfer.clearData()
            event.dataTransfer.setData('text/html', dom.innerHTML)
            event.dataTransfer.setData('text/plain', text)
            if (shared.activeNode?.el) {
                event.dataTransfer.setDragImage(shared.activeNode.el, 0, 0)
            }

            // `node` is not in prosemirror-view's *public* `dragging` type but
            // it is what its drop handler keys the source removal on:
            //
            //     if (move) { let {node} = dragging
            //                 if (node) node.replace(tr)   // exact source
            //                 else tr.deleteSelection() }   // whatever is selected
            //
            // Without it, a move-drop deletes the *current* selection — so if
            // the selection no longer covers the dragged block when the drop
            // lands, the source survives and the inserted copy becomes a second
            // block carrying the same blockId (invisible to the incremental
            // save, and split into a genuinely independent block by UniqueID as
            // soon as one copy is deleted). Passing `node` also lets the view
            // remap the source across concurrent doc changes in
            // `updateDraggedNode`, dropping to `undefined` when it can no longer
            // be located rather than deleting the wrong node.
            view.dragging = { slice, move: true, node: nodeSelection ?? undefined } as EditorView['dragging']
        },
    }
}
