import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Editor, useMarginCards } from "@kn/editor";
import type { Transaction } from "@kn/editor";
import { useIsMobile } from "@kn/ui";
import { useTranslation } from "@kn/common";
import { StickyNoteCard } from "./StickyNoteCard";
import { StickyNoteSheet } from "./StickyNoteSheet";
import {
    collectStickyNotes,
    stickyNoteUIKey,
    type StickyNoteUIState,
} from "../sticky-note";

interface NoteItem {
    id: string;
    from: number;
    to: number;
    color: string;
    content: string;
}

/**
 * Collect every sticky-note mark as a positionable item for the margin panel.
 */
function getNotes(editor: Editor): NoteItem[] {
    const markType = editor.schema.marks.stickyNote;
    return collectStickyNotes(editor.state.doc, markType)
        .map((n) => ({ id: n.noteId, from: n.from, to: n.to, color: n.color, content: n.content }))
        .sort((a, b) => a.from - b.from);
}

/**
 * Subscribe to the sticky-note UI plugin state and return the latest snapshot.
 * Filters Tiptap focus/blur meta-only transactions so a Radix Dialog / Sheet /
 * DropdownMenu opening doesn't wake us up (same trick as useMarginCards).
 */
function useStickyNoteUIState(editor: Editor): StickyNoteUIState {
    const [state, setState] = useState<StickyNoteUIState>(() => ({
        activeNoteId: null,
        hoveredNoteId: null,
    }));
    useEffect(() => {
        if (!editor) return;
        const read = () => {
            const s = stickyNoteUIKey.getState(editor.state) as StickyNoteUIState | undefined;
            setState({
                activeNoteId: s?.activeNoteId ?? null,
                hoveredNoteId: s?.hoveredNoteId ?? null,
            });
        };
        const onTx = ({ transaction }: { transaction: Transaction }) => {
            const isFocusBlurOnly =
                !transaction.docChanged &&
                !transaction.selectionSet &&
                (transaction.getMeta("focus") != null ||
                    transaction.getMeta("blur") != null);
            if (isFocusBlurOnly) return;
            read();
        };
        read();
        editor.on("transaction", onTx);
        return () => { editor.off("transaction", onTx); };
    }, [editor]);
    return state;
}

/**
 * Mobile-only: compute the vertical viewport position of each sticky note's
 * anchor so we can render a small marker in the right gutter. Doesn't share
 * `useMarginCards` because we anchor to viewport-right (not the text column
 * edge), and we don't need overlap resolution — markers are 6×24 and can stack
 * pixel-tight if the doc happens to have overlapping notes.
 */
function useMobileMarkerAnchors(
    editor: Editor,
    notes: NoteItem[],
    enabled: boolean
) {
    const [tops, setTops] = useState<Record<string, number>>({});
    useEffect(() => {
        if (!enabled || !editor) {
            setTops({});
            return;
        }
        const compute = () => {
            if (editor.isDestroyed) return;
            const next: Record<string, number> = {};
            for (const n of notes) {
                try {
                    const coords = editor.view.coordsAtPos(n.from);
                    if (coords.top < 0 || coords.top > window.innerHeight) continue;
                    next[n.id] = coords.top;
                } catch {
                    /* skip */
                }
            }
            setTops(next);
        };
        compute();
        const onTx = ({ transaction }: { transaction: Transaction }) => {
            const isFocusBlurOnly =
                !transaction.docChanged &&
                !transaction.selectionSet &&
                (transaction.getMeta("focus") != null ||
                    transaction.getMeta("blur") != null);
            if (isFocusBlurOnly) return;
            requestAnimationFrame(compute);
        };
        const onScroll = () => requestAnimationFrame(compute);
        editor.on("transaction", onTx);
        window.addEventListener("scroll", onScroll, { passive: true, capture: true });
        window.addEventListener("resize", onScroll, { passive: true });
        // Async node-view growth (bitable rows, images, embeds) moves anchors
        // without any transaction or scroll — re-anchor instead of drifting.
        const ro = new ResizeObserver(() => requestAnimationFrame(compute));
        ro.observe(editor.view.dom);
        return () => {
            editor.off("transaction", onTx);
            window.removeEventListener("scroll", onScroll, { capture: true } as any);
            window.removeEventListener("resize", onScroll);
            ro.disconnect();
        };
    }, [editor, notes, enabled]);
    return tops;
}

