import { Editor } from '@kn/editor'
import { z } from '@kn/ui'
import { PluginConfigStore, parseMarkdownToNodes, resolveOptionalService } from '@kn/common'
import {
    listReleases,
    listTags,
    getLatestRelease,
    getReleaseByTag,
    getReleaseById,
    resolveReleaseNotes,
    createRelease,
    updateRelease,
    deleteRelease,
    createTag,
    uploadReleaseAsset,
    deleteReleaseAsset,
} from '../../services/github-release-service'
import { generateChangelog } from '../../services/github-doc-service'
import type { GitHubPluginConfig } from '../../types/config'
import type { GitHubRelease } from '../../types/github'
import { GITHUB_PLUGIN_KEY, requireGitHubToken } from '../../hooks/use-github-config'
import { describeGitHubError } from '../../services/github-errors'

async function getConfig(): Promise<GitHubPluginConfig> {
    const store = PluginConfigStore.getInstance()
    await store.initialize()
    const config = await store.getConfig<GitHubPluginConfig>(GITHUB_PLUGIN_KEY)
    return (config || {}) as GitHubPluginConfig
}

async function getToken(): Promise<string> {
    // The PAT is never part of the persisted config; reveal it into memory.
    return requireGitHubToken()
}

async function resolveOwnerRepo(params: { owner?: string; repo?: string }): Promise<{ owner: string; repo: string }> {
    const config = await getConfig()
    const owner = params.owner || config.defaultOwner || ''
    const repo = params.repo || config.defaultRepo || ''
    if (!owner || !repo) {
        throw new Error('Missing owner/repo. Provide them explicitly or set a default repository in Settings -> GitHub.')
    }
    return { owner, repo }
}

async function resolveRelease(
    token: string,
    owner: string,
    repo: string,
    params: { tagName?: string; releaseId?: number; latest?: boolean },
): Promise<GitHubRelease> {
    if (params.releaseId) return getReleaseById(token, owner, repo, params.releaseId)
    if (params.tagName) return getReleaseByTag(token, owner, repo, params.tagName)
    if (params.latest) return getLatestRelease(token, owner, repo)
    throw new Error('Provide tagName, releaseId, or latest=true to address a release.')
}

/** Append parsed Markdown to the end of the current document. Returns block count. */
function appendMarkdown(editor: Editor, markdown: string): number {
    const nodes = parseMarkdownToNodes(markdown)
    if (!nodes || nodes.length === 0) return 0
    const position = editor.state.doc.content.size
    editor.commands.insertContentAt(position, nodes)
    return nodes.length
}

function releaseSummaryMarkdown(release: GitHubRelease, owner: string, repo: string): string {
    const lines: string[] = []
    const title = release.name || release.tag_name
    lines.push('## ' + title)
    lines.push('')
    const flags: string[] = []
    if (release.draft) flags.push('Draft')
    if (release.prerelease) flags.push('Pre-release')
    lines.push('> [' + owner + '/' + repo + ' · ' + release.tag_name + '](' + release.html_url + ')' + (flags.length ? ' · ' + flags.join(' · ') : ''))
    lines.push('')
    if (release.body) {
        lines.push(release.body.trim())
        lines.push('')
    }
    return lines.join('\n')
}

const ownerRepoFields = {
    owner: z.string().optional().describe('仓库所有者，缺省使用设置中的默认 owner'),
    repo: z.string().optional().describe('仓库名称，缺省使用设置中的默认 repo'),
}

const releaseRefFields = {
    tagName: z.string().optional().describe('release 对应的 tag 名称'),
    releaseId: z.number().optional().describe('release 数字 ID（与 tagName 二选一）'),
    latest: z.boolean().optional().describe('设为 true 时定位最新的非草稿 release'),
}

export const listGitHubReleasesTool = {
    name: 'listGitHubReleases',
    description: '列出仓库的 release（版本发布）列表，包含草稿/预发布状态、发布时间、资产文件、下载量与链接。用于查看已发布版本或选定要更新的 release。',
    inputSchema: z.object({
        ...ownerRepoFields,
        latestOnly: z.boolean().optional().describe('仅返回最新非草稿 release，默认 false'),
        per_page: z.number().optional().describe('每页数量，默认 30，最大 100'),
        page: z.number().optional().describe('页码，默认 1'),
    }),
    execute: (_editor: Editor) => async (params: { owner?: string; repo?: string; latestOnly?: boolean; per_page?: number; page?: number }) => {
        try {
            const { owner, repo } = await resolveOwnerRepo(params)
            const token = await getToken()
            if (params.latestOnly) {
                const release = await getLatestRelease(token, owner, repo)
                return { success: true, owner, repo, count: 1, releases: [mapRelease(release)] }
            }
            const releases = await listReleases(token, owner, repo, {
                perPage: Math.min(Math.max(params.per_page || 30, 1), 100),
                page: params.page,
            })
            return { success: true, owner, repo, count: releases.length, releases: releases.map(mapRelease) }
        } catch (error: any) {
            return { success: false, error: describeGitHubError(error) }
        }
    },
}

