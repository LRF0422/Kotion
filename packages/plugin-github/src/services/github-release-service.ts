import { getOctokit } from './github-client'
import { githubCache } from './github-cache'
import { generateChangelog } from './github-doc-service'
import { describeAssetUploadError } from './github-errors'
import { resolveOptionalService, type DesktopBridge } from '@kn/common'
import type {
    GitHubRelease,
    GitHubReleaseAsset,
    GitHubCreateReleaseInput,
    GitHubUpdateReleaseInput,
    GitHubReleaseNotes,
    GitHubTag,
} from '../types/github'

/** Cache namespace for release reads; separate from the legacy repo-service list. */
const RELEASE_NS = 'release'
const DEFAULT_TTL = 5

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max)
}

/** Drop every cached release read for a repository after a mutation. */
export function invalidateReleaseCache(owner: string, repo: string): void {
    const scoped = owner + '/' + repo
    githubCache.invalidatePattern(RELEASE_NS + ':' + scoped)
    githubCache.invalidatePattern(RELEASE_NS + '-list:' + scoped)
    githubCache.invalidatePattern(RELEASE_NS + '-tag:' + scoped)
    githubCache.invalidatePattern(RELEASE_NS + '-id:' + scoped)
    githubCache.invalidatePattern(RELEASE_NS + '-assets:' + scoped)
    githubCache.invalidate(RELEASE_NS + '-latest:' + scoped)
    // Keep the legacy repo-service list consistent too (history tools read it).
    githubCache.invalidatePattern('releases:' + scoped)
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

export async function listReleases(
    token: string,
    owner: string,
    repo: string,
    options?: { perPage?: number; page?: number },
): Promise<GitHubRelease[]> {
    const perPage = clamp(options?.perPage ?? 30, 1, 100)
    const page = Math.max(options?.page ?? 1, 1)
    const cacheKey = RELEASE_NS + '-list:' + owner + '/' + repo + ':' + perPage + ':' + page
    const cached = githubCache.get<GitHubRelease[]>(cacheKey)
    if (cached) return cached

    const octokit = getOctokit(token)
    const { data } = await octokit.repos.listReleases({ owner, repo, per_page: perPage, page })
    const releases = data as unknown as GitHubRelease[]
    githubCache.set(cacheKey, releases, DEFAULT_TTL)
    return releases
}

export async function getLatestRelease(
    token: string,
    owner: string,
    repo: string,
): Promise<GitHubRelease> {
    const cacheKey = RELEASE_NS + '-latest:' + owner + '/' + repo
    const cached = githubCache.get<GitHubRelease>(cacheKey)
    if (cached) return cached

    const octokit = getOctokit(token)
    const { data } = await octokit.repos.getLatestRelease({ owner, repo })
    const release = data as unknown as GitHubRelease
    githubCache.set(cacheKey, release, DEFAULT_TTL)
    return release
}

export async function getReleaseById(
    token: string,
    owner: string,
    repo: string,
    releaseId: number,
): Promise<GitHubRelease> {
    const cacheKey = RELEASE_NS + '-id:' + owner + '/' + repo + ':' + releaseId
    const cached = githubCache.get<GitHubRelease>(cacheKey)
    if (cached) return cached

    const octokit = getOctokit(token)
    const { data } = await octokit.repos.getRelease({ owner, repo, release_id: releaseId })
    const release = data as unknown as GitHubRelease
    githubCache.set(cacheKey, release, DEFAULT_TTL)
    return release
}

export async function getReleaseByTag(
    token: string,
    owner: string,
    repo: string,
    tag: string,
): Promise<GitHubRelease> {
    const cacheKey = RELEASE_NS + '-tag:' + owner + '/' + repo + ':' + tag
    const cached = githubCache.get<GitHubRelease>(cacheKey)
    if (cached) return cached

    const octokit = getOctokit(token)
    const { data } = await octokit.repos.getReleaseByTag({ owner, repo, tag })
    const release = data as unknown as GitHubRelease
    githubCache.set(cacheKey, release, DEFAULT_TTL)
    return release
}

export async function listTags(
    token: string,
    owner: string,
    repo: string,
    perPage: number = 100,
): Promise<GitHubTag[]> {
    const size = clamp(perPage, 1, 100)
    const cacheKey = RELEASE_NS + '-tags:' + owner + '/' + repo + ':' + size
    const cached = githubCache.get<GitHubTag[]>(cacheKey)
    if (cached) return cached

    const octokit = getOctokit(token)
    const { data } = await octokit.repos.listTags({ owner, repo, per_page: size })
    const tags = data as unknown as GitHubTag[]
    githubCache.set(cacheKey, tags, DEFAULT_TTL)
    return tags
}

export async function listReleaseAssets(
    token: string,
    owner: string,
    repo: string,
    releaseId: number,
): Promise<GitHubReleaseAsset[]> {
    const cacheKey = RELEASE_NS + '-assets:' + owner + '/' + repo + ':' + releaseId
    const cached = githubCache.get<GitHubReleaseAsset[]>(cacheKey)
    if (cached) return cached

    const octokit = getOctokit(token)
    const { data } = await octokit.repos.listReleaseAssets({
        owner,
        repo,
        release_id: releaseId,
        per_page: 100,
    })
    const assets = data as unknown as GitHubReleaseAsset[]
    githubCache.set(cacheKey, assets, DEFAULT_TTL)
    return assets
}

/**
 * Generate release notes the way GitHub's own UI does: it diffs the target
 * against the previous release/tag and groups merged pull requests.
 */
export async function generateReleaseNotes(
    token: string,
    owner: string,
    repo: string,
    options: { tagName: string; targetCommitish?: string; previousTagName?: string; configurationFilePath?: string },
): Promise<GitHubReleaseNotes> {
    const octokit = getOctokit(token)
    const { data } = await octokit.repos.generateReleaseNotes({
        owner,
        repo,
        tag_name: options.tagName,
        ...(options.targetCommitish ? { target_commitish: options.targetCommitish } : {}),
        ...(options.previousTagName ? { previous_tag_name: options.previousTagName } : {}),
        ...(options.configurationFilePath ? { configuration_file_path: options.configurationFilePath } : {}),
    })
    return { name: data.name || '', body: data.body || '' }
}

/**
 * GitHub's generate-notes endpoint requires Contents *write* access even though
 * it only produces text. Fine-grained tokens scoped to read-only contents get a
 * "Resource not accessible by personal access token" error; detect that so we
 * can fall back to a read-only, commit-based changelog.
 */
export function isReleaseNotesPermissionError(error: any): boolean {
    const status = error?.status
    const message = String(error?.message || '')
    if (/Resource not accessible by (personal access token|integration)/i.test(message)) return true
    if (status === 404 && /not accessible|generate.?notes/i.test(message)) return true
    if (status === 403 && /not accessible|forbidden|permission/i.test(message)) return true
    return false
}

export interface ResolvedReleaseNotes {
    name?: string
    body: string
    source: 'github-generate-notes' | 'commit-changelog'
    warning?: string
}

/**
 * Release notes with a resilient fallback:
 *   1. Try GitHub's native generate-notes (groups merged PRs, matches the web UI).
 *   2. If the token lacks permission, fall back to a commit-based changelog that
 *      only needs read access.
 */
export async function resolveReleaseNotes(
    token: string,
    owner: string,
    repo: string,
    options: {
        tagName: string
        targetCommitish?: string
        previousTagName?: string
        version?: string
        includeAuthors?: boolean
    },
): Promise<ResolvedReleaseNotes> {
    try {
        const notes = await generateReleaseNotes(token, owner, repo, {
            tagName: options.tagName,
            targetCommitish: options.targetCommitish,
            previousTagName: options.previousTagName,
        })
        return { name: notes.name, body: notes.body, source: 'github-generate-notes' }
    } catch (error: any) {
        if (!isReleaseNotesPermissionError(error)) throw error

        let previousTag = options.previousTagName
        if (!previousTag) {
            const tags = await listTags(token, owner, repo, 100).catch(() => [] as GitHubTag[])
            previousTag = tags.map(tag => tag.name).find(name => name !== options.tagName)
        }
        const changelog = await generateChangelog(token, owner, repo, {
            base: previousTag,
            head: options.targetCommitish,
            version: options.version || options.tagName,
            includeAuthors: options.includeAuthors,
        })
        return {
            body: changelog.markdown,
            source: 'commit-changelog',
            warning: 'GitHub generate-notes 需要 Contents 写权限，当前 token 无权限，已自动回退为基于 commit 的 changelog。',
        }
    }
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                     */
/* -------------------------------------------------------------------------- */

export async function createRelease(
    token: string,
    owner: string,
    repo: string,
    input: GitHubCreateReleaseInput,
): Promise<GitHubRelease> {
    const octokit = getOctokit(token)
    const { data } = await octokit.repos.createRelease({
        owner,
        repo,
        tag_name: input.tagName,
        ...(input.targetCommitish ? { target_commitish: input.targetCommitish } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.draft !== undefined ? { draft: input.draft } : {}),
        ...(input.prerelease !== undefined ? { prerelease: input.prerelease } : {}),
        ...(input.generateReleaseNotes ? { generate_release_notes: true } : {}),
        ...(input.makeLatest ? { make_latest: input.makeLatest } : {}),
        ...(input.discussionCategoryName ? { discussion_category_name: input.discussionCategoryName } : {}),
    } as any)
    invalidateReleaseCache(owner, repo)
    return data as unknown as GitHubRelease
}

async function resolveReleaseId(
    token: string,
    owner: string,
    repo: string,
    input: { releaseId?: number; tagName?: string },
): Promise<number> {
    if (input.releaseId) return input.releaseId
    if (!input.tagName) throw new Error('Provide releaseId or tagName to address a release.')
    const release = await getReleaseByTag(token, owner, repo, input.tagName)
    return release.id
}

export async function updateRelease(
    token: string,
    owner: string,
    repo: string,
    input: GitHubUpdateReleaseInput,
): Promise<GitHubRelease> {
    const releaseId = await resolveReleaseId(token, owner, repo, input)
    const octokit = getOctokit(token)
    const { data } = await octokit.repos.updateRelease({
        owner,
        repo,
        release_id: releaseId,
        ...(input.newTagName ? { tag_name: input.newTagName } : {}),
        ...(input.targetCommitish ? { target_commitish: input.targetCommitish } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.draft !== undefined ? { draft: input.draft } : {}),
        ...(input.prerelease !== undefined ? { prerelease: input.prerelease } : {}),
        ...(input.makeLatest ? { make_latest: input.makeLatest } : {}),
        ...(input.discussionCategoryName ? { discussion_category_name: input.discussionCategoryName } : {}),
    } as any)
    invalidateReleaseCache(owner, repo)
    return data as unknown as GitHubRelease
}

export async function deleteRelease(
    token: string,
    owner: string,
    repo: string,
    input: { releaseId?: number; tagName?: string },
): Promise<{ deleted: true; releaseId: number }> {
    const releaseId = await resolveReleaseId(token, owner, repo, input)
    const octokit = getOctokit(token)
    await octokit.repos.deleteRelease({ owner, repo, release_id: releaseId })
    invalidateReleaseCache(owner, repo)
    return { deleted: true, releaseId }
}

/**
 * Resolve a branch, tag or commit-ish to a commit SHA. Used before creating a
 * tag so both lightweight and annotated tags point at a real commit.
 */
async function resolveCommitSha(
    token: string,
    owner: string,
    repo: string,
    ref?: string,
): Promise<string> {
    const octokit = getOctokit(token)
    let target = ref
    if (!target) {
        const { data } = await octokit.repos.get({ owner, repo })
        target = data.default_branch
    }

    try {
        const { data } = await octokit.git.getRef({ owner, repo, ref: 'heads/' + target })
        return data.object.sha
    } catch {
        // not a branch
    }
    try {
        const { data } = await octokit.git.getRef({ owner, repo, ref: 'tags/' + target })
        return data.object.sha
    } catch {
        // not a tag
    }
    const { data } = await octokit.repos.getCommit({ owner, repo, ref: target })
    return data.sha
}

export interface CreateTagInput {
    tag: string
    /** Branch, tag or commit SHA the tag should point at. Defaults to the default branch. */
    target?: string
    /** When set, an annotated tag object is created with this message. */
    message?: string
}

/** Create a git tag (lightweight, or annotated when a message is supplied). */
export async function createTag(
    token: string,
    owner: string,
    repo: string,
    input: CreateTagInput,
): Promise<{ tag: string; sha: string; annotated: boolean; url: string }> {
    const octokit = getOctokit(token)
    const commitSha = await resolveCommitSha(token, owner, repo, input.target)

    let refSha = commitSha
    let annotated = false
    if (input.message) {
        const { data: tagObject } = await octokit.git.createTag({
            owner,
            repo,
            tag: input.tag,
            message: input.message,
            object: commitSha,
            type: 'commit',
        })
        refSha = tagObject.sha
        annotated = true
    }

    try {
        await octokit.git.createRef({ owner, repo, ref: 'refs/tags/' + input.tag, sha: refSha })
    } catch (error: any) {
        if (error?.status === 422) {
            throw new Error('Tag "' + input.tag + '" already exists in ' + owner + '/' + repo + '.')
        }
        throw error
    }

    invalidateReleaseCache(owner, repo)
    githubCache.invalidatePattern(RELEASE_NS + '-tags:' + owner + '/' + repo)
    return {
        tag: input.tag,
        sha: commitSha,
        annotated,
        url: 'https://github.com/' + owner + '/' + repo + '/releases/tag/' + encodeURIComponent(input.tag),
    }
}

export interface UploadAssetInput {
    releaseId?: number
    tagName?: string
    name: string
    /** Asset payload. Text/JSON/Markdown is uploaded as-is; binary must be passed as ArrayBuffer/Blob. */
    data: string | ArrayBuffer | Blob
    contentType?: string
    label?: string
}

/** Base64-encode a Blob without blowing the call stack on large files. */
async function blobToBase64(blob: Blob): Promise<string> {
    if (typeof FileReader !== 'undefined') {
        return await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => {
                const result = String(reader.result || '')
                const comma = result.indexOf(',')
                resolve(comma >= 0 ? result.slice(comma + 1) : result)
            }
            reader.onerror = () => reject(reader.error || new Error('Failed to read file'))
            reader.readAsDataURL(blob)
        })
    }
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let binary = ''
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)) as any)
    }
    return btoa(binary)
}

