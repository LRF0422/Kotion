import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { type EditorState, Selection } from "@tiptap/pm/state";
import { findNodeByBlockId, findAllNodesByBlockId } from "../../utilities/node";

export interface DeleteByBlockIdResult {
    /** Whether at least one block was found and deleted */
    success: boolean;
    /** IDs that were found and deleted */
    deletedIds: string[];
    /** IDs that were not found in the document */
    notFoundIds: string[];
}

/** Where to place the moved block relative to the target block. */
export type MoveBlockPosition = "before" | "after";

/** Direction of a sibling swap — "up" / "down" within the same parent. */
export type MoveBlockDirection = "up" | "down";

/**
 * Nodes that are pinned to their slot in the document: the page title always
 * stays first, and the table of contents is positioned by the page layout.
 * A block can never be swapped past one of them.
 */
const PINNED_SIBLING_TYPES = new Set(["title", "tableOfContents"]);

/** A resolved sibling swap, with every position taken before any mutation. */
export interface BlockMoveTarget {
    /** The node being moved. */
    node: PMNode;
    /** Start of the node being moved. */
    from: number;
    /** End of the node being moved. */
    to: number;
    /** Where the node should be re-inserted, in pre-deletion coordinates. */
    insertPos: number;
}

/**
 * Resolve the sibling swap for the block starting at `pos` (the position
 * *before* the node, as produced by `ActiveNode.$pos.pos - ActiveNode.offset`).
 *
 * Returns `null` when the move isn't possible — invalid position, no node at
 * `pos`, no sibling in that direction, or a pinned sibling (title / ToC).
 * Callers use it both to run the move and to enable/disable the menu item, so
 * the UI can never offer a move that the command would reject.
 */
export function resolveBlockMove(
    state: EditorState,
    pos: number,
    direction: MoveBlockDirection,
): BlockMoveTarget | null {
    if (pos < 0 || pos > state.doc.content.size) return null;

    let $pos;
    try {
        $pos = state.doc.resolve(pos);
    } catch {
        return null;
    }

    const node = $pos.nodeAfter;
    if (!node) return null;

    const index = $pos.index();
    const sibling =
        direction === "up"
            ? $pos.parent.maybeChild(index - 1)
            : $pos.parent.maybeChild(index + 1);

    if (!sibling) return null;
    if (PINNED_SIBLING_TYPES.has(sibling.type.name)) return null;

    const from = pos;
    const to = pos + node.nodeSize;

    return {
        node,
        from,
        to,
        // Swapping with the sibling means landing on its far side.
        insertPos: direction === "up" ? from - sibling.nodeSize : to + sibling.nodeSize,
    };
}

declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        blockOperations: {
            /**
             * Delete block node(s) by blockId.
             * Accepts a single blockId (string) or multiple blockIds (string[]).
             *
             * Batch deletion uses a single transaction with positions resolved
             * in descending order so earlier deletions don't invalidate
             * later positions — the standard ProseMirror approach for
             * multi-range removals.
             *
             * Returns a DeleteByBlockIdResult with details about which IDs
             * were deleted and which were not found.
             */
            deleteByBlockId: (blockId: string | string[]) => ReturnType;
            /**
             * Move a block (identified by blockId) to a position relative to
             * another block (identified by targetBlockId).
             *
             * The move is performed inside a single ProseMirror transaction:
             *   1. Delete the source node at its original position.
             *   2. Map the raw insert position through the deletion step.
             *   3. Insert the cloned source node at the mapped position.
             *
             * Cloning via nodeFromJSON preserves all attributes (including
             * blockId). Since the original is removed inside the same
             * transaction, the UniqueID extension sees no duplicate and
             * keeps the original blockId on the moved node.
             */
            moveBlockById: (
                blockId: string,
                targetBlockId: string,
                position?: MoveBlockPosition,
            ) => ReturnType;
            /**
             * Swap the block starting at `pos` with its previous ("up") or
             * next ("down") sibling, keeping it inside the same parent.
             *
             * `pos` is the position *before* the node, i.e. what the drag
             * handle already computes as `$pos.pos - offset`.
             *
             * Returns false (without touching the document) when there is no
             * sibling to swap with, or when that sibling is pinned — the page
             * title must stay the first child of the doc.
             */
            moveBlockAtPos: (
                pos: number,
                direction: MoveBlockDirection,
            ) => ReturnType;
        };
    }
}

