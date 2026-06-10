import { Extension, JSONContent } from '@tiptap/core'
import { Plugin, PluginKey, Transaction } from '@tiptap/pm/state'
import { Node as ProseMirrorNode } from '@tiptap/pm/model'

// ─── Public Types ────────────────────────────────────────────────────

export interface IncrementalPayload {
  /** All top-level block ids, in document order. */
  blockOrder: string[]
  /** Content changes (insert/update/delete) since the last commit. */
  changes: BlockChange[]
  /**
   * True when `blockOrder` differs from the committed order (a block was
   * moved/reordered) — even if no block's *content* changed. The save path
   * must not skip a patch that only changes order.
   */
  orderChanged: boolean
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

/** Ordered list of top-level block ids — a cheap attribute-only walk. */
function blockOrderOf(doc: ProseMirrorNode, attr: string): string[] {
  const ids: string[] = []
  doc.forEach(node => {
    const id = node.attrs[attr]
    if (id) ids.push(id)
  })
  return ids
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
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
      // Must match the UniqueID extension's `attributeName` (`blockId`),
      // otherwise the diff keys on an attribute ordinary blocks never carry.
      blockIdAttribute: 'blockId',
      filterTransaction: () => true,
    }
  },

  addStorage() {
    return {
      initialized: false,
      committedOrder: [],
      dirtyBlockIds: new Set<string>(),
      dirty: false,
      blockVersions: new Map<string, number>(),
      idleCallback: null,
      idleDebounceMs: 3000,
      idleTimer: null,
      hasDirty() { return false },
      getPayload() { return { blockOrder: [], changes: [], orderChanged: false } },
      commit() {},
      applyServerVersions(_versions: Record<string, number>) {},
      subscribeIdle(_cb: () => void, _ms: number) { return () => {} },
      cancelIdle() {},
    }
  },

  onCreate() {
    const { blockIdAttribute } = this.options
    const storage = this.storage

    storage.committedOrder = blockOrderOf(this.editor.state.doc, blockIdAttribute)
    storage.dirtyBlockIds = new Set<string>()
    storage.dirty = false

    storage.hasDirty = () => storage.dirty

    storage.getPayload = (): IncrementalPayload => {
      const doc = this.editor.state.doc

      // Single cheap pass: ordered ids + id -> node index. No serialisation.
      const currentOrder: string[] = []
      const nodeById = new Map<string, ProseMirrorNode>()
      doc.forEach(node => {
        const id = node.attrs[blockIdAttribute]
        if (id) {
          currentOrder.push(id)
          nodeById.set(id, node)
        }
      })
      const currentSet = new Set(currentOrder)
      const changes: BlockChange[] = []

      // Deletions: present in committed order, absent now.
      for (const id of storage.committedOrder) {
        if (!currentSet.has(id)) {
          changes.push({ action: 'delete', blockId: id })
        }
      }

      // Upserts: only the dirty blocks that still exist. Serialise just these.
      for (const id of storage.dirtyBlockIds) {
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

      const orderChanged = !arraysEqual(storage.committedOrder, currentOrder)

      return { blockOrder: currentOrder, changes, orderChanged }
    }

    storage.commit = () => {
      storage.committedOrder = blockOrderOf(this.editor.state.doc, blockIdAttribute)
      storage.dirtyBlockIds.clear()
      storage.dirty = false
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
        // exists. We diff top-level children by node reference: ProseMirror keeps
        // the identity of untouched nodes, so only changed/new blocks appear.
        state: {
          init: () => null,
          apply: (tr, _value, oldState, newState) => {
            const storage = ext.storage
            if (!storage.initialized) return _value
            if (!tr.docChanged) return _value
            // Only user-origin edits count as dirty; remote/collab edits are
            // saved by the client that authored them.
            if (!ext.options.filterTransaction(tr)) return _value

            const oldRefs = new Set<ProseMirrorNode>()
            oldState.doc.forEach(node => oldRefs.add(node))
            newState.doc.forEach(node => {
              if (!oldRefs.has(node)) {
                const id = node.attrs[blockIdAttribute]
                if (id) storage.dirtyBlockIds.add(id)
              }
            })
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