/**
 * Upload an asset through the Electron main process. Unlike the browser, the
 * main process can POST to uploads.github.com (which sends no CORS headers).
 */
async function uploadAssetViaDesktop(
    desktop: DesktopBridge,
    token: string,
    owner: string,
    repo: string,
    releaseId: number,
    input: UploadAssetInput,
    contentType: string,
): Promise<GitHubReleaseAsset> {
    const blob = input.data instanceof Blob
        ? input.data
        : new Blob([input.data as any], { type: contentType })
    const base64 = await blobToBase64(blob)
    const query = 'name=' + encodeURIComponent(input.name)
        + (input.label ? '&label=' + encodeURIComponent(input.label) : '')
    const url = 'https://uploads.github.com/repos/' + owner + '/' + repo
        + '/releases/' + releaseId + '/assets?' + query

    const response = await desktop.invoke('http.request', {
        method: 'POST',
        url,
        headers: {
            Authorization: 'token ' + token,
            Accept: 'application/vnd.github+json',
            'Content-Type': contentType,
            'Content-Length': String(blob.size),
        },
        bodyBase64: base64,
        timeoutMs: 180000,
        maxResponseBytes: 4 * 1024 * 1024,
    })

    if (response.status < 200 || response.status >= 300) {
        let detail = response.bodyText || response.statusText
        try {
            const parsed = JSON.parse(response.bodyText)
            if (parsed?.message) {
                detail = parsed.message + (parsed.documentation_url ? ' - ' + parsed.documentation_url : '')
            }
        } catch {
            // keep raw text
        }
        const error: any = new Error('GitHub asset upload failed (' + response.status + '): ' + detail)
        error.status = response.status
        throw error
    }
    try {
        return JSON.parse(response.bodyText) as GitHubReleaseAsset
    } catch {
        throw new Error('GitHub asset upload returned an unreadable response.')
    }
}

