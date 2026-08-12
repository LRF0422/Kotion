import type { Editor, JSONContent } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

// ─── Types ───────────────────────────────────────────────────────────

/**
 * One block-level change produced by diffing the top level of two document
 * snapshots. `before` / `after` carry the block's full JSON so the change can
 * be inverted later without consulting any other state.
 */
export interface EditorOpBlockChange {
    /** insert = the block did not exist in the before snapshot. */
    action: 'insert' | 'delete' | 'update'
    blockId: string
    blockType?: string
    /** Short plain-text preview for UI summaries. */
    textPreview?: string
    /**
     * Id of the nearest preceding top-level sibling that carries an id, in the
     * BEFORE snapshot (null = the block was the first id-bearing block).
     * Serves as the anchor for re-insertion and move-back during rollback.
     */
    prevId?: string | null
    before?: JSONContent
    after?: JSONContent
}

export interface OperationRollbackResult {
    /** Changes successfully inverted. */
    applied: number
    /** Changes skipped because their block could no longer be resolved. */
    skipped: number
}

// ─── Snapshot / diff ─────────────────────────────────────────────────

const blockIdOf = (node: ProseMirrorNode): string | undefined =>
    ((node.attrs?.id ?? node.attrs?.blockId) as string | undefined) || undefined

export const previewOf = (node: ProseMirrorNode): string => {
    const text = node.textContent.replace(/\s+/g, ' ').trim()
    return text.length > 60 ? text.slice(0, 60) + '…' : text
}

interface TopBlockEntry {
    node: ProseMirrorNode
    pos: number
    prevId: string | null
}

/** Index the id-bearing top-level blocks of a doc, in document order. */
export const indexTopBlocks = (doc: ProseMirrorNode): Map<string, TopBlockEntry> => {
    const map = new Map<string, TopBlockEntry>()
    let prevId: string | null = null
    doc.forEach((node, offset) => {
        const id = blockIdOf(node)
        if (!id) return
        map.set(id, { node, pos: offset, prevId })
        prevId = id
    })
    return map
}

/**
 * Diff the top level of two doc snapshots by stable block id. Nested edits
 * bubble up to their top-level block (its JSON changes), matching the
 * granularity DirtyTracker uses for incremental save.
 *
 * Result order: deletes + updates in before-doc order (so re-insertion can
 * chain sibling anchors), then inserts in after-doc order.
 */
export const diffTopBlocks = (
    beforeDoc: ProseMirrorNode,
    afterDoc: ProseMirrorNode,
): EditorOpBlockChange[] => {
    const before = indexTopBlocks(beforeDoc)
    const after = indexTopBlocks(afterDoc)
    const changes: EditorOpBlockChange[] = []

    for (const [blockId, b] of before) {
        const a = after.get(blockId)
        if (!a) {
            changes.push({
                action: 'delete',
                blockId,
                blockType: b.node.type.name,
                textPreview: previewOf(b.node),
                prevId: b.prevId,
                before: b.node.toJSON(),
            })
        } else if (!b.node.eq(a.node)) {
            changes.push({
                action: 'update',
                blockId,
                blockType: b.node.type.name,
                textPreview: previewOf(b.node) || previewOf(a.node),
                prevId: b.prevId,
                before: b.node.toJSON(),
                after: a.node.toJSON(),
            })
        }
    }
    for (const [blockId, a] of after) {
        if (!before.has(blockId)) {
            changes.push({
                action: 'insert',
                blockId,
                blockType: a.node.type.name,
                textPreview: previewOf(a.node),
                after: a.node.toJSON(),
            })
        }
    }
    return changes
}

// ─── Inverse application ─────────────────────────────────────────────

/**
 * Insert position for a restored / moved-back block: right after its anchor
 * sibling; when the anchor is gone, at the start of the body (after the
 * title node when the schema pins one at the front).
 */
export const resolveInsertPos = (doc: ProseMirrorNode, prevId: string | null | undefined): number => {
    if (prevId) {
        const anchor = indexTopBlocks(doc).get(prevId)
        if (anchor) return anchor.pos + anchor.node.nodeSize
    }
    const first = doc.firstChild
    if (first && first.type.name === 'title') return first.nodeSize
    return 0
}

/**
 * Invert a set of block changes against the editor's live document in a
 * single transaction — one history entry (Ctrl+Z-able) and one incremental
 * save batch. Every step re-resolves positions against `tr.doc`, so a subset
 * of the changes can be reverted independently of the rest; blocks a later
 * edit removed or relocated into a container are skipped and counted.
 */
export const applyInverseChanges = (
    editor: Editor,
    changes: EditorOpBlockChange[],
): OperationRollbackResult => {
    let applied = 0
    let skipped = 0
    if (editor.isDestroyed || changes.length === 0) {
        return { applied, skipped: changes.length }
    }

    const tr = editor.state.tr
    const nodeFromJSON = (json: JSONContent): ProseMirrorNode | null => {
        try {
            return editor.schema.nodeFromJSON(json)
        } catch {
            return null
        }
    }

    // 1. Remove blocks the operation created.
    for (const change of changes) {
        if (change.action !== 'insert') continue
        const found = indexTopBlocks(tr.doc).get(change.blockId)
        if (!found) {
            skipped++
            continue
        }
        tr.delete(found.pos, found.pos + found.node.nodeSize)
        applied++
    }

    // 2. Restore the content of blocks the operation modified.
    for (const change of changes) {
        if (change.action !== 'update' || !change.before) continue
        const found = indexTopBlocks(tr.doc).get(change.blockId)
        const node = found ? nodeFromJSON(change.before) : null
        if (!found || !node) {
            skipped++
            continue
        }
        tr.replaceWith(found.pos, found.pos + found.node.nodeSize, node)
        applied++
    }

    // 3. Re-insert blocks the operation deleted (original doc order, so
    //    consecutive deletions chain off each other's anchors).
    for (const change of changes) {
        if (change.action !== 'delete' || !change.before) continue
        if (indexTopBlocks(tr.doc).has(change.blockId)) {
            skipped++
            continue
        }
        const node = nodeFromJSON(change.before)
        if (!node) {
            skipped++
            continue
        }
        tr.insert(resolveInsertPos(tr.doc, change.prevId), node)
        applied++
    }

    // 4. Move blocks back when their position also changed: restoring the
    //    JSON restores attrs (rank) but not the position in the live doc.
    for (const change of changes) {
        if (change.action !== 'update') continue
        const found = indexTopBlocks(tr.doc).get(change.blockId)
        if (!found) continue
        if ((found.prevId ?? null) === (change.prevId ?? null)) continue
        tr.delete(found.pos, found.pos + found.node.nodeSize)
        tr.insert(resolveInsertPos(tr.doc, change.prevId), found.node)
    }

    if (tr.steps.length > 0) {
        editor.view.dispatch(tr)
    }
    return { applied, skipped }
}
