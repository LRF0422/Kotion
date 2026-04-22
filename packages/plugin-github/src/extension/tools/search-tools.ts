import { Editor } from '@kn/editor'
import { z } from '@kn/ui'
import { PluginConfigStore } from "@kn/common"
import { getOctokit } from '../../services/github-client'
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

export const searchGitHubIssuesTool = {
    name: 'searchGitHubIssues',
    description: '搜索 GitHub Issues 和 Pull Requests。使用 GitHub 搜索语法。',
    inputSchema: z.object({
        query: z.string().describe('搜索关键词'),
        owner: z.string().optional().describe('限定仓库所有者'),
        repo: z.string().optional().describe('限定仓库名称'),
        type: z.enum(['issue', 'pr']).optional().describe('筛选类型'),
        state: z.enum(['open', 'closed']).optional().describe('筛选状态'),
        per_page: z.number().optional().describe('结果数量，默认 20'),
    }),
    execute: (editor: Editor) => async (params: { query: string; owner?: string; repo?: string; type?: 'issue' | 'pr'; state?: 'open' | 'closed'; per_page?: number }) => {
        try {
            const token = await getToken()
            const octokit = getOctokit(token)

            let q = params.query
            if (params.owner && params.repo) q += ` repo:${params.owner}/${params.repo}`
            else if (params.owner) q += ` user:${params.owner}`
            if (params.type === 'issue') q += ' is:issue'
            else if (params.type === 'pr') q += ' is:pr'
            if (params.state) q += ` is:${params.state}`

            const { data } = await octokit.search.issuesAndPullRequests({
                q,
                per_page: params.per_page || 20,
            })

            return {
                success: true,
                totalCount: data.total_count,
                items: data.items.map((item: any) => ({
                    number: item.number,
                    title: item.title,
                    state: item.state,
                    isPR: !!item.pull_request,
                    repo: item.repository_url.split('/').slice(-2).join('/'),
                    author: item.user?.login,
                    labels: item.labels?.map((l: any) => l.name) || [],
                    url: item.html_url,
                    updatedAt: item.updated_at,
                })),
            }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    },
}

export const searchGitHubCodeTool = {
    name: 'searchGitHubCode',
    description: '搜索 GitHub 代码。',
    inputSchema: z.object({
        query: z.string().describe('搜索关键词'),
        owner: z.string().optional().describe('限定仓库所有者'),
        repo: z.string().optional().describe('限定仓库名称'),
        language: z.string().optional().describe('编程语言筛选'),
        per_page: z.number().optional().describe('结果数量，默认 20'),
    }),
    execute: (editor: Editor) => async (params: { query: string; owner?: string; repo?: string; language?: string; per_page?: number }) => {
        try {
            const token = await getToken()
            const octokit = getOctokit(token)

            let q = params.query
            if (params.owner && params.repo) q += ` repo:${params.owner}/${params.repo}`
            else if (params.owner) q += ` user:${params.owner}`
            if (params.language) q += ` language:${params.language}`

            const { data } = await octokit.search.code({ q, per_page: params.per_page || 20 })

            return {
                success: true,
                totalCount: data.total_count,
                items: data.items.map((item: any) => ({
                    name: item.name,
                    path: item.path,
                    repo: item.repository?.full_name,
                    url: item.html_url,
                    sha: item.sha,
                })),
            }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    },
}

export const searchTools = [searchGitHubIssuesTool, searchGitHubCodeTool]