/**
 * Upload a release asset. Text payloads default to text/plain.
 *
 * Prefers the Electron main-process bridge because GitHub's asset host
 * (uploads.github.com) sends no CORS headers, so browsers cannot upload
 * release assets directly.
 */
export async function uploadReleaseAsset(
    token: string,
    owner: string,
    repo: string,
    input: UploadAssetInput,
): Promise<GitHubReleaseAsset> {
    const releaseId = await resolveReleaseId(token, owner, repo, input)
    const contentType = input.contentType || (typeof input.data === 'string' ? 'text/plain' : 'application/octet-stream')

    const desktop = resolveOptionalService('desktop')
    if (desktop?.has('http.request')) {
        try {
            const asset = await uploadAssetViaDesktop(desktop, token, owner, repo, releaseId, input, contentType)
            invalidateReleaseCache(owner, repo)
            return asset
        } catch (error: any) {
            invalidateReleaseCache(owner, repo)
            throw new Error(describeAssetUploadError(error, input.tagName))
        }
    }

    try {
        const octokit = getOctokit(token)
        const length = typeof input.data === 'string'
            ? new TextEncoder().encode(input.data).length
            : (input.data as any).size ?? (input.data as ArrayBuffer).byteLength

        const { data } = await (octokit.repos as any).uploadReleaseAsset({
            owner,
            repo,
            release_id: releaseId,
            name: input.name,
            label: input.label,
            data: input.data,
            headers: {
                'content-type': contentType,
                'content-length': String(length),
            },
        })
        invalidateReleaseCache(owner, repo)
        return data as unknown as GitHubReleaseAsset
    } catch (error: any) {
        invalidateReleaseCache(owner, repo)
        throw new Error(describeAssetUploadError(error, input.tagName))
    }
}

export async function deleteReleaseAsset(
    token: string,
    owner: string,
    repo: string,
    assetId: number,
): Promise<{ deleted: true; assetId: number }> {
    const octokit = getOctokit(token)
    await octokit.repos.deleteReleaseAsset({ owner, repo, asset_id: assetId })
    invalidateReleaseCache(owner, repo)
    return { deleted: true, assetId }
}
