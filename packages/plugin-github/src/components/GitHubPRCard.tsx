import React from 'react'
import { NodeViewWrapper, NodeViewProps } from '@kn/editor'
import { Card, cn } from '@kn/ui'
import { ArrowRight, ExternalLink, GitPullRequest, RefreshCw } from '@kn/icon'
import { GitHubAvatar } from './shared/GitHubAvatar'
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
    ghStatAdd,
    ghStatDel,
    ghTitle,
} from './shared/styles'
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
                <Card className={ghCardDashed}>
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
    const reviewerList = reviewers || []

    return (
        <NodeViewWrapper>
            <Card className={cn(ghCard, editor.isEditable && ghCardInteractive)}>
                <div className={ghHeader}>
                    <div className={ghHeaderStart}>
                        <span className={cn(ghIconTile, 'bg-violet-500/10 text-violet-600 ring-violet-500/20 dark:text-violet-400')}>
                            <GitPullRequest className="h-3.5 w-3.5" />
                        </span>
                        <span className={ghRef}>
                            {owner}/{repo}#{prNumber}
                        </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                        <GitHubStatusBadge state={mergeState} type="pr" />
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

                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1 font-mono">
                            <span className="rounded bg-muted/60 px-1.5 py-0.5 text-foreground/80">{baseRef}</span>
                            <ArrowRight className="h-3 w-3" />
                            <span className="rounded bg-muted/60 px-1.5 py-0.5 text-foreground/80">{headRef}</span>
                        </span>
                        {additions > 0 && <span className={ghStatAdd}>+{additions}</span>}
                        {deletions > 0 && <span className={ghStatDel}>-{deletions}</span>}
                        {changedFiles > 0 && <span className={ghChip}>{changedFiles} files</span>}
                    </div>

                    <div className="mt-2.5 flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                            {authorLogin && <GitHubAvatar login={authorLogin} avatarUrl={authorAvatar} size="md" />}
                            {reviewerList.length > 0 && <span className="text-xs text-muted-foreground">reviewers</span>}
                            {reviewerList.slice(0, 4).map((r: any, i: number) => (
                                <GitHubAvatar key={i} login={r.login} avatarUrl={r.avatar_url} />
                            ))}
                            {reviewerList.length > 4 && <span className="text-xs text-muted-foreground">+{reviewerList.length - 4}</span>}
                        </div>
                        <GitHubTimestamp date={updatedAt} />
                    </div>
                </div>

                {error && <div className={ghErrorBox}>{error}</div>}
            </Card>
        </NodeViewWrapper>
    )
}
