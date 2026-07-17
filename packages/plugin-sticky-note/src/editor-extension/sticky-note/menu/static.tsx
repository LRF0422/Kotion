import React, { useCallback } from "react";
import { useActive, Editor } from "@kn/editor";
import { Toggle, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@kn/ui";
import { StickyNote as StickyNoteIcon } from "@kn/icon";
import { useTranslation } from "@kn/common";
import { findStickyNoteRange } from "../sticky-note";

/**
 * Toolbar button shown in the floating selection menu (`flotMenuConfig`).
 * Click to add a sticky-note mark on the current text selection,
 * or remove the existing one.
 */
export const StickyNoteStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {
    const isActive = useActive(editor, "stickyNote");
    const { t } = useTranslation();

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

        // addStickyNote already dispatches the "activate this new note" meta on
        // the same transaction, so the margin panel will scroll to and focus
        // the new card automatically. We still collapse the selection to the
        // end of the marked range so a subsequent keystroke doesn't overwrite
        // the just-highlighted text.
        editor.commands.addStickyNote();
        const markType = editor.schema.marks.stickyNote;
        const lastAttrs = editor.getAttributes("stickyNote");
        const noteId = lastAttrs.note_id;
        if (noteId) {
            const range = findStickyNoteRange(editor.state.doc, markType, noteId);
            if (range) {
                editor.chain().setTextSelection(range.to).run();
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
                        aria-label={isActive ? t("stickyNote.remove") : t("stickyNote.add")}
                    >
                        <StickyNoteIcon className="h-4 w-4" />
                    </Toggle>
                </TooltipTrigger>
                <TooltipContent>
                    <p>{isActive ? t("stickyNote.remove") : t("stickyNote.add")}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
};
