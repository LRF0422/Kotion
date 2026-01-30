import { BubbleMenu, BubbleMenuProps } from "@editor/components";
import { Editor, getMarkRange, isMarkActive, posToDOMRect } from "@tiptap/core";
import React, { useCallback, useMemo, useState } from "react";
import Comments, { CommentInterface, CustomCommentInterface } from "../comment";
import { Avatar, IconButton, Separator, Textarea, ScrollArea } from "@kn/ui";
import { CheckIcon, HeartIcon, MoreHorizontalIcon, ReplyIcon, Trash2, XIcon } from "@kn/icon";
import { useAttributes } from "@editor/hooks";

interface CommentItemProps {
    comment: CommentInterface;
    onReply?: (commentId: string) => void;
    onDelete?: (commentId: string) => void;
    isReply?: boolean;
}

const CommentItem: React.FC<CommentItemProps> = ({ comment, onReply, onDelete, isReply = false }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [replyText, setReplyText] = useState('');

    const formattedDate = useMemo(() => {
        const date = new Date(comment.date);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
    }, [comment.date]);

    const handleReplySubmit = () => {
        if (replyText.trim() && onReply) {
            onReply(comment.uuid);
            setReplyText('');
            setIsEditing(false);
        }
    };

    const handleReplyCancel = () => {
        setReplyText('');
        setIsEditing(false);
    };

    return (
        <div className={`space-y-1 ${isReply ? 'ml-4 border-l-2 border-muted pl-2' : ''}`}>
            <div className="p-1 flex items-start gap-2">
                <Avatar className="h-9 w-9 flex-shrink-0">
                    {comment.user.avatar ? (
                        <img src={comment.user.avatar} alt={comment.user.name} />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center bg-muted text-sm font-medium">
                            {comment.user.name.charAt(0).toUpperCase()}
                        </div>
                    )}
                </Avatar>
                <div className="relative w-full min-w-0">
                    <div className="flex items-center justify-between">
                        <div className="font-medium text-sm truncate">{comment.user.name}</div>
                        <IconButton
                            icon={<MoreHorizontalIcon className="h-4 w-4" />}
                        />
                    </div>
                    <div className="text-xs text-muted-foreground">{formattedDate}</div>
                </div>
            </div>

            {comment.parent_title && (
                <div className="px-1 py-1 text-xs text-muted-foreground bg-muted/30 rounded italic">
                    Replying to: "{comment.parent_title}..."
                </div>
            )}

            <div className="p-1 text-sm whitespace-pre-wrap break-words">
                {comment.comment}
            </div>

            {isEditing ? (
                <div className="space-y-2">
                    <Textarea
                        spellCheck={false}
                        placeholder="Write a reply..."
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        className="min-h-[60px] resize-none"
                        autoFocus
                    />
                    <div className="flex gap-1 justify-end">
                        <IconButton
                            className="h-7 w-7"
                            icon={<CheckIcon className="h-4 w-4" />}
                            onClick={handleReplySubmit}
                            disabled={!replyText.trim()}
                        />
                        <IconButton
                            className="h-7 w-7"
                            icon={<XIcon className="h-4 w-4" />}
                            onClick={handleReplyCancel}
                        />
                    </div>
                </div>
            ) : (
                <div className="flex items-center gap-1">
                    <IconButton
                        icon={<ReplyIcon className="h-4 w-4" />}
                        onClick={() => setIsEditing(true)}
                    />
                    <IconButton
                        icon={<Trash2 className="h-4 w-4" />}
                        onClick={() => onDelete?.(comment.uuid)}
                    />
                    <IconButton
                        icon={<HeartIcon className="h-4 w-4" />}
                    />
                </div>
            )}
            <Separator orientation="horizontal" />
        </div>
    );
};

