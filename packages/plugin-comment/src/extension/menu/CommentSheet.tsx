import React from "react";
import type { CommentItem as CommentItemType } from "../types";
import { Sheet, SheetContent, SheetTitle } from "@kn/ui";
import { CommentThread } from "./CommentThread";
import { CommentInput } from "./CommentInput";

export interface CommentSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    comments: CommentItemType[];
    isNew: boolean;
    isEditable: boolean;
    currentUserId?: string;
    onReply: (content: string, parentId?: string) => void;
    onEdit: (commentId: string, content: string) => void;
    onDelete: (commentId: string) => void;
    onResolve: () => void;
    onSetFirstComment: (content: string) => void;
}

/**
 * Mobile presentation of a comment thread as a bottom sheet.
 * Mirrors the desktop margin card but adapts to small screens.
 */
export const CommentSheet: React.FC<CommentSheetProps> = ({
    open,
    onOpenChange,
    comments,
    isNew,
    isEditable,
    currentUserId,
    onReply,
    onEdit,
    onDelete,
    onResolve,
    onSetFirstComment,
}) => {
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="bottom"
                className="flex max-h-[85vh] flex-col rounded-t-xl p-0"
            >
                <SheetTitle className="shrink-0 border-b px-4 py-3 text-sm font-semibold">
                    {isNew ? "Add comment" : "Comments"}
                </SheetTitle>
                {isNew ? (
                    <div className="px-4 py-3 pb-safe">
                        <CommentInput
                            autoFocus
                            showAvatar
                            showAttachments
                            placeholder="Write a comment…"
                            onSubmit={onSetFirstComment}
                            onCancel={onResolve}
                        />
                    </div>
                ) : (
                    <CommentThread
                        comments={comments}
                        currentUserId={currentUserId}
                        isEditable={isEditable}
                        onReply={onReply}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        onResolve={onResolve}
                    />
                )}
            </SheetContent>
        </Sheet>
    );
};
