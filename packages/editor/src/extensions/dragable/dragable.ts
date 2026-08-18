import { Extension } from '@tiptap/core'
import {
    NodeSelection,
    Plugin as PMPlugin,
    PluginKey as PMPluginKey,
    Selection,
    TextSelection,
} from '@tiptap/pm/state'
import { Decoration, DecorationSet, EditorView } from '@tiptap/pm/view'
import { Node } from '@tiptap/pm/model'
import { findParentNodeClosestToPos } from 'prosemirror-utils'

import { ActiveNode } from '../../utilities/select-node-by-dom'
import { safePos } from '../../utilities/position'
import { removePossibleTable } from '../../utilities/table'
import { BlockMenuItem } from './block-menu'
import { createHoverController } from './hover-controller'
import { createDragSource } from './drag-source'
import { createColumnDropController } from './column-drop'

const DragablePluginKey = new PMPluginKey('dragable')
const SelectionDecorationPluginKey = new PMPluginKey('AncestorDragablePluginFocusKey')

/**
 * Delay before wiping lingering selection state after a non-column drop.
 * ProseMirror's own drop transaction commits synchronously; scheduling the
 * cleanup at the tail of the current task lets that commit land first and
 * avoids fighting its own selection update.
 */
const DROP_CLEAR_DELAY_MS = 100

const SELECTED_NODE_CLASSES = [
    'ProseMirror-selectednode',
    'ProseMirror-selectedblocknode-dragable',
    'ProseMirror-selectedblocknode-normal',
] as const

export interface DragableStorage {
    blockMenuItems: BlockMenuItem[]
}

declare module '@tiptap/core' {
    interface Storage {
        dragable: DragableStorage
    }
}

/**
 * Mutable state shared between the four `dragable` sub-controllers. This
 * intentionally replaces what was a bag of top-level `let`s in the old
 * monolithic implementation — bundling them in one object makes it obvious
 * which pieces are read/written across module boundaries.
 *
 * Ownership summary:
 *   - `view`           — orchestrator sets it in `view()` update.
 *   - `activeNode`     — hover-controller writes; drag-source and orchestrator
 *                         reset on drop / dragend / mouseup.
 *   - `activeSelection`— drag-source writes on grip mousedown; orchestrator
 *                         resets after drop / dragend.
 *   - `dragging`       — drag-source flips true at dragstart; orchestrator
 *                         and drag-source flip back on drop / dragend / mouseup.
 *   - `draggedNodeInfo`— drag-source writes on mousedown; read by column-drop
 *                         and the drop orchestrator; reset on completion.
 */
export interface DragSharedState {
    view: EditorView | null
    activeNode: ActiveNode | null
    activeSelection: Selection | null
    dragging: boolean
    draggedNodeInfo: { node: Node; pos: number } | null
}

function createSharedState(): DragSharedState {
    return {
        view: null,
        activeNode: null,
        activeSelection: null,
        dragging: false,
        draggedNodeInfo: null,
    }
}

/**
 * `Dragable` — Notion-style drag handle + block menu for every top-level
 * block, plus a Notion-style "drop next to a block to make columns"
 * interaction.
 *
 * Implementation is split across four collaborators sharing a small mutable
 * state bag (`DragSharedState` above):
 *
 *   - `hover-controller` — handle DOM + block menu React root + rAF-throttled
 *                          mousemove hover resolution.
 *   - `drag-source`      — grip mousedown / mouseup / dragstart callbacks
 *                          wired into the React DragHandle.
 *   - `column-drop`      — drop-zone indicator + column-split drop consumer.
 *   - selection decoration — small PMPlugin below that styles NodeSelections.
 *
 * The orchestrator here owns the ProseMirror plugin lifecycle and the drop
 * fallback (when column-split doesn't apply, fall through to the normal
 * ProseMirror drag-drop with a small post-drop cleanup).
 */
