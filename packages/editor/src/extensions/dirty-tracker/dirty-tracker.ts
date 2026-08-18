import { Extension, JSONContent } from '@tiptap/core'
import { Plugin, PluginKey, Transaction } from '@tiptap/pm/state'
import { Node as ProseMirrorNode } from '@tiptap/pm/model'
import getChangedRanges from '../unique-id/utilities/get-changed-ranges'

// ─── Public Types ────────────────────────────────────────────────────

export interface IncrementalPayload {
  /**
   * Content changes (insert/update/delete) since the last commit. Order is
   * carried inside each block's `attrs.rank` (see the BlockRank extension), so
   * a move is just an upsert of the moved block — there is no separate order
   * payload and no full block-id list.
   */
  changes: BlockChange[]
}

export interface BlockChange {
  action: 'upsert' | 'delete'
  blockId: string
  type?: string
  content?: JSONContent
  attrs?: Record<string, unknown>
  prevVersion?: number
}

export interface DirtyTrackerOptions {
  blockIdAttribute: string
  filterTransaction: (tr: Transaction) => boolean
}

export interface DirtyTrackerStorage {
  initialized: boolean
  /**
   * Top-level block ids in document order, as of the last successful save.
   * Used to detect deletions and reorders without re-serialising the doc.
   */
  committedOrder: string[]
  /**
   * Committed `attrs.rank` per top-level block (blockId -> rank). A move only
   * changes the moved block's rank (see the BlockRank extension), so comparing
   * current vs committed rank reliably detects moves even when ProseMirror's
   * native drag-drop reuses the moved node object (which defeats the
   * reference-diff below).
   */
  committedRanks: Map<string, string>
  /**
   * Ids of top-level blocks whose content changed (insert/update) since the
   * last commit. Maintained incrementally per-transaction — this is what makes
   * save cost proportional to the edit, not to document size.
   */
  dirtyBlockIds: Set<string>
  /** Optimization hint — flipped true on any user-origin doc-changing tx. */
  dirty: boolean
  /** Latest backend version per block (blockId -> version). */
  blockVersions: Map<string, number>
  /** Currently-registered idle callback (set by `subscribeIdle`). */
  idleCallback: (() => void) | null
  idleDebounceMs: number
  idleTimer: ReturnType<typeof setTimeout> | null

