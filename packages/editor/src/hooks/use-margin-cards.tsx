import { Editor } from "@tiptap/core";
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";

/**
 * A shared hook for positioning "margin cards" — floating cards anchored beside
 * the editor text column, in the left or right gutter (Google-Docs style).
 *
 * Used by the comment and sticky-note plugins. It owns ALL the fiddly geometry
 * and lifecycle:
 *  - anchors each card to a document position via `coordsAtPos`
 *  - places cards in the correct gutter relative to the editor SCROLL container
 *    (`#editor-container`), never the window/sidebar
 *  - clamps the horizontal extent so a card never covers the text, hiding the
 *    whole panel when the gutter is too narrow
 *  - clamps vertically to the visible editor viewport so cards don't float over
 *    the toolbar / page chrome
 *  - resolves vertical overlap between cards using their real measured heights
 *  - re-runs on transaction / scroll / resize / tab-visibility changes
 *
 * The caller renders the returned `anchors` (each already carries a viewport
 * `top`) at `panelLeft` / `panelWidth`, typically through a portal to
 * `document.body` so the fixed positioning is immune to transformed ancestors.
 */

/** The scroll container that wraps the editor (see editor/render.tsx). */
const EDITOR_CONTAINER_ID = "editor-container";

export interface MarginItem {
    id: string;
    from: number;
    to: number;
}

export type MarginAnchor<T> = T & { top: number };

export interface UseMarginCardsOptions<T extends MarginItem> {
    /** Which gutter the cards live in. */
    side: "left" | "right";
    /** Walk the document and return the items to position (id + range + payload). */
    collect: (editor: Editor) => T[];
    /** Preferred card width; shrinks to fit a narrow gutter. Default 300. */
    cardWidth?: number;
    /** Gap between the card and the text column edge. Default 16. */
    gutter?: number;
    /** Min gap kept from the viewport / container edge. Default 12. */
    viewportPadding?: number;
    /** Below this usable width the panel hides instead of covering text. Default 140. */
    minVisible?: number;
    /** Estimated card height used before real heights are measured. Default 80. */
    estimatedHeight?: number;
    /** Vertical gap kept between stacked cards. Default 12. */
    gap?: number;
    /** Skip all positioning work (e.g. on mobile, which uses a bottom sheet). */
    disabled?: boolean;
}

export interface UseMarginCardsResult<T extends MarginItem> {
    /** Left CSS coordinate for every card, or null when there's no room / editor hidden. */
    panelLeft: number | null;
    /** Width every card should render at (<= cardWidth). */
    panelWidth: number;
    /** Visible items, each with a de-overlapped viewport `top`, in document order. */
    anchors: MarginAnchor<T>[];
    /** Ref callback to register a card's DOM node so the hook can measure its height. */
    registerCard: (id: string) => (el: HTMLElement | null) => void;
}

/**
 * The editor's OWN scroll container. Resolved via `closest` (not
 * `getElementById`) because the LRU tab pool keeps several editors mounted, so
 * multiple elements share `id="editor-container"` and `getElementById` would
 * return whichever comes first in the DOM, not this editor's.
 */
function getContainer(editor: Editor): HTMLElement | null {
    return editor.view.dom.closest<HTMLElement>(`#${EDITOR_CONTAINER_ID}`);
}

/**
 * Push each card below the previous one so they never overlap. `heightOf`
 * returns the height to reserve for a card (measured when available, otherwise
 * the estimate).
 */
function resolveOverlap<T extends MarginItem>(
    positioned: MarginAnchor<T>[],
    heightOf: (id: string) => number,
    gap: number
): MarginAnchor<T>[] {
    const out = positioned.map((p) => ({ ...p }));
    for (let i = 1; i < out.length; i++) {
        const minTop = out[i - 1].top + heightOf(out[i - 1].id) + gap;
        if (out[i].top < minTop) out[i].top = minTop;
    }
    return out;
}

