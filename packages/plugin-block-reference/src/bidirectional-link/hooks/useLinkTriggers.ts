/**
 * useLinkTriggers Hook
 * Listens for [[ and (( triggers in the editor to open link pickers.
 * 
 * @module @kn/plugin-block-reference/bidirectional-link/hooks
 */

import { useEffect, useState, useCallback } from 'react';
import { Editor } from '@kn/editor';

interface UseLinkTriggersOptions {
    /** The Tiptap editor instance */
    editor: Editor | null;
    /** Whether the hook is enabled */
    enabled?: boolean;
}

interface UseLinkTriggersReturn {
    /** Whether the page link picker is visible */
    showPagePicker: boolean;
    /** Whether the block link picker is visible */
    showBlockPicker: boolean;
    /** Close the page picker */
    closePagePicker: () => void;
    /** Close the block picker */
    closeBlockPicker: () => void;
    /** Handle page selection */
    handlePageSelect: (page: { id: number; title: string }) => void;
    /** Handle block selection */
    handleBlockSelect: (block: { id: string }) => void;
}

/**
 * Hook for detecting [[ and (( triggers in the editor
 * 
 * @example
 * const { showPagePicker, showBlockPicker, ... } = useLinkTriggers({ editor });
 * 
 * <PageLinkPicker
 *   visible={showPagePicker}
 *   onSelect={handlePageSelect}
 *   onCancel={closePagePicker}
 * />
 */
export function useLinkTriggers({
    editor,
    enabled = true,
}: UseLinkTriggersOptions): UseLinkTriggersReturn {
    const [showPagePicker, setShowPagePicker] = useState(false);
    const [showBlockPicker, setShowBlockPicker] = useState(false);

    // Listen for [[ and (( triggers
    useEffect(() => {
        if (!editor || !enabled) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            const { from } = editor.state.selection;
            const textBefore = editor.state.doc.textBetween(
                Math.max(0, from - 1),
                from,
                '\n'
            );

            // Detect [[ trigger
            if (event.key === '[' && textBefore === '[') {
                event.preventDefault();
                // Delete the first [
                editor.commands.deleteRange({ from: from - 1, to: from });
                setShowPagePicker(true);
            }

            // Detect (( trigger
            if (event.key === '(' && textBefore === '(') {
                event.preventDefault();
                // Delete the first (
                editor.commands.deleteRange({ from: from - 1, to: from });
                setShowBlockPicker(true);
            }
        };

        editor.view.dom.addEventListener('keydown', handleKeyDown);
        return () => {
            editor.view.dom.removeEventListener('keydown', handleKeyDown);
        };
    }, [editor, enabled]);

    // Close page picker
    const closePagePicker = useCallback(() => {
        setShowPagePicker(false);
        editor?.commands.focus();
    }, [editor]);

    // Close block picker
    const closeBlockPicker = useCallback(() => {
        setShowBlockPicker(false);
        editor?.commands.focus();
    }, [editor]);

    // Handle page selection
    const handlePageSelect = useCallback((page: { id: number; title: string }) => {
        if (editor) {
            (editor.commands as any).setPageLink({ pageId: page.id, title: page.title });
        }
        setShowPagePicker(false);
    }, [editor]);

    // Handle block selection
    const handleBlockSelect = useCallback((block: { id: string }) => {
        if (editor) {
            (editor.commands as any).setBlockLink({ blockId: block.id });
        }
        setShowBlockPicker(false);
    }, [editor]);

    return {
        showPagePicker,
        showBlockPicker,
        closePagePicker,
        closeBlockPicker,
        handlePageSelect,
        handleBlockSelect,
    };
}