export const CommentBubbleView: React.FC<{ editor: Editor }> = (props) => {
    const { editor } = props;
    const [newCommentText, setNewCommentText] = useState('');
    const [forceUpdate, setForceUpdate] = useState(0);

    const shouldShow = useCallback<BubbleMenuProps["shouldShow"]>(() => {
        return isMarkActive(editor.state, Comments.name);
    }, [editor]);

    const threadId = useAttributes(editor, 'comment_id') as string;

    // Get current comment thread
    const commentThread = useMemo<CustomCommentInterface | null>(() => {
        // @ts-ignore
        const storage = editor.storage.comments;
        if (!storage || !storage.comments) return null;
        return storage.comments.find((thread: CustomCommentInterface) => thread.threadId === threadId) || null;
    }, [editor, threadId, forceUpdate]); // Add forceUpdate to dependencies

    // Check if this is a new comment thread with empty/placeholder comment
    const isNewThread = useMemo(() => {
        if (!commentThread || !commentThread.comments || commentThread.comments.length === 0) {
            return true;
        }
        const firstComment = commentThread.comments[0];
        return !firstComment.comment || firstComment.comment.trim().length === 0;
    }, [commentThread]);

    const getReferenceClientRect = useCallback(() => {
        const { selection } = editor.state;
        const range = getMarkRange(selection.$from, editor.schema.marks.comment);
        if (range) {
            return posToDOMRect(editor.view, range.from, range.to);
        }
        return posToDOMRect(editor.view, selection.from, selection.to);
    }, [editor]);

    const handleAddComment = () => {
        if (newCommentText.trim()) {
            if (isNewThread && commentThread) {
                // Update the first empty comment
                const firstComment = commentThread.comments[0];
                if (firstComment) {
                    firstComment.comment = newCommentText.trim();
                    firstComment.date = Date.now();

                    // Sync using command
                    editor.commands.syncComments();

                    // Force re-render
                    setForceUpdate(prev => prev + 1);
                }
            } else {
                // Add a new comment to existing thread
                editor.commands.addComments({
                    comment: newCommentText,
                    parent_id: null
                });
                setForceUpdate(prev => prev + 1);
            }
            setNewCommentText('');
        }
    };

    const handleReply = (parentId: string) => {
        // Reply functionality would be implemented here
        // This would open a reply input for the specific comment
        console.log('Reply to:', parentId);
    };

    const handleDeleteComment = (commentId: string) => {
        if (threadId) {
            editor.commands.removeSpecificComment(threadId, commentId);
            setForceUpdate(prev => prev + 1);
        }
    };

    const handleResolveThread = () => {
        if (threadId && commentThread?.comments[0]) {
            editor.commands.removeSpecificComment(threadId, commentThread.comments[0].uuid);
        }
    };

    const handleCancelNewComment = () => {
        // Remove the comment mark if user cancels without adding content
        if (isNewThread && threadId) {
            editor.commands.removeSpecificComment(threadId, commentThread?.comments[0]?.uuid || '');
        }
    };

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
                        {commentThread && !isNewThread && (
                            <span className="text-xs text-muted-foreground">
                                ({commentThread.comments.length})
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

                {/* Comments List - only show if not a new thread */}
                {!isNewThread && (
                    <ScrollArea className="flex-1 p-2 max-h-[200px]">
                        {commentThread && commentThread.comments.length > 0 ? (
                            commentThread.comments.map((comment) => (
                                <CommentItem
                                    key={comment.uuid}
                                    comment={comment}
                                    onReply={handleReply}
                                    onDelete={handleDeleteComment}
                                    isReply={!!comment.parent_id}
                                />
                            ))
                        ) : (
                            <div className="p-4 text-center text-sm text-muted-foreground">
                                No comments yet
                            </div>
                        )}
                    </ScrollArea>
                )}

                {/* New Comment Input */}
                <div className="p-3 border-t space-y-2">
                    <Textarea
                        placeholder={isNewThread ? "Add your comment..." : "Reply to this thread..."}
                        value={newCommentText}
                        onChange={(e) => setNewCommentText(e.target.value)}
                        className="min-h-[80px] resize-none text-sm"
                        spellCheck={false}
                        autoFocus={isNewThread}
                    />
                    <div className="flex justify-between items-center">
                        <div className="text-xs text-muted-foreground">
                            {isNewThread ? 'Add a comment to get started' : 'Add to conversation'}
                        </div>
                        <div className="flex gap-1">
                            {isNewThread && (
                                <IconButton
                                    icon={<XIcon className="h-4 w-4" />}
                                    onClick={handleCancelNewComment}
                                />
                            )}
                            <IconButton
                                icon={<CheckIcon className="h-4 w-4" />}
                                onClick={handleAddComment}
                                disabled={!newCommentText.trim()}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </BubbleMenu>
    );
};