function mapRelease(release: GitHubRelease) {
    return {
        id: release.id,
        tag: release.tag_name,
        name: release.name,
        draft: release.draft,
        prerelease: release.prerelease,
        targetCommitish: release.target_commitish,
        publishedAt: release.published_at,
        createdAt: release.created_at,
        url: release.html_url,
        author: release.author?.login,
        assetCount: (release.assets || []).length,
        assets: (release.assets || []).map(asset => ({
            id: asset.id,
            name: asset.name,
            size: asset.size,
            downloadCount: asset.download_count,
            url: asset.browser_download_url,
        })),
        body: release.body,
    }
}

export const getGitHubReleaseTool = {
    name: 'getGitHubRelease',
    description: '获取单个 release 的详细信息（按 tag、ID 或 latest），包括完整的 release notes、状态与资产列表。',
    inputSchema: z.object({
        ...ownerRepoFields,
        ...releaseRefFields,
    }),
    execute: (_editor: Editor) => async (params: { owner?: string; repo?: string; tagName?: string; releaseId?: number; latest?: boolean }) => {
        try {
            const { owner, repo } = await resolveOwnerRepo(params)
            const token = await getToken()
            const release = await resolveRelease(token, owner, repo, params)
            return { success: true, owner, repo, release: mapRelease(release) }
        } catch (error: any) {
            return { success: false, error: describeGitHubError(error) }
        }
    },
}

export const generateGitHubReleaseNotesTool = {
    name: 'generateGitHubReleaseNotes',
    description: '使用 GitHub 原生能力为新 tag 生成 release notes（与 GitHub 网页端一致：对比上一个版本并按合并的 PR 分组）。可指定 previousTag，或自动使用最近一个 tag；默认把结果插入到文档末尾。',
    inputSchema: z.object({
        ...ownerRepoFields,
        tagName: z.string().describe('即将发布的新 tag，例如 v1.3.0'),
        targetCommitish: z.string().optional().describe('目标分支或 commit，默认仓库默认分支'),
        previousTagName: z.string().optional().describe('上一个版本 tag，缺省自动取最新 tag'),
        insert: z.boolean().optional().describe('是否插入到文档末尾，默认 true'),
    }),
    execute: (editor: Editor) => async (params: { owner?: string; repo?: string; tagName: string; targetCommitish?: string; previousTagName?: string; insert?: boolean }) => {
        try {
            const { owner, repo } = await resolveOwnerRepo(params)
            const token = await getToken()
            const notes = await resolveReleaseNotes(token, owner, repo, {
                tagName: params.tagName,
                targetCommitish: params.targetCommitish,
                previousTagName: params.previousTagName,
                version: params.tagName,
            })
            const markdown = '## ' + (notes.name || params.tagName) + '\n\n' + notes.body
            let insertedBlocks = 0
            if (params.insert !== false) insertedBlocks = appendMarkdown(editor, markdown)
            return {
                success: true,
                owner,
                repo,
                tagName: params.tagName,
                name: notes.name,
                body: notes.body,
                source: notes.source,
                warning: notes.warning,
                insertedBlocks,
                markdown,
            }
        } catch (error: any) {
            return { success: false, error: describeGitHubError(error) }
        }
    },
}

export const createGitHubTagTool = {
    name: 'createGitHubTag',
    description: '在仓库中创建一个 git tag（轻量 tag；提供 message 时创建附注 tag）。发布 release 前如需先打 tag，可使用此工具。',
    inputSchema: z.object({
        ...ownerRepoFields,
        tag: z.string().describe('tag 名称，例如 v1.3.0'),
        target: z.string().optional().describe('目标分支、tag 或 commit SHA，默认仓库默认分支'),
        message: z.string().optional().describe('附注 tag 的消息；不填则创建轻量 tag'),
    }),
    execute: (_editor: Editor) => async (params: { owner?: string; repo?: string; tag: string; target?: string; message?: string }) => {
        try {
            const { owner, repo } = await resolveOwnerRepo(params)
            const token = await getToken()
            const result = await createTag(token, owner, repo, {
                tag: params.tag,
                target: params.target,
                message: params.message,
            })
            return { success: true, owner, repo, ...result }
        } catch (error: any) {
            return { success: false, error: describeGitHubError(error) }
        }
    },
}

