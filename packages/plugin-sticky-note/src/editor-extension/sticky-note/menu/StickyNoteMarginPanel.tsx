import React, { useCallback, useEffect, useState } from "react";
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

    const { panelLeft, panelWidth, anchors, registerCard } = useMarginCards<NoteItem>(editor, {
        side: "left",
        cardWidth: 280,
        minVisible: 140,
        collect: getNotes,
        disabled: isMobile,
    });

    const closeActiveNote = useCallback(() => {
        const storage = (editor?.storage as any)?.stickyNote;
        if (storage) storage.activeNoteId = null;
        setActiveNoteId(null);
    }, [editor]);

    // Mirror the extension's active note (set by tapping an inline marker on mobile).
    useEffect(() => {
        if (!editor) return;
        const sync = () => setActiveNoteId((editor.storage as any).stickyNote?.activeNoteId ?? null);
        sync();
        editor.on("transaction", sync);
        return () => { editor.off("transaction", sync); };
    }, [editor]);

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

    // Mobile: no room for margin cards. Each note shows an inline marker (a
    // ProseMirror widget rendered by the extension); tapping it sets
    // activeNoteId, and we present that note in a bottom sheet for editing.
    if (isMobile) {
        const active = activeNoteId
            ? getNotes(editor).find((n) => n.id === activeNoteId)
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
                    onContentChange={(c) => handleContentChange(note.id, c)}
                    onColorChange={(c) => handleColorChange(note.id, c)}
                    onDelete={() => handleDelete(note.id)}
                />
            ))}
        </>,
        document.body
    );
};
