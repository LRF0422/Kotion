import type { Editor } from "@kn/editor"
import { findBlockPosById, runWithAITransactionMeta } from "@kn/common"
import type { MergeOp } from "@kn/common"

/**
 * Apply a merge result's block-level operations to the live page editor.
 *
 * Positions are re-resolved from the live document for every operation (block ids
 * survive edits), so a single pass stays correct even though each op shifts the
 * document. Operations run under the AI-origin transaction meta, exactly like
 * agent-authored edits produced by the tools themselves.
 */
export interface ApplyMergeOutcome {
    applied: number
    /** Operations whose target block no longer exists / failed to apply. */
    failed: MergeOp[]
}

export function applyMergeOps(editor: Editor, ops: MergeOp[]): ApplyMergeOutcome {
    let applied = 0
    const failed: MergeOp[] = []

    runWithAITransactionMeta(editor, () => {
        for (const op of ops) {
            try {
                if (op.kind === 'delete') {
                    const found = findBlockPosById(editor.state.doc, op.key)
                    if (!found) {
                        failed.push(op)
                        continue
                    }
                    editor.chain()
                        .deleteRange({ from: found.pos, to: found.pos + found.node.nodeSize })
                        .run()
                    applied += 1
                    continue
                }

                const node = editor.schema.nodeFromJSON(op.node)
                if (op.kind === 'replace') {
                    const found = findBlockPosById(editor.state.doc, op.key)
                    if (!found) {
                        failed.push(op)
                        continue
                    }
                    editor.chain()
                        .insertContentAt(
                            { from: found.pos, to: found.pos + found.node.nodeSize },
                            node.toJSON()
                        )
                        .run()
                    applied += 1
                    continue
                }

                // insert: after the anchor block when it still exists, else at the end.
                let pos = editor.state.doc.content.size
                if (op.anchorKey) {
                    const anchor = findBlockPosById(editor.state.doc, op.anchorKey)
                    if (anchor) {
                        pos = anchor.pos + anchor.node.nodeSize
                    } else {
                        failed.push(op)
                        continue
                    }
                }
                editor.chain().insertContentAt(pos, node.toJSON()).run()
                applied += 1
            } catch {
                failed.push(op)
            }
        }
    })

    return { applied, failed }
}
