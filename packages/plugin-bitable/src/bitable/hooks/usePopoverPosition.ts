import { useState, useCallback, RefObject } from "react";

export interface PopoverPosition {
    top: number;
    left: number;
    placement: "bottom-start" | "bottom-end" | "top-start" | "top-end";
}

/**
 * Smart popover positioning — flips if the popover would overflow the viewport.
 * Returns a callback that computes the optimal position given a trigger element.
 */
export function usePopoverPosition<T extends HTMLElement = HTMLElement>(
    ref: RefObject<T>,
    popoverWidth: number = 240,
    popoverHeight: number = 320
) {
    const [position, setPosition] = useState<PopoverPosition>({
        top: 0,
        left: 0,
        placement: "bottom-start",
    });

    const computePosition = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const viewportW = window.innerWidth;
        const viewportH = window.innerHeight;

        // Vertical: prefer bottom, flip to top if not enough space
        const spaceBelow = viewportH - rect.bottom;
        const spaceAbove = rect.top;
        const placeOnTop = spaceBelow < popoverHeight && spaceAbove > spaceBelow;

        // Horizontal: prefer start, flip to end if not enough space
        const spaceRight = viewportW - rect.left;
        const spaceLeft = rect.right;
        const placeAtEnd = spaceRight < popoverWidth && spaceLeft > spaceRight;

        const placement: PopoverPosition["placement"] = placeOnTop
            ? placeAtEnd ? "top-end" : "top-start"
            : placeAtEnd ? "bottom-end" : "bottom-start";

        const top = placeOnTop ? rect.top - popoverHeight : rect.bottom;
        const left = placeAtEnd ? rect.right - popoverWidth : rect.left;

        setPosition({ top, left, placement });
    }, [ref, popoverWidth, popoverHeight]);

    return { position, computePosition };
}