export const Dragable = Extension.create<DragableStorage>({
    name: 'dragable',

    addStorage() {
        return {
            blockMenuItems: [] as BlockMenuItem[],
        }
    },

    addProseMirrorPlugins() {
        const editor = this.editor
        const shared = createSharedState()

        // Construction order matters: drag-source needs to call column-drop's
        // hide (on mouseUp), so column-drop is built first.
        const columnDrop = createColumnDropController(shared)
        const dragSource = createDragSource({
            shared,
            hideDropIndicator: columnDrop.hide,
        })
        const hover = createHoverController({ editor, shared, dragSource })

        /**
         * Pending handle of the deferred post-drop selection cleanup, so a new
         * drop can cancel the previous one instead of letting two of them race.
         */
        let dropCleanupTimer: any = null

        const clearSelectedNodeClasses = (view: EditorView) => {
            const root = view.dom as HTMLElement
            for (const cls of SELECTED_NODE_CLASSES) {
                root.querySelectorAll(`.${cls}`).forEach((el) => el.classList.remove(cls))
            }
        }

        return [
            new PMPlugin({
                key: DragablePluginKey,
                view: (view) => {
                    shared.view = view
                    if (view.editable) {
                        hover.attach(view)
                        columnDrop.attach(view)
                    }
                    return {
                        update(nextView) {
                            shared.view = nextView
                        },
                        destroy: () => {
                            hover.detach()
                            columnDrop.detach()
                            shared.view = null
                        },
                    }
                },
                props: {
                    handleDOMEvents: {
                        dragover: (view, event) => {
                            columnDrop.onDragOver(view, event as DragEvent)
                            return false
                        },

                        drop: (view, event) => {
                            const dropEvent = event as DragEvent
                            if (!view.editable) return false
                            if (!shared.draggedNodeInfo) return false

                            // 1) Try to consume as a column-split drop first.
                            //    When this returns true, the drop transaction
                            //    has already been dispatched.
                            if (columnDrop.tryConsumeDrop(view, dropEvent)) {
                                shared.activeSelection = null
                                shared.activeNode = null
                                shared.draggedNodeInfo = null
                                shared.dragging = false
                                return true
                            }

                            // 2) Fall back to normal drag-drop. ProseMirror
                            //    will run its own drop handling after we
                            //    return; we just clean up around the edges.
                            const eventPos = view.posAtCoords({
                                left: dropEvent.clientX,
                                top: dropEvent.clientY,
                            })

                            // Defer selection cleanup until PM's own drop
                            // transaction has landed (see DROP_CLEAR_DELAY_MS).
                            if (dropCleanupTimer) clearTimeout(dropCleanupTimer)
                            dropCleanupTimer = setTimeout(() => {
                                dropCleanupTimer = null

                                // A new drag can have started inside the delay
                                // window (`view.dragging` is set at dragstart and
                                // cleared right after PM's drop). Resetting the
                                // selection now would clobber the state that
                                // drag relies on, so leave it to its own drop.
                                if (shared.dragging || view.dragging) return

                                if (shared.activeSelection) {
                                    clearSelectedNodeClasses(view)
                                    const noneSelection = new TextSelection(
                                        view.state.doc.resolve(safePos(view.state, eventPos?.pos ?? 0))
                                    )
                                    view.dispatch(view.state.tr.setSelection(noneSelection))
                                    editor.commands.blur()
                                    shared.activeSelection = null
                                    shared.activeNode = null
                                }
                                shared.draggedNodeInfo = null
                            }, DROP_CLEAR_DELAY_MS)

                            if (!eventPos) {
                                columnDrop.hide()
                                return true
                            }

                            const maybeTitle = findParentNodeClosestToPos(
                                view.state.doc.resolve(safePos(editor.state, eventPos.pos)),
                                (node) => node.type.name === 'title'
                            )

                            // Never let a drop land inside the title.
                            if (eventPos.pos === 0 || maybeTitle) {
                                columnDrop.hide()
                                return true
                            }

                            if (shared.dragging) {
                                const tr = removePossibleTable(view, dropEvent)
                                shared.dragging = false
                                columnDrop.hide()
                                if (tr) {
                                    view.dispatch(tr)
                                    dropEvent.preventDefault()
                                    return true
                                }
                            }

                            columnDrop.hide()
                            return false
                        },

                        mousemove: (view, event) => {
                            hover.onMouseMove(view, event as MouseEvent)
                            return false
                        },

                        keydown: (view) => {
                            if (!view.editable) return false
                            hover.onKeyDown()
                            return false
                        },

                        mouseleave: () => {
                            hover.onEditorMouseLeave()
                            return false
                        },

                        dragleave: (view, event) => {
                            const dragEvent = event as DragEvent
                            // Hide the indicator only when the pointer left
                            // the editor DOM entirely (dragleave fires on
                            // every inner element transition too).
                            if (
                                dragEvent.target === view.dom ||
                                !view.dom.contains(dragEvent.relatedTarget as any)
                            ) {
                                columnDrop.hide()
                            }
                            return false
                        },

                        dragend: () => {
                            columnDrop.hide()
                            shared.dragging = false
                            shared.activeSelection = null
                            shared.draggedNodeInfo = null
                            // NOTE: `activeNode` is intentionally NOT cleared
                            // here — the pointer may still be over the source
                            // block, and clearing it would cause the handle
                            // to blink out until the next mousemove pass.
                            return false
                        },
                    },
                },
            }),

            // ── Selection decoration ────────────────────────────────────
            // Styles the current NodeSelection with a distinct class when it
            // was originated by the drag handle (as opposed to a keyboard /
            // click NodeSelection). Kept tiny and inline — it's the only
            // consumer of `shared.activeSelection`'s truthiness outside the
            // drag-source module.
            new PMPlugin({
                key: SelectionDecorationPluginKey,
                props: {
                    decorations(state) {
                        const usingActiveSelection = !!shared.activeSelection
                        const selection = state.selection
                        if (!(selection instanceof NodeSelection)) return DecorationSet.empty
                        const { from, to } = selection
                        return DecorationSet.create(state.doc, [
                            Decoration.node(safePos(state, from), safePos(state, to), {
                                class: usingActiveSelection
                                    ? 'ProseMirror-selectedblocknode-dragable'
                                    : 'ProseMirror-selectedblocknode-normal',
                            }),
                        ])
                    },
                },
            }),
        ]
    },
})
