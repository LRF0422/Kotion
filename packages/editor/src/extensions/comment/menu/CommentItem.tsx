import React, { useMemo, useState } from "react";
import type { CommentItem as CommentItemType } from "../types";
import { Avatar, AvatarFallback, AvatarImage, IconButton, Separator, Textarea } from "@kn/ui";
import { CheckIcon, ReplyIcon, Trash2, XIcon } from "@kn/icon";

export interface CommentItemProps {
    comment: CommentItemType;
    onReply?: (parentId: string, content: string) => void;
    onDelete?: (commentId: string) => void;
    isReply?: boolean;
}

export const CommentItem: React.FC<CommentItemProps> = ({
    comment,
    onReply,
    onDelete,
    isReply = false,
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
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;

        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        });
    }, [comment.createdAt]);

    const handleReplySubmit = () => {
        if (replyText.trim() && onReply) {
            onReply(comment.id, replyText.trim());
            setReplyText('');
            setIsReplying(false);
        }
    };

    return (
        <div className={`space-y-1 ${isReply ? 'ml-4 border-l-2 border-muted pl-2' : ''}`}>
            <div className="p-1 flex items-start gap-2">
                <Avatar className="h-7 w-7 flex-shrink-0">
                    <AvatarImage src={comment.user.avatar} alt={comment.user.name} />
                    <AvatarFallback className="text-xs">
                        {comment.user.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{comment.user.name}</span>
                        <span className="text-xs text-muted-foreground flex-shrink-0">{formattedDate}</span>
                    </div>
                    <div className="text-sm whitespace-pre-wrap break-words mt-0.5">
                        {comment.content}
                    </div>
                </div>
            </div>

            {isReplying ? (
                <div className="ml-9 space-y-2">
                    <Textarea
                        spellCheck={false}
                        placeholder="Write a reply..."
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        className="min-h-[60px] resize-none text-sm"
                        autoFocus
                    />
                    <div className="flex gap-1 justify-end">
                        <IconButton
                            className="h-7 w-7"
                            icon={<XIcon className="h-4 w-4" />}
                            onClick={() => { setReplyText(''); setIsReplying(false); }}
                        />
                        <IconButton
                            className="h-7 w-7"
                            icon={<CheckIcon className="h-4 w-4" />}
                            onClick={handleReplySubmit}
                            disabled={!replyText.trim()}
                        />
                    </div>
                </div>
            ) : (
                <div className="ml-9 flex items-center gap-1">
                    <IconButton
                        className="h-6 w-6"
                        icon={<ReplyIcon className="h-3.5 w-3.5" />}
                        onClick={() => setIsReplying(true)}
                    />
                    <IconButton
                        className="h-6 w-6"
                        icon={<Trash2 className="h-3.5 w-3.5" />}
                        onClick={() => onDelete?.(comment.id)}
                    />
                </div>
            )}
            <Separator orientation="horizontal" />
        </div>
    );
};