export const createGitHubReleaseTool = {
    name: 'createGitHubRelease',
    description: '创建并发布一个 GitHub release。可同时自动创建 tag、自动生成 release notes（GitHub 原生 generate-notes 或基于 commit 的 changelog）。支持 draft（草稿）与 prerelease（预发布）。',
    inputSchema: z.object({
        ...ownerRepoFields,
        tagName: z.string().describe('release 的 tag 名称，例如 v1.3.0；若不存在 GitHub 会基于 targetCommitish 自动创建'),
        targetCommitish: z.string().optional().describe('目标分支或 commit，默认仓库默认分支'),
        name: z.string().optional().describe('release 标题，缺省使用 tag 名称'),
        body: z.string().optional().describe('release notes（Markdown）。当 notesSource=custom 时必填'),
        notesSource: z.enum(['auto', 'commits', 'custom', 'none']).optional().describe('notes 来源：auto=GitHub 原生生成，commits=基于 commit/changelog 生成，custom=使用 body，none=留空。默认 auto'),
        previousTag: z.string().optional().describe('生成 notes 时的上一个版本 tag（auto/commits 模式可选）'),
        draft: z.boolean().optional().describe('是否保存为草稿，默认 false'),
        prerelease: z.boolean().optional().describe('是否标记为预发布，默认 false'),
        createTag: z.boolean().optional().describe('是否在创建 release 前显式创建 tag（附注 tag 需要 tagMessage），默认 false'),
        tagMessage: z.string().optional().describe('显式创建附注 tag 时使用的消息'),
        makeLatest: z.enum(['true', 'false', 'legacy']).optional().describe('是否设为 latest release，默认 GitHub 行为'),
        includeContributors: z.boolean().optional().describe('commits 模式下是否附带贡献者列表，默认 false'),
        insert: z.boolean().optional().describe('发布成功后是否把 release 摘要插入文档，默认 false'),
    }),
    execute: (editor: Editor) => async (params: {
        owner?: string; repo?: string; tagName: string; targetCommitish?: string; name?: string; body?: string
        notesSource?: 'auto' | 'commits' | 'custom' | 'none'; previousTag?: string; draft?: boolean; prerelease?: boolean
        createTag?: boolean; tagMessage?: string; makeLatest?: 'true' | 'false' | 'legacy'; includeContributors?: boolean; insert?: boolean
    }) => {
        try {
            const { owner, repo } = await resolveOwnerRepo(params)
            const token = await getToken()
            const config = await getConfig()
            const notesSource = params.notesSource || (config.releaseAutoGenerateNotes ? 'auto' : 'none')

            let resolvedBody = params.body
            let notesGenerator: string | undefined
            let notesWarning: string | undefined

            if (notesSource === 'auto') {
                const notes = await resolveReleaseNotes(token, owner, repo, {
                    tagName: params.tagName,
                    targetCommitish: params.targetCommitish,
                    previousTagName: params.previousTag,
                    version: params.tagName,
                    includeAuthors: params.includeContributors,
                })
                resolvedBody = notes.body
                notesGenerator = notes.source
                notesWarning = notes.warning
            } else if (notesSource === 'commits') {
                let previousTag = params.previousTag
                if (!previousTag) {
                    const tags = await listTags(token, owner, repo, 100).catch(() => [])
                    previousTag = tags.map(tag => tag.name).find(name => name !== params.tagName)
                }
                const changelog = await generateChangelog(token, owner, repo, {
                    base: previousTag,
                    head: params.targetCommitish,
                    version: params.tagName,
                    includeAuthors: params.includeContributors,
                })
                resolvedBody = changelog.markdown
                notesGenerator = 'commit-changelog'
            } else if (notesSource === 'none') {
                resolvedBody = undefined
            }

            let tagCreated: { tag: string; sha: string; annotated: boolean } | null = null
            if (params.createTag) {
                tagCreated = await createTag(token, owner, repo, {
                    tag: params.tagName,
                    target: params.targetCommitish,
                    message: params.tagMessage,
                })
            }

            const release = await createRelease(token, owner, repo, {
                tagName: params.tagName,
                targetCommitish: params.targetCommitish,
                name: params.name || params.tagName,
                body: resolvedBody,
                draft: params.draft ?? config.releaseDraftDefault ?? false,
                prerelease: params.prerelease ?? config.releasePrereleaseDefault ?? false,
                makeLatest: params.makeLatest,
            })

            let insertedBlocks = 0
            if (params.insert) {
                insertedBlocks = appendMarkdown(editor, releaseSummaryMarkdown(release, owner, repo))
            }

            return {
                success: true,
                owner,
                repo,
                tagCreated,
                notesGenerator,
                warning: notesWarning,
                insertedBlocks,
                release: mapRelease(release),
            }
        } catch (error: any) {
            return { success: false, error: describeGitHubError(error) }
        }
    },
}

