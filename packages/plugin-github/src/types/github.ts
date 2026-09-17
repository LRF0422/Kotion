export interface GitHubUser {
    login: string
    avatar_url: string
    html_url: string
}

export interface GitHubLabel {
    name: string
    color: string
    description?: string
}

export interface GitHubMilestone {
    title: string
    number: number
    state: 'open' | 'closed'
}

export interface GitHubIssue {
    number: number
    title: string
    state: 'open' | 'closed'
    html_url: string
    user: GitHubUser
    assignees: GitHubUser[]
    labels: GitHubLabel[]
    comments: number
    body?: string
    milestone?: GitHubMilestone
    created_at: string
    updated_at: string
    closed_at?: string
}

export interface GitHubPullRequest {
    number: number
    title: string
    state: 'open' | 'closed'
    merged: boolean
    draft: boolean
    html_url: string
    user: GitHubUser
    assignees: GitHubUser[]
    labels: GitHubLabel[]
    comments: number
    body?: string
    base: { ref: string; label: string }
    head: { ref: string; label: string }
    additions: number
    deletions: number
    changed_files: number
    requested_reviewers: GitHubUser[]
    merge_commit_sha?: string
    merged_at?: string
    created_at: string
    updated_at: string
    closed_at?: string
}

export type PRMergeState = 'open' | 'closed' | 'merged' | 'draft'

export interface GitHubReview {
    user: GitHubUser
    state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'PENDING' | 'DISMISSED'
}

export interface GitHubRepo {
    full_name: string
    name: string
    owner: GitHubUser
    description: string | null
    html_url: string
    language: string | null
    stargazers_count: number
    forks_count: number
    open_issues_count: number
    topics: string[]
    visibility: 'public' | 'private' | 'internal'
    default_branch: string
    created_at: string
    updated_at: string
}

export interface GitHubFileContent {
    name: string
    path: string
    sha: string
    content: string
    encoding: string
    html_url: string
    size: number
}

export interface GitHubComment {
    id: number
    user: GitHubUser
    body: string
    html_url: string
    created_at: string
    updated_at: string
}

export interface GitHubTreeItem {
    name: string
    path: string
    type: 'file' | 'dir' | 'symlink' | 'submodule'
    size: number
    sha: string
    html_url: string
}

export interface GitHubCommit {
    sha: string
    message: string
    author: { name: string; date: string; email: string }
    committer: { name: string; date: string }
    html_url: string
    avatar_url?: string
}

export interface GitHubSearchResult<T> {
    total_count: number
    incomplete_results: boolean
    items: T[]
}

export type GitHubFileStatus =
    | 'added'
    | 'removed'
    | 'modified'
    | 'renamed'
    | 'copied'
    | 'changed'
    | 'unchanged'

export interface GitHubCommitFile {
    filename: string
    previous_filename?: string
    status: GitHubFileStatus
    additions: number
    deletions: number
    changes: number
    patch?: string
    blob_url: string
    raw_url: string
}

export interface GitHubCommitDetail extends GitHubCommit {
    files?: GitHubCommitFile[]
    stats?: { additions: number; deletions: number; total: number }
    parents?: { sha: string }[]
}

export interface GitHubTag {
    name: string
    commit: { sha: string; url: string }
    zipball_url?: string
    tarball_url?: string
}

export type GitHubReleaseAssetState = 'uploaded' | 'open'

export interface GitHubReleaseAsset {
    id: number
    name: string
    label: string | null
    content_type: string
    size: number
    download_count: number
    state: GitHubReleaseAssetState
    browser_download_url: string
    created_at: string
    updated_at: string
}

export interface GitHubRelease {
    id: number
    tag_name: string
    target_commitish?: string
    name: string | null
    body: string | null
    draft: boolean
    prerelease: boolean
    html_url: string
    url?: string
    assets_url?: string
    upload_url?: string
    tarball_url?: string | null
    zipball_url?: string | null
    author?: GitHubUser
    assets?: GitHubReleaseAsset[]
    published_at: string | null
    created_at: string
}

/** Make-latest semantics accepted by the create/update release APIs. */
export type GitHubReleaseMakeLatest = 'true' | 'false' | 'legacy'

/** Payload for creating a release; tag may be created automatically by GitHub. */
export interface GitHubCreateReleaseInput {
    tagName: string
    targetCommitish?: string
    name?: string
    body?: string
    draft?: boolean
    prerelease?: boolean
    generateReleaseNotes?: boolean
    makeLatest?: GitHubReleaseMakeLatest
    discussionCategoryName?: string
}

/** Partial update for an existing release (addressed by id or tag). */
export interface GitHubUpdateReleaseInput {
    releaseId?: number
    tagName?: string
    newTagName?: string
    targetCommitish?: string
    name?: string
    body?: string
    draft?: boolean
    prerelease?: boolean
    makeLatest?: GitHubReleaseMakeLatest
    discussionCategoryName?: string
}

export interface GitHubReleaseNotes {
    name: string
    body: string
}

export interface GitHubTreeEntry {
    path: string
    mode: string
    type: 'blob' | 'tree' | 'commit'
    sha: string
    size?: number
    url: string
}

export interface GitHubCompareResult {
    status: string
    ahead_by: number
    behind_by: number
    total_commits: number
    html_url: string
    commits: GitHubCommit[]
    files: GitHubCommitFile[]
}