export const StickyNoteMarginPanel: React.FC<{ editor: Editor }> = ({ editor }) => {
    const isMobile = useIsMobile();
    const { t } = useTranslation();
    const { activeNoteId, hoveredNoteId } = useStickyNoteUIState(editor);

    const { panelLeft, panelWidth, anchors, registerCard } = useMarginCards<NoteItem>(editor, {
        side: "left",
        cardWidth: 280,
        minVisible: 140,
        collect: getNotes,
        disabled: isMobile,
    });

    // Notes list for mobile. Only recomputes when the doc actually changes.
    const mobileNotes = useMemo(
        () => (isMobile ? getNotes(editor) : []),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [isMobile, editor, editor.state.doc]
    );

    const mobileMarkerTops = useMobileMarkerAnchors(editor, mobileNotes, isMobile);

    const setActive = useCallback(
        (noteId: string | null) => {
            editor.commands.focusStickyNote(noteId);
        },
        [editor]
    );

    const closeActiveNote = useCallback(() => {
        editor.commands.focusStickyNote(null);
        editor.commands.hoverStickyNote(null);
    }, [editor]);

    // Scroll the active card into view (desktop only). Guards against triggering
    // on the initial null → null "change".
    const lastScrolledRef = useRef<string | null>(null);
    useEffect(() => {
        if (isMobile) return;
        if (!activeNoteId) {
            lastScrolledRef.current = null;
            return;
        }
        if (lastScrolledRef.current === activeNoteId) return;
        lastScrolledRef.current = activeNoteId;
        const el = document.querySelector(
            `.sticky-note-card-enter[data-note-id="${activeNoteId}"]`
        );
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, [activeNoteId, isMobile]);

    const handleContentChange = useCallback(
        (noteId: string, content: string) => {
            editor.commands.updateStickyNoteContent(noteId, content);
        },
        [editor]
    );

    const handleColorChange = useCallback(
        (noteId: string, color: string) => {
            editor.commands.updateStickyNoteColor(noteId, color);
        },
        [editor]
    );

    const handleDelete = useCallback(
        (noteId: string) => {
            editor.commands.removeStickyNote(noteId);
        },
        [editor]
    );

    const handleHoverChange = useCallback(
        (noteId: string | null) => {
            editor.commands.hoverStickyNote(noteId);
        },
        [editor]
    );

    // ── Mobile ────────────────────────────────────────────────────────────
    // Render one gutter marker per note (right edge of the viewport) plus a
    // bottom sheet for the active note. The old inline widget marker is gone —
    // it used to sit at `n.to`, which often fell in the middle of a paragraph
    // and broke the text flow.
    if (isMobile) {
        const active = activeNoteId
            ? mobileNotes.find((n) => n.id === activeNoteId)
            : undefined;
        return createPortal(
            <>
                {mobileNotes.map((n) => {
                    const top = mobileMarkerTops[n.id];
                    if (top == null) return null;
                    return (
                        <button
                            key={n.id}
                            type="button"
                            className="sticky-note-gutter-marker"
                            data-color={n.color}
                            style={{ top: `${top}px` }}
                            aria-label={t("stickyNote.open")}
                            onClick={() => setActive(n.id)}
                        />
                    );
                })}
                {active && (
                    <StickyNoteSheet
                        open
                        onOpenChange={(open) => { if (!open) closeActiveNote(); }}
                        color={active.color}
                        content={active.content}
                        isEditable={editor.isEditable}
                        onContentChange={(c) => handleContentChange(active.id, c)}
                        onColorChange={(c) => handleColorChange(active.id, c)}
                        onDelete={() => { handleDelete(active.id); closeActiveNote(); }}
                    />
                )}
            </>,
            document.body
        );
    }

    if (panelLeft === null || anchors.length === 0) return null;

    // Render into <body> so the cards escape any ancestor with a CSS `transform`
    // (e.g. the tab/workspace switcher). A transformed ancestor turns
    // `position: fixed` into "relative to that ancestor", which would offset the
    // cards away from the viewport coordinates we computed and push them over
    // the text. document.body has no such transform, so `fixed` stays
    // viewport-relative and the computed left/top land correctly.
    return createPortal(
        <>
            {anchors.map((note) => (
                <StickyNoteCard
                    key={note.id}
                    registerRef={registerCard(note.id)}
                    noteId={note.id}
                    color={note.color}
                    content={note.content}
                    top={note.top}
                    left={panelLeft}
                    width={panelWidth}
                    isEditable={editor.isEditable}
                    isActive={activeNoteId === note.id}
                    isHovered={hoveredNoteId === note.id}
                    onHoverChange={handleHoverChange}
                    onContentChange={(c) => handleContentChange(note.id, c)}
                    onColorChange={(c) => handleColorChange(note.id, c)}
                    onDelete={() => handleDelete(note.id)}
                />
            ))}
        </>,
        document.body
    );
};
