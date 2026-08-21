import { Extension, JSONContent } from '@tiptap/core'
import { Plugin, PluginKey, Transaction } from '@tiptap/pm/state'
import { Node as ProseMirrorNode } from '@tiptap/pm/model'
import getChangedRanges from '../unique-id/utilities/get-changed-ranges'
import { deriveOps } from './derive-ops'
import type { BlockOp } from './derive-ops'
import { mergeServerDoc, readServerBlocks } from './merge-server-doc'

export type { BlockOp, BlockOpKind, BlockOpPos } from './derive-ops'
export { deriveOps } from './derive-ops'
export { mergeServerDoc, readServerBlocks } from './merge-server-doc'
export type { MergeInput, MergePlan } from './merge-server-doc'

/**
 * Marks a transaction as "this change is already in the database".
 *
 * Set on the transaction that folds a server-side write back into the document,
 * and honoured by the tracker's plugin so those blocks never become dirty. It is
 * exported because more than one place has to recognise it — the tracker itself
 * and the save hook's own dirty-flag listener — and a listener that missed it
 * would send the server's changes straight back to the server as ops.
 */
export const OP_TRACKER_ABSORB = 'opTrackerAbsorb'

/** What a catch-up actually did, for the log line that follows it. */
export interface AbsorbSummary {
  /** Blocks the server had and we did not. */
  inserted: number
  /** Blocks the server no longer has. */
  removed: number
  /** Blocks whose content came from the server. */
  replaced: number
  /** Blocks reordered to match the server. */
  moved: number
  /**
   * Blocks kept that the server does not have: unsaved local inserts, and local
   * edits that outranked a server delete. Non-zero means the next save has work
   * to do, which is the normal outcome — writing was suspended, so there is
   * almost always something waiting.
   */
  localOnly: number
}

/**
 * A batch of ops plus what the tracker needs to know to commit it safely.
 *
 * `order` and `seqs` are captured when the batch is produced, not when it is
 * acknowledged. That distinction is the whole point: the document keeps changing
 * while the request is in flight, and committing against *current* state would
 * silently discard those edits.
 */
export interface OpBatch {
  ops: BlockOp[]
  /** The document order the server will be at once this batch applies. */
  order: string[]
  /** Per-block mutation counter as of batch creation. */
  seqs: Map<string, number>
}

/**
 * A whole-document submission, for the reconcile path.
 *
 * It carries `order` and `seqs` for the same reason {@link OpBatch} does. It is
 * tempting to just re-derive the baseline from the live document once the server
 * answers — that is what a naive `resetBaseline()` after reconcile would do — but
 * that marks edits made *during* the round trip as saved when the server never
 * received them.
 */
export interface ReconcileSnapshot {
  doc: JSONContent
  order: string[]
  seqs: Map<string, number>
}

export interface OpTrackerOptions {
  blockIdAttribute: string
  /**
   * Which transactions count as changes to persist.
   *
   * The default accepts **everything, local and remote alike** — the opposite of
   * the old dirty tracker, which only tracked its own author's edits. Under the
   * session model exactly one client (the host) writes the database, so it has to
   * persist collaborators' edits too. If it filtered remote transactions out,
   * every collaborator's work would be dropped on the floor.
   */
  filterTransaction: (tr: Transaction) => boolean
}

export interface OpTrackerStorage {
  initialized: boolean
  /**
   * Whether this client persists at all. Only the session host sets this. A
   * collaborator leaves it false and therefore accumulates nothing — "a
   * collaborator writes zero bytes to the database" is structural here, not a
   * rule someone has to remember to follow.
   */
  enabled: boolean
  /**
   * Top-level block ids in document order as of the last acknowledged write.
   * Deletions and moves are both derived from this, so it must only ever be
   * advanced to a state the server has actually confirmed.
   */
  baselineOrder: string[]
  /**
   * blockId -> mutation counter. A counter rather than a set membership so an
   * edit that lands *while a save is in flight* can be distinguished from the
   * edit that save is persisting.
   */
  dirtyBlocks: Map<string, number>
  /** Monotonic counter, bumped once per tracked transaction. */
  seq: number
  dirty: boolean
  /**
   * Set when the tracker can no longer trust its own baseline, which makes the
   * next write a full reconcile instead of an op batch. Reaching for reconcile
   * is deliberate: it is idempotent and free on an aligned document, so using it
   * as the sink for every uncertain case costs nothing and removes a whole class
   * of "clever incremental repair" bugs.
   */
  needsReconcile: boolean

