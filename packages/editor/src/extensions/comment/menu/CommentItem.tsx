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
}

export const CommentItem: React.FC<CommentItemProps> = ({
    comment,
    onReply,
    onDelete,
    isReply = false,
    isLast = false,
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

    return (
        <div className={`group ${isReply ? 'pl-7' : ''} ${!isLast ? 'mb-1' : ''}`}>
            <div className="flex items-start gap-2.5 py-1.5 rounded-md">
                <Avatar className="h-6 w-6 flex-shrink-0 mt-0.5">
                    <AvatarImage src={comment.user.avatar} alt={comment.user.name} />
                    <AvatarFallback className="text-[10px] font-medium bg-muted">
                        {comment.user.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                        <span className="font-medium text-[13px] leading-tight truncate">
                            {comment.user.name}
                        </span>
                        <span className="text-[11px] text-muted-foreground/70 flex-shrink-0">
                            {formattedDate}
                        </span>
                    </div>
                    <p className="text-[13px] leading-relaxed text-foreground/90 whitespace-pre-wrap break-words mt-0.5">
                        {comment.content}
                    </p>

                    {/* Action buttons - show on hover */}
                    {!isReplying && (
                        <div className="flex items-center gap-0.5 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                                onClick={() => setIsReplying(true)}
                            >
                                <CornerDownRight className="h-3 w-3 mr-0.5" />
                                Reply
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-destructive"
                                onClick={() => onDelete?.(comment.id)}
                            >
                                <Trash2 className="h-3 w-3" />
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            {/* Inline reply */}
            {isReplying && (
                <div className="pl-8 pb-1">
                    <Textarea
                        spellCheck={false}
                        placeholder="Reply..."
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="min-h-[56px] resize-none text-[13px] border-muted bg-muted/30 focus-visible:ring-1 focus-visible:ring-ring/30"
                        autoFocus
                    />
                    <div className="flex gap-1.5 justify-end mt-1.5">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2.5 text-xs"
                            onClick={() => { setReplyText(''); setIsReplying(false); }}
                        >
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            className="h-7 px-2.5 text-xs"
                            onClick={handleReplySubmit}
                            disabled={!replyText.trim()}
                        >
                            Reply
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};
