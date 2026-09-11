import { getOctokit } from './github-client'
import { githubCache } from './github-cache'
import type {
    GitHubRepo,
    GitHubTreeItem,
    GitHubCommit,
    GitHubCommitDetail,
    GitHubCommitFile,
    GitHubCompareResult,
    GitHubTag,
    GitHubRelease,
} from '../types/github'

/** Build a browser URL for a path on GitHub without needing the full repo payload. */
function buildHtmlUrl(owner: string, repo: string, ref: string, path: string, type: 'file' | 'dir'): string {
    const kind = type === 'dir' ? 'tree' : 'blob'
    const base = 'https://github.com/' + owner + '/' + repo + '/' + kind + '/' + encodeURIComponent(ref)
    if (!path) return base
    return base + '/' + path.split('/').map(encodeURIComponent).join('/')
}

function mapCommitFile(file: any): GitHubCommitFile {
    return {
        filename: file.filename,
        previous_filename: file.previous_filename,
        status: file.status,
        additions: file.additions ?? 0,
        deletions: file.deletions ?? 0,
        changes: file.changes ?? 0,
        patch: file.patch,
        blob_url: file.blob_url,
        raw_url: file.raw_url,
    }
}

function mapCommit(item: any): GitHubCommit {
    return {
        sha: item.sha,
        message: item.commit?.message || item.message || '',
        author: {
            name: item.commit?.author?.name || item.author?.login || 'Unknown',
            date: item.commit?.author?.date || '',
            email: item.commit?.author?.email || '',
        },
        committer: {
            name: item.commit?.committer?.name || 'Unknown',
            date: item.commit?.committer?.date || '',
        },
        html_url: item.html_url,
        avatar_url: item.author?.avatar_url,
    }
}

