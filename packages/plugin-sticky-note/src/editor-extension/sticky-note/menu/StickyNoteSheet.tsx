import React from "react";
import { Sheet, SheetContent, SheetTitle } from "@kn/ui";
import { StickyNoteCard } from "./StickyNoteCard";

export interface StickyNoteSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    color: string;
    content: string;
    isEditable: boolean;
    onContentChange: (content: string) => void;
    onColorChange: (color: string) => void;
    onDelete: () => void;
}

/**
 * Mobile presentation of a sticky note. Opened by tapping the inline marker on
 * the note's highlighted text. The sheet itself is stripped of all chrome
 * (no white panel, title bar or close button) so what slides up *is* the
 * sticky note — a post-it docked to the bottom edge. Tap the dimmed backdrop
 * to dismiss; delete from the note's own toolbar.
 */
export const StickyNoteSheet: React.FC<StickyNoteSheetProps> = ({
    open,
    onOpenChange,
    color,
    content,
    isEditable,
    onContentChange,
    onColorChange,
    onDelete,
}) => {
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="bottom"
                // Strip the default sheet chrome: transparent, no padding/border/
                // shadow, and hide the built-in close button ([&>button] targets
                // only SheetContent's direct child — the Radix Close).
                className="border-0 bg-transparent p-0 shadow-none [&>button]:hidden"
            >
                {/* Required for dialog a11y, but visually hidden. */}
                <SheetTitle className="sr-only">便签</SheetTitle>
                <StickyNoteCard
                    variant="sheet"
                    noteId=""
                    color={color}
                    content={content}
                    top={0}
                    left={0}
                    width={0}
                    isEditable={isEditable}
                    onContentChange={onContentChange}
                    onColorChange={onColorChange}
                    onDelete={onDelete}
                />
            </SheetContent>
        </Sheet>
    );
};
