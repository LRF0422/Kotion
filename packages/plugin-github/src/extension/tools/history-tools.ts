import { Editor } from '@kn/editor'
import { z } from '@kn/ui'
import { PluginConfigStore, parseMarkdownToNodes } from '@kn/common'
import {
    getRepoCommits,
    getRepoCommit,
    compareCommits,
    listRepoTags,
    listRepoReleases,
} from '../../services/github-repo-service'
import { generateChangelog } from '../../services/github-doc-service'
import type { GitHubPluginConfig } from '../../types/config'
import { GITHUB_PLUGIN_KEY } from '../../hooks/use-github-config'

async function getToken(): Promise<string> {
    const store = PluginConfigStore.getInstance()
    await store.initialize()
    const config = await store.getConfig<GitHubPluginConfig>(GITHUB_PLUGIN_KEY)
    const token = config?.personalAccessToken || ''
    if (!token) throw new Error('GitHub PAT not configured. Please set it in Settings -> GitHub.')
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

async function resolveOwnerRepo(params: { owner?: string; repo?: string }): Promise<{ owner: string; repo: string }> {
    const defaults = await getDefaults()
    const owner = params.owner || defaults.owner
    const repo = params.repo || defaults.repo
    if (!owner || !repo) {
        throw new Error('Missing owner/repo. Provide them explicitly or set a default repository in Settings -> GitHub.')
    }
    return { owner, repo }
}

/** Append parsed Markdown to the end of the current document. Returns block count. */
function appendMarkdown(editor: Editor, markdown: string): number {
    const nodes = parseMarkdownToNodes(markdown)
    if (!nodes || nodes.length === 0) return 0
    const position = editor.state.doc.content.size
    editor.commands.insertContentAt(position, nodes)
    return nodes.length
}

const ownerRepoFields = {
    owner: z.string().optional().describe('仓库所有者，缺省使用设置中的默认 owner'),
    repo: z.string().optional().describe('仓库名称，缺省使用设置中的默认 repo'),
}

export const listGitHubCommitsTool = {
    name: 'listGitHubCommits',
    description: '列出 GitHub 仓库的 commit 记录，可按分支/commit、时间范围、文件路径过滤。返回 SHA、标题、作者和时间，用于生成 changelog 或追溯变更。',
    inputSchema: z.object({
        ...ownerRepoFields,
        ref: z.string().optional().describe('分支、tag 或 commit SHA，默认仓库默认分支'),
        since: z.string().optional().describe('起始时间（ISO 8601，如 2024-01-01T00:00:00Z）'),
        until: z.string().optional().describe('结束时间（ISO 8601）'),
        path: z.string().optional().describe('只返回影响该文件/目录的 commit'),
        per_page: z.number().optional().describe('每页数量，默认 30，最大 100'),
        page: z.number().optional().describe('页码，默认 1'),
    }),
    execute: (_editor: Editor) => async (params: { owner?: string; repo?: string; ref?: string; since?: string; until?: string; path?: string; per_page?: number; page?: number }) => {
        try {
            const { owner, repo } = await resolveOwnerRepo(params)
            const token = await getToken()
            const perPage = Math.min(Math.max(params.per_page || 30, 1), 100)
            const commits = await getRepoCommits(token, owner, repo, {
                sha: params.ref,
                since: params.since,
                until: params.until,
                path: params.path,
                per_page: perPage,
                page: params.page,
            })
            return {
                success: true,
                owner,
                repo,
                count: commits.length,
                commits: commits.map(commit => ({
                    sha: commit.sha,
                    shortSha: commit.sha.slice(0, 7),
                    title: commit.message.split('\n')[0],
                    message: commit.message,
                    author: commit.author.name,
                    date: commit.author.date,
                    url: commit.html_url,
                })),
            }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    },
}

export const getGitHubCommitDetailsTool = {
    name: 'getGitHubCommitDetails',
    description: '获取单个 commit 的详细信息，包括变更文件列表、增删行数，以及可选的 diff patch。用于分析具体改动。',
    inputSchema: z.object({
        ...ownerRepoFields,
        sha: z.string().describe('commit SHA'),
        includePatch: z.boolean().optional().describe('是否返回 diff patch，默认 false（patch 可能很大）'),
        maxFiles: z.number().optional().describe('最多返回的文件数，默认 30'),
    }),
    execute: (_editor: Editor) => async (params: { owner?: string; repo?: string; sha: string; includePatch?: boolean; maxFiles?: number }) => {
        try {
            const { owner, repo } = await resolveOwnerRepo(params)
            const token = await getToken()
            const detail = await getRepoCommit(token, owner, repo, params.sha)
            const maxFiles = Math.min(Math.max(params.maxFiles || 30, 1), 100)
            const files = (detail.files || []).slice(0, maxFiles).map(file => ({
                filename: file.filename,
                status: file.status,
                additions: file.additions,
                deletions: file.deletions,
                changes: file.changes,
                ...(params.includePatch ? { patch: file.patch } : {}),
            }))
            return {
                success: true,
                owner,
                repo,
                sha: detail.sha,
                shortSha: detail.sha.slice(0, 7),
                title: detail.message.split('\n')[0],
                message: detail.message,
                author: detail.author,
                committer: detail.committer,
                url: detail.html_url,
                stats: detail.stats,
                parents: (detail.parents || []).map(parent => parent.sha),
                fileCount: (detail.files || []).length,
                filesTruncated: (detail.files || []).length > maxFiles,
                files,
            }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    },
}

export const compareGitHubRefsTool = {
    name: 'compareGitHubRefs',
    description: '比较两个分支、tag 或 commit（base...head），返回二者之间的 commit 列表和文件变更统计。生成 changelog 的核心工具。',
    inputSchema: z.object({
        ...ownerRepoFields,
        base: z.string().describe('基准 ref（较旧，如上一个 tag）'),
        head: z.string().describe('目标 ref（较新，如最新 tag 或分支）'),
        includePatch: z.boolean().optional().describe('是否返回文件 diff patch，默认 false'),
        maxFiles: z.number().optional().describe('最多返回的文件数，默认 50'),
    }),
    execute: (_editor: Editor) => async (params: { owner?: string; repo?: string; base: string; head: string; includePatch?: boolean; maxFiles?: number }) => {
        try {
            const { owner, repo } = await resolveOwnerRepo(params)
            const token = await getToken()
            const comparison = await compareCommits(token, owner, repo, params.base, params.head)
            const maxFiles = Math.min(Math.max(params.maxFiles || 50, 1), 300)
            const files = comparison.files.slice(0, maxFiles).map(file => ({
                filename: file.filename,
                status: file.status,
                additions: file.additions,
                deletions: file.deletions,
                ...(params.includePatch ? { patch: file.patch } : {}),
            }))
            return {
                success: true,
                owner,
                repo,
                range: params.base + '...' + params.head,
                status: comparison.status,
                aheadBy: comparison.ahead_by,
                behindBy: comparison.behind_by,
                totalCommits: comparison.total_commits,
                compareUrl: comparison.html_url,
                commits: comparison.commits.map(commit => ({
                    sha: commit.sha,
                    shortSha: commit.sha.slice(0, 7),
                    title: commit.message.split('\n')[0],
                    author: commit.author.name,
                    date: commit.author.date,
                    url: commit.html_url,
                })),
                files,
            }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    },
}

export const listGitHubTagsTool = {
    name: 'listGitHubTags',
    description: '列出仓库的 tag 和 release，用于确定 changelog 的版本区间（例如上一个版本到最新版本）。',
    inputSchema: z.object({
        ...ownerRepoFields,
        per_page: z.number().optional().describe('返回数量，默认 30，最大 100'),
    }),
    execute: (_editor: Editor) => async (params: { owner?: string; repo?: string; per_page?: number }) => {
        try {
            const { owner, repo } = await resolveOwnerRepo(params)
            const token = await getToken()
            const perPage = Math.min(Math.max(params.per_page || 30, 1), 100)
            const [tags, releases] = await Promise.all([
                listRepoTags(token, owner, repo, perPage),
                listRepoReleases(token, owner, repo, perPage).catch(() => []),
            ])
            return {
                success: true,
                owner,
                repo,
                count: tags.length,
                tags: tags.map(tag => ({ name: tag.name, sha: tag.commit?.sha })),
                releases: releases.map(release => ({
                    tag: release.tag_name,
                    name: release.name,
                    draft: release.draft,
                    prerelease: release.prerelease,
                    publishedAt: release.published_at,
                    url: release.html_url,
                })),
            }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    },
}

export const generateGitHubChangelogTool = {
    name: 'generateGitHubChangelog',
    description: '根据 commit 记录生成 Markdown 格式的 changelog，并按 feat/fix 等类型分组。可指定 base...head 版本区间，或 since/until 时间范围；默认会把生成结果追加到文档末尾（insert=false 则只返回文本）。',
    inputSchema: z.object({
        ...ownerRepoFields,
        base: z.string().optional().describe('基准 ref（较旧的版本/tag），与 head 搭配使用'),
        head: z.string().optional().describe('目标 ref（较新的版本/tag/分支）'),
        since: z.string().optional().describe('起始时间（ISO 8601），未提供 base/head 时生效'),
        until: z.string().optional().describe('结束时间（ISO 8601）'),
        version: z.string().optional().describe('changelog 标题中的版本号，如 v1.2.0'),
        groupBy: z.enum(['type', 'none']).optional().describe('是否按 commit 类型分组，默认 type'),
        includeAuthors: z.boolean().optional().describe('是否附带贡献者列表，默认 false'),
        maxCommits: z.number().optional().describe('最多分析的 commit 数，默认 50，最大 100'),
        insert: z.boolean().optional().describe('是否插入到文档末尾，默认 true'),
    }),
    execute: (editor: Editor) => async (params: { owner?: string; repo?: string; base?: string; head?: string; since?: string; until?: string; version?: string; groupBy?: 'type' | 'none'; includeAuthors?: boolean; maxCommits?: number; insert?: boolean }) => {
        try {
            const { owner, repo } = await resolveOwnerRepo(params)
            const token = await getToken()
            const result = await generateChangelog(token, owner, repo, {
                base: params.base,
                head: params.head,
                since: params.since,
                until: params.until,
                version: params.version,
                groupBy: params.groupBy,
                includeAuthors: params.includeAuthors,
                maxCommits: params.maxCommits,
            })
            let insertedBlocks = 0
            if (params.insert !== false) {
                insertedBlocks = appendMarkdown(editor, result.markdown)
            }
            return {
                success: true,
                owner,
                repo,
                range: result.range,
                source: result.source,
                commitCount: result.commitCount,
                compareUrl: result.compareUrl,
                insertedBlocks,
                markdown: result.markdown,
            }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    },
}

export const historyTools = [
    listGitHubCommitsTool,
    getGitHubCommitDetailsTool,
    compareGitHubRefsTool,
    listGitHubTagsTool,
    generateGitHubChangelogTool,
]
