import { useCallback, useEffect, useRef, useState } from 'react';
import { useDebounceFn } from 'ahooks';
import { Editor } from '@tiptap/core';
import type { DirtyTrackerStorage, IncrementalSavePayload, BlockChange, BlockChangeAction } from '../extensions/dirty-tracker/dirty-tracker';
import type { AutoSaveStatus } from './use-auto-save';

// Re-export types so consumers can import from @kn/editor directly
export type { IncrementalSavePayload, BlockChange, BlockChangeAction } from '../extensions/dirty-tracker/dirty-tracker';

// ─── Options ─────────────────────────────────────────────────────────

export interface UseIncrementalSaveOptions {
    /** Editor instance */
    editor: Editor | null;
    /** Debounce delay in milliseconds (default: 2000) */
    debounceDelay?: number;
    /** Called for incremental saves with only the changed blocks. */
    onIncrementalSave: (payload: IncrementalSavePayload) => Promise<void>;
    /** Whether auto-save is enabled (default: true) */
    enabled?: boolean;
    /** Callback when save status changes */
    onStatusChange?: (status: AutoSaveStatus) => void;
    /**
     * Whether the editor content has finished loading (default: true).
     * While false, editor update events are ignored.
     */
    contentReady?: boolean;
}

// ─── Return type ─────────────────────────────────────────────────────

export interface UseIncrementalSaveReturn {
    /** Current save status */
    status: AutoSaveStatus;
    /** Whether there are unsaved changes */
    isDirty: boolean;
    /** Manually trigger an immediate save */
    saveNow: () => Promise<void>;
    /** Mark content as saved (clears dirty state and DirtyTracker) */
    markAsSaved: () => void;
    /** Mark content as dirty */
    markAsDirty: () => void;
    /** Timestamp of the last successful save */
    lastSavedAt: Date | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function getDirtyTrackerStorage(editor: Editor | null): DirtyTrackerStorage | null {
    if (!editor) return null;
    return (editor.storage as any)?.dirtyTracker as DirtyTrackerStorage ?? null;
}

// ─── Hook ────────────────────────────────────────────────────────────

/**
 * useIncrementalSave — leverages the DirtyTracker extension to send only
 * changed blocks to the backend. No full-document save is performed;
 * if nothing changed or the tracker isn't ready, the save is simply skipped.
 */
export function useIncrementalSave({
    editor,
    debounceDelay = 2000,
    onIncrementalSave,
    enabled = true,
    onStatusChange,
    contentReady = true,
}: UseIncrementalSaveOptions): UseIncrementalSaveReturn {
    const [status, setStatus] = useState<AutoSaveStatus>('idle');
    const [isDirty, setIsDirty] = useState(false);
    const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
    const isSavingRef = useRef(false);
    const pendingSaveRef = useRef(false);
    const contentReadyRef = useRef(contentReady);

    // Update status and notify
    const updateStatus = useCallback((newStatus: AutoSaveStatus) => {
        setStatus(newStatus);
        onStatusChange?.(newStatus);
    }, [onStatusChange]);

    // ── Core save logic ──
    const performSave = useCallback(async () => {
        if (!editor || isSavingRef.current) {
            pendingSaveRef.current = true;
            return;
        }

        isSavingRef.current = true;
        updateStatus('saving');

        try {
            const tracker = getDirtyTrackerStorage(editor);

            if (tracker && tracker.initialized) {
                const payload = tracker.getIncrementalPayload();

                // Nothing changed — skip save
                if (payload.changes.length === 0) {
                    setIsDirty(false);
                    updateStatus('idle');
                    return;
                }

                await onIncrementalSave(payload);
                tracker.commitSave();
            } else {
                // DirtyTracker not ready — skip
                updateStatus('idle');
                return;
            }

            setIsDirty(false);
            setLastSavedAt(new Date());
            updateStatus('saved');

            setTimeout(() => {
                if (!pendingSaveRef.current) {
                    updateStatus('idle');
                }
            }, 2000);
        } catch (error) {
            console.error('Incremental auto-save failed:', error);
            updateStatus('error');
        } finally {
            isSavingRef.current = false;

            if (pendingSaveRef.current) {
                pendingSaveRef.current = false;
                performSave();
            }
        }
    }, [editor, onIncrementalSave, updateStatus]);

    // Debounced save
    const { run: debouncedSave, cancel: cancelDebouncedSave } = useDebounceFn(
        () => {
            if (isDirty && enabled) {
                performSave();
            }
        },
        { wait: debounceDelay },
    );

    // ── Public helpers ──

    const markAsDirty = useCallback(() => {
        setIsDirty(true);
        updateStatus('unsaved');
    }, [updateStatus]);

    const markAsSaved = useCallback(() => {
        setIsDirty(false);
        setLastSavedAt(new Date());
        updateStatus('saved');
        cancelDebouncedSave();

        // Also commit the DirtyTracker state
        const tracker = getDirtyTrackerStorage(editor);
        if (tracker) tracker.commitSave();

        setTimeout(() => {
            updateStatus('idle');
        }, 2000);
    }, [editor, updateStatus, cancelDebouncedSave]);

    const saveNow = useCallback(async () => {
        cancelDebouncedSave();
        if (isDirty) {
            await performSave();
        }
    }, [isDirty, performSave, cancelDebouncedSave]);

    // ── Effects ──

    // Keep contentReadyRef in sync and reinitialize tracker when content loads
    useEffect(() => {
        const wasReady = contentReadyRef.current;
        contentReadyRef.current = contentReady;

        if (contentReady && !wasReady) {
            cancelDebouncedSave();
            setIsDirty(false);
            updateStatus('idle');

            // Reinitialize the tracker baseline after content finishes loading
            const tracker = getDirtyTrackerStorage(editor);
            if (tracker) tracker.reinitialize();
        }
    }, [contentReady, cancelDebouncedSave, updateStatus, editor]);

    // Listen for editor content changes
    useEffect(() => {
        if (!editor || !enabled) return;

        const handleUpdate = () => {
            if (!contentReadyRef.current) return;

            // The DirtyTracker plugin automatically tracks which blocks
            // changed via its appendTransaction hook. We just need to
            // trigger the debounced save.
            markAsDirty();
            debouncedSave();
        };

        editor.on('update', handleUpdate);
        return () => {
            editor.off('update', handleUpdate);
        };
    }, [editor, enabled, markAsDirty, debouncedSave]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            cancelDebouncedSave();
        };
    }, [cancelDebouncedSave]);

    return {
        status,
        isDirty,
        saveNow,
        markAsSaved,
        markAsDirty,
        lastSavedAt,
    };
}
