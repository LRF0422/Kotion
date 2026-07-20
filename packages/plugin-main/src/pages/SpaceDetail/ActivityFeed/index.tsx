import React, { useCallback, useEffect } from "react"
import {
    Avatar, AvatarFallback, AvatarImage,
    Badge, Button, Skeleton, cn
} from "@kn/ui"
import {
    FileText, UserPlus, UserMinus, MessageSquare, Pin, Edit, Trash2, Undo2, Shield
} from "@kn/icon"
import { useApi, useTranslation, useSafeState } from "@kn/common"
import { APIS } from "../../../api"
import { SpaceActivity, ActivityActionType } from "../../../model/Space"

interface ActivityFeedProps {
    spaceId: string
    className?: string
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
    PAGE_CREATED: <FileText className="h-3.5 w-3.5 text-green-500" />,
    PAGE_EDITED: <Edit className="h-3.5 w-3.5 text-blue-500" />,
    PAGE_DELETED: <Trash2 className="h-3.5 w-3.5 text-red-500" />,
    PAGE_RESTORED: <Undo2 className="h-3.5 w-3.5 text-emerald-500" />,
    MEMBER_JOINED: <UserPlus className="h-3.5 w-3.5 text-indigo-500" />,
    MEMBER_LEFT: <UserMinus className="h-3.5 w-3.5 text-orange-500" />,
    MEMBER_ROLE_CHANGED: <Shield className="h-3.5 w-3.5 text-purple-500" />,
    COMMENT_ADDED: <MessageSquare className="h-3.5 w-3.5 text-cyan-500" />,
    PAGE_PINNED: <Pin className="h-3.5 w-3.5 text-amber-500" />,
    PAGE_UNPINNED: <Pin className="h-3.5 w-3.5 text-gray-400" />,
}

function getActionText(actionType: ActivityActionType, metadata?: Record<string, any>): string {
    const pageTitle = metadata?.pageTitle || 'a page'
    switch (actionType) {
        case 'PAGE_CREATED': return `created "${pageTitle}"`
        case 'PAGE_EDITED': return `edited "${pageTitle}"`
        case 'PAGE_DELETED': return `deleted "${pageTitle}"`
        case 'PAGE_RESTORED': return `restored "${pageTitle}"`
        case 'MEMBER_JOINED': return `joined the space`
        case 'MEMBER_LEFT': return `left the space`
        case 'MEMBER_ROLE_CHANGED':
            return `changed role to ${metadata?.newRole || 'member'}`
        case 'COMMENT_ADDED': return `commented on "${pageTitle}"`
        case 'PAGE_PINNED': return `pinned "${pageTitle}"`
        case 'PAGE_UNPINNED': return `unpinned "${pageTitle}"`
        default: return `performed an action`
    }
}

function formatTimeAgo(dateStr?: string): string {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return 'just now'
    if (diffMin < 60) return `${diffMin}m ago`
    const diffHours = Math.floor(diffMin / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
}

export const ActivityFeed: React.FC<ActivityFeedProps> = ({ spaceId, className }) => {
    const { t } = useTranslation()
    const [activities, setActivities] = useSafeState<SpaceActivity[]>([])
    const [loading, setLoading] = useSafeState(true)
    const [page, setPage] = useSafeState(1)
    const [hasMore, setHasMore] = useSafeState(true)

    const fetchActivities = useCallback((pageNum: number, append = false) => {
        if (!append) setLoading(true)
        useApi(APIS.GET_SPACE_ACTIVITIES, { spaceId, page: pageNum, pageSize: 20 })
            .then(res => {
                const data = res.data || []
                if (append) {
                    setActivities(prev => [...prev, ...data])
                } else {
                    setActivities(data)
                }
                setHasMore(data.length >= 20)
            })
            .catch(() => {
                if (!append) setActivities([])
            })
            .finally(() => setLoading(false))
    }, [spaceId])

    useEffect(() => {
        fetchActivities(1)
    }, [spaceId])

    const handleLoadMore = useCallback(() => {
        const next = page + 1
        setPage(next)
        fetchActivities(next, true)
    }, [page, fetchActivities])

    if (loading && activities.length === 0) {
        return (
            <div className={cn("space-y-3 p-4", className)}>
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-start gap-3">
                        <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                        <div className="flex-1 space-y-1">
                            <Skeleton className="h-4 w-3/4" />
                            <Skeleton className="h-3 w-1/4" />
                        </div>
                    </div>
                ))}
            </div>
        )
    }

    if (activities.length === 0) {
        return (
            <div className={cn("flex flex-col items-center justify-center py-12 text-center", className)}>
                <FileText className="h-10 w-10 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">
                    {t('activity.empty', 'No activity yet')}
                </p>
            </div>
        )
    }

    return (
        <div className={cn("space-y-1", className)}>
            {activities.map((activity) => (
                <div
                    key={activity.id}
                    className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/40 transition-colors"
                >
                    <Avatar className="h-7 w-7 shrink-0 mt-0.5">
                        <AvatarImage src={activity.userAvatar} />
                        <AvatarFallback className="text-[10px]">
                            {activity.userName?.charAt(0)?.toUpperCase() || '?'}
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm leading-snug">
                            <span className="font-medium">{activity.userName || 'Unknown'}</span>
                            {' '}
                            <span className="text-muted-foreground">
                                {getActionText(activity.actionType, activity.metadata)}
                            </span>
                        </p>
                        <p className="text-xs text-muted-foreground/70 mt-0.5">
                            {formatTimeAgo(activity.createdAt)}
                        </p>
                    </div>
                    <div className="shrink-0 mt-1">
                        {ACTION_ICONS[activity.actionType] || <FileText className="h-3.5 w-3.5 text-muted-foreground" />}
                    </div>
                </div>
            ))}
            {hasMore && (
                <div className="pt-2 px-3">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-xs text-muted-foreground"
                        onClick={handleLoadMore}
                    >
                        {t('activity.loadMore', 'Load more')}
                    </Button>
                </div>
            )}
        </div>
    )
}
