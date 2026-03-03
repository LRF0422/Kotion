import React, { useMemo, useState } from "react";
import type { CommentItem as CommentItemType } from "../types";
import { Avatar, AvatarFallback, AvatarImage, Button, Textarea } from "@kn/ui";
import { CornerDownRight, Trash2 } from "@kn/icon";

export interface CommentItemProps {
    comment: CommentItemType;
    onReply?: (parentId: string, content: string) => void;
    onDelete?: (commentId: string) => void;
    isReply?: boolean;
    isLast?: boolean;
    readOnly?: boolean;
}

export const CommentItem: React.FC<CommentItemProps> = ({
    comment,
    onReply,
    onDelete,
    isReply = false,
    isLast = false,
    readOnly = false,
}) => {
    const [isReplying, setIsReplying] = useState(false);
    const [replyText, setReplyText] = useState('');

    const formattedDate = useMemo(() => {
        const date = new Date(comment.createdAt);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'just now';
        if (diffMins < 60) return `${diffMins}m`;
        if (diffHours < 24) return `${diffHours}h`;
        if (diffDays < 30) return `${diffDays}d`;

        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
        });
    }, [comment.createdAt]);

    const handleReplySubmit = () => {
        if (replyText.trim() && onReply) {
            onReply(comment.id, replyText.trim());
            setReplyText('');
            setIsReplying(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleReplySubmit();
        }
        if (e.key === 'Escape') {
            setReplyText('');
            setIsReplying(false);
        }
    };

    // Generate a consistent color based on user name
    const avatarColors = [
        'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400',
        'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400',
        'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400',
        'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400',
        'bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400',
        'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/40 dark:text-cyan-400',
    ];
    const colorIndex = comment.user.name.charCodeAt(0) % avatarColors.length;
    const avatarColorClass = avatarColors[colorIndex];

    return (
        <div className={`group ${isReply ? 'ml-6 relative before:absolute before:left-[-14px] before:top-0 before:bottom-0 before:w-px before:bg-border/50' : ''}`}>
            <div className={`flex gap-2.5 py-2 ${isReply ? 'relative' : ''}`}>
                {/* Avatar with consistent user color */}
                <Avatar className={`h-7 w-7 flex-shrink-0 ring-2 ring-background shadow-sm`}>
                    <AvatarImage src={comment.user.avatar} alt={comment.user.name} />
                    <AvatarFallback className={`text-[10px] font-semibold ${avatarColorClass}`}>
                        {comment.user.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                </Avatar>

                {/* Content area */}
                <div className="flex-1 min-w-0">
                    {/* Header: name + timestamp */}
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-[13px] text-foreground truncate">
                            {comment.user.name}
                        </span>
                        <span className="text-[11px] text-muted-foreground/60 flex-shrink-0 tabular-nums">
                            {formattedDate}
                        </span>
                    </div>

                    {/* Comment content */}
                    <p className="text-[13px] leading-[1.5] text-foreground/85 whitespace-pre-wrap break-words mt-0.5">
                        {comment.content}
                    </p>

                    {/* Action buttons - show on hover */}
                    {!isReplying && !readOnly && (
                        <div className="flex items-center gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60"
                                onClick={() => setIsReplying(true)}
                            >
                                <CornerDownRight className="h-3 w-3 mr-1" />
                                Reply
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                onClick={() => onDelete?.(comment.id)}
                            >
                                <Trash2 className="h-3 w-3" />
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            {/* Inline reply input */}
            {isReplying && !readOnly && (
                <div className="ml-9 mb-2 animate-in slide-in-from-top-1 duration-200">
                    <div className="relative">
                        <Textarea
                            spellCheck={false}
                            placeholder="Write a reply..."
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="min-h-[60px] resize-none text-[13px] border-border/60 bg-muted/30 focus:bg-background focus:border-border transition-colors"
                            autoFocus
                        />
                    </div>
                    <div className="flex items-center justify-end gap-2 mt-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-3 text-xs font-medium"
                            onClick={() => { setReplyText(''); setIsReplying(false); }}
                        >
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            className="h-7 px-3 text-xs font-medium"
                            onClick={handleReplySubmit}
                            disabled={!replyText.trim()}
                        >
                            Reply
                        </Button>
                    </div>
                </div>
            )}

            {/* Divider for non-last items */}
            {!isLast && !isReplying && (
                <div className="border-b border-border/40 ml-9" />
            )}
        </div>
    );
};