  hasDirty(): boolean
  /** The pending batch, or null when there is nothing to send. */
  getBatch(): OpBatch | null
  /** The whole document, for the reconcile path. */
  getDoc(): JSONContent
  /** The whole document plus the bookkeeping needed to commit it safely. */
  getReconcile(): ReconcileSnapshot
  /**
   * Acknowledge a batch the server fully applied. Advances the baseline to the
   * batch's order and clears only those dirty entries whose counter has not
   * moved since — anything edited during the round trip stays dirty.
   */
  commitBatch(batch: OpBatch): void
  /**
   * Acknowledge a reconcile the server applied. Same in-flight safety as
   * {@link commitBatch}, and additionally clears the reconcile demand: the
   * document and the database are now known to agree, so the next write can go
   * back to being an op batch.
   */
  commitReconcile(snapshot: ReconcileSnapshot): void
  /** Give up on incremental tracking; the next write reconciles. */
  requireReconcile(): void
  /**
   * Re-baseline from the current document and drop all pending state. Valid only
   * straight after a successful reconcile or a fresh load, when the document and
   * the database are known to agree.
   */
  resetBaseline(): void
  /**
   * Fold a server-side write into the live document, without producing ops for
   * it. Returns null when the merge was refused, in which case the document is
   * untouched and writing stays suspended.
   */
  absorbServerDoc(serverDoc: JSONContent): AbsorbSummary | null

  subscribeIdle(callback: () => void, debounceMs: number): () => void
  cancelIdle(): void
  idleCallback: (() => void) | null
  idleDebounceMs: number
  idleTimer: ReturnType<typeof setTimeout> | null
}

// ─── Helpers ─────────────────────────────────────────────────────────

function resolveBlockId(node: ProseMirrorNode, attr: string): string | undefined {
  return (node.attrs[attr] ?? node.attrs.id ?? node.attrs.blockId) as string | undefined
}

/**
 * Top-level block ids in document order, duplicates dropped.
 *
 * A duplicate id means the document is already corrupt. The first occurrence
 * wins so the op stream is at least deterministic across saves; the copy is
 * neither sent nor renamed. Renaming would turn one repairable duplicate into
 * two legitimate blocks, which nothing downstream could ever tell apart.
 */
function orderOf(doc: ProseMirrorNode, attr: string): { order: string[]; nodeById: Map<string, ProseMirrorNode>; duplicates: number } {
  const order: string[] = []
  const nodeById = new Map<string, ProseMirrorNode>()
  let duplicates = 0
  doc.forEach(node => {
    const id = resolveBlockId(node, attr)
    if (!id) return
    if (nodeById.has(id)) {
      duplicates += 1
      return
    }
    order.push(id)
    nodeById.set(id, node)
  })
  return { order, nodeById, duplicates }
}

function topIndexAt(doc: ProseMirrorNode, pos: number): number {
  const clamped = Math.max(0, Math.min(pos, doc.content.size))
  return doc.resolve(clamped).index(0)
}

/**
 * Locate a top-level block by id in a document, or null.
 *
 * Positions are recomputed from the live document on every lookup rather than
 * mapped through the transaction. That is O(n) per lookup and therefore O(n·k)
 * for k changes, which is the right trade here: k is the size of one server-side
 * write — a handful of blocks — and position mapping through a transaction that
 * is itself deleting and inserting nodes is exactly the kind of arithmetic that
 * is wrong in one direction only and silently corrupts a document.
 */
function findTop(
  doc: ProseMirrorNode,
  id: string,
  attr: string,
): { index: number; pos: number; node: ProseMirrorNode } | null {
  let pos = 0
  for (let i = 0; i < doc.childCount; i++) {
    const child = doc.child(i)
    if (resolveBlockId(child, attr) === id) return { index: i, pos, node: child }
    pos += child.nodeSize
  }
  return null
}

/** Document position at which the top-level block of the given index starts. */
function posAtIndex(doc: ProseMirrorNode, index: number): number {
  let pos = 0
  for (let i = 0; i < index && i < doc.childCount; i++) pos += doc.child(i).nodeSize
  return pos
}

