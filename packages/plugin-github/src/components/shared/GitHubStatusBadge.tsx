import React from 'react'
import { cn } from '@kn/ui'

type IssueState = 'open' | 'closed'
type PRState = 'open' | 'closed' | 'merged' | 'draft'

interface GitHubStatusBadgeProps {
    state: IssueState | PRState
    type?: 'issue' | 'pr'
    className?: string
}

const STATE_CONFIG: Record<string, { label: string; dot: string; className: string }> = {
    open: {
        label: 'Open',
        dot: 'bg-emerald-500',
        className: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300',
    },
    closed: {
        label: 'Closed',
        dot: 'bg-rose-500',
        className: 'bg-rose-500/10 text-rose-700 ring-rose-500/25 dark:text-rose-300',
    },
    merged: {
        label: 'Merged',
        dot: 'bg-violet-500',
        className: 'bg-violet-500/10 text-violet-700 ring-violet-500/25 dark:text-violet-300',
    },
    draft: {
        label: 'Draft',
        dot: 'bg-slate-400',
        className: 'bg-slate-500/10 text-slate-600 ring-slate-500/25 dark:text-slate-300',
    },
}

export const GitHubStatusBadge: React.FC<GitHubStatusBadgeProps> = ({ state, type = 'issue', className }) => {
    const config = STATE_CONFIG[state] || STATE_CONFIG.open

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
                config.className,
                className
            )}
            title={(type === 'pr' ? 'Pull request' : 'Issue') + ' · ' + config.label}
        >
            <span className={cn('h-1.5 w-1.5 rounded-full', config.dot)} />
            {config.label}
        </span>
    )
}
