import React, { useCallback } from 'react'
import { NodeViewWrapper, NodeViewProps } from '@kn/editor'
import { Card, Badge, cn } from '@kn/ui'
import { RefreshCw, ExternalLink, MessageSquare } from '@kn/icon'
import { GitHubAvatar } from './shared/GitHubAvatar'
import { GitHubLabel } from './shared/GitHubLabel'
import { GitHubStatusBadge } from './shared/GitHubStatusBadge'
import { GitHubTimestamp } from './shared/GitHubTimestamp'
import { GitHubUrlInput, parseGitHubUrl } from './shared/GitHubUrlInput'
import { useGitHubData } from '../hooks/use-github-data'
import { getIssue } from '../services/github-issue-service'

export const GitHubIssueCard: React.FC<NodeViewProps> = ({ node, updateAttributes, editor, deleteNode }) => {
    const { owner, repo, issueNumber, title, state, labels, assignees, commentsCount, authorLogin, authorAvatar, htmlUrl, updatedAt, lastSyncAt } = node.attrs

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
                <Card className="my-4 border-2 border-dashed">
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
            <Card className={cn(
                'my-4 p-3 transition-all duration-200 border',
                editor.isEditable && 'hover:border-primary/50'
            )}>
                {/* Row 1: header */}
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
                        <span className="text-green-600 dark:text-green-400 font-bold">●</span>
                        <span className="truncate font-mono">{owner}/{repo}#{issueNumber}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                        <GitHubStatusBadge state={state || 'open'} type="issue" />
                        {loading && <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />}
                        {!loading && editor.isEditable && (
                            <button onClick={refresh} className="p-0.5 hover:bg-muted rounded" title="Refresh">
                                <RefreshCw className="h-3 w-3 text-muted-foreground" />
                            </button>
                        )}
                        {htmlUrl && (
                            <a href={htmlUrl} target="_blank" rel="noopener noreferrer" className="p-0.5 hover:bg-muted rounded" title="Open on GitHub">
                                <ExternalLink className="h-3 w-3 text-muted-foreground" />
                            </a>
                        )}
                    </div>
                </div>

                {/* Row 2: title */}
                <div className="mt-1 font-medium text-sm leading-snug">
                    {title || 'Loading...'}
                </div>

                {/* Row 3: labels + timestamp */}
                <div className="mt-1.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 flex-wrap min-w-0">
                        {(labels || []).map((label: any, i: number) => (
                            <GitHubLabel key={i} name={label.name} color={label.color} />
                        ))}
                    </div>
                    <GitHubTimestamp date={updatedAt} />
                </div>

                {/* Row 4: author + assignees + comments */}
                <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                        {authorLogin && <GitHubAvatar login={authorLogin} avatarUrl={authorAvatar} />}
                        {(assignees || []).map((a: any, i: number) => (
                            <GitHubAvatar key={i} login={a.login} avatarUrl={a.avatar_url} />
                        ))}
                    </div>
                    {commentsCount > 0 && (
                        <div className="flex items-center gap-0.5">
                            <MessageSquare className="h-3 w-3" />
                            <span>{commentsCount}</span>
                        </div>
                    )}
                </div>

                {error && (
                    <div className="mt-2 text-xs text-red-500">{error}</div>
                )}
            </Card>
        </NodeViewWrapper>
    )
}