/**
 * Visit every top-level block the transaction actually touched.
 *
 * Derived from the transaction's changed ranges — O(steps) — so a keystroke
 * costs one block, not one document. This is what keeps typing in a large page
 * from getting slower as the page grows.
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
    // Bias the end left so a range ending on a block boundary is attributed to
    // the block whose content ends there, not the untouched next block.
    let to = topIndexAt(newDoc, Math.max(range.newStart, range.newEnd - 1))
    if (from > to) { const t = from; from = to; to = t }
    from = Math.max(0, Math.min(from, lastIndex))
    to = Math.max(0, Math.min(to, lastIndex))
    for (let i = from; i <= to; i++) visit(newDoc.child(i))
  }
}

// ─── Extension ───────────────────────────────────────────────────────

const opTrackerPluginKey = new PluginKey('opTracker')

/**
 * Derives an **op sequence** from ProseMirror transactions.
 *
 * This replaces the dirty tracker, and the difference is not cosmetic. The old
 * tracker emitted "these blocks now look like this" and the server overwrote
 * whatever it had. Order travelled as a rank attribute smuggled inside content,
 * so the server could not validate it, could not record a move on its own, and
 * could not tell a move apart from an edit.
 *
 * Here the two are separate ops. A move carries no content; a replace carries no
 * position. That is what lets the server keep rank authority and lets history
 * record "this block moved" as a fact rather than inferring it from a diff.
 *
 * This extension is the ProseMirror plumbing only: which blocks changed, when to
 * fire, how to commit safely. The derivation of the op sequence itself lives in
 * {@link deriveOps}, where it is a pure function and can be reasoned about
 * without an editor.
 */
