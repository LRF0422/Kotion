import { Editor } from '@kn/editor'
import { z } from '@kn/ui'
import { PluginConfigStore } from '@kn/core'
import { getPullRequest, listPullRequests, getPRDetails } from '../../services/github-pr-service'
import type { GitHubPluginConfig } from '../../types/config'
import { GITHUB_PLUGIN_KEY } from '../../hooks/use-github-config'

async function getToken(): Promise<string> {
    const store = PluginConfigStore.getInstance()
    await store.initialize()
    const config = await store.getConfig<GitHubPluginConfig>(GITHUB_PLUGIN_KEY)
    const token = config?.personalAccessToken || ''
    if (!token) throw new Error('GitHub PAT not configured. Please set it in Settings → GitHub.')
    return token
}

export const insertGitHubPRTool = {
    name: 'insertGitHubPR',
    description: '在文档中插入一个 GitHub Pull Request 卡片。',
    inputSchema: z.object({
        owner: z.string().describe('仓库所有者'),
        repo: z.string().describe('仓库名称'),
        prNumber: z.number().describe('PR 编号'),
    }),
    execute: (editor: Editor) => async (params: { owner: string; repo: string; prNumber: number }) => {
        try {
            const token = await getToken()
            const pr = await getPullRequest(token, params.owner, params.repo, params.prNumber)
            editor.chain().focus().insertContent({
                type: 'githubPR',
                attrs: {
                    owner: params.owner,
                    repo: params.repo,
                    prNumber: params.prNumber,
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
                },
            }).run()
            return { success: true, message: `已插入 PR #${params.prNumber}: ${pr.title}` }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    },
}

export const listGitHubPRsTool = {
    name: 'listGitHubPRs',
    description: '列出指定仓库的 Pull Requests。',
    inputSchema: z.object({
        owner: z.string().describe('仓库所有者'),
        repo: z.string().describe('仓库名称'),
        state: z.enum(['open', 'closed', 'all']).optional().describe('筛选状态，默认 open'),
        per_page: z.number().optional().describe('每页数量，默认 20'),
    }),
    execute: (editor: Editor) => async (params: { owner: string; repo: string; state?: 'open' | 'closed' | 'all'; per_page?: number }) => {
        try {
            const token = await getToken()
            const prs = await listPullRequests(token, params.owner, params.repo, params)
            return {
                success: true,
                count: prs.length,
                pullRequests: prs.map(pr => ({
                    number: pr.number,
                    title: pr.title,
                    state: pr.state,
                    merged: pr.merged,
                    draft: pr.draft,
                    author: pr.user.login,
                    base: pr.base.ref,
                    head: pr.head.ref,
                    additions: pr.additions,
                    deletions: pr.deletions,
                    changedFiles: pr.changed_files,
                    url: pr.html_url,
                })),
            }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    },
}

export const getGitHubPRDetailsTool = {
    name: 'getGitHubPRDetails',
    description: '获取 PR 的详细信息，包括文件变更和 Review 状态。',
    inputSchema: z.object({
        owner: z.string().describe('仓库所有者'),
        repo: z.string().describe('仓库名称'),
        prNumber: z.number().describe('PR 编号'),
    }),
    execute: (editor: Editor) => async (params: { owner: string; repo: string; prNumber: number }) => {
        try {
            const token = await getToken()
            const details = await getPRDetails(token, params.owner, params.repo, params.prNumber)
            return {
                success: true,
                pr: {
                    number: details.pr.number,
                    title: details.pr.title,
                    state: details.pr.state,
                    merged: details.pr.merged,
                    draft: details.pr.draft,
                    body: details.pr.body,
                    base: details.pr.base.ref,
                    head: details.pr.head.ref,
                    additions: details.pr.additions,
                    deletions: details.pr.deletions,
                    changedFiles: details.pr.changed_files,
                    author: details.pr.user.login,
                },
                reviews: details.reviews.map(r => ({
                    reviewer: r.user.login,
                    state: r.state,
                })),
            }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    },
}

export const prTools = [insertGitHubPRTool, listGitHubPRsTool, getGitHubPRDetailsTool]
