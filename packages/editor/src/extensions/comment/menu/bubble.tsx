import { BubbleMenu, BubbleMenuProps } from "@editor/components";
import { Editor, getMarkRange, isMarkActive, posToDOMRect } from "@tiptap/core";
import React, { useCallback, useMemo } from "react";
import type { CommentItem as CommentItemType } from "../types";
import { IconButton, ScrollArea } from "@kn/ui";
import { CheckIcon, Trash2 } from "@kn/icon";
import { useAttributes } from "@editor/hooks";
import { CommentItem } from "./CommentItem";
import { CommentInput } from "./CommentInput";

export const CommentBubbleView: React.FC<{ editor: Editor }> = (props) => {
    const { editor } = props;

    const shouldShow = useCallback<BubbleMenuProps["shouldShow"]>(() => {
        return isMarkActive(editor.state, 'comment');
    }, [editor]);

    const attrs = useAttributes(editor, 'comment', { thread_id: '', comments: '[]' });
    const threadId = (attrs as any).thread_id as string;
    const commentsJson = (attrs as any).comments as string;

    const comments = useMemo<CommentItemType[]>(() => {
        try {
            return JSON.parse(commentsJson || '[]');
        } catch {
            return [];
        }
    }, [commentsJson]);

    const isNewThread = comments.length === 0 || (comments.length === 1 && !comments[0].content);

    const getReferenceClientRect = useCallback(() => {
        const { selection } = editor.state;
        const range = getMarkRange(selection.$from, editor.schema.marks.comment);
        if (range) {
            return posToDOMRect(editor.view, range.from, range.to);
        }
        return posToDOMRect(editor.view, selection.from, selection.to);
    }, [editor]);

    const handleAddComment = useCallback((content: string) => {
        if (!content.trim()) return;

        if (isNewThread && threadId) {
            // This is a new thread with empty first comment - we need to resolve and recreate
            editor.commands.resolveThread(threadId);
            editor.commands.addComment(content);
        } else if (threadId) {
            editor.commands.replyComment(threadId, content);
        }
    }, [editor, threadId, isNewThread]);

    const handleReply = useCallback((parentId: string, content: string) => {
        if (!threadId || !content.trim()) return;
        editor.commands.replyComment(threadId, content, parentId);
    }, [editor, threadId]);

    const handleDeleteComment = useCallback((commentId: string) => {
        if (threadId) {
            editor.commands.deleteComment(threadId, commentId);
        }
    }, [editor, threadId]);

    const handleResolveThread = useCallback(() => {
        if (threadId) {
            editor.commands.resolveThread(threadId);
        }
    }, [editor, threadId]);

    const handleCancelNewComment = useCallback(() => {
        if (threadId) {
            editor.commands.resolveThread(threadId);
        }
    }, [editor, threadId]);

    return (
        <BubbleMenu
            editor={editor}
            shouldShow={shouldShow}
            forNode
            getReferenceClientRect={getReferenceClientRect}
            options={{
                placement: "top"
            }}
        >
            <div className="w-[320px] max-h-[400px] flex flex-col bg-background border rounded-lg shadow-lg">
                {/* Header */}
                <div className="flex justify-between items-center p-3 border-b">
                    <div className="text-sm font-semibold flex items-center gap-2">
                        <span>Comments</span>
                        {!isNewThread && (
                            <span className="text-xs text-muted-foreground">
                                ({comments.length})
                            </span>
                        )}
                    </div>
                    {!isNewThread && (
                        <div className="flex items-center gap-1">
                            <IconButton
                                icon={<CheckIcon className="h-4 w-4" />}
                                onClick={handleResolveThread}
                            />
                            <IconButton
                                icon={<Trash2 className="h-4 w-4" />}
                                onClick={handleResolveThread}
                            />
                        </div>
                    )}
                </div>

                {/* Comments List */}
                {!isNewThread && (
                    <ScrollArea className="flex-1 p-2 max-h-[200px]">
                        {comments.length > 0 ? (
                            comments.map((comment) => (
                                <CommentItem
                                    key={comment.id}
                                    comment={comment}
                                    onReply={handleReply}
                                    onDelete={handleDeleteComment}
                                    isReply={!!comment.parentId}
                                />
                            ))
                        ) : (
                            <div className="p-4 text-center text-sm text-muted-foreground">
                                No comments yet
                            </div>
                        )}
                    </ScrollArea>
                )}

                {/* Comment Input */}
                <CommentInput
                    onSubmit={handleAddComment}
                    placeholder={isNewThread ? "Add your comment..." : "Reply to this thread..."}
                    autoFocus={isNewThread}
                    onCancel={isNewThread ? handleCancelNewComment : undefined}
                />
            </div>
        </BubbleMenu>
    );
};
