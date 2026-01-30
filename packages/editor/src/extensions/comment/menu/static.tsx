import { useActive } from "@editor/hooks";
import { Toggle, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@kn/ui";
import { Editor } from "@tiptap/core";
import React, { useCallback } from "react";
import Comments from "../comment";
import { MessageCircleMore } from "@kn/icon";

export const CommentStaticMenu: React.FC<{ editor: Editor }> = (props) => {
    const { editor } = props;

    const isCommentActive = useActive(editor, Comments.name);

    const handleToggleComment = useCallback(() => {
        const { state } = editor;
        const { selection } = state;

        // Check if there's a text selection
        if (selection.empty) {
            // No text selected, show a warning
            console.warn('[Comment] Please select text to add a comment');
            return;
        }

        if (isCommentActive) {
            // If comment is active, remove it
            const attrs = editor.getAttributes('comment');
            const threadId = attrs.comment_id;

            if (threadId) {
                const storage: any = {}
                const thread = storage?.comments?.find((t: any) => t.threadId === threadId);

                if (thread && thread.comments && thread.comments.length > 0) {
                    // Remove the first comment which will remove the entire thread if it's the only one
                    editor.commands.removeSpecificComment(threadId, thread.comments[0].uuid);
                }
            }
        } else {
            // Add a new comment mark with placeholder
            // editor.addComments({ comment: '', parent_id: null });
        }
    }, [editor, isCommentActive]);

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Toggle
                        size="sm"
                        pressed={isCommentActive}
                        onClick={handleToggleComment}
                        aria-label="Toggle comment"
                    >
                        <MessageCircleMore className="h-4 w-4" />
                    </Toggle>
                </TooltipTrigger>
                <TooltipContent>
                    <p>{isCommentActive ? 'Remove comment' : 'Add comment'}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
};