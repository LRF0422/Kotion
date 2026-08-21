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
  /**
   * Optional keepalive transport used when the page is being dismissed
   * (`pagehide`): normal async requests are killed by the browser at that
   * point, so consumers provide a `fetch(..., { keepalive: true })`-based
   * fire-and-forget sender here. Unmount flushes use the regular `onSave`
   * path (its promise outlives the component).
   */
  onFlush?: (payload: IncrementalPayload) => void
  /**
   * Optional "the user asked to save" hook, invoked by `saveNow` once the
   * pending changes have landed. Autosaves deliberately merge into a single
   * version per editing session, so this is what lets a deliberate save mark
   * a restore point.
   *
   * Only supply it for genuinely user-initiated saves: consumers that call
   * `saveNow` merely to flush before unmounting (hover previews, offscreen AI
   * hosts) must leave it undefined, or every flush would cut a version.
   */
  onCheckpoint?: () => Promise<void>
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

/** Backoff schedule for automatic retries after a failed save. */
const RETRY_DELAYS_MS = [2000, 5000, 15000]

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
    onBulkSave, bulkThreshold = 2000, onFlush, onCheckpoint,
  } = options

  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [progress, setProgress] = useState<SaveProgress | null>(null)
  const savingRef = useRef(false)
  // A save trigger arrived while another save was in flight — run one more
  // round afterwards so those edits are not stranded until the next edit.
  const pendingRef = useRef(false)
  const retryCountRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Top-level block count at the moment tracking was enabled. Used to gate the
  // bulk (clear-and-replace) fast path to genuinely empty pages.
  const baselineBlockCountRef = useRef(0)
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave
  const onBulkSaveRef = useRef(onBulkSave)
  onBulkSaveRef.current = onBulkSave
  const onFlushRef = useRef(onFlush)
  onFlushRef.current = onFlush
  const onCheckpointRef = useRef(onCheckpoint)
  onCheckpointRef.current = onCheckpoint
  // Outcome of the most recent save attempt — `doSave` reports failures through
  // state, which `saveNow` cannot read back within the same tick.
  const lastSaveOkRef = useRef(true)
  // Self-reference for retry timers and the pending re-run in `finally`.
  const doSaveRef = useRef<() => Promise<void>>()

  const doSave = useCallback(async () => {
    if (savingRef.current) {
      // Another save is in flight — remember to run again once it finishes so
      // edits made meanwhile are not stranded until the next keystroke.
      pendingRef.current = true
      return
    }
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

    // Capture the exact ids in this payload NOW. On success we commit ONLY
    // these via commitBlocks — a full commit() would re-baseline the whole
    // document and silently swallow edits/deletions made while the request
    // was in flight (they'd never be saved again).
    const payloadUpsertIds: string[] = []
    const payloadDeleteIds: string[] = []
    for (const c of payload.changes) {
      if (c.action === 'delete') payloadDeleteIds.push(c.blockId)
      else payloadUpsertIds.push(c.blockId)
    }

    // The bulk (clear-and-replace) fast path is ONLY safe for a first import
    // into an empty page. "All upserts without prevVersion" alone is not
    // enough: versions are only learned from this session's saves, so the
    // first save after opening an existing page looks identical. Require the
    // baseline at tracking start to have been empty (title block at most).
    //
    // `baselineBlockCountRef` alone is not enough either: under collaboration
    // tracking turns on before the Yjs sync populates the document, so it is 0
    // even for a page full of content. Re-check the *live* baseline, which the
    // tracker keeps up to date as synced blocks arrive.
    const isFreshBulkImport =
      payload.changes.length > bulkThreshold &&
      baselineBlockCountRef.current <= 1 &&
      tracker.committedOrder.length <= 1 &&
      payload.changes.every(c => c.action === 'upsert' && c.prevVersion == null)

    let failed = false
    try {
      if (onBulkSaveRef.current && isFreshBulkImport) {
        try {
          await onBulkSaveRef.current(payload)
          tracker.commitBlocks(payloadUpsertIds, payloadDeleteIds)
        } catch {
          // Bulk endpoint rejected (e.g. backend guard against a non-empty
          // page) — fall back to the safe batched incremental path.
          await runBatchedSave(payload)
        }
      } else if (payload.changes.length <= batchThreshold) {
        // Small save — one request, one transaction (unchanged fast path).
        await onSaveRef.current(payload)
        if (editor && !editor.isDestroyed) {
          tracker.commitBlocks(payloadUpsertIds, payloadDeleteIds)
        }
      } else {
        await runBatchedSave(payload)
      }
      retryCountRef.current = 0
      setDirty(tracker.hasDirty())
    } catch (err) {
      failed = true
      const e = err instanceof Error ? err : new Error(String(err))
      setError(e)
      console.error('[useIncrementalSave] Save failed:', e)
    } finally {
      setProgress(null)
      savingRef.current = false
      setSaving(false)
      lastSaveOkRef.current = !failed
      if (failed) {
        // Exponential-backoff retry — without it a failed save is only ever
        // retried when the user happens to edit again.
        if (retryCountRef.current < RETRY_DELAYS_MS.length && retryTimerRef.current == null) {
          const delay = RETRY_DELAYS_MS[retryCountRef.current++]
          retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = null
            void doSaveRef.current?.()
          }, delay)
        }
      } else if (pendingRef.current) {
        pendingRef.current = false
        if (tracker.hasDirty()) void doSaveRef.current?.()
      }
    }

    // Large save (import/paste of a huge doc) — split into batches so no
    // single request/transaction is oversized. Upserts go first (concurrent);
    // deletes are sent in one final request ONLY after every upsert batch
    // succeeded — a delete landing before/without its reparented target's
    // upsert would soft-delete content the backend can no longer rescue
    // (its "never delete an upserted block" guard is per-request).
    async function runBatchedSave(p: IncrementalPayload): Promise<void> {
      const upserts = p.changes.filter(c => c.action !== 'delete')
      const deletes = p.changes.filter(c => c.action === 'delete')
      const batches = chunk(upserts, batchSize)
      const total = batches.length + (deletes.length > 0 ? 1 : 0)
      setProgress({ done: 0, total })

      const ok = new Array<boolean>(batches.length)
      let firstError: Error | null = null
      let done = 0
      let next = 0
      const worker = async () => {
        while (next < batches.length) {
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
        Array.from({ length: Math.min(batchConcurrency, Math.max(batches.length, 1)) }, worker),
      )

      const succeededUpsertIds: string[] = []
      for (let i = 0; i < batches.length; i++) {
        if (!ok[i]) continue
        for (const c of batches[i]) succeededUpsertIds.push(c.blockId)
      }

      const succeededDeleteIds: string[] = []
      if (deletes.length > 0 && !firstError) {
        try {
          await onSaveRef.current({ changes: deletes })
          for (const c of deletes) succeededDeleteIds.push(c.blockId)
        } catch (err) {
          if (!firstError) firstError = err instanceof Error ? err : new Error(String(err))
        }
        done++
        setProgress({ done, total })
      }

      // Partial commit — succeeded blocks re-baseline, failed ones stay dirty
      // (failed deletes remain in committedOrder and are re-detected).
      if (editor && !editor.isDestroyed) {
        tracker!.commitBlocks(succeededUpsertIds, succeededDeleteIds)
      }
      if (firstError) throw firstError
    }
  }, [editor, batchThreshold, batchSize, batchConcurrency, bulkThreshold])
  doSaveRef.current = doSave

  // Mark dirty on any doc-changing transaction so the UI can show
  // "Unsaved changes" immediately (before the idle debounce fires).
  // Remote collab transactions (Yjs sync) are skipped — they are saved by
  // the client that authored them and must not flip this client's status.
  useEffect(() => {
    if (!editor || !enabled) return
    const handler = ({ transaction }: { transaction: any }) => {
      if (transaction.docChanged && !transaction.getMeta('y-sync$')) {
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
    // Record how much content the page already had — gates the destructive
    // bulk clear-and-replace fast path to genuinely empty pages.
    baselineBlockCountRef.current = tracker.committedOrder.length

    const unsubscribe = tracker.subscribeIdle(() => {
      doSave()
    }, debounceMs)

    return () => {
      unsubscribe()
      if (retryTimerRef.current != null) {
        clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }
    }
  }, [editor, enabled, debounceMs, doSave])

  // Best-effort flush of pending changes when the page/component goes away.
  // Without this, anything typed inside the idle-debounce window is lost on
  // tab close or page switch.
  useEffect(() => {
    if (!editor || !enabled) return

    const collectPayload = (): IncrementalPayload | null => {
      const tracker = getTracker(editor)
      if (!tracker) return null
      const payload = tracker.getPayload()
      return payload.changes.length > 0 ? payload : null
    }

    // Tab close / reload: async requests are killed, so use the consumer's
    // keepalive transport when provided (fire-and-forget by nature).
    const onPageHide = () => {
      const payload = collectPayload()
      if (!payload) return
      if (onFlushRef.current) onFlushRef.current(payload)
      else void onSaveRef.current(payload).catch(() => {})
    }
    window.addEventListener('pagehide', onPageHide)

    return () => {
      window.removeEventListener('pagehide', onPageHide)
      // Unmount / page switch: the regular async path is fine here — the
      // request's promise outlives the component. Skip the tracker commit
      // entirely (upserts are idempotent; the tracker dies with the editor).
      const payload = collectPayload()
      if (payload) void onSaveRef.current(payload).catch(() => {})
    }
  }, [editor, enabled])

  const saveNow = useCallback(async () => {
    const tracker = getTracker(editor)
    tracker?.cancelIdle()
    await doSave()

    // Seal the session's version only once the server provably holds everything
    // the editor holds. `doSave` returns early when another save is in flight,
    // and a partially-failed batched save leaves blocks dirty — sealing then
    // would create a restore point for a state that never existed.
    if (!onCheckpointRef.current) return
    if (!lastSaveOkRef.current || savingRef.current || tracker?.hasDirty()) return
    try {
      await onCheckpointRef.current()
    } catch (err) {
      // The content is safe; only the restore point was not cut.
      console.error('[useIncrementalSave] Checkpoint failed:', err)
    }
  }, [editor, doSave])

  return { saving, dirty, error, progress, saveNow }
}
