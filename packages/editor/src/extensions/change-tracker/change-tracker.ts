import { Extension } from '@tiptap/core'
import type { Editor, JSONContent } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import {
    applyInverseChanges,
    indexTopBlocks,
    previewOf,
    resolveInsertPos,
    type EditorOpBlockChange,
    type OperationRollbackResult,
} from './op-diff'
import {
    currentOffsets,
    diffInlineText,
    inlineTextOf,
    LEAF_CHAR,
    removeOpsFromBlockJSON,
    type InlineOp,
} from './text-diff'

// ─── Public Types ────────────────────────────────────────────────────

/** A block change with optional span-level (inline text) detail. */
export interface TrackedChange extends EditorOpBlockChange {
    /**
     * Present for update changes between same-type textblocks with pure-text
     * inline content: the character-level ops against the baseline text.
     * Absent ops mean the difference is structural or marks-only → the whole
     * block is decorated instead of individual spans.
     */
    inline?: { ops: InlineOp[]; baseText: string }
}

/** The change the user clicked on the canvas; anchors the accept/reject popup. */
export interface TrackerSelection {
    kind: 'span' | 'block'
    blockId: string
    /** Index into TrackedChange.inline.ops (span kind only). */
    opIndex?: number
    action?: 'insert' | 'update' | 'delete'
    /** Anchor position in the current doc, for popup placement. */
    from: number
}

/**
 * A block merged mid-session: the accepted node snapshot, or null for an
 * accepted deletion. `prevId` is the block's live anchor at accept time, so
 * a block that diverges again after acceptance re-enters the pending list
 * with the accepted content as its new before-image.
 */
interface AcceptedEntry {
    node: ProseMirrorNode | null
    prevId: string | null
}

export interface ChangeTrackerStorage {
    /** Whether a tracking session is active. */
    enabled: boolean
    /** Pending (unmerged) block changes, baseline-first order. */
    changes: TrackedChange[]
    /** Bumped on every mutation so React consumers can subscribe. */
    version: number
    /** The canvas change the user clicked, if any. */
    selected: TrackerSelection | null
    /** Start tracking: the current doc becomes the merge baseline. */
    start: () => void
    /** Stop tracking and keep all edits (implicit merge-all). */
    stop: () => void
    /** Merge one change: keep the block's current content. */
    accept: (blockId: string) => void
    /** Restore one change: revert the block to its baseline content. */
    restore: (blockId: string) => OperationRollbackResult | null
    /** Merge every pending change; tracking continues on a fresh baseline. */
    acceptAll: () => void
    /** Restore every pending change; tracking continues. */
    restoreAll: () => OperationRollbackResult | null
    /** Select a canvas change (drives the accept/reject popup). */
    select: (sel: TrackerSelection | null) => void
    /** Merge the selected change (span or block). */
    acceptSelection: () => void
    /** Restore the selected change (span or block). */
    rejectSelection: () => void
    /** Subscribe to storage mutations; returns an unsubscribe function. */
    subscribe: (cb: () => void) => () => void
}

export const changeTrackerPluginKey = new PluginKey('changeTracker')

// ─── Extension ───────────────────────────────────────────────────────

/**
 * ChangeTracker — an editor-level "track changes" session. While enabled,
 * every document mutation (agent tool calls, manual typing, remote sync) is
 * diffed live against the session baseline. Textblock updates are diffed at
 * character granularity: inserted text is highlighted inline, deleted text
 * is rendered in place with strikethrough, and clicking any change pops an
 * accept/reject affordance. Structural changes fall back to whole-block
 * highlighting; deleted blocks render as struck-through ghost blocks.
 *
 * The baseline is an immutable doc reference, so tracking costs one
 * top-level diff per update — unchanged blocks short-circuit on reference
 * equality inside `node.eq`, and span diffs run only for blocks whose JSON
 * actually changed.
 */
