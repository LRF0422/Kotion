import React, { useCallback } from 'react'
import { NodeViewWrapper, NodeViewProps } from '@kn/editor'
import { Card, cn } from '@kn/ui'
import { CircleDot, ExternalLink, MessageSquare, RefreshCw } from '@kn/icon'
import { GitHubAvatar } from './shared/GitHubAvatar'
import { GitHubLabel } from './shared/GitHubLabel'
import { GitHubStatusBadge } from './shared/GitHubStatusBadge'
import { GitHubTimestamp } from './shared/GitHubTimestamp'
import { GitHubUrlInput } from './shared/GitHubUrlInput'
import {
    GhIconButton,
    GhIconLink,
    ghBody,
    ghCard,
    ghCardDashed,
    ghCardInteractive,
    ghChip,
    ghErrorBox,
    ghHeader,
    ghHeaderStart,
    ghIconTile,
    ghRef,
    ghTitle,
} from './shared/styles'
import { useGitHubData } from '../hooks/use-github-data'
import { getIssue } from '../services/github-issue-service'

const STATE_TILE: Record<string, string> = {
    open: 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400',
    closed: 'bg-rose-500/10 text-rose-600 ring-rose-500/20 dark:text-rose-400',
}

export const GitHubIssueCard: React.FC<NodeViewProps> = ({ node, updateAttributes, editor, deleteNode }) => {
    const { owner, repo, issueNumber, title, state, labels, assignees, commentsCount, authorLogin, authorAvatar, htmlUrl, updatedAt } = node.attrs

    const isConfigured = owner && repo && issueNumber

    const fetcher = useCallback((token: string) => getIssue(token, owner, repo, issueNumber), [owner, repo, issueNumber])

    const { loading, error, refresh } = useGitHubData({
        fetcher: async (token) => {
            const issue = await fetcher(token)
            updateAttributes({
                title: issue.title,
                state: issue.state,
                labels: issue.labels.map(l => ({ name: l.name, color: l.color })),
                assignees: issue.assignees.map(a => ({ login: a.login, avatar_url: a.avatar_url })),
                commentsCount: issue.comments,
                authorLogin: issue.user.login,
                authorAvatar: issue.user.avatar_url,
                htmlUrl: issue.html_url,
                updatedAt: issue.updated_at,
                lastSyncAt: new Date().toISOString(),
            })
            return issue
        },
        enabled: !!isConfigured,
    })

    if (!isConfigured) {
        return (
            <NodeViewWrapper>
                <Card className={ghCardDashed}>
                    <GitHubUrlInput
                        type="issue"
                        onSubmit={(parsed) => {
                            updateAttributes({
                                owner: parsed.owner,
                                repo: parsed.repo,
                                issueNumber: parsed.number || 0,
                            })
                        }}
                        onCancel={deleteNode}
                    />
                </Card>
            </NodeViewWrapper>
        )
    }

    return (
        <NodeViewWrapper>
            <Card className={cn(ghCard, editor.isEditable && ghCardInteractive)}>
                <div className={ghHeader}>
                    <div className={ghHeaderStart}>
                        <span className={cn(ghIconTile, STATE_TILE[state] || STATE_TILE.open)}>
                            <CircleDot className="h-3.5 w-3.5" />
                        </span>
                        <span className={ghRef}>
                            {owner}/{repo}#{issueNumber}
                        </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                        <GitHubStatusBadge state={state || 'open'} type="issue" />
                        {loading && <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Loading" />}
                        {!loading && editor.isEditable && (
                            <GhIconButton label="Refresh" onClick={refresh}>
                                <RefreshCw className="h-3.5 w-3.5" />
                            </GhIconButton>
                        )}
                        {htmlUrl && (
                            <GhIconLink label="Open on GitHub" href={htmlUrl}>
                                <ExternalLink className="h-3.5 w-3.5" />
                            </GhIconLink>
                        )}
                    </div>
                </div>

                <div className={ghBody}>
                    <div className={ghTitle}>{title || 'Loading…'}</div>

                    {(labels || []).length > 0 && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {labels.map((label: any, i: number) => (
                                <GitHubLabel key={i} name={label.name} color={label.color} />
                            ))}
                        </div>
                    )}

                    <div className="mt-2.5 flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                            {authorLogin && <GitHubAvatar login={authorLogin} avatarUrl={authorAvatar} size="md" />}
                            {(assignees || []).length > 0 && <span className="text-xs text-muted-foreground">assigned to</span>}
                            {(assignees || []).map((a: any, i: number) => (
                                <GitHubAvatar key={i} login={a.login} avatarUrl={a.avatar_url} />
                            ))}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                            {commentsCount > 0 && (
                                <span className={ghChip}>
                                    <MessageSquare className="h-3 w-3" />
                                    {commentsCount}
                                </span>
                            )}
                            <GitHubTimestamp date={updatedAt} />
                        </div>
                    </div>
                </div>

                {error && <div className={ghErrorBox}>{error}</div>}
            </Card>
        </NodeViewWrapper>
    )
}
