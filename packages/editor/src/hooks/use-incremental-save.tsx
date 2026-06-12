import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import type { IncrementalPayload, DirtyTrackerStorage } from '../extensions/dirty-tracker'

// Re-export for consumers
export type { IncrementalPayload, BlockChange } from '../extensions/dirty-tracker'

export interface UseIncrementalSaveOptions {
  editor: Editor | null
  enabled: boolean
  debounceMs?: number
  onSave: (payload: IncrementalPayload) => Promise<void>
  /**
   * Payloads with more changes than this are split into batches (each its own
   * PATCH request / backend transaction) so a million-word import never lands
   * in one oversized request or one long transaction. Default 500.
   */
  batchThreshold?: number
  /** Changes per batch when splitting. Default 400. */
  batchSize?: number
  /** Max concurrent batch requests. Default 3. */
  batchConcurrency?: number
  /**
   * Optional fast path for a first import/paste: when the payload is a large set
   * of brand-new blocks (all upserts, none yet saved), this is called once with
   * the whole payload instead of the batched PATCH path. The backend persists it
   * in chunked transactions and seals a single page version (no per-block
   * history). When omitted, large imports just use the batched path.
   */
  onBulkSave?: (payload: IncrementalPayload) => Promise<void>
  /** Min change count to route to `onBulkSave`. Default 2000. */
  bulkThreshold?: number
}

export interface SaveProgress {
  done: number
  total: number
}

export interface UseIncrementalSaveReturn {
  saving: boolean
  dirty: boolean
  error: Error | null
  /** Non-null only while a batched (large) save is in flight. */
  progress: SaveProgress | null
  saveNow: () => Promise<void>
}

/** Split an array into fixed-size chunks. */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function getTracker(editor: Editor | null): DirtyTrackerStorage | null {
  if (!editor) return null
  const storage = (editor.storage as any)?.dirtyTracker as DirtyTrackerStorage | undefined
  if (!storage || !storage.initialized) return null
  return storage
}

export function useIncrementalSave(options: UseIncrementalSaveOptions): UseIncrementalSaveReturn {
  const {
    editor, enabled, debounceMs = 3000, onSave,
    batchThreshold = 500, batchSize = 400, batchConcurrency = 3,
    onBulkSave, bulkThreshold = 2000,
  } = options

  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [progress, setProgress] = useState<SaveProgress | null>(null)
  const savingRef = useRef(false)
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave
  const onBulkSaveRef = useRef(onBulkSave)
  onBulkSaveRef.current = onBulkSave

  const doSave = useCallback(async () => {
    if (savingRef.current) return
    const tracker = getTracker(editor)
    if (!tracker) return

    // Bail iff there is genuinely nothing to persist. A move is itself a change
    // (the moved block's `attrs.rank` changed), so it shows up in `changes`.
    const payload = tracker.getPayload()
    if (payload.changes.length === 0) {
      setDirty(false)
      return
    }

    savingRef.current = true
    setSaving(true)
    setError(null)

    // A fresh full import is every-block-new: all upserts, none acked yet
    // (no prevVersion). Route those to the single-shot bulk endpoint when one
    // is provided — it clears + re-inserts in chunked transactions and seals
    // one page version, avoiding N per-batch versions and per-block history.
    const isFreshBulkImport =
      payload.changes.length > bulkThreshold &&
      payload.changes.every(c => c.action === 'upsert' && c.prevVersion == null)

    try {
      if (onBulkSaveRef.current && isFreshBulkImport) {
        await onBulkSaveRef.current(payload)
        tracker.commit()
        setDirty(false)
      } else if (payload.changes.length <= batchThreshold) {
        // Small save — one request, one transaction (unchanged fast path).
        await onSaveRef.current(payload)
        tracker.commit()
        setDirty(false)
      } else {
        // Large save (import/paste of a huge doc) — split into independent
        // batches so no single request/transaction is oversized. Blocks are
        // independent rows keyed by id, so batches need no ordering and run
        // concurrently. Each batch that fails simply stays dirty and retries.
        const batches = chunk(payload.changes, batchSize)
        const total = batches.length
        setProgress({ done: 0, total })

        const ok = new Array<boolean>(total)
        let firstError: Error | null = null
        let done = 0
        let next = 0
        const worker = async () => {
          while (next < total) {
            const i = next++
            try {
              await onSaveRef.current({ changes: batches[i] })
              ok[i] = true
            } catch (err) {
              ok[i] = false
              if (!firstError) firstError = err instanceof Error ? err : new Error(String(err))
            }
            done++
            setProgress({ done, total })
          }
        }
        await Promise.all(
          Array.from({ length: Math.min(batchConcurrency, total) }, worker),
        )

        if (!firstError) {
          tracker.commit()
          setDirty(false)
        } else {
          // Re-baseline only the succeeded batches; failed ones remain dirty.
          const upIds: string[] = []
          const delIds: string[] = []
          for (let i = 0; i < total; i++) {
            if (!ok[i]) continue
            for (const c of batches[i]) {
              if (c.action === 'delete') delIds.push(c.blockId)
              else upIds.push(c.blockId)
            }
          }
          tracker.commitBlocks(upIds, delIds)
          throw firstError
        }
      }
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err))
      setError(e)
      console.error('[useIncrementalSave] Save failed:', e)
    } finally {
      setProgress(null)
      savingRef.current = false
      setSaving(false)
    }
  }, [editor, batchThreshold, batchSize, batchConcurrency, bulkThreshold])

  // Mark dirty on any doc-changing transaction so the UI can show
  // "Unsaved changes" immediately (before the idle debounce fires).
  useEffect(() => {
    if (!editor || !enabled) return
    const handler = ({ transaction }: { transaction: any }) => {
      if (transaction.docChanged) {
        setDirty(true)
      }
    }
    editor.on('transaction', handler)
    return () => { editor.off('transaction', handler) }
  }, [editor, enabled])

  // Subscribe to the dirty tracker's idle stream. Triggering is driven by a
  // ProseMirror view plugin inside the DirtyTracker extension — that fires
  // on every PM state update at the core level, bypassing Tiptap's event
  // emitter (which has been observed to be unreliable in this codebase's
  // collab setup).
  useEffect(() => {
    if (!editor || !enabled) return

    const tracker = getTracker(editor)
    if (!tracker) return

    // Seed the baseline at the moment tracking turns on. Covers content
    // loaded into the editor before `enabled` became true (initial Yjs
    // sync, setContent({emitUpdate:false}), progressive load).
    tracker.commit()

    const unsubscribe = tracker.subscribeIdle(() => {
      doSave()
    }, debounceMs)

    return unsubscribe
  }, [editor, enabled, debounceMs, doSave])

  const saveNow = useCallback(() => {
    const tracker = getTracker(editor)
    tracker?.cancelIdle()
    return doSave()
  }, [editor, doSave])

  return { saving, dirty, error, progress, saveNow }
}
