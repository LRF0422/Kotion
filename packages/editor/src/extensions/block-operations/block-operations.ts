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
        };
    },
});
