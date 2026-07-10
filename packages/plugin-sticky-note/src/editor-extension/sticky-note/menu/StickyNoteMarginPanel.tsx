import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Editor, useMarginCards } from "@kn/editor";
import { useIsMobile } from "@kn/ui";
import { StickyNoteCard } from "./StickyNoteCard";
import { StickyNoteSheet } from "./StickyNoteSheet";
import { collectStickyNotes } from "../sticky-note";

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

export const StickyNoteMarginPanel: React.FC<{ editor: Editor }> = ({ editor }) => {
    const isMobile = useIsMobile();
    // Mobile: which note's bottom-sheet is open (mirrors editor.storage.stickyNote.activeNoteId).
    const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
    // Hovered note — drives bidirectional highlight/card emphasis.
    const [hoveredNoteId, setHoveredNoteId] = useState<string | null>(null);

    const { panelLeft, panelWidth, anchors, registerCard } = useMarginCards<NoteItem>(editor, {
        side: "left",
        cardWidth: 280,
        minVisible: 140,
        collect: getNotes,
        disabled: isMobile,
    });

    // Memoized notes for mobile — avoids walking the doc on every render.
    // Only recomputes when the doc actually changes.
    const mobileNotes = useMemo(
        () => (isMobile ? getNotes(editor) : []),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [isMobile, editor, editor.state.doc]
    );

    const closeActiveNote = useCallback(() => {
        const storage = (editor?.storage as any)?.stickyNote;
        if (storage) {
            storage.activeNoteId = null;
            storage.hoveredNoteId = null;
        }
        setActiveNoteId(null);
        setHoveredNoteId(null);
    }, [editor]);

    // Mirror the extension's active note and hovered note from storage.
    useEffect(() => {
        if (!editor) return;
        const sync = () => {
            const s = (editor.storage as any).stickyNote;
            setActiveNoteId(s?.activeNoteId ?? null);
            setHoveredNoteId(s?.hoveredNoteId ?? null);
        };
        sync();
        editor.on("transaction", sync);
        return () => { editor.off("transaction", sync); };
    }, [editor]);

    // Scroll the active card into view (desktop only).
    useEffect(() => {
        if (!activeNoteId || isMobile) return;
        // The card's outer div carries data-note-id + the sticky-note-card-enter class.
        const el = document.querySelector(
            `.sticky-note-card-enter[data-note-id="${activeNoteId}"]`
        );
        if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    }, [activeNoteId, isMobile]);

    // Card → highlight hover sync: toggle the is-hovered class on the
    // corresponding highlight span(s) in the document.
    useEffect(() => {
        if (!editor || !editor.view) return;
        const dom = editor.view.dom;
        dom
            .querySelectorAll(".sticky-note-highlight.is-hovered")
            .forEach((el) => el.classList.remove("is-hovered"));
        if (hoveredNoteId) {
            dom
                .querySelectorAll(`.sticky-note-highlight[data-note-id="${hoveredNoteId}"]`)
                .forEach((el) => el.classList.add("is-hovered"));
        }
    }, [hoveredNoteId, editor]);

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

    const handleHoverChange = useCallback((noteId: string | null) => {
        const storage = (editor?.storage as any)?.stickyNote;
        if (storage) storage.hoveredNoteId = noteId;
        setHoveredNoteId(noteId);
    }, [editor]);

    const handleActivate = useCallback((noteId: string) => {
        const storage = (editor?.storage as any)?.stickyNote;
        if (storage) storage.activeNoteId = noteId;
        setActiveNoteId(noteId);
    }, [editor]);

    // Mobile: no room for margin cards. Each note shows an inline marker (a
    // ProseMirror widget rendered by the extension); tapping it sets
    // activeNoteId, and we present that note in a bottom sheet for editing.
    if (isMobile) {
        const active = activeNoteId
            ? mobileNotes.find((n) => n.id === activeNoteId)
            : undefined;
        if (!active) return null;
        return (
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
                    onActivate={handleActivate}
                    onContentChange={(c) => handleContentChange(note.id, c)}
                    onColorChange={(c) => handleColorChange(note.id, c)}
                    onDelete={() => handleDelete(note.id)}
                />
            ))}
        </>,
        document.body
    );
};
