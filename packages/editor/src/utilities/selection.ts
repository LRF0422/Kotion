import { EditorState, Selection, TextSelection, NodeSelection } from '@tiptap/pm/state';
import { Node as PMNode, ResolvedPos } from '@tiptap/pm/model';

/**
 * Selection utility functions for the editor
 */

/**
 * Check if the current selection is empty
 */
export function isSelectionEmpty(state: EditorState): boolean {
    const { selection } = state;
    return selection.empty;
}

/**
 * Check if the selection spans multiple blocks
 */
export function isMultiBlockSelection(state: EditorState): boolean {
    const { selection } = state;
    if (selection.empty) return false;

    const { $from, $to } = selection;
    return $from.parent !== $to.parent;
}

/**
 * Get the text content of the current selection
 */
export function getSelectionText(state: EditorState): string {
    const { selection } = state;
    if (selection.empty) return '';

    const { from, to } = selection;
    return state.doc.textBetween(from, to, '\n');
}

/**
 * Get all nodes in the current selection
 */
export function getNodesInSelection(state: EditorState): Array<{ node: PMNode; pos: number }> {
    const { selection } = state;
    const nodes: Array<{ node: PMNode; pos: number }> = [];

    if (selection.empty) return nodes;

    const { from, to } = selection;
    state.doc.nodesBetween(from, to, (node, pos) => {
        nodes.push({ node, pos });
    });

    return nodes;
}

/**
 * Get block nodes in the current selection
 */
export function getBlockNodesInSelection(state: EditorState): Array<{ node: PMNode; pos: number }> {
    const { selection } = state;
    const nodes: Array<{ node: PMNode; pos: number }> = [];

    if (selection.empty) return nodes;

    const { from, to } = selection;
    state.doc.nodesBetween(from, to, (node, pos) => {
        if (node.isBlock && !node.isText) {
            nodes.push({ node, pos });
        }
    });

    return nodes;
}

/**
 * Select the entire content of a node at a given position
 */
export function selectNode(state: EditorState, pos: number): Selection | null {
    try {
        const $pos = state.doc.resolve(pos);
        const node = $pos.nodeAfter;

        if (!node) return null;

        return NodeSelection.create(state.doc, pos);
    } catch (error) {
        console.error('Error selecting node:', error);
        return null;
    }
}

/**
 * Select a range within the document
 */
export function selectRange(state: EditorState, from: number, to: number): Selection | null {
    try {
        const maxPos = state.doc.content.size;
        const safeFrom = Math.max(0, Math.min(from, maxPos));
        const safeTo = Math.max(0, Math.min(to, maxPos));

        return TextSelection.create(state.doc, safeFrom, safeTo);
    } catch (error) {
        console.error('Error selecting range:', error);
        return null;
    }
}

/**
 * Get the parent node of the current selection
 */
export function getSelectionParent(state: EditorState): { node: PMNode; pos: number } | null {
    const { selection } = state;
    const { $from } = selection;

    if ($from.depth === 0) return null;

    const depth = $from.depth;
    const pos = $from.before(depth);
    const node = $from.node(depth);

    return { node, pos };
}

/**
 * Check if the selection is at the start of the document
 */
export function isSelectionAtStart(state: EditorState): boolean {
    const { selection } = state;
    return selection.from === 0;
}

/**
 * Check if the selection is at the end of the document
 */
export function isSelectionAtEnd(state: EditorState): boolean {
    const { selection } = state;
    return selection.to === state.doc.content.size;
}

/**
 * Check if a position is within the current selection
 */
export function isPosInSelection(state: EditorState, pos: number): boolean {
    const { selection } = state;
    return pos >= selection.from && pos <= selection.to;
}

/**
 * Get the depth of the current selection
 */
export function getSelectionDepth(state: EditorState): number {
    const { selection } = state;
    return selection.$from.depth;
}


/**
 * Get the common ancestor node of the selection
 */
export function getSelectionAncestor(state: EditorState): { node: PMNode; pos: number } | null {
    const { selection } = state;
    const { $from, $to } = selection;

    // Find the common depth
    let depth = 0;
    for (let d = 0; d <= Math.min($from.depth, $to.depth); d++) {
        if ($from.node(d) === $to.node(d)) {
            depth = d;
        } else {
            break;
        }
    }

    if (depth === 0) return null;

    const pos = $from.before(depth);
    const node = $from.node(depth);

    return { node, pos };
}

/**
 * Expand selection to include the entire parent node
 */
export function expandSelectionToParent(state: EditorState): Selection | null {
    const { selection } = state;
    const { $from } = selection;

    if ($from.depth === 0) return null;

    try {
        const depth = $from.depth;
        const start = $from.start(depth);
        const end = $from.end(depth);

        return TextSelection.create(state.doc, start, end);
    } catch (error) {
        console.error('Error expanding selection:', error);
        return null;
    }
}

/**
 * Check if selection spans across multiple node types
 */
export function hasMultipleNodeTypes(state: EditorState): boolean {
    const nodes = getBlockNodesInSelection(state);
    if (nodes.length <= 1) return false;

    const firstType = nodes[0].node.type;
    return nodes.some(({ node }) => node.type !== firstType);
}

/**
 * Get selection bounds relative to a specific node
 */
export function getSelectionBoundsInNode(
    state: EditorState,
    nodePos: number
): { from: number; to: number } | null {
    try {
        const { selection } = state;
        const node = state.doc.nodeAt(nodePos);

        if (!node) return null;

        const nodeEnd = nodePos + node.nodeSize;
        const from = Math.max(selection.from, nodePos);
        const to = Math.min(selection.to, nodeEnd);

        if (from >= to) return null;

        return { from, to };
    } catch (error) {
        console.error('Error getting selection bounds:', error);
        return null;
    }
}


export const test = () => { }
