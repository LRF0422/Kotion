import { useEffect, useCallback } from "react";

interface KeyboardShortcutHandlers {
    onAddRecord?: () => void;
    onDeleteSelected?: () => void;
    onDuplicateSelected?: () => void;
    onClearSelection?: () => void;
    onCloseDrawer?: () => void;
    hasSelection: boolean;
    drawerOpen: boolean;
}

/**
 * Keyboard shortcuts for the bitable:
 * - Cmd/Ctrl+N: add new record
 * - Cmd/Ctrl+D: duplicate selected records
 * - Delete/Backspace: delete selected records
 * - Escape: clear selection or close drawer
 */
export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers) {
    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            const isMac = navigator.platform.toUpperCase().includes("MAC");
            const mod = isMac ? e.metaKey : e.ctrlKey;

            // Cmd/Ctrl+N — add record
            if (mod && e.key === "n" && handlers.onAddRecord) {
                e.preventDefault();
                handlers.onAddRecord();
                return;
            }

            // Cmd/Ctrl+D — duplicate selected
            if (mod && e.key === "d" && handlers.onDuplicateSelected && handlers.hasSelection) {
                e.preventDefault();
                handlers.onDuplicateSelected();
                return;
            }

            // Delete/Backspace — delete selected records (only when not editing)
            if (
                (e.key === "Delete" || e.key === "Backspace") &&
                handlers.onDeleteSelected &&
                handlers.hasSelection
            ) {
                const target = e.target as HTMLElement;
                const isEditing =
                    target.tagName === "INPUT" ||
                    target.tagName === "TEXTAREA" ||
                    target.isContentEditable;
                if (!isEditing) {
                    e.preventDefault();
                    handlers.onDeleteSelected();
                    return;
                }
            }

            // Escape — close drawer first, then clear selection
            if (e.key === "Escape") {
                if (handlers.drawerOpen && handlers.onCloseDrawer) {
                    e.preventDefault();
                    handlers.onCloseDrawer();
                    return;
                }
                if (handlers.hasSelection && handlers.onClearSelection) {
                    e.preventDefault();
                    handlers.onClearSelection();
                    return;
                }
            }
        },
        [handlers]
    );

    useEffect(() => {
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [handleKeyDown]);
}
