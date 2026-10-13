import { Editor } from "@kn/editor";
import { BitableAttrs } from "../../types";

/**
 * ProseMirror-facing helpers for the bitable AI tools.
 *
 * The pure field/data builders live in `tools/dataBuilders.ts` and are
 * re-exported here so existing imports keep working.
 */

export * from "./dataBuilders";

// ---------------------------------------------------------------------------
// ProseMirror node helpers
// ---------------------------------------------------------------------------

/** Find all bitable nodes in the document. */
export function findBitableNodes(editor: Editor) {
    const bitables: Array<{ pos: number; attrs: BitableAttrs; nodeSize: number }> = [];
    editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "bitable") {
            bitables.push({ pos, attrs: node.attrs as BitableAttrs, nodeSize: node.nodeSize });
        }
    });
    return bitables;
}

/** Find bitable node by 0-based index. */
export function findBitableByIndex(editor: Editor, index: number) {
    const bitables = findBitableNodes(editor);
    if (index < 0 || index >= bitables.length) return null;
    return bitables[index];
}

/** Update bitable attributes at a given document position. */
export function updateBitableAttrs(editor: Editor, pos: number, newAttrs: Partial<BitableAttrs>) {
    const { tr } = editor.state;
    const node = editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== "bitable") return false;
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...newAttrs });
    editor.view.dispatch(tr);
    return true;
}
