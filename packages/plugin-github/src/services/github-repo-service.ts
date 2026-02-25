import { getOctokit } from './github-client'
import { githubCache } from './github-cache'
import type { GitHubRepo, GitHubTreeItem, GitHubCommit } from '../types/github'

export async function getRepo(token: string, owner: string, repo: string): Promise<GitHubRepo> {
    const cacheKey = `repo:${owner}/${repo}`
    const cached = githubCache.get<GitHubRepo>(cacheKey)
    if (cached) return cached

    const octokit = getOctokit(token)
    const { data } = await octokit.repos.get({ owner, repo })
    const repoData = data as unknown as GitHubRepo
    githubCache.set(cacheKey, repoData)
    return repoData
}

export async function getRepoContents(
    token: string,
    owner: string,
    repo: string,
    path: string = '',
    ref?: string,
): Promise<GitHubTreeItem[]> {
    const cacheKey = `contents:${owner}/${repo}:${path}:${ref || 'default'}`
    const cached = githubCache.get<GitHubTreeItem[]>(cacheKey)
    if (cached) return cached

    const octokit = getOctokit(token)
    const { data } = await octokit.repos.getContent({
        owner,
        repo,
        path,
        ...(ref ? { ref } : {}),
    })

    if (!Array.isArray(data)) {
        return []
    }

    const items: GitHubTreeItem[] = data.map((item: any) => ({
        name: item.name,
        path: item.path,
        type: item.type as GitHubTreeItem['type'],
        size: item.size || 0,
        sha: item.sha,
        html_url: item.html_url,
    }))

    // Sort: directories first, then files, alphabetically
    items.sort((a, b) => {
        if (a.type === 'dir' && b.type !== 'dir') return -1
        if (a.type !== 'dir' && b.type === 'dir') return 1
        return a.name.localeCompare(b.name)
    })

    githubCache.set(cacheKey, items, 2)
    return items
}

export async function getRepoCommits(
    token: string,
    owner: string,
    repo: string,
    options?: { per_page?: number; page?: number; sha?: string },
): Promise<GitHubCommit[]> {
    const perPage = options?.per_page || 20
    const page = options?.page || 1
    const sha = options?.sha
    const cacheKey = `commits:${owner}/${repo}:${sha || 'default'}:${page}:${perPage}`
    const cached = githubCache.get<GitHubCommit[]>(cacheKey)
    if (cached) return cached

    const octokit = getOctokit(token)
    const { data } = await octokit.repos.listCommits({
        owner,
        repo,
        per_page: perPage,
        page,
        ...(sha ? { sha } : {}),
    })

    const commits: GitHubCommit[] = data.map((item: any) => ({
        sha: item.sha,
        message: item.commit.message,
        author: {
            name: item.commit.author?.name || 'Unknown',
            date: item.commit.author?.date || '',
            email: item.commit.author?.email || '',
        },
        committer: {
            name: item.commit.committer?.name || 'Unknown',
            date: item.commit.committer?.date || '',
        },
        html_url: item.html_url,
        avatar_url: item.author?.avatar_url,
    }))

    githubCache.set(cacheKey, commits, 2)
    return commits
}

export async function getReadme(
    token: string,
    owner: string,
    repo: string,
): Promise<string | null> {
    const cacheKey = `readme:${owner}/${repo}`
    const cached = githubCache.get<string>(cacheKey)
    if (cached) return cached

    try {
        const octokit = getOctokit(token)
        const { data } = await octokit.repos.getReadme({ owner, repo })
        const content = atob((data as any).content?.replace(/\n/g, '') || '')
        githubCache.set(cacheKey, content, 10)
        return content
    } catch {
        return null
    }
}
