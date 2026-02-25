import { getOctokit } from './github-client'
import { githubCache } from './github-cache'
import type { GitHubIssue, GitHubComment } from '../types/github'

export async function getIssue(token: string, owner: string, repo: string, issueNumber: number): Promise<GitHubIssue> {
    const cacheKey = `issue:${owner}/${repo}#${issueNumber}`
    const cached = githubCache.get<GitHubIssue>(cacheKey)
    if (cached) return cached

    const octokit = getOctokit(token)
    const { data } = await octokit.issues.get({ owner, repo, issue_number: issueNumber })
    const issue = data as unknown as GitHubIssue
    githubCache.set(cacheKey, issue)
    return issue
}

export async function listIssues(
    token: string,
    owner: string,
    repo: string,
    options?: { state?: 'open' | 'closed' | 'all'; labels?: string; per_page?: number; page?: number }
): Promise<GitHubIssue[]> {
    const octokit = getOctokit(token)
    const { data } = await octokit.issues.listForRepo({
        owner,
        repo,
        state: options?.state || 'open',
        labels: options?.labels,
        per_page: options?.per_page || 20,
        page: options?.page || 1,
    })
    // Filter out pull requests (GitHub API returns PRs as issues too)
    return (data as unknown as GitHubIssue[]).filter(issue => !(issue as any).pull_request)
}

export async function createIssue(
    token: string,
    owner: string,
    repo: string,
    title: string,
    body?: string,
    labels?: string[],
    assignees?: string[]
): Promise<GitHubIssue> {
    const octokit = getOctokit(token)
    const { data } = await octokit.issues.create({ owner, repo, title, body, labels, assignees })
    githubCache.invalidatePattern(`issue:${owner}/${repo}`)
    return data as unknown as GitHubIssue
}

export async function updateIssue(
    token: string,
    owner: string,
    repo: string,
    issueNumber: number,
    updates: { state?: 'open' | 'closed'; title?: string; body?: string; labels?: string[]; assignees?: string[] }
): Promise<GitHubIssue> {
    const octokit = getOctokit(token)
    const { data } = await octokit.issues.update({ owner, repo, issue_number: issueNumber, ...updates })
    githubCache.invalidate(`issue:${owner}/${repo}#${issueNumber}`)
    return data as unknown as GitHubIssue
}

export async function getIssueComments(
    token: string,
    owner: string,
    repo: string,
    issueNumber: number,
    per_page: number = 10
): Promise<GitHubComment[]> {
    const cacheKey = `comments:${owner}/${repo}#${issueNumber}`
    const cached = githubCache.get<GitHubComment[]>(cacheKey)
    if (cached) return cached

    const octokit = getOctokit(token)
    const { data } = await octokit.issues.listComments({ owner, repo, issue_number: issueNumber, per_page })
    const comments = data as unknown as GitHubComment[]
    githubCache.set(cacheKey, comments)
    return comments
}

export async function addIssueComment(
    token: string,
    owner: string,
    repo: string,
    issueNumber: number,
    body: string
): Promise<GitHubComment> {
    const octokit = getOctokit(token)
    const { data } = await octokit.issues.createComment({ owner, repo, issue_number: issueNumber, body })
    githubCache.invalidate(`comments:${owner}/${repo}#${issueNumber}`)
    return data as unknown as GitHubComment
}
