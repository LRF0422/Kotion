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
}

export interface UseIncrementalSaveReturn {
  saving: boolean
  dirty: boolean
  error: Error | null
  saveNow: () => Promise<void>
}

function getTracker(editor: Editor | null): DirtyTrackerStorage | null {
  if (!editor) return null
  const storage = (editor.storage as any)?.dirtyTracker as DirtyTrackerStorage | undefined
  if (!storage || !storage.initialized) return null
  return storage
}

export function useIncrementalSave(options: UseIncrementalSaveOptions): UseIncrementalSaveReturn {
  const { editor, enabled, debounceMs = 3000, onSave } = options

  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const savingRef = useRef(false)
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave

  const doSave = useCallback(async () => {
    if (savingRef.current) return
    const tracker = getTracker(editor)
    if (!tracker) return

    // Bail iff there is genuinely nothing to persist: no content changes AND
    // no reorder. A pure block move produces zero `changes` but `orderChanged`,
    // and must still be sent so the backend can persist the new order.
    const payload = tracker.getPayload()
    if (payload.changes.length === 0 && !payload.orderChanged) {
      setDirty(false)
      return
    }

    savingRef.current = true
    setSaving(true)
    setError(null)

    try {
      await onSaveRef.current(payload)
      tracker.commit()
      setDirty(false)
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err))
      setError(e)
      console.error('[useIncrementalSave] Save failed:', e)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }, [editor])

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

  return { saving, dirty, error, saveNow }
}
