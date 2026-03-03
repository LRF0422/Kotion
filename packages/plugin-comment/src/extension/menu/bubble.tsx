import { BubbleMenu, type BubbleMenuProps } from "@kn/editor";
import { Editor, getMarkRange, isMarkActive, posToDOMRect } from "@tiptap/core";
import React, { useCallback, useMemo } from "react";
import type { CommentItem as CommentItemType } from "../types";
import { Button, ScrollArea, Separator } from "@kn/ui";
import { CheckIcon, MessageCircle } from "@kn/icon";
import { useAttributes } from "@kn/editor";
import { CommentItem } from "./CommentItem";
import { CommentInput } from "./CommentInput";

export const CommentBubbleView: React.FC<{ editor: Editor }> = (props) => {
    const { editor } = props;

    const isEditable = editor.isEditable;

    const shouldShow = useCallback<BubbleMenuProps["shouldShow"]>(() => {
        if (!isMarkActive(editor.state, 'comment')) return false;

        // In read-only mode, don't show for empty/new threads
        if (!editor.isEditable) {
            try {
                const attrs = editor.getAttributes('comment');
                const comments = JSON.parse(attrs.comments || '[]');
                if (comments.length === 0 || (comments.length === 1 && !comments[0].content)) {
                    return false;
                }
            } catch { /* show by default */ }
        }

        return true;
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
            // Update the existing mark in a single transaction instead of
            // resolveThread + addComment (which removes the mark first,
            // causing the selection/range to be lost before re-adding).
            editor.commands.setFirstComment(threadId, content);
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
                placement: "bottom-start"
            }}
        >
            <div className="w-[360px] max-h-[460px] flex flex-col bg-popover rounded-xl shadow-lg border border-border/50 overflow-hidden">
                {/* Header - only show for existing threads */}
                {!isNewThread && (
                    <div className="flex justify-between items-center px-4 py-3 bg-muted/30">
                        <div className="flex items-center gap-2">
                            <MessageCircle className="h-4 w-4 text-muted-foreground" />
                            <span className="text-xs font-semibold text-foreground/80 tracking-wide">
                                Comments
                            </span>
                            <span className="text-[11px] text-muted-foreground/60 bg-muted/60 px-1.5 py-0.5 rounded-full">
                                {comments.length}
                            </span>
                        </div>
                        {isEditable && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2.5 text-xs font-medium text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30 gap-1.5"
                                onClick={handleResolveThread}
                            >
                                <CheckIcon className="h-3.5 w-3.5" />
                                Resolve
                            </Button>
                        )}
                    </div>
                )}

                {/* Comments List */}
                {!isNewThread && (
                    <ScrollArea className="flex-1 max-h-[280px]">
                        <div className="px-4 py-3 space-y-1">
                            {comments.map((comment, index) => (
                                <CommentItem
                                    key={comment.id}
                                    comment={comment}
                                    onReply={isEditable ? handleReply : undefined}
                                    onDelete={isEditable ? handleDeleteComment : undefined}
                                    readOnly={!isEditable}
                                    isReply={!!comment.parentId}
                                    isLast={index === comments.length - 1}
                                />
                            ))}
                        </div>
                    </ScrollArea>
                )}

                {/* Comment Input - only in edit mode */}
                {isEditable && (
                    <>
                        {!isNewThread && <Separator className="opacity-50" />}
                        <CommentInput
                            onSubmit={handleAddComment}
                            placeholder={isNewThread ? "Write a comment..." : "Add a reply..."}
                            autoFocus={isNewThread}
                            onCancel={isNewThread ? handleCancelNewComment : undefined}
                        />
                    </>
                )}
            </div>
        </BubbleMenu>
    );
};