export const publishGitHubReleaseTool = {
    name: 'publishGitHubRelease',
    description: '一站式发布 release：自动解析上一个版本区间 -> 生成 release notes ->（可选）创建 tag -> 发布 release。适合"把当前改动发布为新版本"的场景。若已存在同 tag 的 release 会返回错误提示改用 updateGitHubRelease。',
    inputSchema: z.object({
        ...ownerRepoFields,
        tagName: z.string().describe('要发布的版本 tag，例如 v1.3.0'),
        targetCommitish: z.string().optional().describe('目标分支或 commit，默认仓库默认分支'),
        name: z.string().optional().describe('release 标题，缺省使用 tag 名称'),
        draft: z.boolean().optional().describe('是否保存为草稿，默认 false'),
        prerelease: z.boolean().optional().describe('是否标记为预发布，默认 false'),
        previousTag: z.string().optional().describe('上一个版本 tag；缺省自动检测'),
        createTag: z.boolean().optional().describe('发布前是否显式创建 tag（附注 tag 传 tagMessage），默认 true'),
        tagMessage: z.string().optional().describe('附注 tag 消息；提供时会创建附注 tag'),
        notesSource: z.enum(['auto', 'commits']).optional().describe('notes 来源，默认 auto（GitHub 原生）'),
        makeLatest: z.enum(['true', 'false', 'legacy']).optional().describe('是否设为 latest release'),
        insert: z.boolean().optional().describe('发布成功后是否把 release 摘要插入文档，默认 true'),
    }),
    execute: (editor: Editor) => async (params: {
        owner?: string; repo?: string; tagName: string; targetCommitish?: string; name?: string
        draft?: boolean; prerelease?: boolean; previousTag?: string; createTag?: boolean; tagMessage?: string
        notesSource?: 'auto' | 'commits'; makeLatest?: 'true' | 'false' | 'legacy'; insert?: boolean
    }) => {
        try {
            const { owner, repo } = await resolveOwnerRepo(params)
            const token = await getToken()
            const config = await getConfig()

            // Refuse to silently overwrite an existing release.
            const existing = await getReleaseByTag(token, owner, repo, params.tagName).catch(() => null)
            if (existing) {
                return {
                    success: false,
                    error: 'A release for tag "' + params.tagName + '" already exists. Use updateGitHubRelease to modify it.',
                    release: mapRelease(existing),
                }
            }

            const notesSource = params.notesSource || 'auto'
            let notes = ''
            let notesWarning: string | undefined
            if (notesSource === 'commits') {
                let previousTag = params.previousTag
                if (!previousTag) {
                    const tags = await listTags(token, owner, repo, 100).catch(() => [])
                    previousTag = tags.map(tag => tag.name).find(name => name !== params.tagName)
                }
                notes = (await generateChangelog(token, owner, repo, {
                    base: previousTag,
                    head: params.targetCommitish,
                    version: params.tagName,
                })).markdown
            } else {
                const generated = await resolveReleaseNotes(token, owner, repo, {
                    tagName: params.tagName,
                    targetCommitish: params.targetCommitish,
                    previousTagName: params.previousTag,
                    version: params.tagName,
                })
                notes = generated.body
                notesWarning = generated.warning
            }

            let tagCreated: { tag: string; sha: string; annotated: boolean } | null = null
            if (params.createTag !== false) {
                tagCreated = await createTag(token, owner, repo, {
                    tag: params.tagName,
                    target: params.targetCommitish,
                    message: params.tagMessage,
                }).catch((error: any) => {
                    if (String(error.message).includes('already exists')) return null
                    throw error
                })
            }

            const release = await createRelease(token, owner, repo, {
                tagName: params.tagName,
                targetCommitish: params.targetCommitish,
                name: params.name || params.tagName,
                body: notes,
                draft: params.draft ?? config.releaseDraftDefault ?? false,
                prerelease: params.prerelease ?? config.releasePrereleaseDefault ?? false,
                makeLatest: params.makeLatest,
            })

            let insertedBlocks = 0
            if (params.insert !== false) {
                insertedBlocks = appendMarkdown(editor, releaseSummaryMarkdown(release, owner, repo))
            }

            return { success: true, owner, repo, tagCreated, notesSource, warning: notesWarning, insertedBlocks, release: mapRelease(release) }
        } catch (error: any) {
            return { success: false, error: describeGitHubError(error) }
        }
    },
}

