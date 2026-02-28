import { useActive } from "@editor/hooks";
import { Toggle, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@kn/ui";
import { Editor } from "@tiptap/core";
import React, { useCallback } from "react";
import { MessageCircleMore } from "@kn/icon";

export const CommentStaticMenu: React.FC<{ editor: Editor }> = (props) => {
    const { editor } = props;

    const isCommentActive = useActive(editor, 'comment');

    const handleToggleComment = useCallback(() => {
        const { selection } = editor.state;

        if (selection.empty) {
            return;
        }

        if (isCommentActive) {
            const attrs = editor.getAttributes('comment');
            const threadId = attrs.thread_id;
            if (threadId) {
                editor.commands.resolveThread(threadId);
            }
        } else {
            editor.commands.addComment('');
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
