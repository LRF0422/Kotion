import React from 'react'
import { Badge, cn } from '@kn/ui'

type IssueState = 'open' | 'closed'
type PRState = 'open' | 'closed' | 'merged' | 'draft'

interface GitHubStatusBadgeProps {
    state: IssueState | PRState
    type: 'issue' | 'pr'
}

const stateConfig: Record<string, { label: string; className: string }> = {
    open: { label: 'Open', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
    closed: { label: 'Closed', className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' },
    merged: { label: 'Merged', className: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400' },
    draft: { label: 'Draft', className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
}

export const GitHubStatusBadge: React.FC<GitHubStatusBadgeProps> = ({ state, type }) => {
    const config = stateConfig[state] || stateConfig.open

    return (
        <Badge variant="secondary" className={cn('text-[11px] font-medium px-1.5 py-0', config.className)}>
            {config.label}
        </Badge>
    )
}