export const OpTracker = Extension.create<OpTrackerOptions, OpTrackerStorage>({
  name: 'opTracker',
  priority: 50,

  addOptions() {
    return {
      blockIdAttribute: 'id',
      filterTransaction: () => true,
    }
  },

  addStorage() {
    return {
      initialized: false,
      enabled: false,
      baselineOrder: [],
      dirtyBlocks: new Map<string, number>(),
      seq: 0,
      dirty: false,
      needsReconcile: false,
      hasDirty() { return false },
      getBatch() { return null },
      getDoc() { return { type: 'doc' } },
      getReconcile() { return { doc: { type: 'doc' }, order: [], seqs: new Map<string, number>() } },
      commitBatch(_batch: OpBatch) {},
      commitReconcile(_snapshot: ReconcileSnapshot) {},
      requireReconcile() {},
      resetBaseline() {},
      absorbServerDoc(_serverDoc: JSONContent) { return null },
      subscribeIdle(_cb: () => void, _ms: number) { return () => {} },
      cancelIdle() {},
      idleCallback: null,
      idleDebounceMs: 3000,
      idleTimer: null,
    }
  },

  onCreate() {
    const { blockIdAttribute } = this.options
    const storage = this.storage

    storage.hasDirty = () => storage.dirty || storage.needsReconcile

    storage.getDoc = () => this.editor.state.doc.toJSON() as JSONContent

    storage.getReconcile = (): ReconcileSnapshot => {
      const doc = this.editor.state.doc
      // Duplicates are dropped from `order` but left in `doc`. That is the point
      // of reconciling: the server flattens the document it is given, drops the
      // duplicate itself, and the baseline we adopt afterwards describes the
      // result rather than the corruption we sent.
      const { order } = orderOf(doc, blockIdAttribute)
      return {
        doc: doc.toJSON() as JSONContent,
        order,
        seqs: new Map(storage.dirtyBlocks),
      }
    }

    storage.getBatch = (): OpBatch | null => {
      const doc = this.editor.state.doc
      const { order, nodeById, duplicates } = orderOf(doc, blockIdAttribute)
      if (duplicates > 0) {
        // Loud, and it forces a reconcile: the server drops duplicates when it
        // flattens, so reconciling is what actually converges the page.
        console.warn(
          `[op-tracker] ${duplicates} duplicate top-level blockId(s); reconciling instead of sending ops.`
        )
        storage.needsReconcile = true
        return null
      }

      const ops = deriveOps({
        order,
        baselineOrder: storage.baselineOrder,
        dirty: new Set(storage.dirtyBlocks.keys()),
        nodeOf: id => nodeById.get(id)!.toJSON() as JSONContent,
      })
      if (ops.length === 0) return null

      // Snapshot the counter of every block this batch touches. Taken here, at
      // batch creation, so `commitBatch` can later tell "this is the edit I
      // saved" from "this arrived while the request was in flight".
      const seqs = new Map<string, number>()
      for (const op of ops) {
        const seq = storage.dirtyBlocks.get(op.blockId)
        if (seq !== undefined) seqs.set(op.blockId, seq)
      }

      return { ops, order, seqs }
    }

    storage.commitBatch = (batch: OpBatch) => {
      storage.baselineOrder = batch.order
      // Only clear what this batch actually persisted. A block edited again
      // while the request was in flight has a higher counter and stays dirty —
      // clearing the whole set here is a data-loss bug this project has already
      // shipped once.
      for (const [id, seq] of batch.seqs) {
        if (storage.dirtyBlocks.get(id) === seq) {
          storage.dirtyBlocks.delete(id)
        }
      }
      storage.dirty = storage.dirtyBlocks.size > 0
    }

    storage.commitReconcile = (snapshot: ReconcileSnapshot) => {
      storage.baselineOrder = snapshot.order
      for (const [id, seq] of snapshot.seqs) {
        if (storage.dirtyBlocks.get(id) === seq) {
          storage.dirtyBlocks.delete(id)
        }
      }
      storage.dirty = storage.dirtyBlocks.size > 0
      storage.needsReconcile = false
    }

    storage.requireReconcile = () => {
      storage.needsReconcile = true
    }

    storage.resetBaseline = () => {
      const { order } = orderOf(this.editor.state.doc, blockIdAttribute)
      storage.baselineOrder = order
      storage.dirtyBlocks.clear()
      storage.dirty = false
      storage.needsReconcile = false
    }

    /**
     * Fold a server-side write back into the live document.
     *
     * During a session the page is still written by things that are not this
     * browser — AI, import, scheduled jobs — and the host learns of it from the
     * heartbeat's rev watermark. Until it catches up it must not write, because
     * its next write would describe a document that never contained those
     * changes and would revert them. This is the catching up.
     *
     * Three decisions are worth spelling out:
     *
     * **It merges, it does not adopt.** Writing is suspended by the time this
     * runs, so the document is holding edits — the host's own and every
     * collaborator's, relayed through Yjs — that the server has never seen.
     * Taking the server's document wholesale would delete exactly the work that
     * could not be saved. The decision table lives in {@link mergeServerDoc}.
     *
     * **It produces no ops.** The transaction carries {@link OP_TRACKER_ABSORB},
     * which the plugin below honours, so none of these blocks become dirty.
     * These changes are in the database already; describing them back to the
     * server would burn a rev per catch-up and write a version history claiming
     * the host made changes it merely received.
     *
     * **It applies minimally.** Each block is changed only where it actually
     * differs, because this document is bound to a Y.Doc: a wholesale replace
     * would drop every collaborator's caret and push the entire page over the
     * wire on every catch-up.
     */
    storage.absorbServerDoc = (serverDoc: JSONContent): AbsorbSummary | null => {
      if (this.editor.isDestroyed) return null

      const state = this.editor.state
      const { order: localOrder, duplicates } = orderOf(state.doc, blockIdAttribute)
      if (duplicates > 0) {
        // Refused rather than reconciled, which is the opposite of what this
        // codebase does everywhere else, and deliberately so: reconciling sends
        // the local document as authoritative, which would revert the very
        // server-side write we came here to pick up. Staying suspended loses
        // nothing — the page stops autosaving until a reload reads it cleanly.
        console.warn(
          `[op-tracker] ${duplicates} duplicate top-level blockId(s) locally; refusing to merge the server document.`,
        )
        return null
      }

      const server = readServerBlocks(serverDoc, blockIdAttribute)
      const plan = mergeServerDoc({
        localOrder,
        serverOrder: server.order,
        baselineOrder: storage.baselineOrder,
        // Read here, after the fetch has returned, so an edit that landed while
        // the request was in flight is still protected from being overwritten.
        dirty: new Set(storage.dirtyBlocks.keys()),
      })

      // Build every node up front. `nodeFromJSON` throws on a node type this
      // build does not have — a block written by a client with a different
      // extension set — and discovering that halfway through would leave the
      // document in a state neither side can describe. Same refusal as above:
      // no reconcile, because that would overwrite the server.
      const built = new Map<string, ProseMirrorNode>()
      try {
        for (const id of [...plan.insert, ...plan.replace]) {
          const json = server.nodeById.get(id)
          if (json) built.set(id, state.schema.nodeFromJSON(json))
        }
      } catch (err) {
        console.error('[op-tracker] server document does not parse against this schema; not merging:', err)
        return null
      }

      const tr = state.tr
      // Not undoable. These are not this user's edits, and letting Ctrl+Z reach
      // them would delete a write the user never made and cannot see.
      tr.setMeta('addToHistory', false)
      tr.setMeta(OP_TRACKER_ABSORB, true)

      let removed = 0
      for (const id of plan.remove) {
        const found = findTop(tr.doc, id, blockIdAttribute)
        if (!found) continue
        tr.delete(found.pos, found.pos + found.node.nodeSize)
        removed += 1
      }

      let replaced = 0
      for (const id of plan.replace) {
        const next = built.get(id)
        if (!next) continue
        const found = findTop(tr.doc, id, blockIdAttribute)
        if (!found) continue
        // Structural comparison rather than JSON equality: the server's copy has
        // been through Jackson and back, so its key order tells us nothing about
        // whether the block changed. Comparing strings would rewrite the whole
        // page on every catch-up.
        if (found.node.eq(next)) continue
        tr.replaceWith(found.pos, found.pos + found.node.nodeSize, next)
        replaced += 1
      }

      let inserted = 0
      let moved = 0
      for (let i = 0; i < plan.order.length; i++) {
        const id = plan.order[i]
        const found = findTop(tr.doc, id, blockIdAttribute)
        if (!found) {
          const node = built.get(id)
          if (!node) continue
          tr.insert(posAtIndex(tr.doc, i), node)
          inserted += 1
          continue
        }
        if (found.index === i) continue
        // Walking left to right, every index below `i` already holds its final
        // block, so a misplaced block is always found *after* where it belongs
        // and detaching it cannot disturb anything already placed. A move has to
        // be delete-then-insert because ProseMirror has no move step; the block
        // keeps its id, which is what preserves its identity, history and
        // comments as far as the server is concerned.
        tr.delete(found.pos, found.pos + found.node.nodeSize)
        tr.insert(posAtIndex(tr.doc, i), found.node)
        moved += 1
      }

      if (tr.docChanged) this.editor.view.dispatch(tr)

      // The baseline becomes the *server's* order, not the merged order: that is
      // what the database holds at this rev. Everything the merge kept against
      // it — an unsaved insert, a local edit that outranked a server delete — is
      // then exactly the difference `deriveOps` describes on the next save, so
      // the catch-up leaves the client in a state it can write from. Leaves
      // `dirtyBlocks` untouched on purpose: those edits are still unsaved, and
      // clearing them here is the same data-loss bug as clearing the whole dirty
      // set in `commitBatch`.
      storage.baselineOrder = server.order

      const localOnly = plan.order.reduce(
        (n, id) => (server.nodeById.has(id) ? n : n + 1),
        0,
      )
      return { inserted, removed, replaced, moved, localOnly }
    }

    storage.subscribeIdle = (callback: () => void, debounceMs: number) => {
      storage.idleCallback = callback
      storage.idleDebounceMs = debounceMs
      return () => {
        if (storage.idleCallback === callback) storage.idleCallback = null
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

    storage.baselineOrder = orderOf(this.editor.state.doc, blockIdAttribute).order
    storage.initialized = true
  },

  addProseMirrorPlugins() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const ext = this
    const { blockIdAttribute } = this.options
    return [
      new Plugin({
        key: opTrackerPluginKey,

        state: {
          init: () => null,
          apply: (tr, value, _oldState, newState) => {
            const storage = ext.storage
            if (!storage.initialized) return value
            // A collaborator tracks nothing at all.
            if (!storage.enabled) return value
            if (!tr.docChanged) return value
            // A server-side write being folded back in. Already in the database,
            // so marking these blocks dirty would describe them back to the
            // server as if the host had made them.
            if (tr.getMeta(OP_TRACKER_ABSORB)) return value
            if (!ext.options.filterTransaction(tr)) return value

            const seq = ++storage.seq
            forEachChangedTopBlock(tr, newState.doc, node => {
              const id = resolveBlockId(node, blockIdAttribute)
              if (id) storage.dirtyBlocks.set(id, seq)
            })
            storage.dirty = true
            return value
          },
        },

        view() {
          return {
            update(view, prevState) {
              if (view.state.doc === prevState.doc) return
              const storage = ext.storage
              if (!storage.initialized || !storage.enabled) return
              if (!storage.idleCallback) return

              if (storage.idleTimer != null) clearTimeout(storage.idleTimer)
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
