import React, { useCallback, useEffect, useRef, useState } from "react";
import { Editor } from "@kn/editor";
import { StickyNoteCard } from "./StickyNoteCard";

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
const CARD_MIN_HEIGHT = 70;
const GAP = 8;
const VIEWPORT_PADDING = 12;

/**
 * Compute viewport-relative `top` and resolve overlap by pushing
 * subsequent cards downward.
 */
function calcPositions(editor: Editor, raw: Omit<NotePosition, "top">[]): NotePosition[] {
    const positioned: NotePosition[] = [];
    for (const note of raw) {
        try {
            const coords = editor.view.coordsAtPos(note.from);
            positioned.push({ ...note, top: coords.top });
        } catch {
            /* skip */
        }
    }
    for (let i = 1; i < positioned.length; i++) {
        const minTop = positioned[i - 1].top + CARD_MIN_HEIGHT + GAP;
        if (positioned[i].top < minTop) positioned[i].top = minTop;
    }
    return positioned;
}

export const StickyNoteMarginPanel: React.FC<{ editor: Editor }> = ({ editor }) => {
    const [notes, setNotes] = useState<NotePosition[]>([]);
    const [panelLeft, setPanelLeft] = useState<number | null>(null);
    const rawRef = useRef<Omit<NotePosition, "top">[]>([]);

    const refreshData = useCallback(() => {
        if (!editor || editor.isDestroyed) return;
        rawRef.current = getNotes(editor);
    }, [editor]);

    const refreshPositions = useCallback(() => {
        if (!editor || editor.isDestroyed) return;

        const proseMirrorEl = editor.view.dom;
        if (proseMirrorEl) {
            const rect = proseMirrorEl.getBoundingClientRect();
            // Place cards in the LEFT margin of the editor.
            const idealLeft = rect.left - CARD_WIDTH - 16;
            const minLeft = VIEWPORT_PADDING;
            setPanelLeft(Math.max(idealLeft, minLeft));
        }

        setNotes(calcPositions(editor, rawRef.current));
    }, [editor]);

    useEffect(() => {
        if (!editor) return;

        const handleUpdate = () => {
            refreshData();
            requestAnimationFrame(refreshPositions);
        };

        handleUpdate();
        editor.on("transaction", handleUpdate);

        const editorContainer = document.getElementById("editor-container");
        const handleScroll = () => requestAnimationFrame(refreshPositions);
        editorContainer?.addEventListener("scroll", handleScroll, { passive: true });
        window.addEventListener("resize", handleScroll, { passive: true });

        return () => {
            editor.off("transaction", handleUpdate);
            editorContainer?.removeEventListener("scroll", handleScroll);
            window.removeEventListener("resize", handleScroll);
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

    if (panelLeft === null || notes.length === 0) return null;

    return (
        <>
            {notes.map((note) => (
                <StickyNoteCard
                    key={note.noteId}
                    noteId={note.noteId}
                    color={note.color}
                    content={note.content}
                    top={note.top}
                    left={panelLeft}
                    width={CARD_WIDTH}
                    isEditable={editor.isEditable}
                    onContentChange={(c) => handleContentChange(note.noteId, c)}
                    onColorChange={(c) => handleColorChange(note.noteId, c)}
                    onDelete={() => handleDelete(note.noteId)}
                />
            ))}
        </>
    );
};
