import React, { useCallback, useEffect, useRef } from "react"
import {
    Avatar, AvatarFallback, AvatarImage,
    Button, Skeleton, Textarea, cn, toast,
    Badge,
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@kn/ui"
import {
    MessageSquare, Send, Trash2, CheckCircle, SmilePlus, MoreHorizontal, Reply
} from "@kn/icon"
import { useApi, useTranslation, useSafeState } from "@kn/common"
import { APIS } from "../../../api"
import { PageComment, CreateCommentRequest, SpaceMember } from "../../../model/Space"

interface PageCommentsProps {
    pageId: string
    spaceId?: string
    members?: SpaceMember[]
    className?: string
}

function formatTime(dateStr?: string): string {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return 'just now'
    if (diffMin < 60) return `${diffMin}m ago`
    const diffHours = Math.floor(diffMin / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    return date.toLocaleDateString()
}

const QUICK_REACTIONS = ['👍', '❤️', '🎉', '😄', '🤔', '👀']

export const PageComments: React.FC<PageCommentsProps> = ({ pageId, spaceId, members, className }) => {
    const { t } = useTranslation()
    const [comments, setComments] = useSafeState<PageComment[]>([])
    const [loading, setLoading] = useSafeState(true)
    const [newComment, setNewComment] = useSafeState('')
    const [replyTo, setReplyTo] = useSafeState<PageComment | null>(null)
    const [submitting, setSubmitting] = useSafeState(false)
    const [showMentions, setShowMentions] = useSafeState(false)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    const fetchComments = useCallback(() => {
        setLoading(true)
        useApi(APIS.GET_PAGE_COMMENTS, { pageId })
            .then(res => setComments(res.data || []))
            .catch(() => setComments([]))
            .finally(() => setLoading(false))
    }, [pageId])

    useEffect(() => {
        fetchComments()
    }, [pageId])

    const handleSubmit = useCallback(async () => {
        if (!newComment.trim()) return
        setSubmitting(true)

        // Parse @mentions from content
        const mentionRegex = /@(\w+)/g
        const mentionNames: string[] = []
        let match
        while ((match = mentionRegex.exec(newComment)) !== null) {
            mentionNames.push(match[1])
        }

        // Resolve mention names to IDs
        const mentionIds: (string | number)[] = []
        if (members && mentionNames.length > 0) {
            for (const name of mentionNames) {
                const member = members.find(m =>
                    m.name?.toLowerCase().includes(name.toLowerCase())
                )
                if (member) mentionIds.push(member.id)
            }
        }

        try {
            await useApi(APIS.ADD_PAGE_COMMENT, { pageId }, {
                content: newComment,
                parentId: replyTo?.id || null,
                mentions: mentionIds.length > 0 ? mentionIds : undefined
            })
            setNewComment('')
            setReplyTo(null)
            fetchComments()
        } catch (e) {
            toast.error(t('comment.submitError', 'Failed to post comment'))
        } finally {
            setSubmitting(false)
        }
    }, [newComment, replyTo, pageId, members])

    const handleDelete = useCallback(async (commentId: string | number) => {
        try {
            await useApi(APIS.DELETE_PAGE_COMMENT, { pageId, commentId })
            fetchComments()
        } catch (e) {
            toast.error(t('comment.deleteError', 'Failed to delete comment'))
        }
    }, [pageId])

    const handleToggleResolved = useCallback(async (commentId: string | number) => {
        try {
            await useApi(APIS.TOGGLE_COMMENT_RESOLVED, { pageId, commentId })
            fetchComments()
        } catch (e) {
            toast.error(t('comment.resolveError', 'Failed to update comment'))
        }
    }, [pageId])

    const handleReaction = useCallback(async (commentId: string | number, emoji: string) => {
        try {
            await useApi(APIS.ADD_COMMENT_REACTION, { pageId, commentId, emoji })
            fetchComments()
        } catch (e) { /* ignore */ }
    }, [pageId])

    const handleInsertMention = useCallback((member: SpaceMember) => {
        setNewComment(prev => prev + `@${member.name} `)
        setShowMentions(false)
        textareaRef.current?.focus()
    }, [])

    const renderComment = (comment: PageComment, isReply = false) => (
        <div key={comment.id} className={cn("group", isReply ? "ml-10" : "")}>
            <div className="flex items-start gap-2.5 py-2.5 px-2 rounded-lg hover:bg-muted/30 transition-colors">
                <Avatar className="h-7 w-7 shrink-0 mt-0.5">
                    <AvatarImage src={comment.userAvatar} />
                    <AvatarFallback className="text-[10px]">
                        {comment.userName?.charAt(0)?.toUpperCase() || '?'}
                    </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{comment.userName || 'Unknown'}</span>
                        <span className="text-[11px] text-muted-foreground">{formatTime(comment.createdAt)}</span>
                        {comment.resolved && (
                            <Badge variant="secondary" className="h-4 text-[10px] px-1.5 gap-0.5">
                                <CheckCircle className="h-2.5 w-2.5" /> Resolved
                            </Badge>
                        )}
                    </div>
                    <p className="text-sm text-foreground/90 mt-0.5 whitespace-pre-wrap break-words">
                        {comment.content}
                    </p>
                    {/* Reactions */}
                    {comment.reactions && Object.keys(comment.reactions).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                            {Object.entries(comment.reactions).map(([emoji, users]) => (
                                <button
                                    key={emoji}
                                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs bg-muted hover:bg-muted/80 transition-colors"
                                    onClick={() => handleReaction(comment.id, emoji)}
                                >
                                    <span>{emoji}</span>
                                    <span className="text-muted-foreground">{(users as any[]).length}</span>
                                </button>
                            ))}
                        </div>
                    )}
                    {/* Action buttons */}
                    <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {!isReply && (
                            <Button
                                variant="ghost" size="sm"
                                className="h-6 px-1.5 text-[11px] text-muted-foreground"
                                onClick={() => setReplyTo(comment)}
                            >
                                <Reply className="h-3 w-3 mr-0.5" /> Reply
                            </Button>
                        )}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground">
                                    <SmilePlus className="h-3 w-3" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="min-w-0">
                                <div className="flex gap-0.5 p-1">
                                    {QUICK_REACTIONS.map(emoji => (
                                        <button
                                            key={emoji}
                                            className="p-1 rounded hover:bg-muted text-base"
                                            onClick={() => handleReaction(comment.id, emoji)}
                                        >
                                            {emoji}
                                        </button>
                                    ))}
                                </div>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground">
                                    <MoreHorizontal className="h-3 w-3" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                                {!isReply && (
                                    <DropdownMenuItem onClick={() => handleToggleResolved(comment.id)}>
                                        <CheckCircle className="h-3.5 w-3.5 mr-2" />
                                        {comment.resolved ? 'Unresolve' : 'Resolve'}
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                    className="text-destructive"
                                    onClick={() => handleDelete(comment.id)}
                                >
                                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </div>
            {/* Replies */}
            {comment.replies && comment.replies.length > 0 && (
                <div className="space-y-0">
                    {comment.replies.map(reply => renderComment(reply, true))}
                </div>
            )}
        </div>
    )

    if (loading) {
        return (
            <div className={cn("space-y-3 p-4", className)}>
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-start gap-3">
                        <Skeleton className="h-7 w-7 rounded-full" />
                        <div className="flex-1 space-y-1.5">
                            <Skeleton className="h-3.5 w-1/3" />
                            <Skeleton className="h-10 w-full rounded" />
                        </div>
                    </div>
                ))}
            </div>
        )
    }

    return (
        <div className={cn("flex flex-col", className)}>
            {/* Comment list */}
            <div className="flex-1 overflow-auto space-y-0.5">
                {comments.length > 0 ? (
                    comments.map(comment => renderComment(comment))
                ) : (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                        <MessageSquare className="h-8 w-8 text-muted-foreground/40 mb-2" />
                        <p className="text-sm text-muted-foreground">
                            {t('comment.empty', 'No comments yet. Start the conversation!')}
                        </p>
                    </div>
                )}
            </div>

            {/* New comment input */}
            <div className="border-t pt-3 mt-3 space-y-2">
                {replyTo && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
                        <Reply className="h-3 w-3" />
                        <span>Replying to <strong>{replyTo.userName}</strong></span>
                        <button
                            className="ml-auto text-[10px] hover:text-foreground"
                            onClick={() => setReplyTo(null)}
                        >
                            Cancel
                        </button>
                    </div>
                )}
                <div className="relative">
                    <Textarea
                        ref={textareaRef}
                        value={newComment}
                        onChange={(e) => {
                            setNewComment(e.target.value)
                            // Show mention suggestions on @
                            const lastChar = e.target.value.slice(-1)
                            if (lastChar === '@' && members && members.length > 0) {
                                setShowMentions(true)
                            } else if (lastChar === ' ' || !e.target.value.includes('@')) {
                                setShowMentions(false)
                            }
                        }}
                        placeholder={replyTo
                            ? t('comment.replyPlaceholder', 'Write a reply...')
                            : t('comment.placeholder', 'Write a comment... Use @ to mention')
                        }
                        className="min-h-[60px] max-h-[120px] resize-none text-sm pr-10"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                e.preventDefault()
                                handleSubmit()
                            }
                        }}
                    />
                    <Button
                        variant="ghost"
                        size="sm"
                        className="absolute right-1.5 bottom-1.5 h-7 w-7 p-0"
                        disabled={!newComment.trim() || submitting}
                        onClick={handleSubmit}
                    >
                        <Send className="h-3.5 w-3.5" />
                    </Button>
                </div>
                {/* Mention suggestions popup */}
                {showMentions && members && members.length > 0 && (
                    <div className="border rounded-lg bg-popover p-1 shadow-md max-h-32 overflow-auto">
                        {members.map(member => (
                            <button
                                key={member.id}
                                className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors"
                                onClick={() => handleInsertMention(member)}
                            >
                                <Avatar className="h-5 w-5">
                                    <AvatarImage src={member.avatar} />
                                    <AvatarFallback className="text-[9px]">
                                        {member.name?.charAt(0)?.toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                                <span>{member.name}</span>
                            </button>
                        ))}
                    </div>
                )}
                <p className="text-[10px] text-muted-foreground px-1">
                    {t('comment.hint', 'Ctrl+Enter to submit')}
                </p>
            </div>
        </div>
    )
}
