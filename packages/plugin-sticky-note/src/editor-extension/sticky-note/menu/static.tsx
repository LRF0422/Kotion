import React, { useCallback } from "react";
import { useActive, Editor } from "@kn/editor";
import { Toggle, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@kn/ui";
import { StickyNote as StickyNoteIcon } from "@kn/icon";
import { findStickyNoteRange } from "../sticky-note";

/**
 * Toolbar button shown in the floating selection menu (`flotMenuConfig`).
 * Click to add a sticky-note mark on the current text selection,
 * or remove the existing one.
 */
export const StickyNoteStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {
    const isActive = useActive(editor, "stickyNote");

    const handleToggle = useCallback(() => {
        const { selection } = editor.state;

        if (isActive) {
            const attrs = editor.getAttributes("stickyNote");
            const noteId = attrs.note_id;
            if (noteId) {
                editor.commands.removeStickyNote(noteId);
            }
            return;
        }

        if (selection.empty) return;
        editor.commands.addStickyNote();

        // Move caret to the end of the selection so the user can keep typing,
        // and also surface the new card immediately in the margin panel.
        const markType = editor.schema.marks.stickyNote;
        const lastAttrs = editor.getAttributes("stickyNote");
        const noteId = lastAttrs.note_id;
        if (noteId) {
            const range = findStickyNoteRange(editor.state.doc, markType, noteId);
            if (range) {
                editor.chain().focus().setTextSelection(range.to).run();
            }
        }
    }, [editor, isActive]);

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Toggle
                        size="sm"
                        pressed={isActive}
                        onClick={handleToggle}
                        aria-label="Toggle sticky note"
                    >
                        <StickyNoteIcon className="h-4 w-4" />
                    </Toggle>
                </TooltipTrigger>
                <TooltipContent>
                    <p>{isActive ? "Remove sticky note" : "Add sticky note"}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
};