export function useMarginCards<T extends MarginItem>(
    editor: Editor,
    options: UseMarginCardsOptions<T>
): UseMarginCardsResult<T> {
    const {
        side,
        collect,
        cardWidth = 300,
        gutter = 16,
        viewportPadding = 12,
        minVisible = 140,
        estimatedHeight = 80,
        gap = 12,
        disabled = false,
    } = options;

    const [panelLeft, setPanelLeft] = useState<number | null>(null);
    const [panelWidth, setPanelWidth] = useState<number>(cardWidth);
    const [anchors, setAnchors] = useState<MarginAnchor<T>[]>([]);

    // Raw collected items for the latest doc state (no positions yet).
    const rawRef = useRef<T[]>([]);
    // Registered card DOM nodes, keyed by id, for height measurement.
    const elsRef = useRef<Map<string, HTMLElement>>(new Map());
    // Last measured heights, keyed by id.
    const heightsRef = useRef<Map<string, number>>(new Map());

    const heightOf = useCallback(
        (id: string) => heightsRef.current.get(id) ?? estimatedHeight,
        [estimatedHeight]
    );

    const registerCard = useCallback(
        (id: string) => (el: HTMLElement | null) => {
            if (el) elsRef.current.set(id, el);
            else elsRef.current.delete(id);
        },
        []
    );

    /** Recompute panelLeft / panelWidth and every anchor's clamped top. */
    const reflow = useCallback(() => {
        if (!editor || editor.isDestroyed || disabled) return;

        // Hidden tab guard. Inactive tab layers are kept mounted but hidden —
        // either display:none (0×0 rect) or, in the LRU tab pool, an
        // `aria-hidden="true"` + opacity-0 layer that keeps full size. Either
        // way our cards are portaled to <body>, so without this guard a
        // backgrounded tab's cards would float over the visible tab.
        if (editor.view.dom.closest('[aria-hidden="true"]')) {
            setPanelLeft(null);
            return;
        }
        const pm = editor.view.dom.getBoundingClientRect();
        if (pm.width === 0 && pm.height === 0) {
            setPanelLeft(null);
            return;
        }

        const container = getContainer(editor)?.getBoundingClientRect();
        const ec = container ?? {
            left: 0,
            right: window.innerWidth,
            top: 0,
            bottom: window.innerHeight,
        };

        // Horizontal: place the card in the chosen gutter, between the text
        // column edge and the editor container edge — never the window/sidebar.
        let available: number;
        let left: number;
        let width: number;
        if (side === "right") {
            const start = pm.right + gutter;
            const end = ec.right - viewportPadding;
            available = end - start;
            width = Math.min(cardWidth, available);
            left = start; // hug the text's right edge
        } else {
            const start = ec.left + viewportPadding;
            const end = pm.left - gutter;
            available = end - start;
            width = Math.min(cardWidth, available);
            left = end - width; // right-align so the card hugs the text's left edge
        }

        if (available < minVisible) {
            setPanelLeft(null);
            return;
        }
        setPanelWidth(width);
        setPanelLeft(left);

        // Vertical: anchor each item to its doc position, dropping any whose
        // anchor scrolled outside the visible editor viewport.
        const bounds = { top: ec.top, bottom: ec.bottom };
        const positioned: MarginAnchor<T>[] = [];
        for (const item of rawRef.current) {
            try {
                const coords = editor.view.coordsAtPos(item.from);
                if (coords.top < bounds.top || coords.top > bounds.bottom) continue;
                positioned.push({ ...item, top: coords.top });
            } catch {
                /* position not renderable — skip */
            }
        }
        setAnchors(resolveOverlap(positioned, heightOf, gap));
    }, [
        editor,
        disabled,
        side,
        cardWidth,
        gutter,
        viewportPadding,
        minVisible,
        gap,
        heightOf,
    ]);

    /** Re-collect items from the document, then reflow. */
    const refresh = useCallback(() => {
        if (!editor || editor.isDestroyed) return;
        rawRef.current = disabled ? [] : collect(editor);
        reflow();
    }, [editor, disabled, collect, reflow]);

    useEffect(() => {
        if (!editor) return;

        if (disabled) {
            setPanelLeft(null);
            setAnchors([]);
            return;
        }

        const onTransaction = () => {
            rawRef.current = collect(editor);
            requestAnimationFrame(reflow);
        };
        const onScrollOrResize = () => requestAnimationFrame(reflow);

        // Initial pass.
        rawRef.current = collect(editor);
        reflow();

        editor.on("transaction", onTransaction);
        const container = getContainer(editor);
        container?.addEventListener("scroll", onScrollOrResize, { passive: true });
        window.addEventListener("resize", onScrollOrResize, { passive: true });

        // Catch tab show/hide (display:none toggles fire no scroll/transaction).
        const io = new IntersectionObserver(() => requestAnimationFrame(reflow));
        io.observe(editor.view.dom);

        // The LRU tab pool hides inactive editors with opacity (not display:none)
        // and flips `aria-hidden` on the tab layer — which fires no scroll /
        // transaction / intersection event. Watch that attribute so a card hides
        // the instant its tab is backgrounded and reappears when it returns.
        const ariaTarget = editor.view.dom.closest<HTMLElement>("[aria-hidden]");
        const mo = ariaTarget
            ? new MutationObserver(() => requestAnimationFrame(reflow))
            : null;
        mo?.observe(ariaTarget as HTMLElement, {
            attributes: true,
            attributeFilter: ["aria-hidden"],
        });

        return () => {
            editor.off("transaction", onTransaction);
            container?.removeEventListener("scroll", onScrollOrResize);
            window.removeEventListener("resize", onScrollOrResize);
            io.disconnect();
            mo?.disconnect();
        };
    }, [editor, disabled, collect, reflow]);

    // Measure real card heights after paint and re-resolve overlap. Runs
    // synchronously before the browser paints so there's no visible jump.
    const anchorKey = useMemo(
        () => anchors.map((a) => a.id).join("|"),
        [anchors]
    );
    useLayoutEffect(() => {
        if (disabled || anchors.length === 0) return;

        const measure = () => {
            let changed = false;
            for (const a of anchors) {
                const el = elsRef.current.get(a.id);
                if (!el) continue;
                const h = el.offsetHeight;
                if (heightsRef.current.get(a.id) !== h) {
                    heightsRef.current.set(a.id, h);
                    changed = true;
                }
            }
            if (changed) {
                setAnchors((prev) => resolveOverlap(prev, heightOf, gap));
            }
        };

        measure();

        // Re-measure when a card's own content changes height (typing, wrap…).
        const ro = new ResizeObserver(measure);
        for (const a of anchors) {
            const el = elsRef.current.get(a.id);
            if (el) ro.observe(el);
        }
        return () => ro.disconnect();
        // anchorKey captures membership; heightOf/gap are stable per options.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [anchorKey, disabled, gap, heightOf]);

    return { panelLeft, panelWidth, anchors, registerCard };
}