export const BlockOperations = Extension.create({
    name: "blockOperations",

    addCommands() {
        return {
            deleteByBlockId:
                (blockId: string | string[]) =>
                    ({ state, dispatch }) => {
                        const ids = typeof blockId === "string" ? [blockId] : blockId;

                        if (ids.length === 0) {
                            return true;
                        }

                        // ── Single blockId fast path ──
                        // Use findAllNodesByBlockId (not findNodeByBlockId) so that
                        // duplicate blockIds — which can appear after a Yjs seeding
                        // race condition — are all removed in one transaction.
                        // findNodeByBlockId stops at the first match and would
                        // silently leave duplicates behind.
                        if (typeof blockId === "string") {
                            const results = findAllNodesByBlockId(state, blockId);
                            if (results.length === 0) {
                                return true;
                            }

                            if (dispatch) {
                                const tr = state.tr;
                                // Delete in descending position order so earlier
                                // deletions don't invalidate later positions.
                                const ranges = results
                                    .map(({ node, pos }) => ({ from: pos, to: pos + node.nodeSize }))
                                    .sort((a, b) => b.from - a.from);
                                for (const { from, to } of ranges) {
                                    tr.deleteRange(from, to);
                                }
                                dispatch(tr.scrollIntoView());
                            }

                            return true;
                        }

                        // ── Batch deletion (string[]) ──
                        // Like the single-id path, collect ALL matching nodes
                        // (not just one per id) so duplicate blockIds are
                        // fully removed. A single traversal gathers every match;
                        // descending-position deletion keeps earlier positions
                        // valid.
                        const idSet = new Set(ids);
                        const batchRanges: { from: number; to: number }[] = [];
                        state.doc.nodesBetween(0, state.doc.content.size, (node, p) => {
                            const id = (node.attrs.id ?? node.attrs.blockId) as string | undefined;
                            if (id && idSet.has(id)) {
                                batchRanges.push({ from: p, to: p + node.nodeSize });
                            }
                            return false;
                        });

                        if (batchRanges.length === 0) {
                            return true;
                        }

                        if (dispatch) {
                            const tr = state.tr;

                            batchRanges
                                .sort((a, b) => b.from - a.from);

                            for (const { from, to } of batchRanges) {
                                tr.deleteRange(from, to);
                            }

                            dispatch(tr.scrollIntoView());
                        }

                        return true
                    },

            moveBlockById:
                (
                    blockId: string,
                    targetBlockId: string,
                    position: MoveBlockPosition = "after",
                ) =>
                    ({ state, dispatch }) => {
                        if (!blockId || !targetBlockId) {
                            return false;
                        }

                        // No-op: moving a block relative to itself.
                        if (blockId === targetBlockId) {
                            return true;
                        }

                        const source = findNodeByBlockId(state, blockId);
                        const target = findNodeByBlockId(state, targetBlockId);

                        if (!source || !target) {
                            return false;
                        }

                        const sourceFrom = source.pos;
                        const sourceTo = source.pos + source.node.nodeSize;

                        // Reject moves where the target is inside the source
                        // subtree — that would be an invalid operation.
                        if (target.pos >= sourceFrom && target.pos < sourceTo) {
                            return false;
                        }

                        if (dispatch) {
                            const tr = state.tr;

                            // Raw insert position before any mutation.
                            const rawInsertPos =
                                position === "before"
                                    ? target.pos
                                    : target.pos + target.node.nodeSize;

                            // Clone the source node via JSON round-trip to
                            // detach it from the doc tree while preserving
                            // all attributes (including blockId).
                            const sourceClone = state.schema.nodeFromJSON(
                                source.node.toJSON(),
                            );

                            // Delete source first; map the raw insert
                            // position through the deletion step so it stays
                            // valid after the removal.
                            tr.delete(sourceFrom, sourceTo);
                            const mappedInsertPos = tr.mapping.map(rawInsertPos);
                            tr.insert(mappedInsertPos, sourceClone);

                            dispatch(tr.scrollIntoView());
                        }

                        return true;
                    },

            moveBlockAtPos:
                (pos: number, direction: MoveBlockDirection) =>
                    ({ state, dispatch }) => {
                        const target = resolveBlockMove(state, pos, direction);

                        if (!target) {
                            return false;
                        }

                        if (dispatch) {
                            const tr = state.tr;

                            // Same delete-then-insert dance as moveBlockById:
                            // cloning through JSON keeps every attribute
                            // (blockId included), and because the original is
                            // gone within the same transaction the UniqueID
                            // extension sees no duplicate to re-generate.
                            const clone = state.schema.nodeFromJSON(target.node.toJSON());

                            tr.delete(target.from, target.to);
                            const insertPos = tr.mapping.map(target.insertPos);
                            tr.insert(insertPos, clone);

                            // Deleting the source drops any selection that
                            // lived inside it, so re-anchor into the moved
                            // block — successive moves then stay on the block
                            // the user is actually shuffling around.
                            tr.setSelection(Selection.near(tr.doc.resolve(insertPos), 1));

                            dispatch(tr.scrollIntoView());
                        }

                        return true;
                    },
        };
    },
});
