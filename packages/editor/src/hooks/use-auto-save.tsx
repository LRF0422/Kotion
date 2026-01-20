import { useCallback, useEffect, useRef, useState } from 'react';
import { useDebounceFn } from 'ahooks';
import { Editor } from '@tiptap/core';

export type AutoSaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error';

export interface UseAutoSaveOptions {
    /** Editor instance */
    editor: Editor | null;
    /** Debounce delay in milliseconds (default: 2000ms) */
    debounceDelay?: number;
    /** Callback to perform the save operation */
    onSave: (content: any) => Promise<void>;
    /** Whether auto-save is enabled (default: true) */
    enabled?: boolean;
    /** Callback when save status changes */
    onStatusChange?: (status: AutoSaveStatus) => void;
}

export interface UseAutoSaveReturn {
    /** Current save status */
    status: AutoSaveStatus;
    /** Whether there are unsaved changes */
    isDirty: boolean;
    /** Manually trigger a save */
    saveNow: () => Promise<void>;
    /** Mark content as saved (useful after manual save) */
    markAsSaved: () => void;
    /** Mark content as dirty (has unsaved changes) */
    markAsDirty: () => void;
    /** Last save timestamp */
    lastSavedAt: Date | null;
}

export function useAutoSave({
    editor,
    debounceDelay = 2000,
    onSave,
    enabled = true,
    onStatusChange,
}: UseAutoSaveOptions): UseAutoSaveReturn {
    const [status, setStatus] = useState<AutoSaveStatus>('idle');
    const [isDirty, setIsDirty] = useState(false);
    const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
    const isSavingRef = useRef(false);
    const pendingSaveRef = useRef(false);
    const initialContentRef = useRef<string | null>(null);

    // Update status and notify via callback
    const updateStatus = useCallback((newStatus: AutoSaveStatus) => {
        setStatus(newStatus);
        onStatusChange?.(newStatus);
    }, [onStatusChange]);

    // Perform the actual save
    const performSave = useCallback(async () => {
        if (!editor || isSavingRef.current) {
            pendingSaveRef.current = true;
            return;
        }

        isSavingRef.current = true;
        updateStatus('saving');

        try {
            const content = editor.getJSON();
            await onSave(content);
            setIsDirty(false);
            setLastSavedAt(new Date());
            updateStatus('saved');

            // Update baseline to current content after successful save
            initialContentRef.current = JSON.stringify(content);

            // Reset to idle after showing "saved" status briefly
            setTimeout(() => {
                if (!pendingSaveRef.current) {
                    updateStatus('idle');
                }
            }, 2000);
        } catch (error) {
            console.error('Auto-save failed:', error);
            updateStatus('error');
        } finally {
            isSavingRef.current = false;

            // If there was a pending save request, execute it
            if (pendingSaveRef.current) {
                pendingSaveRef.current = false;
                performSave();
            }
        }
    }, [editor, onSave, updateStatus]);

    // Debounced save function
    const { run: debouncedSave, cancel: cancelDebouncedSave } = useDebounceFn(
        () => {
            if (isDirty && enabled) {
                performSave();
            }
        },
        { wait: debounceDelay }
    );

    // Mark content as dirty
    const markAsDirty = useCallback(() => {
        setIsDirty(true);
        updateStatus('unsaved');
    }, [updateStatus]);

    // Mark content as saved
    const markAsSaved = useCallback(() => {
        setIsDirty(false);
        setLastSavedAt(new Date());
        updateStatus('saved');
        cancelDebouncedSave();

        // Update baseline to current content after save
        if (editor) {
            initialContentRef.current = JSON.stringify(editor.getJSON());
        }

        setTimeout(() => {
            updateStatus('idle');
        }, 2000);
    }, [editor, updateStatus, cancelDebouncedSave]);

    // Manual save function
    const saveNow = useCallback(async () => {
        cancelDebouncedSave();
        if (isDirty) {
            await performSave();
        }
    }, [isDirty, performSave, cancelDebouncedSave]);

    // Listen for editor content changes
    useEffect(() => {
        if (!editor || !enabled) return;

        // Store initial content for comparison
        if (initialContentRef.current === null) {
            initialContentRef.current = JSON.stringify(editor.getJSON());
        }

        const handleUpdate = () => {
            const currentContent = JSON.stringify(editor.getJSON());

            // Only mark as dirty if content actually changed from initial
            if (currentContent !== initialContentRef.current) {
                markAsDirty();
                debouncedSave();
            }
        };

        editor.on('update', handleUpdate);

        return () => {
            editor.off('update', handleUpdate);
        };
    }, [editor, enabled, markAsDirty, debouncedSave]);

    // Note: We intentionally do NOT reset initialContentRef on doc changes.
    // This was causing agent-generated content to not trigger auto-save,
    // because the baseline was being reset after every change.
    // The initial content is set once in the update listener effect.

    // Cleanup on unmount - save if dirty
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
