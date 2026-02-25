import React, { useCallback } from 'react'
import { NodeViewWrapper, NodeViewProps } from '@kn/editor'
import { Card, cn } from '@kn/ui'
import { RefreshCw, ExternalLink, GitPullRequest } from '@kn/icon'
import { GitHubAvatar } from './shared/GitHubAvatar'
import { GitHubStatusBadge } from './shared/GitHubStatusBadge'
import { GitHubTimestamp } from './shared/GitHubTimestamp'
import { GitHubUrlInput } from './shared/GitHubUrlInput'
import { useGitHubData } from '../hooks/use-github-data'
import { getPullRequest } from '../services/github-pr-service'
import type { PRMergeState } from '../types/github'

function getPRState(state: string, merged: boolean, draft: boolean): PRMergeState {
    if (merged) return 'merged'
    if (draft) return 'draft'
    return state as PRMergeState
}

export const GitHubPRCard: React.FC<NodeViewProps> = ({ node, updateAttributes, editor, deleteNode }) => {
    const { owner, repo, prNumber, title, state, merged, draft, baseRef, headRef, additions, deletions, changedFiles, authorLogin, authorAvatar, reviewers, htmlUrl, updatedAt } = node.attrs

    const isConfigured = owner && repo && prNumber

    const { loading, error, refresh } = useGitHubData({
        fetcher: async (token) => {
            const pr = await getPullRequest(token, owner, repo, prNumber)
            updateAttributes({
                title: pr.title,
                state: pr.state,
                merged: pr.merged,
                draft: pr.draft,
                baseRef: pr.base.ref,
                headRef: pr.head.ref,
                additions: pr.additions,
                deletions: pr.deletions,
                changedFiles: pr.changed_files,
                authorLogin: pr.user.login,
                authorAvatar: pr.user.avatar_url,
                reviewers: pr.requested_reviewers.map(r => ({ login: r.login, avatar_url: r.avatar_url })),
                htmlUrl: pr.html_url,
                updatedAt: pr.updated_at,
                lastSyncAt: new Date().toISOString(),
            })
            return pr
        },
        enabled: !!isConfigured,
    })

    if (!isConfigured) {
        return (
            <NodeViewWrapper>
                <Card className="my-4 border-2 border-dashed">
                    <GitHubUrlInput
                        type="pr"
                        onSubmit={(parsed) => {
                            updateAttributes({
                                owner: parsed.owner,
                                repo: parsed.repo,
                                prNumber: parsed.number || 0,
                            })
                        }}
                        onCancel={deleteNode}
                    />
                </Card>
            </NodeViewWrapper>
        )
    }

    const mergeState = getPRState(state, merged, draft)

    return (
        <NodeViewWrapper>
            <Card className={cn(
                'my-4 p-3 transition-all duration-200 border',
                editor.isEditable && 'hover:border-primary/50'
            )}>
                {/* Row 1: header */}
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
                        <GitPullRequest className="h-3.5 w-3.5 text-purple-500" />
                        <span className="truncate font-mono">{owner}/{repo}#{prNumber}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                        <GitHubStatusBadge state={mergeState} type="pr" />
                        {loading && <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />}
                        {!loading && editor.isEditable && (
                            <button onClick={refresh} className="p-0.5 hover:bg-muted rounded" title="Refresh">
                                <RefreshCw className="h-3 w-3 text-muted-foreground" />
                            </button>
                        )}
                        {htmlUrl && (
                            <a href={htmlUrl} target="_blank" rel="noopener noreferrer" className="p-0.5 hover:bg-muted rounded">
                                <ExternalLink className="h-3 w-3 text-muted-foreground" />
                            </a>
                        )}
                    </div>
                </div>

                {/* Row 2: title */}
                <div className="mt-1 font-medium text-sm leading-snug">
                    {title || 'Loading...'}
                </div>

                {/* Row 3: base ← head + diff stats */}
                <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1 font-mono">
                        <span>{baseRef}</span>
                        <span>←</span>
                        <span>{headRef}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        {additions > 0 && <span className="text-green-600 dark:text-green-400">+{additions}</span>}
                        {deletions > 0 && <span className="text-red-600 dark:text-red-400">-{deletions}</span>}
                        {changedFiles > 0 && <span>{changedFiles} files</span>}
                    </div>
                </div>

                {/* Row 4: author + reviewers + timestamp */}
                <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                        {authorLogin && <GitHubAvatar login={authorLogin} avatarUrl={authorAvatar} />}
                        {(reviewers || []).length > 0 && (
                            <>
                                <span>Reviewers:</span>
                                {reviewers.map((r: any, i: number) => (
                                    <GitHubAvatar key={i} login={r.login} avatarUrl={r.avatar_url} />
                                ))}
                            </>
                        )}
                    </div>
                    <GitHubTimestamp date={updatedAt} />
                </div>

                {error && <div className="mt-2 text-xs text-red-500">{error}</div>}
            </Card>
        </NodeViewWrapper>
    )
}