export const updateGitHubReleaseTool = {
    name: 'updateGitHubRelease',
    description: '更新已存在的 release（按 tag、releaseId 或 latest 定位）：可修改标题、release notes、tag、草稿/预发布状态，或将草稿正式发布（draft=false）。',
    inputSchema: z.object({
        ...ownerRepoFields,
        ...releaseRefFields,
        newTagName: z.string().optional().describe('新的 tag 名称'),
        name: z.string().optional().describe('新的 release 标题'),
        body: z.string().optional().describe('新的 release notes（Markdown）'),
        draft: z.boolean().optional().describe('是否设为草稿；传 false 即正式发布'),
        prerelease: z.boolean().optional().describe('是否设为预发布'),
        makeLatest: z.enum(['true', 'false', 'legacy']).optional().describe('是否设为 latest release'),
    }),
    execute: (_editor: Editor) => async (params: {
        owner?: string; repo?: string; tagName?: string; releaseId?: number; latest?: boolean
        newTagName?: string; name?: string; body?: string; draft?: boolean; prerelease?: boolean
        makeLatest?: 'true' | 'false' | 'legacy'
    }) => {
        try {
            const { owner, repo } = await resolveOwnerRepo(params)
            const token = await getToken()
            let releaseId = params.releaseId
            if (!releaseId) {
                const current = await resolveRelease(token, owner, repo, params)
                releaseId = current.id
            }
            const release = await updateRelease(token, owner, repo, {
                releaseId,
                newTagName: params.newTagName,
                name: params.name,
                body: params.body,
                draft: params.draft,
                prerelease: params.prerelease,
                makeLatest: params.makeLatest,
            })
            return { success: true, owner, repo, release: mapRelease(release) }
        } catch (error: any) {
            return { success: false, error: describeGitHubError(error) }
        }
    },
}

export const deleteGitHubReleaseTool = {
    name: 'deleteGitHubRelease',
    description: '删除一个 release（按 tag、releaseId 或 latest 定位）。不会删除对应的 git tag。',
    inputSchema: z.object({
        ...ownerRepoFields,
        ...releaseRefFields,
    }),
    execute: (_editor: Editor) => async (params: { owner?: string; repo?: string; tagName?: string; releaseId?: number; latest?: boolean }) => {
        try {
            const { owner, repo } = await resolveOwnerRepo(params)
            const token = await getToken()
            const target = await resolveRelease(token, owner, repo, params)
            const result = await deleteRelease(token, owner, repo, { releaseId: target.id })
            return { success: true, owner, repo, deleted: true, releaseId: result.releaseId, tag: target.tag_name }
        } catch (error: any) {
            return { success: false, error: describeGitHubError(error) }
        }
    },
}

export const uploadGitHubReleaseAssetTool = {
    name: 'uploadGitHubReleaseAsset',
    description: '为 release 上传资产文件（asset）。多数场景用于上传文本类资产（如校验和、changelog、清单文件）；内容以字符串传入。注意：GitHub 资产上传需经桌面端主进程，Web 端受 CORS 限制（uploads.github.com 无 CORS 头）会失败。',
    inputSchema: z.object({
        ...ownerRepoFields,
        ...releaseRefFields,
        name: z.string().describe('资产文件名，例如 checksums.txt'),
        content: z.string().describe('资产的文本内容'),
        contentType: z.string().optional().describe('MIME 类型，默认 text/plain'),
        label: z.string().optional().describe('资产标签'),
    }),
    execute: (_editor: Editor) => async (params: { owner?: string; repo?: string; tagName?: string; releaseId?: number; latest?: boolean; name: string; content: string; contentType?: string; label?: string }) => {
        try {
            const { owner, repo } = await resolveOwnerRepo(params)
            const token = await getToken()
            const target = await resolveRelease(token, owner, repo, params)
            const asset = await uploadReleaseAsset(token, owner, repo, {
                releaseId: target.id,
                tagName: target.tag_name,
                name: params.name,
                data: params.content,
                contentType: params.contentType,
                label: params.label,
            })
            return {
                success: true,
                owner,
                repo,
                releaseId: target.id,
                asset: { id: asset.id, name: asset.name, size: asset.size, url: asset.browser_download_url },
            }
        } catch (error: any) {
            return { success: false, error: describeGitHubError(error) }
        }
    },
}

