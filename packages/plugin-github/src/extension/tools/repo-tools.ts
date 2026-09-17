import { Editor } from '@kn/editor'
import { z } from '@kn/ui'
import { getRepo } from '../../services/github-repo-service'
import { requireGitHubToken as getToken } from '../../hooks/use-github-config'

export const insertGitHubRepoTool = {
    name: 'insertGitHubRepo',
    description: '在文档中插入一个 GitHub 仓库卡片。',
    inputSchema: z.object({
        owner: z.string().describe('仓库所有者'),
        repo: z.string().describe('仓库名称'),
    }),
    execute: (editor: Editor) => async (params: { owner: string; repo: string }) => {
        try {
            const token = await getToken()
            const repoData = await getRepo(token, params.owner, params.repo)
            editor.chain().focus().insertContent({
                type: 'githubRepo',
                attrs: {
                    owner: params.owner,
                    repo: params.repo,
                    description: repoData.description || '',
                    language: repoData.language || '',
                    stars: repoData.stargazers_count,
                    forks: repoData.forks_count,
                    openIssues: repoData.open_issues_count,
                    topics: repoData.topics || [],
                    visibility: repoData.visibility,
                    htmlUrl: repoData.html_url,
                    lastSyncAt: new Date().toISOString(),
                },
            }).run()
            return { success: true, message: `已插入仓库 ${params.owner}/${params.repo}` }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    },
}

export const getGitHubRepoInfoTool = {
    name: 'getGitHubRepoInfo',
    description: '获取 GitHub 仓库的信息。',
    inputSchema: z.object({
        owner: z.string().describe('仓库所有者'),
        repo: z.string().describe('仓库名称'),
    }),
    execute: (_editor: Editor) => async (params: { owner: string; repo: string }) => {
        try {
            const token = await getToken()
            const repoData = await getRepo(token, params.owner, params.repo)
            return {
                success: true,
                repo: {
                    fullName: repoData.full_name,
                    description: repoData.description,
                    language: repoData.language,
                    stars: repoData.stargazers_count,
                    forks: repoData.forks_count,
                    openIssues: repoData.open_issues_count,
                    topics: repoData.topics,
                    visibility: repoData.visibility,
                    defaultBranch: repoData.default_branch,
                    url: repoData.html_url,
                },
            }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    },
}

export const repoTools = [insertGitHubRepoTool, getGitHubRepoInfoTool]
