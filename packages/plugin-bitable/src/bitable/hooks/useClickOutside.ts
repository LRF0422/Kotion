import { useEffect, RefObject } from "react";

/**
 * Reusable click-outside detection for popovers, dropdowns, etc.
 * Calls `handler` when a pointerdown event occurs outside the referenced element.
 */
export function useClickOutside<T extends HTMLElement = HTMLElement>(
    ref: RefObject<T>,
    handler: (event: MouseEvent | TouchEvent) => void,
    enabled: boolean = true
) {
    useEffect(() => {
        if (!enabled) return;
        const listener = (event: MouseEvent | TouchEvent) => {
            const el = ref.current;
            if (!el || el.contains(event.target as Node)) return;
            handler(event);
        };
        document.addEventListener("pointerdown", listener);
        return () => document.removeEventListener("pointerdown", listener);
    }, [ref, handler, enabled]);
}
