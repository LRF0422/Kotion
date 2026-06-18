import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Editor } from "@kn/editor";
import { useIsMobile } from "@kn/ui";
import { StickyNoteCard } from "./StickyNoteCard";
import { StickyNoteSheet } from "./StickyNoteSheet";

interface NotePosition {
    noteId: string;
    color: string;
    content: string;
    from: number;
    to: number;
    top: number; // viewport-relative Y
}

/**
 * Walk the document and collect all sticky-note marks.
 */
function getNotes(editor: Editor): Omit<NotePosition, "top">[] {
    const { doc } = editor.state;
    const markType = editor.schema.marks.stickyNote;
    if (!markType) return [];

    const map = new Map<string, { from: number; to: number; color: string; content: string }>();

    doc.descendants((node, pos) => {
        if (!node.isText) return;
        const mark = node.marks.find((m) => m.type === markType);
        if (!mark) return;

        const noteId = mark.attrs.note_id;
        if (!noteId) return;

        const existing = map.get(noteId);
        if (existing) {
            existing.to = Math.max(existing.to, pos + node.nodeSize);
        } else {
            map.set(noteId, {
                from: pos,
                to: pos + node.nodeSize,
                color: mark.attrs.color || "yellow",
                content: mark.attrs.content || "",
            });
        }
    });

    const list: Omit<NotePosition, "top">[] = [];
    map.forEach((v, noteId) => {
        list.push({ noteId, from: v.from, to: v.to, color: v.color, content: v.content });
    });
    list.sort((a, b) => a.from - b.from);
    return list;
}

const CARD_WIDTH = 280;
const CARD_MIN_HEIGHT = 80;
const GAP = 12;
const VIEWPORT_PADDING = 12;
// Horizontal gap kept between a card's right edge and where the editor text
// starts. The card's right edge is hard-clamped to `textLeft - GUTTER` so a
// card can never cover the text.
const GUTTER = 16;
// If the left margin can't fit a card at least this wide, hide the cards
// entirely instead of letting them overlap the text.
const CARD_MIN_VISIBLE = 140;

/**
 * Compute viewport-relative `top` and resolve overlap by pushing
 * subsequent cards downward.
 *
 * `bounds` is the visible vertical range of the editor's scroll container.
 * Notes whose anchor has scrolled out of that range are dropped so their
 * fixed cards don't float over the toolbar / page chrome above the editor.
 */
function calcPositions(
    editor: Editor,
    raw: Omit<NotePosition, "top">[],
    bounds: { top: number; bottom: number }
): NotePosition[] {
    const positioned: NotePosition[] = [];
    for (const note of raw) {
        try {
            const coords = editor.view.coordsAtPos(note.from);
            // Skip notes whose anchor is scrolled above/below the visible
            // editor viewport. Otherwise the card overlaps unrelated elements.
            if (coords.top < bounds.top || coords.top > bounds.bottom) continue;
            positioned.push({ ...note, top: coords.top });
        } catch {
            /* skip */
        }
    }
    // Second pass: resolve overlap using estimated heights (before measurement)
    for (let i = 1; i < positioned.length; i++) {
        const minTop = positioned[i - 1].top + CARD_MIN_HEIGHT + GAP;
        if (positioned[i].top < minTop) positioned[i].top = minTop;
    }
    return positioned;
}

/**
 * Resolve overlap using actual measured card heights.
 */
function resolveOverlapWithHeights(
    positions: NotePosition[],
    heights: Record<string, number>
): NotePosition[] {
    const adjusted = positions.map((p) => ({ ...p }));
    for (let i = 1; i < adjusted.length; i++) {
        const prevH = heights[adjusted[i - 1].noteId] || CARD_MIN_HEIGHT;
        const minTop = adjusted[i - 1].top + prevH + GAP;
        if (adjusted[i].top < minTop) {
            adjusted[i].top = minTop;
        }
    }
    return adjusted;
}

