import { Editor } from '@kn/editor'
import { z } from '@kn/ui'
import { PluginConfigStore } from '@kn/core'
import { getFileContent, decodeContent, extractLines, detectLanguage } from '../../services/github-code-service'
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

export const insertGitHubCodeSnippetTool = {
    name: 'insertGitHubCodeSnippet',
    description: '在文档中插入 GitHub 代码片段。可以指定行范围。',
    inputSchema: z.object({
        owner: z.string().describe('仓库所有者'),
        repo: z.string().describe('仓库名称'),
        path: z.string().describe('文件路径（如 src/index.ts）'),
        ref: z.string().optional().describe('分支或 commit SHA，默认为仓库默认分支'),
        startLine: z.number().optional().describe('起始行号'),
        endLine: z.number().optional().describe('结束行号'),
    }),
    execute: (editor: Editor) => async (params: { owner: string; repo: string; path: string; ref?: string; startLine?: number; endLine?: number }) => {
        try {
            const token = await getToken()
            const file = await getFileContent(token, params.owner, params.repo, params.path, params.ref)
            const decoded = decodeContent(file.content, file.encoding)
            const extracted = extractLines(decoded, params.startLine, params.endLine)
            const lang = detectLanguage(params.path)

            editor.chain().focus().insertContent({
                type: 'githubCode',
                attrs: {
                    owner: params.owner,
                    repo: params.repo,
                    path: params.path,
                    ref: params.ref || '',
                    startLine: params.startLine || 0,
                    endLine: params.endLine || 0,
                    content: extracted,
                    language: lang,
                    htmlUrl: file.html_url,
                    lastSyncAt: new Date().toISOString(),
                },
            }).run()
            return { success: true, message: `已插入代码片段 ${params.path}`, lines: extracted.split('\n').length }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    },
}

export const getGitHubFileContentTool = {
    name: 'getGitHubFileContent',
    description: '读取 GitHub 仓库中的文件内容。',
    inputSchema: z.object({
        owner: z.string().describe('仓库所有者'),
        repo: z.string().describe('仓库名称'),
        path: z.string().describe('文件路径'),
        ref: z.string().optional().describe('分支或 commit SHA'),
        startLine: z.number().optional().describe('起始行号'),
        endLine: z.number().optional().describe('结束行号'),
    }),
    execute: (editor: Editor) => async (params: { owner: string; repo: string; path: string; ref?: string; startLine?: number; endLine?: number }) => {
        try {
            const token = await getToken()
            const file = await getFileContent(token, params.owner, params.repo, params.path, params.ref)
            const decoded = decodeContent(file.content, file.encoding)
            const content = extractLines(decoded, params.startLine, params.endLine)
            return {
                success: true,
                path: params.path,
                language: detectLanguage(params.path),
                content,
                size: file.size,
                url: file.html_url,
            }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    },
}

export const codeTools = [insertGitHubCodeSnippetTool, getGitHubFileContentTool]
