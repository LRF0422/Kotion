import React, { useState } from "react";
import type { CommentItem as CommentItemType } from "../types";
import { Avatar, AvatarFallback, AvatarImage } from "@kn/ui";
import { CornerDownRight, Pencil, Trash2 } from "@kn/icon";
import { CommentInput } from "./CommentInput";
import { formatDate, formatFullTime, getAvatarColor, getInitial } from "./utils";

export interface CommentItemProps {
    comment: CommentItemType;
    /** Current viewer's id; gates edit/delete to the comment's author. */
    currentUserId?: string;
    isReply?: boolean;
    /** When this reply targets another reply, the parent author's name. */
    replyToName?: string;
    readOnly?: boolean;
    /** Start a reply to this comment (parented at the thread level). */
    onStartReply?: (commentId: string) => void;
    onEdit?: (commentId: string, content: string) => void;
    onDelete?: (commentId: string) => void;
}

const actionBtn =
    "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground";

export const CommentItem: React.FC<CommentItemProps> = ({
    comment,
    currentUserId,
    isReply = false,
    replyToName,
    readOnly = false,
    onStartReply,
    onEdit,
    onDelete,
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);

    const isOwn = !!currentUserId && comment.user.id === currentUserId;
    const canModify = !readOnly && isOwn;

    if (isEditing) {
        return (
            <div className={`py-1.5 ${isReply ? "ml-6" : ""}`}>
                <CommentInput
                    compact
                    autoFocus
                    variant="edit"
                    initialValue={comment.content}
                    placeholder="Edit comment..."
                    submitLabel="Save"
                    onCancel={() => setIsEditing(false)}
                    onSubmit={(content) => {
                        onEdit?.(comment.id, content);
                        setIsEditing(false);
                    }}
                />
            </div>
        );
    }

    return (
        <div
            className={`group/item relative py-2 ${isReply ? "ml-6 before:absolute before:left-[-14px] before:top-0 before:bottom-0 before:w-px before:bg-border" : ""}`}
        >
            <div className="flex items-start gap-2.5">
                <Avatar className="h-6 w-6 flex-shrink-0">
                    <AvatarImage src={comment.user.avatar} alt={comment.user.name} />
                    <AvatarFallback className={`text-[10px] font-medium ${getAvatarColor(comment.user.name)}`}>
                        {getInitial(comment.user.name)}
                    </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-foreground">
                            {comment.user.name}
                        </span>
                        <span
                            className="flex-shrink-0 text-xs tabular-nums text-muted-foreground"
                            title={formatFullTime(comment.createdAt)}
                        >
                            {formatDate(comment.createdAt)}
                        </span>
                        {comment.updatedAt && (
                            <span
                                className="flex-shrink-0 text-xs text-muted-foreground/70"
                                title={`Edited ${formatFullTime(comment.updatedAt)}`}
                            >
                                · edited
                            </span>
                        )}
                    </div>

                    {replyToName && (
                        <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                            <CornerDownRight className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">
                                Reply to <span className="text-foreground/80">{replyToName}</span>
                            </span>
                        </div>
                    )}

                    <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-normal text-foreground/90">
                        {comment.content}
                    </p>

                    {!readOnly && !confirmingDelete && (
                        <div className="mt-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/item:opacity-100">
                            {onStartReply && (
                                <button className={actionBtn} onClick={() => onStartReply(comment.id)}>
                                    <CornerDownRight className="h-3 w-3" />
                                    Reply
                                </button>
                            )}
                            {canModify && onEdit && (
                                <button className={actionBtn} onClick={() => setIsEditing(true)}>
                                    <Pencil className="h-3 w-3" />
                                    Edit
                                </button>
                            )}
                            {canModify && onDelete && (
                                <button
                                    className="inline-flex items-center rounded-sm px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                                    onClick={() => setConfirmingDelete(true)}
                                    aria-label="Delete comment"
                                >
                                    <Trash2 className="h-3 w-3" />
                                </button>
                            )}
                        </div>
                    )}

                    {confirmingDelete && (
                        <div className="mt-1.5 flex items-center gap-2 text-xs">
                            <span className="text-muted-foreground">Delete this comment?</span>
                            <button
                                className="font-medium text-destructive hover:underline"
                                onClick={() => {
                                    onDelete?.(comment.id);
                                    setConfirmingDelete(false);
                                }}
                            >
                                Delete
                            </button>
                            <button
                                className="text-muted-foreground hover:text-foreground"
                                onClick={() => setConfirmingDelete(false)}
                            >
                                Cancel
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
