import { useCallback, useState, useEffect } from "react";
import { useKeyPress } from "@kn/core";

interface UseKeyboardNavigationOptions<T> {
    /** Array of items to navigate */
    items: T[];
    /** Callback when item is selected via Enter key */
    onSelect: (item: T, index: number) => void;
    /** Callback when Escape is pressed */
    onClose: () => void;
    /** Whether navigation is enabled (default: true) */
    enabled?: boolean;
}

interface UseKeyboardNavigationReturn {
    /** Currently selected index */
    selectedIndex: number;
    /** Set selected index manually */
    setSelectedIndex: (index: number) => void;
    /** Reset to first item */
    resetSelection: () => void;
}

/**
 * Custom hook for keyboard navigation in list selectors
 * Provides arrow key navigation, Enter selection, and Escape to close
 * 
 * @example
 * ```tsx
 * const { selectedIndex, setSelectedIndex } = useKeyboardNavigation({
 *   items: blocks,
 *   onSelect: (block) => handleBlockSelect(block),
 *   onClose: () => setOpen(false),
 * });
 * ```
 */
export const useKeyboardNavigation = <T>({
    items,
    onSelect,
    onClose,
    enabled = true,
}: UseKeyboardNavigationOptions<T>): UseKeyboardNavigationReturn => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    // Reset selection when items change
    useEffect(() => {
        setSelectedIndex(0);
    }, [items]);

    // Handle arrow up
    const handleArrowUp = useCallback(() => {
        if (!enabled || items.length === 0) return;
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
    }, [enabled, items.length]);

    // Handle arrow down
    const handleArrowDown = useCallback(() => {
        if (!enabled || items.length === 0) return;
        setSelectedIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
    }, [enabled, items.length]);

    // Handle Enter key selection
    const handleEnter = useCallback(() => {
        if (!enabled || items.length === 0) return;
        const selectedItem = items[selectedIndex];
        if (selectedItem) {
            onSelect(selectedItem, selectedIndex);
        }
    }, [enabled, items, selectedIndex, onSelect]);

    // Handle Escape key
    const handleEscape = useCallback(() => {
        if (!enabled) return;
        onClose();
    }, [enabled, onClose]);

    // Bind keyboard events
    useKeyPress(['ArrowUp'], handleArrowUp);
    useKeyPress(['ArrowDown'], handleArrowDown);
    useKeyPress(['Enter'], handleEnter);
    useKeyPress(['Escape', 'Esc'], handleEscape);

    // Reset selection helper
    const resetSelection = useCallback(() => {
        setSelectedIndex(0);
    }, []);

    return {
        selectedIndex,
        setSelectedIndex,
        resetSelection,
    };
};