export const ChangeTracker = Extension.create<Record<string, never>, ChangeTrackerStorage>({
    name: 'changeTracker',

    addStorage() {
        return {
            enabled: false,
            changes: [],
            version: 0,
            selected: null,
            start: () => {},
            stop: () => {},
            accept: () => {},
            restore: () => null,
            acceptAll: () => {},
            restoreAll: () => null,
            select: () => {},
            acceptSelection: () => {},
            rejectSelection: () => {},
            subscribe: () => () => {},
        }
    },

    onCreate() {
        const editor = this.editor
        const storage = this.storage

        let baseline: ProseMirrorNode | null = null
        const accepted = new Map<string, AcceptedEntry>()
        /** Per-block baseline replacement after span-level accepts. */
        const baselineOverrides = new Map<string, JSONContent>()
        const overrideNodes = new Map<string, ProseMirrorNode | null>()
        const listeners = new Set<() => void>()

        const notify = () => {
            storage.version++
            listeners.forEach(cb => cb())
        }

        /** Re-run decorations even when a mutation produced no doc change. */
        const refreshDecorations = () => {
            if (editor.isDestroyed) return
            editor.view.dispatch(editor.state.tr.setMeta(changeTrackerPluginKey, true))
        }

        const clearOverride = (blockId: string) => {
            baselineOverrides.delete(blockId)
            overrideNodes.delete(blockId)
        }

        /** Attach span-level ops when the change is a pure-text textblock edit. */
        const attachInline = (
            change: TrackedChange,
            baseNode: ProseMirrorNode,
            curNode: ProseMirrorNode,
        ) => {
            if (baseNode.type.name !== curNode.type.name) return
            if (!baseNode.isTextblock || !curNode.isTextblock) return
            const baseText = inlineTextOf(baseNode)
            const curText = inlineTextOf(curNode)
            // Atoms (images, mentions…) flatten to LEAF_CHAR and cannot be
            // reconstructed from plain text → block-level fallback.
            if (baseText.includes(LEAF_CHAR) || curText.includes(LEAF_CHAR)) return
            const ops = diffInlineText(baseText, curText)
            // Zero ops with unequal nodes = marks-only change → block-level.
            if (ops.length === 0) return
            change.inline = { ops, baseText }
        }

        const recompute = () => {
            if (!baseline) {
                storage.changes = []
                return
            }
            const baseIndex = indexTopBlocks(baseline)
            const live = indexTopBlocks(editor.state.doc)
            const resolveBaseNode = (id: string): ProseMirrorNode | undefined => {
                if (baselineOverrides.has(id)) {
                    if (!overrideNodes.has(id)) {
                        try {
                            overrideNodes.set(id, editor.schema.nodeFromJSON(baselineOverrides.get(id)))
                        } catch {
                            overrideNodes.set(id, null)
                        }
                    }
                    const node = overrideNodes.get(id)
                    if (node) return node
                }
                return baseIndex.get(id)?.node
            }

            const changes: TrackedChange[] = []
            for (const [blockId, b] of baseIndex) {
                const baseNode = resolveBaseNode(blockId)
                if (!baseNode) continue
                const a = live.get(blockId)
                if (!a) {
                    changes.push({
                        action: 'delete',
                        blockId,
                        blockType: baseNode.type.name,
                        textPreview: previewOf(baseNode),
                        prevId: b.prevId,
                        before: baseNode.toJSON(),
                    })
                    continue
                }
                if (baseNode.eq(a.node)) continue
                const change: TrackedChange = {
                    action: 'update',
                    blockId,
                    blockType: baseNode.type.name,
                    textPreview: previewOf(baseNode) || previewOf(a.node),
                    prevId: b.prevId,
                    before: baseNode.toJSON(),
                    after: a.node.toJSON(),
                }
                attachInline(change, baseNode, a.node)
                changes.push(change)
            }
            for (const [blockId, a] of live) {
                if (!baseIndex.has(blockId)) {
                    changes.push({
                        action: 'insert',
                        blockId,
                        blockType: a.node.type.name,
                        textPreview: previewOf(a.node),
                        after: a.node.toJSON(),
                    })
                }
            }

            storage.changes = changes.filter(change => {
                const acc = accepted.get(change.blockId)
                if (acc === undefined) return true
                const entry = live.get(change.blockId)
                // Accepted blocks stay merged while their content still equals
                // the accepted snapshot (accepted deletion: while still absent).
                const stillMerged = acc.node ? !!entry && entry.node.eq(acc.node) : !entry
                if (stillMerged) return false
                // Diverged again after acceptance: re-track with the accepted
                // content as the new before-image, so a later restore returns
                // the block to what the user last merged, not to the original.
                if (acc.node) change.before = acc.node.toJSON()
                change.prevId = acc.prevId
                accepted.delete(change.blockId)
                return true
            })
        }

        storage.subscribe = (cb: () => void) => {
            listeners.add(cb)
            return () => listeners.delete(cb)
        }

        storage.start = () => {
            if (storage.enabled) return
            baseline = editor.state.doc
            accepted.clear()
            baselineOverrides.clear()
            overrideNodes.clear()
            storage.changes = []
            storage.selected = null
            storage.enabled = true
            notify()
            refreshDecorations()
        }

        storage.stop = () => {
            if (!storage.enabled) return
            baseline = null
            accepted.clear()
            baselineOverrides.clear()
            overrideNodes.clear()
            storage.changes = []
            storage.selected = null
            storage.enabled = false
            notify()
            refreshDecorations()
        }

        storage.accept = (blockId: string) => {
            const index = storage.changes.findIndex(c => c.blockId === blockId)
            if (index < 0) return
            const change = storage.changes[index]
            const entry = indexTopBlocks(editor.state.doc).get(blockId)
            accepted.set(blockId, {
                node: change.action === 'delete' ? null : entry?.node ?? null,
                prevId: change.action === 'delete'
                    ? change.prevId ?? null
                    : entry?.prevId ?? change.prevId ?? null,
            })
            clearOverride(blockId)
            if (storage.selected?.blockId === blockId) storage.selected = null
            storage.changes.splice(index, 1)
            notify()
            refreshDecorations()
        }

        storage.restore = (blockId: string) => {
            const change = storage.changes.find(c => c.blockId === blockId)
            if (!change) return null
            if (storage.selected?.blockId === blockId) storage.selected = null
            // The dispatched transaction triggers `update` → recompute, and the
            // restored block drops out of the pending list on its own.
            return applyInverseChanges(editor, [change])
        }

        storage.acceptAll = () => {
            if (!storage.enabled) return
            baseline = editor.state.doc
            accepted.clear()
            baselineOverrides.clear()
            overrideNodes.clear()
            storage.changes = []
            storage.selected = null
            notify()
            refreshDecorations()
        }

        storage.restoreAll = () => {
            if (!storage.enabled || storage.changes.length === 0) return null
            storage.selected = null
            return applyInverseChanges(editor, [...storage.changes])
        }

        storage.select = (sel: TrackerSelection | null) => {
            storage.selected = sel
            notify()
        }

        /** Resolve the selected span op against fresh doc state; null when stale. */
        const resolveSpan = (sel: TrackerSelection) => {
            if (sel.opIndex == null) return null
            const change = storage.changes.find(c => c.blockId === sel.blockId)
            const ops = change?.inline?.ops
            if (!change || !ops || !ops[sel.opIndex]) return null
            const entry = indexTopBlocks(editor.state.doc).get(sel.blockId)
            if (!entry) return null
            return { change, ops, op: ops[sel.opIndex], entry }
        }

        storage.acceptSelection = () => {
            const sel = storage.selected
            if (!sel) return
            if (sel.kind === 'block') {
                storage.accept(sel.blockId)
                return
            }
            const resolved = resolveSpan(sel)
            storage.selected = null
            if (!resolved) {
                notify()
                return
            }
            const { ops, entry } = resolved
            if (ops.length <= 1) {
                // Last pending span ≙ accepting the whole block.
                storage.accept(sel.blockId)
                return
            }
            // New baseline for the block = current content minus the spans
            // still pending (accepted text stays on both sides of the diff).
            const remaining = ops.filter((_, i) => i !== sel.opIndex)
            baselineOverrides.set(
                sel.blockId,
                removeOpsFromBlockJSON(entry.node.toJSON(), remaining),
            )
            overrideNodes.delete(sel.blockId)
            recompute()
            notify()
            refreshDecorations()
        }

        storage.rejectSelection = () => {
            const sel = storage.selected
            if (!sel) return
            if (sel.kind === 'block') {
                storage.restore(sel.blockId)
                return
            }
            const resolved = resolveSpan(sel)
            if (!resolved) {
                storage.selected = null
                notify()
                return
            }
            const { ops, op, entry } = resolved
            const curOff = currentOffsets(ops)[sel.opIndex!]
            const pos = entry.pos + 1 + curOff
            const tr = editor.state.tr
            if (op.type === 'insert') tr.delete(pos, pos + op.text.length)
            else tr.insertText(op.text, pos)
            storage.selected = null
            editor.view.dispatch(tr)
        }

        const onUpdate = () => {
            if (!storage.enabled) return
            // Positions drift with every edit; the popup re-opens on next click.
            storage.selected = null
            recompute()
            notify()
            // Plugin apply() ran BEFORE this update fired, so its decorations
            // were built from the pre-edit change list. A meta-only transaction
            // re-runs apply against the freshly recomputed spans (no steps → no
            // further update event, no history entry, no DirtyTracker noise).
            refreshDecorations()
        }
        // Editor.destroy() removes all listeners, so no off() is needed.
        editor.on('update', onUpdate)
    },

    addProseMirrorPlugins() {
        const storage = this.storage

        const deletedTextWidget = (text: string, blockId: string, opIndex: number) => () => {
            const el = document.createElement('span')
            el.className = 'kn-tracked-del'
            el.setAttribute('data-tt', `${blockId}:${opIndex}`)
            el.textContent = text
            return el
        }

        const deletedBlockWidget = (change: TrackedChange) => () => {
            const el = document.createElement('div')
            el.className = 'kn-tracked-del-block'
            el.setAttribute('data-tt-block-del', change.blockId)
            el.textContent = change.textPreview || change.blockType || ''
            return el
        }

        return [
            new Plugin({
                key: changeTrackerPluginKey,
                state: {
                    init: () => ({ decorations: DecorationSet.empty, version: -1 }),
                    apply(tr, value) {
                        if (!storage.enabled) {
                            return value.decorations === DecorationSet.empty
                                ? value
                                : { decorations: DecorationSet.empty, version: storage.version }
                        }
                        const versionChanged = value.version !== storage.version
                        if (!tr.docChanged && !versionChanged) return value
                        const live = indexTopBlocks(tr.doc)
                        const decorations: Decoration[] = []
                        for (const change of storage.changes) {
                            if (change.action === 'delete') {
                                // Ghost block: the deleted content, struck
                                // through, at its original position.
                                decorations.push(
                                    Decoration.widget(
                                        resolveInsertPos(tr.doc, change.prevId),
                                        deletedBlockWidget(change),
                                        { side: -1, key: `tt-bdel-${change.blockId}` },
                                    ),
                                )
                                continue
                            }
                            const entry = live.get(change.blockId)
                            if (!entry) continue
                            if (change.inline && change.inline.ops.length > 0) {
                                const blockStart = entry.pos + 1
                                const curOff = currentOffsets(change.inline.ops)
                                change.inline.ops.forEach((op, i) => {
                                    if (op.type === 'insert') {
                                        decorations.push(
                                            Decoration.inline(
                                                blockStart + curOff[i],
                                                blockStart + curOff[i] + op.text.length,
                                                {
                                                    class: 'kn-tracked-ins',
                                                    'data-tt': `${change.blockId}:${i}`,
                                                },
                                            ),
                                        )
                                    } else {
                                        decorations.push(
                                            Decoration.widget(
                                                blockStart + curOff[i],
                                                deletedTextWidget(op.text, change.blockId, i),
                                                { side: -1, key: `tt-del-${change.blockId}-${i}` },
                                            ),
                                        )
                                    }
                                })
                            } else {
                                decorations.push(
                                    Decoration.node(entry.pos, entry.pos + entry.node.nodeSize, {
                                        class: `kn-tracked-${change.action}`,
                                    }),
                                )
                            }
                        }
                        return {
                            decorations: DecorationSet.create(tr.doc, decorations),
                            version: storage.version,
                        }
                    },
                },
                props: {
                    decorations(state) {
                        return changeTrackerPluginKey.getState(state)?.decorations
                    },
                    handleClick(view, pos, event) {
                        if (!storage.enabled) return false
                        const target = event.target as HTMLElement | null
                        const el = target?.closest?.('[data-tt],[data-tt-block-del]') as HTMLElement | null
                        if (el) {
                            const tt = el.getAttribute('data-tt')
                            if (tt) {
                                const [blockId, idx] = tt.split(':')
                                const change = storage.changes.find(c => c.blockId === blockId)
                                const ops = change?.inline?.ops
                                const opIndex = Number(idx)
                                if (change && ops && ops[opIndex]) {
                                    const entry = indexTopBlocks(view.state.doc).get(blockId)
                                    if (entry) {
                                        storage.select({
                                            kind: 'span',
                                            blockId,
                                            opIndex,
                                            from: entry.pos + 1 + currentOffsets(ops)[opIndex],
                                        })
                                    }
                                }
                                return false
                            }
                            const delBlock = el.getAttribute('data-tt-block-del')
                            if (delBlock) {
                                storage.select({ kind: 'block', blockId: delBlock, action: 'delete', from: pos })
                                return false
                            }
                            return false
                        }
                        // Whole-block changes (inserts, structural updates):
                        // select when the click lands inside the live block.
                        for (const change of storage.changes) {
                            if (change.action === 'delete' || change.inline?.ops.length) continue
                            const entry = indexTopBlocks(view.state.doc).get(change.blockId)
                            if (entry && pos >= entry.pos && pos <= entry.pos + entry.node.nodeSize) {
                                storage.select({
                                    kind: 'block',
                                    blockId: change.blockId,
                                    action: change.action,
                                    from: entry.pos + 1,
                                })
                                return false
                            }
                        }
                        if (storage.selected) storage.select(null)
                        return false
                    },
                },
            }),
        ]
    },
})
