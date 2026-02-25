import { getOctokit } from './github-client'
import { githubCache } from './github-cache'
import type { GitHubFileContent } from '../types/github'

export async function getFileContent(
    token: string,
    owner: string,
    repo: string,
    path: string,
    ref?: string
): Promise<GitHubFileContent> {
    const cacheKey = `file:${owner}/${repo}/${path}@${ref || 'HEAD'}`
    const cached = githubCache.get<GitHubFileContent>(cacheKey)
    if (cached) return cached

    const octokit = getOctokit(token)
    const { data } = await octokit.repos.getContent({
        owner,
        repo,
        path,
        ref,
    })

    if (Array.isArray(data) || data.type !== 'file') {
        throw new Error(`Path "${path}" is not a file`)
    }

    const file = data as unknown as GitHubFileContent
    githubCache.set(cacheKey, file)
    return file
}

export function decodeContent(content: string, encoding: string): string {
    if (encoding === 'base64') {
        return atob(content)
    }
    return content
}

export function extractLines(content: string, startLine?: number, endLine?: number): string {
    const lines = content.split('\n')
    const start = (startLine || 1) - 1
    const end = endLine || lines.length
    return lines.slice(start, end).join('\n')
}

export function detectLanguage(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase() || ''
    const langMap: Record<string, string> = {
        ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
        py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java',
        kt: 'kotlin', swift: 'swift', cs: 'csharp', cpp: 'cpp', c: 'c',
        h: 'c', hpp: 'cpp', md: 'markdown', json: 'json', yaml: 'yaml',
        yml: 'yaml', xml: 'xml', html: 'html', css: 'css', scss: 'scss',
        sql: 'sql', sh: 'bash', bash: 'bash', zsh: 'bash', dockerfile: 'dockerfile',
    }
    return langMap[ext] || ext
}
