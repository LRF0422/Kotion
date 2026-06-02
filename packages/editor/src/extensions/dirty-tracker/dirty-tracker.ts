import { Extension, JSONContent } from '@tiptap/core'
import { Plugin, PluginKey, Transaction } from '@tiptap/pm/state'
import { Node as ProseMirrorNode } from '@tiptap/pm/model'

// ─── Public Types ────────────────────────────────────────────────────

export interface IncrementalPayload {
  blockOrder: string[]
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

/**
 * Frozen description of one top-level block at a known-clean state.
 * `signature` is a deterministic JSON fingerprint used for O(1) equality
 * checks during the on-idle diff.
 */
interface BlockSnapshot {
  type: string
  attrs: Record<string, unknown> | undefined
  content: JSONContent | undefined
  signature: string
}

export interface DirtyTrackerStorage {
  initialized: boolean
  /**
   * Last-committed top-level blocks, keyed by blockId. Updated by
   * `commit()` after a successful save.
   */
  committedSnapshot: Map<string, BlockSnapshot>
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

/**
 * Deterministic content fingerprint. ProseMirror's `node.toJSON()` always
 * emits keys in a stable order (type, attrs, content, marks, text), so its
 * stringification can be used directly as a signature without extra
 * canonicalisation.
 */
function signatureOf(node: ProseMirrorNode): string {
  return JSON.stringify(node.toJSON())
}

function buildSnapshot(doc: ProseMirrorNode, attr: string): Map<string, BlockSnapshot> {
  const snapshot = new Map<string, BlockSnapshot>()
  doc.forEach(node => {
    const id = node.attrs[attr]
    if (!id) return
    const json = node.toJSON() as JSONContent
    snapshot.set(id, {
      type: json.type ?? node.type.name,
      attrs: json.attrs,
      content: json.content as unknown as JSONContent | undefined,
      signature: signatureOf(node),
    })
  })
  return snapshot
}

function blockOrderOf(doc: ProseMirrorNode, attr: string): string[] {
  const ids: string[] = []
  doc.forEach(node => {
    const id = node.attrs[attr]
    if (id) ids.push(id)
  })
  return ids
}

// ─── Extension ───────────────────────────────────────────────────────

const dirtyTrackerViewPluginKey = new PluginKey('dirtyTrackerView')

/**
 * Block-level dirty tracker — snapshot-diff strategy with a ProseMirror
 * view-plugin trigger.
 *
 * Save scheduling does NOT rely on Tiptap's `update` event (which can be
 * suppressed by `setContent({emitUpdate: false})` and has been observed to
 * occasionally not fire in this codebase's collaborative setup). Instead a
 * ProseMirror plugin's `view.update` is used — that is fundamental PM core
 * and fires on every state update with no Tiptap-level filtering.
 *
 * Pipeline:
 *   1. `onCreate` captures the initial `blockId -> JSON signature` snapshot.
 *   2. `onTransaction` flips a cheap `dirty` hint for user-origin
 *      transactions. The save flow does not gate on this flag — it exists
 *      for diagnostic / external consumers.
 *   3. The PM view plugin re-arms a debounce on every doc-changing state
 *      update; on idle it invokes the registered idle callback.
 *   4. `getPayload()` rebuilds a fresh snapshot and diffs it against the
 *      committed snapshot, emitting `upsert` / `delete` per blockId.
 *   5. `commit()` advances the baseline after a successful save.
 */
export const DirtyTracker = Extension.create<DirtyTrackerOptions, DirtyTrackerStorage>({
  name: 'dirtyTracker',
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
      committedSnapshot: new Map<string, BlockSnapshot>(),
      dirty: false,
      blockVersions: new Map<string, number>(),
      idleCallback: null,
      idleDebounceMs: 3000,
      idleTimer: null,
      hasDirty() { return false },
      getPayload() { return { blockOrder: [], changes: [] } },
      commit() {},
      applyServerVersions(_versions: Record<string, number>) {},
      subscribeIdle(_cb: () => void, _ms: number) { return () => {} },
      cancelIdle() {},
    }
  },

  onCreate() {
    const { blockIdAttribute } = this.options
    const storage = this.storage

    storage.committedSnapshot = buildSnapshot(this.editor.state.doc, blockIdAttribute)
    storage.dirty = false

    storage.hasDirty = () => storage.dirty

    storage.getPayload = (): IncrementalPayload => {
      const doc = this.editor.state.doc
      const blockOrder = blockOrderOf(doc, blockIdAttribute)
      const current = buildSnapshot(doc, blockIdAttribute)
      const committed = storage.committedSnapshot
      const changes: BlockChange[] = []

      // Deletions: present in baseline, absent now.
      for (const id of committed.keys()) {
        if (!current.has(id)) {
          changes.push({ action: 'delete', blockId: id })
        }
      }

      // Insertions / updates: brand new id, or signature differs.
      for (const [id, snap] of current) {
        const prev = committed.get(id)
        if (prev && prev.signature === snap.signature) continue
        changes.push({
          action: 'upsert',
          blockId: id,
          type: snap.type,
          content: snap.content,
          attrs: snap.attrs,
          prevVersion: storage.blockVersions.get(id) ?? undefined,
        })
      }

      return { blockOrder, changes }
    }

    storage.commit = () => {
      storage.committedSnapshot = buildSnapshot(this.editor.state.doc, blockIdAttribute)
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

  onTransaction({ transaction }) {
    const storage = this.storage
    if (!storage.initialized) return
    if (!transaction.docChanged) return
    if (this.options.filterTransaction(transaction)) {
      storage.dirty = true
    }
  },

  addProseMirrorPlugins() {
    // The extension instance reference; closed-over by the PM plugin's view.
    // `this.storage` lookup inside the plugin always returns the same storage
    // object that lifecycle hooks mutated.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const ext = this
    return [
      new Plugin({
        key: dirtyTrackerViewPluginKey,
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
