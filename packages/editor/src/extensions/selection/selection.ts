import { getCurrentNode } from '../../utilities';
import { Extension } from '@tiptap/core';

import { AllSelection, NodeSelection, Plugin, PluginKey, Selection, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { Node as PMNode } from '@tiptap/pm/model';

export const selectionPluginKey = new PluginKey('selection');

/**
 * Get all top-level block nodes within the current selection
 * Excludes text nodes and paragraph nodes for cleaner selection handling
 * @param selection - The current editor selection
 * @param doc - The ProseMirror document
 * @returns Array of nodes with their positions
 */
export const getTopLevelNodesFromSelection = (selection: Selection, doc: PMNode) => {
    const nodes: { node: PMNode; pos: number }[] = [];

    // Only process if there's an actual selection range
    if (selection.from !== selection.to) {
        const { from, to } = selection;

        doc.nodesBetween(from, to, (node: PMNode, pos: number) => {
            // Check if the node is completely within the selection
            const withinSelection = from <= pos && pos + node.nodeSize <= to;

            // Only include block nodes that aren't paragraphs or text
            if (node && node.type.name !== 'paragraph' && !node.isText && withinSelection) {
                nodes.push({ node, pos });
                // Don't traverse into this node's children
                return false;
            }

            return true;
        });
    }

    return nodes;
};

/**
 * Generate decorations for the current selection
 * Applies visual styling to selected nodes
 * @param doc - The ProseMirror document
 * @param selection - The current editor selection
 * @returns A DecorationSet with appropriate styling
 */
export const getDecorations = (doc: PMNode, selection: Selection): DecorationSet => {
    try {
        // Handle NodeSelection - single node is selected
        if (selection instanceof NodeSelection) {
            return DecorationSet.create(doc, [
                Decoration.node(selection.from, selection.to, {
                    class: 'selected-node',
                }),
            ]);
        }

        // Handle TextSelection and AllSelection - range or full document
        if (selection instanceof TextSelection || selection instanceof AllSelection) {
            const decorations = getTopLevelNodesFromSelection(selection, doc).map(({ node, pos }) => {
                return Decoration.node(pos, pos + node.nodeSize, {
                    class: 'selected-node',
                });
            });
            return DecorationSet.create(doc, decorations);
        }

        return DecorationSet.empty;
    } catch (error) {
        console.error('Error creating selection decorations:', error);
        return DecorationSet.empty;
    }
};

export const SelectionExt = Extension.create({
    name: 'selection',
    priority: 100,
    addProseMirrorPlugins() {
        const { isEditable } = this.editor;
        return [
            new Plugin({
                key: selectionPluginKey,
                props: {
                    handleKeyDown(view, event) {
                        /**
                         * Handle Ctrl+A / Command+A for custom select all behavior
                         * This allows for context-aware selection within specific nodes
                         */
                        if ((event.ctrlKey || event.metaKey) && (event.key === 'a' || event.key === 'A')) {
                            const { state } = view;
                            const { selection } = state;
                            const node = getCurrentNode(state);
                            const $head = selection.$head;

                            // Try to find the context node boundaries
                            let startPos: number | null = null;
                            let endPos: number | null = null;

                            // If we're in a custom node (not doc or paragraph), select within that node
                            if (node && node.type.name !== 'doc' && node.type.name !== 'paragraph') {
                                try {
                                    // Find the position of the current node
                                    for (let d = $head.depth; d > 0; d--) {
                                        const currentNode = $head.node(d);
                                        if (currentNode === node) {
                                            const nodeStart = $head.start(d);
                                            const nodeEnd = $head.end(d);
                                            startPos = nodeStart;
                                            endPos = nodeEnd;
                                            break;
                                        }
                                    }
                                } catch (error) {
                                    console.error('Error calculating node boundaries:', error);
                                }
                            }

                            // If we found valid boundaries, select within them
                            if (startPos !== null && endPos !== null && startPos < endPos) {
                                try {
                                    const tr = state.tr.setSelection(
                                        TextSelection.create(
                                            state.doc,
                                            startPos,
                                            endPos
                                        )
                                    );
                                    view.dispatch(tr);
                                    return true;
                                } catch (error) {
                                    console.error('Error setting custom selection:', error);
                                }
                            }
                        }

                        return false;
                    },
                    decorations(state) {
                        return this.getState(state);
                    },
                },
                state: {
                    init() {
                        return DecorationSet.empty;
                    },
                    apply(tr, oldState) {
                        // Only recalculate decorations if selection or document changed
                        if (!tr.selectionSet && !tr.docChanged) {
                            // Map the old decorations to the new document
                            return oldState.map(tr.mapping, tr.doc);
                        }

                        const { doc, selection } = tr;
                        const decorationSet = getDecorations(doc, selection);
                        return decorationSet;
                    },
                },
                filterTransaction(tr, state) {
                    // Prevent prosemirror's mutation observer from overriding a node selection 
                    // with a text selection for the exact same range
                    // This prevents issues with node-based components like date pickers in collaborative editing
                    // Reference: https://product-fabric.atlassian.net/browse/ED-10645
                    if (
                        state.selection instanceof NodeSelection &&
                        tr.selection instanceof TextSelection &&
                        state.selection.from === tr.selection.from &&
                        state.selection.to === tr.selection.to
                    ) {
                        return false;
                    }

                    return true;
                },
            }),
            new Plugin({
                key: new PluginKey('preventSelection'),
                props: {
                    // Prevent interactions when editor is not editable (read-only mode)
                    handleClick(view, pos, event) {
                        if (!isEditable) {
                            event.preventDefault();
                            return true;
                        }
                        return false;
                    },
                    handleKeyPress(view, event) {
                        if (!isEditable) {
                            event.preventDefault();
                            return true;
                        }
                        return false;
                    },
                    handleKeyDown(view, event) {
                        if (!isEditable) {
                            event.preventDefault();
                            return true;
                        }
                        return false;
                    },
                    // Prevent double-click selection in read-only mode
                    handleDoubleClick(view, pos, event) {
                        if (!isEditable) {
                            event.preventDefault();
                            return true;
                        }
                        return false;
                    },
                    // Prevent triple-click selection in read-only mode
                    handleTripleClick(view, pos, event) {
                        if (!isEditable) {
                            event.preventDefault();
                            return true;
                        }
                        return false;
                    },
                },
            }),
        ];
    },
});