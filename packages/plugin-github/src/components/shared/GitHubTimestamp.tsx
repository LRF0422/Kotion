import React from 'react'
import { Clock } from '@kn/icon'
import { cn } from '@kn/ui'

interface GitHubTimestampProps {
    date: string
    className?: string
}

function getRelativeTime(dateStr: string): string {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffSeconds = Math.floor(diffMs / 1000)
    const diffMinutes = Math.floor(diffSeconds / 60)
    const diffHours = Math.floor(diffMinutes / 60)
    const diffDays = Math.floor(diffHours / 24)
    const diffMonths = Math.floor(diffDays / 30)
    const diffYears = Math.floor(diffDays / 365)

    if (diffSeconds < 60) return 'just now'
    if (diffMinutes < 60) return diffMinutes + 'm ago'
    if (diffHours < 24) return diffHours + 'h ago'
    if (diffDays < 30) return diffDays + 'd ago'
    if (diffMonths < 12) return diffMonths + 'mo ago'
    return diffYears + 'y ago'
}

export const GitHubTimestamp: React.FC<GitHubTimestampProps> = ({ date, className }) => {
    if (!date) return null

    return (
        <span
            className={cn('inline-flex items-center gap-1 text-xs text-muted-foreground', className)}
            title={new Date(date).toLocaleString()}
        >
            <Clock className="h-3 w-3 opacity-70" />
            {getRelativeTime(date)}
        </span>
    )
}