  hasDirty(): boolean
  getPayload(): IncrementalPayload
  commit(): void
  /**
   * Partial commit — used when a large save is split into batches and only some
   * batches succeeded. Clears the succeeded ids from the dirty set and updates
   * the committed baseline for them ONLY, leaving failed blocks dirty (and failed
   * deletions still in `committedOrder`) so the next save retries exactly them.
   * Unlike `commit()`, it does NOT re-baseline the whole document.
   */
  commitBlocks(succeededUpsertIds: string[], succeededDeleteIds: string[]): void
  applyServerVersions(versions: Record<string, number>): void
  /**
   * Register a callback invoked `debounceMs` after the last doc-changing
   * ProseMirror transaction. Returns an unsubscribe function. Replaces any
   * previous registration.
   */
  subscribeIdle(callback: () => void, debounceMs: number): () => void
  /** Cancel any pending idle timer (used before manual `saveNow`). */
  cancelIdle(): void
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Resolve a top-level block's stable id. The configured attribute (`id`) is
 * tried first, then `blockId` as a fallback — different node types in this
 * editor carry their identity under one or the other, and reading the wrong
 * one silently makes the diff track nothing.
 */
function resolveBlockId(node: ProseMirrorNode, attr: string): string | undefined {
  return (node.attrs[attr] ?? node.attrs.id ?? node.attrs.blockId) as string | undefined
}

/** Ordered list of top-level block ids — a cheap attribute-only walk. */
function blockOrderOf(doc: ProseMirrorNode, attr: string): string[] {
  const ids: string[] = []
  doc.forEach(node => {
    const id = resolveBlockId(node, attr)
    if (id) ids.push(id)
  })
  return ids
}

/** Snapshot of each top-level block's `attrs.rank` (cheap attribute-only walk). */
function rankSnapshot(doc: ProseMirrorNode, attr: string): Map<string, string> {
  const ranks = new Map<string, string>()
  doc.forEach(node => {
    const id = resolveBlockId(node, attr)
    const rank = node.attrs.rank as string | undefined
    if (id && rank != null) ranks.set(id, rank)
  })
  return ranks
}

/**
 * Map an absolute document position to the index of the top-level (depth-1)
 * block that owns it. `ResolvedPos.index(0)` returns the child index the
 * position falls into; for a position on a boundary between two blocks it
 * returns the block to the *right*. Callers bias the end of a range by `-1`
 * (see `markChangedTopBlocks`) so a range's end is attributed to the block it
 * actually touches rather than the untouched next block. O(tree depth), not
 * O(block count). Result is NOT clamped — callers clamp to a valid child index.
 */
function topIndexAt(doc: ProseMirrorNode, pos: number): number {
  const clamped = Math.max(0, Math.min(pos, doc.content.size))
  return doc.resolve(clamped).index(0)
}

/**
 * Call `visit` once for every top-level block touched by `tr`.
 *
 * This is the heart of the O(edit-size) tracking: instead of walking the
 * document we ask `getChangedRanges(tr)` for the (new-doc) position ranges the
 * transaction's steps actually altered — O(steps) — and map each range's
 * endpoints to top-level block indices via `topIndexAt`. A typical keystroke
 * yields one range spanning one block.
 */
function forEachChangedTopBlock(
  tr: Transaction,
  newDoc: ProseMirrorNode,
  visit: (node: ProseMirrorNode) => void,
): void {
  const childCount = newDoc.childCount
  if (childCount === 0) return
  const lastIndex = childCount - 1
  for (const range of getChangedRanges(tr)) {
    let from = topIndexAt(newDoc, range.newStart)
    // Bias the end left by one position so a range ending on a block boundary
    // is attributed to the block whose content ends there, not the next block.
    let to = topIndexAt(newDoc, Math.max(range.newStart, range.newEnd - 1))
    if (from > to) { const t = from; from = to; to = t }
    from = Math.max(0, Math.min(from, lastIndex))
    to = Math.max(0, Math.min(to, lastIndex))
    for (let i = from; i <= to; i++) visit(newDoc.child(i))
  }
}

/**
 * Add the ids of every top-level block touched by `tr` to `dirtyBlockIds`.
 *
 * Newly-inserted blocks have no id yet at insert time (UniqueID assigns ids in a
 * *separate* appended transaction). That appended tx's `setNodeMarkup` step
 * covers the new block's position, so when `apply` runs for it this function
 * marks the block once its id exists — no special-casing needed here.
 */
function markChangedTopBlocks(
  tr: Transaction,
  newDoc: ProseMirrorNode,
  attr: string,
  dirtyBlockIds: Set<string>,
): void {
  forEachChangedTopBlock(tr, newDoc, node => {
    const id = resolveBlockId(node, attr)
    if (id) dirtyBlockIds.add(id)
  })
}

/**
 * Fold the blocks carried by a *remote* (collaboration) transaction into the
 * committed baseline.
 *
 * Content that arrives over Yjs is by definition already persisted by the
 * client that authored it, so it belongs in the baseline. This is not an
 * optimisation — it is load-bearing:
 *
 *   - The baseline is snapshotted once, when saving turns on. With a
 *     collaboration provider `onContentReady` fires as soon as the editor
 *     exists (the Y.Doc is the source of truth, so nothing is loaded through
 *     `setContent`), which is *before* the Yjs sync populates the document — so
 *     that snapshot is taken on an empty document.
 *   - Deletions are derived as "in `committedOrder`, absent from the doc now".
 *     A block that never made it into `committedOrder` therefore can never
 *     produce a delete op: the user deletes it, nothing is sent, the row stays
 *     in the database and the block reappears on the next reload.
 *   - `committedRanks` has the same problem in the other direction: with no
 *     baseline rank, *every* synced block looks moved and gets re-upserted on
 *     the first save, making each save O(document) instead of O(edit).
 */
function foldRemoteBlocksIntoBaseline(
  tr: Transaction,
  newDoc: ProseMirrorNode,
  attr: string,
  storage: DirtyTrackerStorage,
): void {
  const known = new Set(storage.committedOrder)
  let added: string[] | null = null
  forEachChangedTopBlock(tr, newDoc, node => {
    const id = resolveBlockId(node, attr)
    if (!id) return
    const rank = node.attrs.rank as string | undefined
    if (rank != null) storage.committedRanks.set(id, rank)
    if (known.has(id)) return
    known.add(id)
    ;(added ??= []).push(id)
  })
  if (added) storage.committedOrder = storage.committedOrder.concat(added)
}

// ─── Extension ───────────────────────────────────────────────────────

const dirtyTrackerViewPluginKey = new PluginKey('dirtyTrackerView')

/**
 * Block-level dirty tracker — incremental change tracking with a ProseMirror
 * view-plugin idle trigger.
 *
 * The previous implementation rebuilt a full `blockId -> JSON signature`
 * snapshot of the *entire document* on every save and diffed it. That made
 * each save O(document size) — fatal for very large documents. This version
 * instead maintains a `dirtyBlockIds` set incrementally:
 *
 *   - A ProseMirror plugin's `state.apply` runs for every transaction (including
 *     the UniqueID extension's appended id-assignment transaction). It diffs the
 *     top-level children of the old vs new doc by *node reference* — ProseMirror
 *     preserves the identity of untouched nodes, so only the edited block (and
 *     any newly inserted block) yields a fresh reference. Their ids are added to
 *     `dirtyBlockIds`. This is O(top-level block count) per transaction (cheap,
 *     no serialisation) and is robust to deferred id assignment.
 *   - `getPayload()` serialises *only* the dirty blocks, derives deletions and
 *     reorders from a cheap ordered-id walk, and never calls `toJSON()` on an
 *     unchanged block.
 *   - `commit()` clears the dirty set and snapshots the new committed order.
 *
 * The idle trigger uses a PM view plugin (fires on every PM state update,
 * bypassing Tiptap's `update` event which can be suppressed by
 * `setContent({emitUpdate:false})` and is unreliable in the collab setup).
 */
export const DirtyTracker = Extension.create<DirtyTrackerOptions, DirtyTrackerStorage>({
  name: 'dirtyTracker',
  priority: 50,

  addOptions() {
    return {
      // Primary id attribute; `resolveBlockId` also falls back to `blockId`.
      blockIdAttribute: 'id',
      filterTransaction: () => true,
    }
  },

  addStorage() {
    return {
      initialized: false,
      committedOrder: [],
      committedRanks: new Map<string, string>(),
      dirtyBlockIds: new Set<string>(),
      dirty: false,
      blockVersions: new Map<string, number>(),
      idleCallback: null,
      idleDebounceMs: 3000,
      idleTimer: null,
      hasDirty() { return false },
      getPayload() { return { changes: [] } },
      commit() {},
      commitBlocks(_up: string[], _del: string[]) {},
      applyServerVersions(_versions: Record<string, number>) {},
      subscribeIdle(_cb: () => void, _ms: number) { return () => {} },
      cancelIdle() {},
    }
  },

  onCreate() {
    const { blockIdAttribute } = this.options
    const storage = this.storage

    storage.committedOrder = blockOrderOf(this.editor.state.doc, blockIdAttribute)
    storage.committedRanks = rankSnapshot(this.editor.state.doc, blockIdAttribute)
    storage.dirtyBlockIds = new Set<string>()
    storage.dirty = false

    storage.hasDirty = () => storage.dirty

    storage.getPayload = (): IncrementalPayload => {
      const doc = this.editor.state.doc

      // Single cheap pass (attribute-only): current id set, id -> node index,
      // and the set of blocks whose rank changed since the last commit. The rank
      // comparison catches moves that the reference-diff misses (native drag-drop
      // reuses the moved node object, so its reference is unchanged).
      const currentSet = new Set<string>()
      const nodeById = new Map<string, ProseMirrorNode>()
      const upsertIds = new Set<string>(storage.dirtyBlockIds)
      let duplicateIdCount = 0
      doc.forEach(node => {
        const id = resolveBlockId(node, blockIdAttribute)
        if (!id) return
        // Two top-level nodes sharing a blockId means the document is already
        // corrupt (only one of them can ever be persisted, and a delete of
        // either is invisible here because the id is still present). Keep the
        // FIRST occurrence so the serialised block is at least deterministic
        // across saves, and make the corruption loud instead of silent.
        if (currentSet.has(id)) {
          duplicateIdCount += 1
          return
        }
        currentSet.add(id)
        nodeById.set(id, node)
        const rank = node.attrs.rank as string | undefined
        if (rank != null && rank !== storage.committedRanks.get(id)) {
          upsertIds.add(id) // moved (or newly ranked) — rank differs from baseline
        }
      })
      if (duplicateIdCount > 0) {
        console.warn(
          `[dirty-tracker] ${duplicateIdCount} top-level block(s) share a blockId with an earlier block; ` +
            'only the first occurrence is saved. This indicates a duplicated block in the document.'
        )
      }
      const changes: BlockChange[] = []

      // Deletions: present in committed order, absent now.
      for (const id of storage.committedOrder) {
        if (!currentSet.has(id)) {
          changes.push({ action: 'delete', blockId: id })
        }
      }

      // Upserts: dirty (content-changed) + rank-changed (moved) blocks that still
      // exist. Only these are serialised — cost stays proportional to the edit.
      for (const id of upsertIds) {
        const node = nodeById.get(id)
        if (!node) continue // deleted before save — covered by deletion pass
        const json = node.toJSON() as JSONContent
        changes.push({
          action: 'upsert',
          blockId: id,
          type: json.type ?? node.type.name,
          content: json.content as unknown as JSONContent | undefined,
          attrs: json.attrs,
          prevVersion: storage.blockVersions.get(id) ?? undefined,
        })
      }

      return { changes }
    }

    storage.commit = () => {
      storage.committedOrder = blockOrderOf(this.editor.state.doc, blockIdAttribute)
      storage.committedRanks = rankSnapshot(this.editor.state.doc, blockIdAttribute)
      storage.dirtyBlockIds.clear()
      storage.dirty = false
    }

    storage.commitBlocks = (succeededUpsertIds: string[], succeededDeleteIds: string[]) => {
      // O(N + succeeded): snapshot current ranks once, mutate the committed
      // baseline through a Set so membership ops aren't O(N) each.
      const doc = this.editor.state.doc
      const rankById = rankSnapshot(doc, blockIdAttribute)
      const orderSet = new Set(storage.committedOrder)
      for (const id of succeededUpsertIds) {
        storage.dirtyBlockIds.delete(id)
        const rank = rankById.get(id)
        if (rank != null) storage.committedRanks.set(id, rank)
        orderSet.add(id) // now committed — must not look like a deletion later
      }
      for (const id of succeededDeleteIds) {
        storage.dirtyBlockIds.delete(id)
        storage.committedRanks.delete(id)
        orderSet.delete(id) // deletion acked — stop reporting it
      }
      // Failed upserts stay in dirtyBlockIds; failed deletions stay in
      // committedOrder (absent from the doc → re-detected next getPayload).
      storage.committedOrder = Array.from(orderSet)
      storage.dirty = storage.dirtyBlockIds.size > 0
    }

    storage.applyServerVersions = (versions: Record<string, number>) => {
      for (const [blockId, version] of Object.entries(versions)) {
        if (version != null) {
          storage.blockVersions.set(blockId, version)
        }
      }
    }

    storage.subscribeIdle = (callback: () => void, debounceMs: number) => {
      storage.idleCallback = callback
      storage.idleDebounceMs = debounceMs
      return () => {
        if (storage.idleCallback === callback) {
          storage.idleCallback = null
        }
        if (storage.idleTimer != null) {
          clearTimeout(storage.idleTimer)
          storage.idleTimer = null
        }
      }
    }

    storage.cancelIdle = () => {
      if (storage.idleTimer != null) {
        clearTimeout(storage.idleTimer)
        storage.idleTimer = null
      }
    }

    storage.initialized = true
  },

  addProseMirrorPlugins() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const ext = this
    const { blockIdAttribute } = this.options
    return [
      new Plugin({
        key: dirtyTrackerViewPluginKey,

        // Per-transaction incremental dirty tracking. `apply` runs for EVERY
        // transaction in a dispatch — including UniqueID's appended id-assignment
        // transaction — so freshly-inserted blocks are captured once their id
        // exists. We derive the touched top-level blocks from the transaction's
        // changed ranges (O(steps)), never walking the whole document — this is
        // what keeps per-keystroke cost proportional to the edit, not the doc.
        state: {
          init: () => null,
          apply: (tr, _value, _oldState, newState) => {
            const storage = ext.storage
            if (!storage.initialized) return _value
            if (!tr.docChanged) return _value
            // Only user-origin edits count as dirty; remote/collab edits are
            // saved by the client that authored them — but they must still join
            // the committed baseline, or they can never be deleted from here.
            if (!ext.options.filterTransaction(tr)) {
              foldRemoteBlocksIntoBaseline(tr, newState.doc, blockIdAttribute, storage)
              return _value
            }

            markChangedTopBlocks(tr, newState.doc, blockIdAttribute, storage.dirtyBlockIds)
            storage.dirty = true
            return _value
          },
        },

        view() {
          return {
            update(view, prevState) {
              // Doc identity check — selection-only updates are skipped.
              if (view.state.doc === prevState.doc) return
              const storage = ext.storage
              if (!storage.initialized) return
              if (!storage.idleCallback) return

              if (storage.idleTimer != null) {
                clearTimeout(storage.idleTimer)
              }
              storage.idleTimer = setTimeout(() => {
                storage.idleTimer = null
                storage.idleCallback?.()
              }, storage.idleDebounceMs)
            },
            destroy() {
              const storage = ext.storage
              if (storage && storage.idleTimer != null) {
                clearTimeout(storage.idleTimer)
                storage.idleTimer = null
              }
            },
          }
        },
      }),
    ]
  },
})