/**
 * Upload a build artifact that already lives in the File Manager (file center)
 * as a release asset. The agent only needs the file-center id (and ideally the
 * file name); the binary is fetched through FileService and streamed to GitHub.
 */
export const uploadGitHubReleaseAssetFromFileManagerTool = {
    name: 'uploadGitHubReleaseAssetFromFileManager',
    description: '从文件管理器（file center）读取一个文件，并作为 release 资产上传。需要 fileId（文件管理器中的文件 ID）；建议同时提供带扩展名的 name。适合把构建产物（zip/jar/dmg/exe 等）从文件中心发布到 release。注意：该能力依赖桌面端主进程代理上传，Web 端会因 GitHub CORS 失败。',
    inputSchema: z.object({
        ...ownerRepoFields,
        ...releaseRefFields,
        fileId: z.string().describe('文件管理器中的文件 ID'),
        name: z.string().optional().describe('上传后的资产文件名（含扩展名），例如 app-1.0.0.zip'),
        contentType: z.string().optional().describe('MIME 类型，缺省按扩展名推断'),
        label: z.string().optional().describe('资产标签'),
    }),
    execute: (_editor: Editor) => async (params: {
        owner?: string; repo?: string; tagName?: string; releaseId?: number; latest?: boolean
        fileId: string; name?: string; contentType?: string; label?: string
    }) => {
        try {
            const { owner, repo } = await resolveOwnerRepo(params)
            const token = await getToken()
            const target = await resolveRelease(token, owner, repo, params)
            const fileService = resolveOptionalService('fileService')
            if (!fileService?.getFileBlob) {
                return { success: false, error: 'FileService.getFileBlob is unavailable. Make sure the File Manager plugin is enabled.' }
            }
            const blob = await fileService.getFileBlob(params.fileId)
            const name = params.name || params.fileId
            const asset = await uploadReleaseAsset(token, owner, repo, {
                releaseId: target.id,
                tagName: target.tag_name,
                name,
                data: blob,
                contentType: params.contentType,
                label: params.label,
            })
            return {
                success: true,
                owner,
                repo,
                releaseId: target.id,
                tag: target.tag_name,
                asset: { id: asset.id, name: asset.name, size: asset.size, url: asset.browser_download_url },
            }
        } catch (error: any) {
            return { success: false, error: describeGitHubError(error) }
        }
    },
}

export const deleteGitHubReleaseAssetTool = {
    name: 'deleteGitHubReleaseAsset',
    description: '删除 release 下的一个资产文件（按 assetId）。可通过 listGitHubReleases 或 getGitHubRelease 获取 assetId。',
    inputSchema: z.object({
        ...ownerRepoFields,
        assetId: z.number().describe('资产 ID'),
    }),
    execute: (_editor: Editor) => async (params: { owner?: string; repo?: string; assetId: number }) => {
        try {
            const { owner, repo } = await resolveOwnerRepo(params)
            const token = await getToken()
            const result = await deleteReleaseAsset(token, owner, repo, params.assetId)
            return { success: true, owner, repo, ...result }
        } catch (error: any) {
            return { success: false, error: describeGitHubError(error) }
        }
    },
}

export const releaseTools = [
    listGitHubReleasesTool,
    getGitHubReleaseTool,
    generateGitHubReleaseNotesTool,
    createGitHubTagTool,
    createGitHubReleaseTool,
    publishGitHubReleaseTool,
    updateGitHubReleaseTool,
    deleteGitHubReleaseTool,
    uploadGitHubReleaseAssetTool,
    uploadGitHubReleaseAssetFromFileManagerTool,
    deleteGitHubReleaseAssetTool,
]
