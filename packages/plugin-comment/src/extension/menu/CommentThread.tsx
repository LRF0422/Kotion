import React, { useMemo, useState } from "react";
import type { CommentItem as CommentItemType } from "../types";
import { Button } from "@kn/ui";
import { Check, MessageSquare } from "@kn/icon";
import { CommentItem } from "./CommentItem";
import { CommentInput } from "./CommentInput";
import { buildCommentTree } from "./utils";

export interface CommentThreadProps {
    comments: CommentItemType[];
    currentUserId?: string;
    isEditable: boolean;
    onReply: (content: string, parentId?: string) => void;
    onEdit: (commentId: string, content: string) => void;
    onDelete: (commentId: string) => void;
    onResolve: () => void;
}

/**
 * Shared thread body: header (count + resolve), scrollable nested comment list,
 * reply input. Rendered as flex children of a bounded `flex-col` parent so the
 * list is the only scrolling region and header/footer stay pinned.
 */
export const CommentThread: React.FC<CommentThreadProps> = ({
    comments,
    currentUserId,
    isEditable,
    onReply,
    onEdit,
    onDelete,
    onResolve,
}) => {
    // The comment being replied to (null = reply at thread root).
    const [replyingTo, setReplyingTo] = useState<string | null>(null);

    const tree = useMemo(() => buildCommentTree(comments), [comments]);
    const byId = useMemo(() => new Map(comments.map((c) => [c.id, c])), [comments]);

    const replyTarget = useMemo(
        () => (replyingTo ? comments.find((c) => c.id === replyingTo) : null),
        [replyingTo, comments]
    );

    const handleReplySubmit = (content: string) => {
        onReply(content, replyingTo || undefined);
        setReplyingTo(null);
    };

    return (
        <>
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-3 py-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span>
                        {comments.length} comment{comments.length > 1 ? "s" : ""}
                    </span>
                </div>
                {isEditable && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 px-2 text-xs font-medium text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-400"
                        onClick={onResolve}
                    >
                        <Check className="h-3.5 w-3.5" />
                        Resolve
                    </Button>
                )}
            </div>

            {/* Thread (the only scrolling region) */}
            <div className="comment-scroll min-h-0 flex-1 overflow-y-auto">
                <div className="divide-y px-3">
                    {tree.map((node) => (
                        <div key={node.comment.id} className="py-0.5 first:pt-0 last:pb-0">
                            <CommentItem
                                comment={node.comment}
                                currentUserId={currentUserId}
                                readOnly={!isEditable}
                                onStartReply={isEditable ? setReplyingTo : undefined}
                                onEdit={onEdit}
                                onDelete={onDelete}
                            />
                            {node.replies.map((reply) => {
                                // Show parent context only when replying to another reply,
                                // not the root comment (its position already implies that).
                                const parentIsRoot = reply.parentId === node.comment.id;
                                const replyToName = !parentIsRoot && reply.parentId
                                    ? byId.get(reply.parentId)?.user.name
                                    : undefined;
                                return (
                                    <CommentItem
                                        key={reply.id}
                                        comment={reply}
                                        currentUserId={currentUserId}
                                        isReply
                                        replyToName={replyToName}
                                        readOnly={!isEditable}
                                        onStartReply={isEditable ? setReplyingTo : undefined}
                                        onEdit={onEdit}
                                        onDelete={onDelete}
                                    />
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>

            {/* Reply input */}
            {isEditable && (
                <div className="shrink-0 border-t border-border/60 px-3 py-2.5 pb-safe">
                    <CommentInput
                        compact
                        showAvatar
                        showAttachments
                        placeholder="Reply…"
                        onSubmit={handleReplySubmit}
                        contextLabel={
                            replyTarget ? (
                                <>Replying to <span className="font-medium text-foreground">{replyTarget.user.name}</span></>
                            ) : undefined
                        }
                        onCancel={replyTarget ? () => setReplyingTo(null) : undefined}
                    />
                </div>
            )}
        </>
    );
};
