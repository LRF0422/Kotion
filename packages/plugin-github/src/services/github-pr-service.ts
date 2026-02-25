import { getOctokit } from './github-client'
import { githubCache } from './github-cache'
import type { GitHubPullRequest, GitHubReview } from '../types/github'

export async function getPullRequest(token: string, owner: string, repo: string, prNumber: number): Promise<GitHubPullRequest> {
    const cacheKey = `pr:${owner}/${repo}#${prNumber}`
    const cached = githubCache.get<GitHubPullRequest>(cacheKey)
    if (cached) return cached

    const octokit = getOctokit(token)
    const { data } = await octokit.pulls.get({ owner, repo, pull_number: prNumber })
    const pr = data as unknown as GitHubPullRequest
    githubCache.set(cacheKey, pr)
    return pr
}

export async function listPullRequests(
    token: string,
    owner: string,
    repo: string,
    options?: { state?: 'open' | 'closed' | 'all'; per_page?: number; page?: number }
): Promise<GitHubPullRequest[]> {
    const octokit = getOctokit(token)
    const { data } = await octokit.pulls.list({
        owner,
        repo,
        state: options?.state || 'open',
        per_page: options?.per_page || 20,
        page: options?.page || 1,
    })
    return data as unknown as GitHubPullRequest[]
}

export async function getPRReviews(token: string, owner: string, repo: string, prNumber: number): Promise<GitHubReview[]> {
    const cacheKey = `reviews:${owner}/${repo}#${prNumber}`
    const cached = githubCache.get<GitHubReview[]>(cacheKey)
    if (cached) return cached

    const octokit = getOctokit(token)
    const { data } = await octokit.pulls.listReviews({ owner, repo, pull_number: prNumber })
    const reviews = data as unknown as GitHubReview[]
    githubCache.set(cacheKey, reviews)
    return reviews
}

export interface PRDetails {
    pr: GitHubPullRequest
    reviews: GitHubReview[]
}

export async function getPRDetails(token: string, owner: string, repo: string, prNumber: number): Promise<PRDetails> {
    const [pr, reviews] = await Promise.all([
        getPullRequest(token, owner, repo, prNumber),
        getPRReviews(token, owner, repo, prNumber),
    ])
    return { pr, reviews }
}