export async function getRepo(token: string, owner: string, repo: string): Promise<GitHubRepo> {
    const cacheKey = 'repo:' + owner + '/' + repo
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
    const cacheKey = 'contents:' + owner + '/' + repo + ':' + path + ':' + (ref || 'default')
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

export interface RepoCommitQuery {
    per_page?: number
    page?: number
    sha?: string
    path?: string
    since?: string
    until?: string
}

export async function getRepoCommits(
    token: string,
    owner: string,
    repo: string,
    options?: RepoCommitQuery,
): Promise<GitHubCommit[]> {
    const perPage = options?.per_page || 20
    const page = options?.page || 1
    const sha = options?.sha
    const path = options?.path
    const since = options?.since
    const until = options?.until
    const cacheKey = 'commits:' + owner + '/' + repo + ':' + (sha || 'default') + ':' + page + ':' + perPage
        + ':' + (path || '') + ':' + (since || '') + ':' + (until || '')
    const cached = githubCache.get<GitHubCommit[]>(cacheKey)
    if (cached) return cached

    const octokit = getOctokit(token)
    const { data } = await octokit.repos.listCommits({
        owner,
        repo,
        per_page: perPage,
        page,
        ...(sha ? { sha } : {}),
        ...(path ? { path } : {}),
        ...(since ? { since } : {}),
        ...(until ? { until } : {}),
    })

    const commits: GitHubCommit[] = data.map(mapCommit)

    githubCache.set(cacheKey, commits, 2)
    return commits
}

/**
 * Fetch the full recursive git tree for a repository. GitHub may mark the
 * response as truncated for very large repos; callers should surface that flag.
 */
export async function getRepoTree(
    token: string,
    owner: string,
    repo: string,
    options?: { ref?: string; recursive?: boolean; path?: string; depth?: number },
): Promise<{ items: GitHubTreeItem[]; truncated: boolean; ref: string }> {
    const ref = options?.ref
    const recursive = options?.recursive !== false
    const filterPath = (options?.path || '').replace(/^\/+|\/+$/g, '')
    const depth = options?.depth
    const cacheKey = 'tree:' + owner + '/' + repo + ':' + (ref || 'HEAD') + ':' + (recursive ? 'r' : 'n')
        + ':' + filterPath + ':' + (depth ?? '')
    const cached = githubCache.get<{ items: GitHubTreeItem[]; truncated: boolean; ref: string }>(cacheKey)
    if (cached) return cached

    const octokit = getOctokit(token)
    let treeRef = ref
    if (!treeRef) {
        const repoData = await getRepo(token, owner, repo)
        treeRef = repoData.default_branch || 'main'
    }

    const { data } = await octokit.git.getTree({
        owner,
        repo,
        tree_sha: treeRef,
        ...(recursive ? { recursive: '1' } : {}),
    } as any)

    const baseDepth = filterPath ? filterPath.split('/').filter(Boolean).length : 0

    let items: GitHubTreeItem[] = (data.tree || []).map((entry: any) => {
        const type: GitHubTreeItem['type'] = entry.type === 'tree'
            ? 'dir'
            : entry.type === 'commit'
                ? 'submodule'
                : entry.type === 'blob'
                    ? 'file'
                    : 'file'
        return {
            name: entry.path.split('/').pop() || entry.path,
            path: entry.path,
            type,
            size: entry.size || 0,
            sha: entry.sha,
            html_url: buildHtmlUrl(owner, repo, treeRef!, entry.path, type === 'dir' ? 'dir' : 'file'),
        }
    })

    if (filterPath) {
        items = items.filter(item => item.path === filterPath || item.path.startsWith(filterPath + '/'))
    }
    if (depth && depth > 0) {
        items = items.filter(item => item.path.split('/').length - baseDepth <= depth)
    }

    items.sort((a, b) => a.path.localeCompare(b.path))

    const result = { items, truncated: !!data.truncated, ref: treeRef! }
    githubCache.set(cacheKey, result, 2)
    return result
}

export async function getRepoCommit(
    token: string,
    owner: string,
    repo: string,
    sha: string,
): Promise<GitHubCommitDetail> {
    const cacheKey = 'commit:' + owner + '/' + repo + ':' + sha
    const cached = githubCache.get<GitHubCommitDetail>(cacheKey)
    if (cached) return cached

    const octokit = getOctokit(token)
    const { data } = await octokit.repos.getCommit({ owner, repo, ref: sha })
    const detail: GitHubCommitDetail = {
        ...mapCommit(data),
        files: (data.files || []).map(mapCommitFile),
        stats: data.stats
            ? {
                additions: data.stats.additions ?? 0,
                deletions: data.stats.deletions ?? 0,
                total: data.stats.total ?? 0,
            }
            : undefined,
        parents: (data.parents || []).map((p: any) => ({ sha: p.sha })),
    }
    githubCache.set(cacheKey, detail, 5)
    return detail
}

export async function compareCommits(
    token: string,
    owner: string,
    repo: string,
    base: string,
    head: string,
): Promise<GitHubCompareResult> {
    const cacheKey = 'compare:' + owner + '/' + repo + ':' + base + '...' + head
    const cached = githubCache.get<GitHubCompareResult>(cacheKey)
    if (cached) return cached

    const octokit = getOctokit(token)
    const { data } = await octokit.repos.compareCommitsWithBasehead({
        owner,
        repo,
        basehead: base + '...' + head,
    })

    const result: GitHubCompareResult = {
        status: data.status,
        ahead_by: data.ahead_by,
        behind_by: data.behind_by,
        total_commits: data.total_commits,
        html_url: data.html_url,
        commits: (data.commits || []).map(mapCommit),
        files: (data.files || []).map(mapCommitFile),
    }
    githubCache.set(cacheKey, result, 2)
    return result
}

export async function listRepoTags(
    token: string,
    owner: string,
    repo: string,
    perPage: number = 30,
): Promise<GitHubTag[]> {
    const cacheKey = 'tags:' + owner + '/' + repo + ':' + perPage
    const cached = githubCache.get<GitHubTag[]>(cacheKey)
    if (cached) return cached

    const octokit = getOctokit(token)
    const { data } = await octokit.repos.listTags({ owner, repo, per_page: perPage })
    const tags = data as unknown as GitHubTag[]
    githubCache.set(cacheKey, tags, 5)
    return tags
}

export async function listRepoReleases(
    token: string,
    owner: string,
    repo: string,
    perPage: number = 20,
): Promise<GitHubRelease[]> {
    const cacheKey = 'releases:' + owner + '/' + repo + ':' + perPage
    const cached = githubCache.get<GitHubRelease[]>(cacheKey)
    if (cached) return cached

    const octokit = getOctokit(token)
    const { data } = await octokit.repos.listReleases({ owner, repo, per_page: perPage })
    const releases = data as unknown as GitHubRelease[]
    githubCache.set(cacheKey, releases, 5)
    return releases
}

export async function getRepoLanguages(
    token: string,
    owner: string,
    repo: string,
): Promise<Record<string, number>> {
    const cacheKey = 'languages:' + owner + '/' + repo
    const cached = githubCache.get<Record<string, number>>(cacheKey)
    if (cached) return cached

    const octokit = getOctokit(token)
    const { data } = await octokit.repos.listLanguages({ owner, repo })
    githubCache.set(cacheKey, data as Record<string, number>, 10)
    return data as Record<string, number>
}

export async function getFileContent(
    token: string,
    owner: string,
    repo: string,
    path: string,
    ref?: string,
): Promise<{ content: string; size: number; encoding: string; html_url: string; name: string; sha: string }> {
    const cacheKey = 'file:' + owner + '/' + repo + ':' + path + ':' + (ref || 'default')
    const cached = githubCache.get<{ content: string; size: number; encoding: string; html_url: string; name: string; sha: string }>(cacheKey)
    if (cached) return cached

    const octokit = getOctokit(token)
    const { data } = await octokit.repos.getContent({
        owner,
        repo,
        path,
        ...(ref ? { ref } : {}),
    })

    if (Array.isArray(data) || !('content' in (data as any))) {
        throw new Error('Not a file')
    }

    const raw = data as any
    const decoded = decodeBase64(raw.content || '')
    const result = {
        content: decoded,
        size: raw.size || 0,
        encoding: raw.encoding || 'base64',
        html_url: raw.html_url || '',
        name: raw.name || path.split('/').pop() || path,
        sha: raw.sha || '',
    }
    githubCache.set(cacheKey, result, 2)
    return result
}

export async function getReadme(
    token: string,
    owner: string,
    repo: string,
    ref?: string,
): Promise<string | null> {
    const cacheKey = 'readme:' + owner + '/' + repo + (ref ? ':' + ref : '')
    const cached = githubCache.get<string>(cacheKey)
    if (cached) return cached

    try {
        const octokit = getOctokit(token)
        const { data } = await octokit.repos.getReadme({ owner, repo, ...(ref ? { ref } : {}) } as any)
        const content = decodeBase64((data as any).content || '')
        githubCache.set(cacheKey, content, 10)
        return content
    } catch {
        return null
    }
}

/** Decode base64 content from the Contents API in a Unicode-safe way. */
function decodeBase64(content: string): string {
    const normalized = content.replace(/\n/g, '')
    if (typeof atob === 'function') {
        try {
            const binary = atob(normalized)
            const bytes = new Uint8Array(binary.length)
            for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
            if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes)
            return binary
        } catch {
            return ''
        }
    }
    return normalized
}
