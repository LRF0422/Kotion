import React, { useState } from "react";
import type { CommentItem as CommentItemType } from "../types";
import { Avatar, AvatarFallback, AvatarImage, Button, ScrollArea, Textarea } from "@kn/ui";
import { CheckIcon, MessageCircle, Trash2 } from "@kn/icon";

export interface MarginCommentCardProps {
    threadId: string;
    comments: CommentItemType[];
    top: number;
    left: number;
    isNew: boolean;
    isActive: boolean;
    isEditable: boolean;
    onClick: () => void;
    onReply: (content: string, parentId?: string) => void;
    onDelete: (commentId: string) => void;
    onResolve: () => void;
    onSetFirstComment: (content: string) => void;
}

const avatarColors = [
    "bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400",
    "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400",
    "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400",
    "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400",
    "bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400",
    "bg-cyan-100 text-cyan-600 dark:bg-cyan-900/40 dark:text-cyan-400",
];

function getAvatarColor(name: string) {
    const index = name.charCodeAt(0) % avatarColors.length;
    return avatarColors[index];
}

function formatTime(ts: number): string {
    const now = Date.now();
    const diffMs = now - ts;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "now";
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 30) return `${diffDays}d`;

    return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export const MarginCommentCard: React.FC<MarginCommentCardProps> = ({
    threadId,
    comments,
    top,
    left,
    isNew,
    isActive,
    isEditable,
    onClick,
    onReply,
    onDelete,
    onResolve,
    onSetFirstComment,
}) => {
    const [replyText, setReplyText] = useState("");
    const [replyingTo, setReplyingTo] = useState<string | null>(null);
    const [newCommentText, setNewCommentText] = useState("");

    const firstComment = comments[0];
    const replyCount = comments.length - 1;

    const handleSubmitReply = () => {
        if (!replyText.trim()) return;
        onReply(replyText.trim(), replyingTo || undefined);
        setReplyText("");
        setReplyingTo(null);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmitReply();
        }
        if (e.key === "Escape") {
            setReplyText("");
            setReplyingTo(null);
        }
    };

    if (!firstComment && !isNew) return null;

    // New thread - show input to write the first comment
    if (isNew) {
        return (
            <div
                className="fixed w-[260px] max-w-[calc(100vw-24px)] z-50 comment-card-enter"
                style={{ top: `${top}px`, left: `${left}px` }}
            >
                <div className="bg-background border border-border/60 rounded-md shadow-md overflow-hidden">
                    <div className="px-2.5 py-2">
                        <Textarea
                            placeholder="Write a comment..."
                            value={newCommentText}
                            onChange={(e) => setNewCommentText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    if (newCommentText.trim()) {
                                        onSetFirstComment(newCommentText.trim());
                                        setNewCommentText("");
                                    }
                                }
                                if (e.key === "Escape") {
                                    onResolve(); // Cancel = remove the mark
                                }
                            }}
                            className="min-h-[48px] resize-none text-[12px] border-border/50 bg-background/80 focus:bg-background transition-colors placeholder:text-muted-foreground/40 py-2 px-2"
                            spellCheck={false}
                            autoFocus
                        />
                        <div className="flex items-center justify-between mt-1.5">
                            <span className="text-[10px] text-muted-foreground/50">Enter to send, Esc to cancel</span>
                            {newCommentText.trim() && (
                                <Button
                                    size="sm"
                                    className="h-5 px-2 text-[10px] font-medium"
                                    onClick={() => {
                                        onSetFirstComment(newCommentText.trim());
                                        setNewCommentText("");
                                    }}
                                >
                                    Send
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Collapsed card - just show first comment summary
    if (!isActive) {
        return (
            <div
                className="fixed w-[240px] max-w-[calc(100vw-24px)] z-40 cursor-pointer group"
                style={{ top: `${top}px`, left: `${left}px` }}
                onClick={onClick}
            >
                <div className="flex items-start gap-2 px-2.5 py-1.5 rounded-md border border-border/40 bg-background/90 backdrop-blur-sm hover:border-border/70 hover:shadow-sm transition-all duration-150">
                    <Avatar className="h-5 w-5 flex-shrink-0">
                        <AvatarImage src={firstComment.user.avatar} />
                        <AvatarFallback className={`text-[8px] font-semibold ${getAvatarColor(firstComment.user.name)}`}>
                            {firstComment.user.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                        <p className="text-[11px] leading-[1.4] text-foreground/80 line-clamp-2">
                            <span className="font-medium text-foreground">{firstComment.user.name}</span>
                            {" "}
                            {firstComment.content}
                        </p>
                    </div>
                    {replyCount > 0 && (
                        <span className="flex-shrink-0 text-[10px] text-muted-foreground/60 bg-muted/50 px-1 py-0.5 rounded">
                            +{replyCount}
                        </span>
                    )}
                    {/* Resolve on hover */}
                    {isEditable && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 flex-shrink-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400"
                            onClick={(e) => { e.stopPropagation(); onResolve(); }}
                        >
                            <CheckIcon className="h-3 w-3" />
                        </Button>
                    )}
                </div>
            </div>
        );
    }

    // Expanded card - full thread
    return (
        <div
            className="fixed w-[260px] max-w-[calc(100vw-24px)] z-50 comment-card-enter"
            style={{ top: `${top}px`, left: `${left}px` }}
        >
            <div className="bg-background border border-border/60 rounded-md shadow-md overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-2.5 py-1.5 bg-muted/20">
                    <div className="flex items-center gap-1.5">
                        <MessageCircle className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[11px] font-medium text-foreground/70">
                            {comments.length} comment{comments.length > 1 ? "s" : ""}
                        </span>
                    </div>
                    {isEditable && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 px-1.5 text-[10px] font-medium text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 gap-1"
                            onClick={onResolve}
                        >
                            <CheckIcon className="h-3 w-3" />
                            Resolve
                        </Button>
                    )}
                </div>

                {/* Thread */}
                <ScrollArea className="max-h-[240px]">
                    <div className="px-2.5 py-1.5 space-y-0">
                        {comments.map((comment, index) => (
                            <div
                                key={comment.id}
                                className={`group/item py-1.5 ${index < comments.length - 1 ? "border-b border-border/30" : ""}`}
                            >
                                <div className="flex items-start gap-2">
                                    <Avatar className="h-5 w-5 flex-shrink-0 mt-0.5">
                                        <AvatarImage src={comment.user.avatar} />
                                        <AvatarFallback className={`text-[8px] font-semibold ${getAvatarColor(comment.user.name)}`}>
                                            {comment.user.name.charAt(0).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[11px] font-semibold text-foreground truncate">
                                                {comment.user.name}
                                            </span>
                                            <span className="text-[10px] text-muted-foreground/50 tabular-nums">
                                                {formatTime(comment.createdAt)}
                                            </span>
                                        </div>
                                        <p className="text-[11px] leading-[1.4] text-foreground/80 whitespace-pre-wrap break-words">
                                            {comment.content}
                                        </p>
                                        {/* Actions */}
                                        {isEditable && (
                                            <div className="flex items-center gap-1 mt-0.5 opacity-0 group-hover/item:opacity-100 transition-opacity">
                                                <button
                                                    className="text-[10px] text-muted-foreground hover:text-foreground px-1 py-0.5 rounded hover:bg-muted/60"
                                                    onClick={() => setReplyingTo(comment.id)}
                                                >
                                                    Reply
                                                </button>
                                                <button
                                                    className="text-[10px] text-muted-foreground hover:text-destructive px-1 py-0.5 rounded hover:bg-destructive/10"
                                                    onClick={() => onDelete(comment.id)}
                                                >
                                                    <Trash2 className="h-2.5 w-2.5" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </ScrollArea>

                {/* Reply input */}
                {isEditable && (
                    <div className="px-2.5 py-2 border-t border-border/40 bg-muted/10">
                        <Textarea
                            placeholder="Reply..."
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="min-h-[36px] h-[36px] resize-none text-[11px] border-border/50 bg-background/80 focus:bg-background transition-colors placeholder:text-muted-foreground/40 py-2 px-2"
                            spellCheck={false}
                        />
                        {replyText.trim() && (
                            <div className="flex justify-end mt-1.5">
                                <Button
                                    size="sm"
                                    className="h-5 px-2 text-[10px] font-medium"
                                    onClick={handleSubmitReply}
                                >
                                    Send
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
