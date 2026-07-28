import React, { useState } from 'react'
import { cn } from '@kn/ui'
import { Clock, ChevronDown, ChevronRight } from '@kn/icon'
import { useTranslation } from '@kn/common'
import { RecentPageItem } from '../hooks/useRecentPages'
import { PageItemIcon } from './PageItemIcon'

interface RecentPagesProps {
    pages: RecentPageItem[]
    onPageClick: (pageId: string) => void
    className?: string
}

/**
 * Displays recently visited pages in a collapsible section.
 */
export const RecentPages: React.FC<RecentPagesProps> = ({
    pages,
    onPageClick,
    className,
}) => {
    const { t } = useTranslation()
    const [collapsed, setCollapsed] = useState(false)

    if (pages.length === 0) return null

    return (
        <div className={cn("flex flex-col flex-shrink-0", className)}>
            <button
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full text-left"
                onClick={() => setCollapsed(!collapsed)}
            >
                {collapsed ? (
                    <ChevronRight className="h-3.5 w-3.5" />
                ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                )}
                <Clock className="h-3.5 w-3.5" />
                <span>{t('recent.title') || 'Recent'}</span>
                <span className="ml-auto text-[10px] sm:text-xs text-muted-foreground/60">{pages.length}</span>
            </button>
            {!collapsed && (
                <div className="flex flex-col gap-0.5 px-1">
                    {pages.map((page) => (
                        <button
                            key={page.id}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs sm:text-sm hover:bg-muted transition-colors w-full text-left group"
                            onClick={() => onPageClick(page.id)}
                        >
                            {page.icon?.icon && (
                                <PageItemIcon icon={page.icon} />
                            )}
                            <span className="flex-1 truncate">{page.title || 'Untitled'}</span>
                            {page.updatedAt && (
                                <span className="text-[10px] sm:text-xs text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                    {formatTimeAgo(page.updatedAt)}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

/**
 * Formats a date string into a human-readable "time ago" format.
 */
function formatTimeAgo(dateStr: string): string {
    const now = Date.now()
    const date = new Date(dateStr).getTime()
    const diff = now - date

    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`
    return new Date(dateStr).toLocaleDateString()
}
