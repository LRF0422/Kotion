import React from "react";
import type { CommentItem as CommentItemType } from "../types";
import { Avatar, AvatarFallback, AvatarImage, Button } from "@kn/ui";
import { Check } from "@kn/icon";
import { CommentThread } from "./CommentThread";
import { CommentInput } from "./CommentInput";
import { getAvatarColor, getInitial } from "./utils";

export interface MarginCommentCardProps {
    threadId: string;
    comments: CommentItemType[];
    top: number;
    left: number;
    isNew: boolean;
    isActive: boolean;
    isEditable: boolean;
    currentUserId?: string;
    onClick: () => void;
    onReply: (content: string, parentId?: string) => void;
    onEdit: (commentId: string, content: string) => void;
    onDelete: (commentId: string) => void;
    onResolve: () => void;
    onSetFirstComment: (content: string) => void;
}

const SURFACE = "rounded-md border bg-popover text-popover-foreground";

const VIEWPORT_MARGIN = 16;

/**
 * Clamp a card's fixed top so it never spills past the viewport, and compute the
 * max height available for its (scrollable) body. When the anchor sits near the
 * bottom, the card is shifted up to keep a usable amount of space.
 */
function placeVertically(top: number, hardCap = 560): { top: number; maxHeight: number } {
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const maxAllowed = Math.min(hardCap, vh - VIEWPORT_MARGIN * 2);
    let t = Math.max(VIEWPORT_MARGIN, top);
    let available = vh - t - VIEWPORT_MARGIN;
    if (available < Math.min(240, maxAllowed)) {
        t = Math.max(VIEWPORT_MARGIN, vh - VIEWPORT_MARGIN - maxAllowed);
        available = vh - t - VIEWPORT_MARGIN;
    }
    return { top: t, maxHeight: Math.min(available, maxAllowed) };
}

export const MarginCommentCard: React.FC<MarginCommentCardProps> = ({
    comments,
    top,
    left,
    isNew,
    isActive,
    isEditable,
    currentUserId,
    onClick,
    onReply,
    onEdit,
    onDelete,
    onResolve,
    onSetFirstComment,
}) => {
    const firstComment = comments[0];
    const replyCount = Math.max(comments.length - 1, 0);

    if (!firstComment && !isNew) return null;

    // New thread - input to write the first comment (Esc removes the empty mark).
    if (isNew) {
        const place = placeVertically(top, 200);
        return (
            <div
                className="comment-card-enter fixed z-50 w-[280px] max-w-[calc(100vw-24px)]"
                style={{ top: `${place.top}px`, left: `${left}px` }}
            >
                <div className={`${SURFACE} p-3 shadow-lg`}>
                    <CommentInput
                        compact
                        autoFocus
                        placeholder="Write a comment…"
                        submitLabel="Comment"
                        onSubmit={onSetFirstComment}
                        onCancel={onResolve}
                    />
                </div>
            </div>
        );
    }

    // Collapsed card - first comment summary.
    if (!isActive) {
        return (
            <div
                className="group fixed z-40 w-[260px] max-w-[calc(100vw-24px)] cursor-pointer"
                style={{ top: `${top}px`, left: `${left}px` }}
                onClick={onClick}
            >
                <div className={`${SURFACE} flex items-start gap-2.5 px-3 py-2 shadow-sm transition-shadow hover:shadow-md`}>
                    <Avatar className="h-6 w-6 flex-shrink-0">
                        <AvatarImage src={firstComment.user.avatar} />
                        <AvatarFallback className={`text-[10px] font-medium ${getAvatarColor(firstComment.user.name)}`}>
                            {getInitial(firstComment.user.name)}
                        </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm leading-snug text-foreground/90">
                            <span className="font-medium text-foreground">{firstComment.user.name}</span>{" "}
                            {firstComment.content}
                        </p>
                    </div>
                    {replyCount > 0 && (
                        <span className="flex-shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                            +{replyCount}
                        </span>
                    )}
                    {isEditable && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 flex-shrink-0 text-emerald-600 opacity-0 hover:bg-emerald-500/10 hover:text-emerald-600 group-hover:opacity-100 dark:text-emerald-400"
                            onClick={(e) => { e.stopPropagation(); onResolve(); }}
                        >
                            <Check className="h-3.5 w-3.5" />
                        </Button>
                    )}
                </div>
            </div>
        );
    }

    // Expanded card - full thread. Bounded to the viewport with an internal scroll.
    const place = placeVertically(top);
    return (
        <div
            className="comment-card-enter fixed z-50 w-[300px] max-w-[calc(100vw-24px)]"
            style={{ top: `${place.top}px`, left: `${left}px` }}
        >
            <div
                className={`${SURFACE} flex flex-col overflow-hidden shadow-lg`}
                style={{ maxHeight: `${place.maxHeight}px` }}
            >
                <CommentThread
                    comments={comments}
                    currentUserId={currentUserId}
                    isEditable={isEditable}
                    onReply={onReply}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onResolve={onResolve}
                />
            </div>
        </div>
    );
};
