import { Extension } from "@tiptap/core";
import { findNodeByBlockId, findNodesByBlockIds } from "../../utilities/node";

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
                        if (typeof blockId === "string") {
                            const result = findNodeByBlockId(state, blockId);
                            if (!result) {
                                return true;
                            }

                            if (dispatch) {
                                const tr = state.tr.deleteRange(
                                    result.pos,
                                    result.pos + result.node.nodeSize,
                                );
                                dispatch(tr.scrollIntoView());
                            }

                            return true;
                        }

                        // ── Batch deletion (string[]) ──
                        const found = findNodesByBlockIds(state, ids);

                        if (found.size === 0) {
                            return true;
                        }

                        if (dispatch) {
                            const tr = state.tr;

                            // Sort positions in descending order so that deleting
                            // from the end of the document first keeps earlier
                            // positions valid — the canonical ProseMirror pattern
                            // for multi-range mutations in one transaction.
                            const ranges = Array.from(found.values())
                                .map(({ node, pos }) => ({ from: pos, to: pos + node.nodeSize }))
                                .sort((a, b) => b.from - a.from);

                            for (const { from, to } of ranges) {
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
        };
    },
});
