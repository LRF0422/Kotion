import { Editor } from '@kn/editor'
import { z } from '@kn/ui'
import { PluginConfigStore } from '@kn/core'
import { getIssue, listIssues, createIssue, updateIssue, getIssueComments, addIssueComment } from '../../services/github-issue-service'
import type { GitHubPluginConfig } from '../../types/config'
import { DEFAULT_GITHUB_CONFIG } from '../../types/config'
import { GITHUB_PLUGIN_KEY } from '../../hooks/use-github-config'

async function getToken(): Promise<string> {
    const store = PluginConfigStore.getInstance()
    await store.initialize()
    const config = await store.getConfig<GitHubPluginConfig>(GITHUB_PLUGIN_KEY)
    const token = config?.personalAccessToken || ''
    if (!token) throw new Error('GitHub PAT not configured. Please set it in Settings → GitHub.')
    return token
}

async function getDefaults(): Promise<{ owner: string; repo: string }> {
    const store = PluginConfigStore.getInstance()
    await store.initialize()
    const config = await store.getConfig<GitHubPluginConfig>(GITHUB_PLUGIN_KEY)
    return {
        owner: (config as any)?.defaultOwner || '',
        repo: (config as any)?.defaultRepo || '',
    }
}

export const insertGitHubIssueTool = {
    name: 'insertGitHubIssue',
    description: '在文档中插入一个 GitHub Issue 卡片。需要提供 owner、repo 和 issue 编号。',
    inputSchema: z.object({
        owner: z.string().describe('仓库所有者'),
        repo: z.string().describe('仓库名称'),
        issueNumber: z.number().describe('Issue 编号'),
    }),
    execute: (editor: Editor) => async (params: { owner: string; repo: string; issueNumber: number }) => {
        try {
            const token = await getToken()
            const issue = await getIssue(token, params.owner, params.repo, params.issueNumber)
            editor.chain().focus().insertContent({
                type: 'githubIssue',
                attrs: {
                    owner: params.owner,
                    repo: params.repo,
                    issueNumber: params.issueNumber,
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
                },
            }).run()
            return { success: true, message: `已插入 Issue #${params.issueNumber}: ${issue.title}` }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    },
}

export const createGitHubIssueTool = {
    name: 'createGitHubIssue',
    description: '在 GitHub 上创建一个新 Issue，可选择同时在文档中插入卡片。',
    inputSchema: z.object({
        owner: z.string().describe('仓库所有者'),
        repo: z.string().describe('仓库名称'),
        title: z.string().describe('Issue 标题'),
        body: z.string().optional().describe('Issue 正文（Markdown）'),
        labels: z.array(z.string()).optional().describe('标签列表'),
        assignees: z.array(z.string()).optional().describe('指派人列表'),
        insertCard: z.boolean().optional().describe('是否在文档中插入卡片，默认 true'),
    }),
    execute: (editor: Editor) => async (params: { owner: string; repo: string; title: string; body?: string; labels?: string[]; assignees?: string[]; insertCard?: boolean }) => {
        try {
            const token = await getToken()
            const issue = await createIssue(token, params.owner, params.repo, params.title, params.body, params.labels, params.assignees)
            if (params.insertCard !== false) {
                editor.chain().focus().insertContent({
                    type: 'githubIssue',
                    attrs: {
                        owner: params.owner,
                        repo: params.repo,
                        issueNumber: issue.number,
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
                    },
                }).run()
            }
            return { success: true, issueNumber: issue.number, url: issue.html_url, message: `已创建 Issue #${issue.number}: ${issue.title}` }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    },
}

export const updateGitHubIssueStatusTool = {
    name: 'updateGitHubIssueStatus',
    description: '修改 GitHub Issue 的状态、标签或分配人。',
    inputSchema: z.object({
        owner: z.string().describe('仓库所有者'),
        repo: z.string().describe('仓库名称'),
        issueNumber: z.number().describe('Issue 编号'),
        state: z.enum(['open', 'closed']).optional().describe('新状态'),
        labels: z.array(z.string()).optional().describe('替换的标签列表'),
        assignees: z.array(z.string()).optional().describe('替换的指派人列表'),
    }),
    execute: (editor: Editor) => async (params: { owner: string; repo: string; issueNumber: number; state?: 'open' | 'closed'; labels?: string[]; assignees?: string[] }) => {
        try {
            const token = await getToken()
            const updated = await updateIssue(token, params.owner, params.repo, params.issueNumber, {
                state: params.state,
                labels: params.labels,
                assignees: params.assignees,
            })
            return { success: true, message: `已更新 Issue #${params.issueNumber}`, state: updated.state }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    },
}

export const listGitHubIssuesTool = {
    name: 'listGitHubIssues',
    description: '列出指定仓库的 Issues。',
    inputSchema: z.object({
        owner: z.string().describe('仓库所有者'),
        repo: z.string().describe('仓库名称'),
        state: z.enum(['open', 'closed', 'all']).optional().describe('筛选状态，默认 open'),
        labels: z.string().optional().describe('按标签筛选（逗号分隔）'),
        per_page: z.number().optional().describe('每页数量，默认 20'),
    }),
    execute: (editor: Editor) => async (params: { owner: string; repo: string; state?: 'open' | 'closed' | 'all'; labels?: string; per_page?: number }) => {
        try {
            const token = await getToken()
            const issues = await listIssues(token, params.owner, params.repo, params)
            return {
                success: true,
                count: issues.length,
                issues: issues.map(i => ({
                    number: i.number,
                    title: i.title,
                    state: i.state,
                    labels: i.labels.map(l => l.name),
                    assignees: i.assignees.map(a => a.login),
                    comments: i.comments,
                    url: i.html_url,
                })),
            }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    },
}

export const getGitHubIssueCommentsTool = {
    name: 'getGitHubIssueComments',
    description: '获取 GitHub Issue 的评论列表。',
    inputSchema: z.object({
        owner: z.string().describe('仓库所有者'),
        repo: z.string().describe('仓库名称'),
        issueNumber: z.number().describe('Issue 编号'),
        per_page: z.number().optional().describe('获取数量，默认 10'),
    }),
    execute: (editor: Editor) => async (params: { owner: string; repo: string; issueNumber: number; per_page?: number }) => {
        try {
            const token = await getToken()
            const comments = await getIssueComments(token, params.owner, params.repo, params.issueNumber, params.per_page)
            return {
                success: true,
                count: comments.length,
                comments: comments.map(c => ({
                    id: c.id,
                    author: c.user.login,
                    body: c.body,
                    createdAt: c.created_at,
                })),
            }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    },
}

export const addGitHubIssueCommentTool = {
    name: 'addGitHubIssueComment',
    description: '向 GitHub Issue 添加评论。',
    inputSchema: z.object({
        owner: z.string().describe('仓库所有者'),
        repo: z.string().describe('仓库名称'),
        issueNumber: z.number().describe('Issue 编号'),
        body: z.string().describe('评论内容（Markdown）'),
    }),
    execute: (editor: Editor) => async (params: { owner: string; repo: string; issueNumber: number; body: string }) => {
        try {
            const token = await getToken()
            const comment = await addIssueComment(token, params.owner, params.repo, params.issueNumber, params.body)
            return { success: true, commentId: comment.id, message: `已添加评论到 Issue #${params.issueNumber}` }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    },
}

export const issueTools = [
    insertGitHubIssueTool,
    createGitHubIssueTool,
    updateGitHubIssueStatusTool,
    listGitHubIssuesTool,
    getGitHubIssueCommentsTool,
    addGitHubIssueCommentTool,
]
