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
    /**
     * Called for incremental saves with only the changed blocks.
     * If not provided, every save falls back to `onFullSave`.
     */
    onIncrementalSave?: (payload: IncrementalSavePayload) => Promise<void>;
    /**
     * Called for full-document saves (fallback, manual save, periodic checkpoint).
     * Always required as a safety net.
     */
    onFullSave: (content: any) => Promise<void>;
    /** Whether auto-save is enabled (default: true) */
    enabled?: boolean;
    /** Callback when save status changes */
    onStatusChange?: (status: AutoSaveStatus) => void;
    /**
     * Whether the editor content has finished loading (default: true).
     * While false, editor update events are ignored.
     */
    contentReady?: boolean;
    /**
     * If the ratio of changed blocks to total blocks exceeds this threshold,
     * fall back to a full save instead of incremental (default: 0.5).
     */
    incrementalThreshold?: number;
    /**
     * Number of consecutive incremental saves before forcing a full checkpoint
     * save for data integrity (default: 20, set 0 to disable).
     */
    fullSaveInterval?: number;
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
 * useIncrementalSave — a drop-in replacement for useAutoSave that leverages
 * the DirtyTracker extension to send only changed blocks to the backend.
 *
 * When `onIncrementalSave` is provided:
 *   - Small changes → incremental payload (only dirty blocks + block order)
 *   - Large changes (> threshold) → falls back to full save
 *   - Every N incremental saves → full checkpoint save for safety
 *
 * When `onIncrementalSave` is NOT provided:
 *   - Behaves exactly like the old useAutoSave (always full save)
 */
export function useIncrementalSave({
    editor,
    debounceDelay = 2000,
    onIncrementalSave,
    onFullSave,
    enabled = true,
    onStatusChange,
    contentReady = true,
    incrementalThreshold = 0.5,
    fullSaveInterval = 20,
}: UseIncrementalSaveOptions): UseIncrementalSaveReturn {
    const [status, setStatus] = useState<AutoSaveStatus>('idle');
    const [isDirty, setIsDirty] = useState(false);
    const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
    const isSavingRef = useRef(false);
    const pendingSaveRef = useRef(false);
    const contentReadyRef = useRef(contentReady);
    const incrementalCountRef = useRef(0);

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
            let didIncremental = false;

            // Attempt incremental save if available
            if (tracker && tracker.initialized && onIncrementalSave) {
                const payload = tracker.getIncrementalPayload();
                const totalBlocks = payload.blockOrder.length;
                const changedBlocks = payload.changes.length;

                const shouldDoFull =
                    changedBlocks === 0 ||
                    totalBlocks === 0 ||
                    (changedBlocks / Math.max(totalBlocks, 1)) > incrementalThreshold ||
                    (fullSaveInterval > 0 && incrementalCountRef.current >= fullSaveInterval);

                if (!shouldDoFull && changedBlocks > 0) {
                    await onIncrementalSave(payload);
                    tracker.commitSave();
                    incrementalCountRef.current++;
                    didIncremental = true;
                }
            }

            // Full save fallback
            if (!didIncremental) {
                const content = editor.getJSON();
                await onFullSave(content);
                const t = getDirtyTrackerStorage(editor);
                if (t) t.commitSave();
                incrementalCountRef.current = 0;
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
    }, [editor, onIncrementalSave, onFullSave, updateStatus, incrementalThreshold, fullSaveInterval]);

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