export const StickyNoteMarginPanel: React.FC<{ editor: Editor }> = ({ editor }) => {
    const isMobile = useIsMobile();
    const [notes, setNotes] = useState<NotePosition[]>([]);
    const [panelLeft, setPanelLeft] = useState<number | null>(null);
    const [panelWidth, setPanelWidth] = useState<number>(CARD_WIDTH);
    const rawRef = useRef<Omit<NotePosition, "top">[]>([]);
    const [heightMap, setHeightMap] = useState<Record<string, number>>({});
    // Mobile: which note's bottom-sheet is open (mirrors editor.storage.stickyNote.activeNoteId).
    const [activeNoteId, setActiveNoteId] = useState<string | null>(null);

    const closeActiveNote = useCallback(() => {
        const storage = (editor?.storage as any)?.stickyNote;
        if (storage) storage.activeNoteId = null;
        setActiveNoteId(null);
    }, [editor]);

    const refreshData = useCallback(() => {
        if (!editor || editor.isDestroyed) return;
        rawRef.current = getNotes(editor);
    }, [editor]);

    const refreshPositions = useCallback(() => {
        if (!editor || editor.isDestroyed) return;
        // Mobile uses a bottom sheet, not margin cards — no positioning needed.
        if (isMobile) return;

        const proseMirrorEl = editor.view.dom;
        if (!proseMirrorEl) return;

        const rect = proseMirrorEl.getBoundingClientRect();
        // A background tab renders its editor with `display:none`, collapsing the
        // editor DOM to 0×0. Because the cards are portaled to <body>, a hidden
        // tab would otherwise leave them floating over whatever tab is now
        // visible — so hide them whenever the editor isn't actually on screen.
        if (rect.width === 0 && rect.height === 0) {
            setPanelLeft(null);
            return;
        }

        // Cards live in the LEFT margin of the editor and must never cover the
        // text. `maxRight` is the hard boundary a card's right edge may not
        // cross; `available` is the usable width between the viewport padding
        // and that boundary.
        const maxRight = rect.left - GUTTER;
        const available = maxRight - VIEWPORT_PADDING;

        if (available < CARD_MIN_VISIBLE) {
            // Not enough room to show a card without overlapping the text
            // (narrow window / wide sidebar). Hide rather than cover text.
            setPanelLeft(null);
        } else {
            // Prefer the full width, shrink to fit the margin. Right-align
            // against `maxRight` so the card hugs the text edge; since the width
            // never exceeds `available`, the left stays >= padding.
            const width = Math.min(CARD_WIDTH, available);
            setPanelWidth(width);
            setPanelLeft(maxRight - width);
        }

        // Visible vertical range of the editor's scroll container. Cards are
        // clamped to this so they never float over the toolbar (a sibling
        // rendered above #editor-container) or below the editor when scrolling.
        const container = document.getElementById("editor-container");
        const bounds = container
            ? (() => {
                  const r = container.getBoundingClientRect();
                  return { top: r.top, bottom: r.bottom };
              })()
            : { top: 0, bottom: window.innerHeight };

        setNotes(calcPositions(editor, rawRef.current, bounds));
    }, [editor, isMobile]);

    useEffect(() => {
        if (!editor) return;

        const handleUpdate = () => {
            refreshData();
            setActiveNoteId(((editor.storage as any).stickyNote?.activeNoteId ?? null));
            requestAnimationFrame(refreshPositions);
        };

        handleUpdate();
        editor.on("transaction", handleUpdate);

        const editorContainer = document.getElementById("editor-container");
        const handleScroll = () => requestAnimationFrame(refreshPositions);
        editorContainer?.addEventListener("scroll", handleScroll, { passive: true });
        window.addEventListener("resize", handleScroll, { passive: true });

        // Re-run positioning when the editor itself is shown/hidden — switching
        // tabs toggles `display:none` on a background editor (no transaction /
        // scroll fires), and the portaled cards must hide with their tab.
        const visibilityObserver = new IntersectionObserver(() => {
            requestAnimationFrame(refreshPositions);
        });
        visibilityObserver.observe(editor.view.dom);

        return () => {
            editor.off("transaction", handleUpdate);
            editorContainer?.removeEventListener("scroll", handleScroll);
            window.removeEventListener("resize", handleScroll);
            visibilityObserver.disconnect();
        };
    }, [editor, refreshData, refreshPositions]);

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

    /**
     * Read actual rendered heights of all card DOM elements by data-note-id.
     * StickyNoteCard sets data-note-id on its outermost fixed div.
     */
    const measureHeights = useCallback((noteIds: string[]): Record<string, number> => {
        const heights: Record<string, number> = {};
        for (const id of noteIds) {
            const el = document.querySelector<HTMLElement>(`[data-note-id="${id}"]`);
            if (el) heights[id] = el.offsetHeight;
        }
        return heights;
    }, []);

    // Measure actual card heights after render and re-layout to prevent overlap.
    // useLayoutEffect runs synchronously before paint — no visual flash.
    useLayoutEffect(() => {
        const ids = notes.map((n) => n.noteId);
        const heights = measureHeights(ids);
        if (Object.keys(heights).length === 0) return;

        const adjusted = resolveOverlapWithHeights(notes, heights);
        const changed = adjusted.some((a, i) => a.top !== notes[i].top);
        if (changed) setNotes(adjusted);
        setHeightMap(heights);
    }, [notes, measureHeights]);

    // Watch for card height changes (user typing, content wrapping, etc.)
    useEffect(() => {
        const observer = new ResizeObserver(() => {
            const ids = notes.map((n) => n.noteId);
            const heights = measureHeights(ids);
            setHeightMap((prev) => {
                const same =
                    Object.keys(prev).length === Object.keys(heights).length &&
                    Object.entries(heights).every(([k, v]) => prev[k] === v);
                return same ? prev : heights;
            });
        });
        for (const note of notes) {
            const el = document.querySelector<HTMLElement>(`[data-note-id="${note.noteId}"]`);
            if (el) observer.observe(el);
        }
        return () => observer.disconnect();
    }, [notes, measureHeights]);

    // When heights change (e.g. user types in a card), re-resolve overlap
    useEffect(() => {
        if (Object.keys(heightMap).length === 0) return;
        setNotes((prev) => {
            const adjusted = resolveOverlapWithHeights(prev, heightMap);
            const changed = adjusted.some((a, i) => a.top !== prev[i].top);
            return changed ? adjusted : prev;
        });
    }, [heightMap]);

    // Mobile: no room for margin cards. Each note shows an inline marker (a
    // ProseMirror widget rendered by the extension); tapping it sets
    // activeNoteId, and we present that note in a bottom sheet for editing.
    if (isMobile) {
        const active = activeNoteId
            ? rawRef.current.find((n) => n.noteId === activeNoteId)
            : undefined;
        if (!active) return null;
        return (
            <StickyNoteSheet
                open
                onOpenChange={(open) => { if (!open) closeActiveNote(); }}
                color={active.color}
                content={active.content}
                isEditable={editor.isEditable}
                onContentChange={(c) => handleContentChange(active.noteId, c)}
                onColorChange={(c) => handleColorChange(active.noteId, c)}
                onDelete={() => { handleDelete(active.noteId); closeActiveNote(); }}
            />
        );
    }

    if (panelLeft === null || notes.length === 0) return null;

    // Render into <body> so the cards escape any ancestor with a CSS `transform`
    // (e.g. the tab/workspace switcher). A transformed ancestor turns
    // `position: fixed` into "relative to that ancestor", which would offset the
    // cards away from the viewport coordinates we computed and push them over
    // the text. document.body has no such transform, so `fixed` stays
    // viewport-relative and the computed left/top land correctly.
    return createPortal(
        <>
            {notes.map((note) => (
                <StickyNoteCard
                    key={note.noteId}
                    noteId={note.noteId}
                    color={note.color}
                    content={note.content}
                    top={note.top}
                    left={panelLeft}
                    width={panelWidth}
                    isEditable={editor.isEditable}
                    onContentChange={(c) => handleContentChange(note.noteId, c)}
                    onColorChange={(c) => handleColorChange(note.noteId, c)}
                    onDelete={() => handleDelete(note.noteId)}
                />
            ))}
        </>,
        document.body
    );
};
