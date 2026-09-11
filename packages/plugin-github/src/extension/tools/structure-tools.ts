import { Editor } from '@kn/editor'
import { z } from '@kn/ui'
import { PluginConfigStore, parseMarkdownToNodes } from '@kn/common'
import { getRepoContents, getRepoTree } from '../../services/github-repo-service'
import { buildAsciiTree, generateProjectDoc } from '../../services/github-doc-service'
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

export const getGitHubRepoTreeTool = {
    name: 'getGitHubRepoTree',
    description: '获取 GitHub 仓库的完整目录结构（项目结构树），支持递归、按子目录和深度过滤。用于了解项目布局并生成项目文档。',
    inputSchema: z.object({
        ...ownerRepoFields,
        ref: z.string().optional().describe('分支、tag 或 commit SHA，默认仓库默认分支'),
        path: z.string().optional().describe('只返回该子目录下的内容'),
        depth: z.number().optional().describe('最大目录深度，默认 3'),
        format: z.enum(['tree', 'list', 'both']).optional().describe('返回格式：tree（ASCII 树）、list（扁平列表）或 both，默认 both'),
        maxEntries: z.number().optional().describe('最多返回的条目数，默认 300'),
    }),
    execute: (_editor: Editor) => async (params: { owner?: string; repo?: string; ref?: string; path?: string; depth?: number; format?: 'tree' | 'list' | 'both'; maxEntries?: number }) => {
        try {
            const { owner, repo } = await resolveOwnerRepo(params)
            const token = await getToken()
            const depth = Math.min(Math.max(params.depth || 3, 1), 10)
            const maxEntries = Math.min(Math.max(params.maxEntries || 300, 10), 2000)
            const result = await getRepoTree(token, owner, repo, {
                ref: params.ref,
                recursive: true,
                path: params.path,
                depth,
            })
            const items = result.items.slice(0, maxEntries)
            const format = params.format || 'both'
            const ascii = format === 'list' ? '' : buildAsciiTree(items, { maxDepth: depth, maxEntries })
            const list = format === 'tree' ? [] : items.map(item => ({
                path: item.path,
                type: item.type,
                size: item.size,
                url: item.html_url,
            }))
            return {
                success: true,
                owner,
                repo,
                ref: result.ref,
                truncated: result.truncated || result.items.length > items.length,
                totalEntries: result.items.length,
                returnedEntries: items.length,
                tree: ascii || undefined,
                files: list.length > 0 ? list : undefined,
            }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    },
}

export const getGitHubRepoContentsTool = {
    name: 'getGitHubRepoContents',
    description: '列出 GitHub 仓库指定目录下的文件和子目录（单层），用于浏览项目文件。',
    inputSchema: z.object({
        ...ownerRepoFields,
        path: z.string().optional().describe('目录路径，为空表示仓库根目录'),
        ref: z.string().optional().describe('分支、tag 或 commit SHA'),
    }),
    execute: (_editor: Editor) => async (params: { owner?: string; repo?: string; path?: string; ref?: string }) => {
        try {
            const { owner, repo } = await resolveOwnerRepo(params)
            const token = await getToken()
            const items = await getRepoContents(token, owner, repo, params.path || '', params.ref)
            return {
                success: true,
                owner,
                repo,
                path: params.path || '/',
                count: items.length,
                entries: items.map(item => ({
                    name: item.name,
                    path: item.path,
                    type: item.type,
                    size: item.size,
                    url: item.html_url,
                })),
            }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    },
}

export const generateGitHubProjectDocTool = {
    name: 'generateGitHubProjectDoc',
    description: '根据仓库元数据、语言构成、目录结构、package.json 和 README 生成 Markdown 项目文档（概览、技术栈、项目结构、脚本、快速开始）。默认会把生成结果追加到文档末尾（insert=false 则只返回文本）。',
    inputSchema: z.object({
        ...ownerRepoFields,
        ref: z.string().optional().describe('分支、tag 或 commit SHA，默认仓库默认分支'),
        treeDepth: z.number().optional().describe('项目结构展示深度，默认 2'),
        includeTree: z.boolean().optional().describe('是否包含目录结构，默认 true'),
        includeReadme: z.boolean().optional().describe('是否包含 README 的快速开始片段，默认 true'),
        insert: z.boolean().optional().describe('是否插入到文档末尾，默认 true'),
    }),
    execute: (editor: Editor) => async (params: { owner?: string; repo?: string; ref?: string; treeDepth?: number; includeTree?: boolean; includeReadme?: boolean; insert?: boolean }) => {
        try {
            const { owner, repo } = await resolveOwnerRepo(params)
            const token = await getToken()
            const result = await generateProjectDoc(token, owner, repo, {
                ref: params.ref,
                treeDepth: params.treeDepth,
                includeTree: params.includeTree,
                includeReadme: params.includeReadme,
            })
            let insertedBlocks = 0
            if (params.insert !== false) {
                insertedBlocks = appendMarkdown(editor, result.markdown)
            }
            return {
                success: true,
                owner,
                repo,
                sections: result.sections,
                treeTruncated: result.treeTruncated,
                insertedBlocks,
                markdown: result.markdown,
            }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    },
}

export const structureTools = [
    getGitHubRepoTreeTool,
    getGitHubRepoContentsTool,
    generateGitHubProjectDocTool,
]
