import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { NodeViewWrapper, NodeViewProps } from '@kn/editor'
import { useDesktop, useOptionalFileService, useTranslation, type SelectedFile } from '@kn/common'
import {
    Badge,
    Button,
    Card,
    Input,
    Label,
    ScrollArea,
    Switch,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    Textarea,
    cn,
} from '@kn/ui'
import {
    Tag,
    Rocket,
    Package,
    Trash2,
    Pencil,
    RefreshCw,
    ExternalLink,
    Loader2,
    Check,
    Copy,
    ChevronDown,
    ChevronRight,
    Sparkles,
    GitBranch,
    Download,
    Upload,
    Monitor,
    X,
    History,
    FileText,
} from '@kn/icon'
import { GitHubUrlInput } from './shared/GitHubUrlInput'
import { GitHubMark } from './GitHubLogo'
import {
    GhIconButton,
    GhIconLink,
    ghCard,
    ghCardDashed,
    ghCardInteractive,
    ghEmptyState,
    ghErrorBox,
    ghHeader,
    ghHeaderStart,
    ghIconTile,
    ghRef,
} from './shared/styles'
import { useGitHubData } from '../hooks/use-github-data'
import { useGitHubConfig } from '../hooks/use-github-config'
import { getRepo } from '../services/github-repo-service'
import { generateChangelog } from '../services/github-doc-service'
import { describeGitHubError } from '../services/github-errors'
import {
    listReleases,
    listTags,
    createRelease,
    updateRelease,
    deleteRelease,
    createTag,
    resolveReleaseNotes,
    uploadReleaseAsset,
} from '../services/github-release-service'
import type {
    GitHubRelease,
    GitHubReleaseAsset,
    GitHubReleaseMakeLatest,
    GitHubRepo,
    GitHubTag,
} from '../types/github'

type NotesSource = 'auto' | 'commits' | 'custom' | 'none'

interface ReleaseBoardData {
    repo: GitHubRepo
    releases: GitHubRelease[]
    tags: GitHubTag[]
}

function formatDate(value?: string | null): string {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatBytes(bytes: number): string {
    if (!bytes) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
    return (bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1) + ' ' + units[index]
}

// Common release-artifact MIME types used when the blob has no type of its own
// (file-center downloads often arrive as an untyped Blob).
const ARTIFACT_CONTENT_TYPES: Record<string, string> = {
    zip: 'application/zip',
    gz: 'application/gzip',
    tgz: 'application/gzip',
    tar: 'application/x-tar',
    jar: 'application/java-archive',
    war: 'application/java-archive',
    apk: 'application/vnd.android.package-archive',
    aab: 'application/octet-stream',
    exe: 'application/vnd.microsoft.portable-executable',
    msi: 'application/x-msi',
    dmg: 'application/x-apple-diskimage',
    deb: 'application/vnd.debian.binary-package',
    rpm: 'application/x-rpm',
    appimage: 'application/octet-stream',
    pdf: 'application/pdf',
    json: 'application/json',
    txt: 'text/plain',
    md: 'text/markdown',
    yml: 'text/yaml',
    yaml: 'text/yaml',
    sig: 'application/pgp-signature',
    asc: 'application/pgp-signature',
    sha256: 'text/plain',
}

function guessContentType(name: string, fallback?: string): string {
    if (fallback) return fallback
    const extension = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
    return ARTIFACT_CONTENT_TYPES[extension] || 'application/octet-stream'
}

const NOTES_SOURCES: { value: NotesSource; labelKey: string; hintKey: string }[] = [
    { value: 'auto', labelKey: 'notesAuto', hintKey: 'notesAutoHint' },
    { value: 'commits', labelKey: 'notesCommits', hintKey: 'notesCommitsHint' },
    { value: 'custom', labelKey: 'notesCustom', hintKey: 'notesCustomHint' },
    { value: 'none', labelKey: 'notesNone', hintKey: 'notesNoneHint' },
]

const tabTriggerClass = 'h-7 gap-1.5 rounded-md px-2.5 text-xs'

const ReleaseStateBadges: React.FC<{ release: GitHubRelease; isLatest: boolean }> = ({ release, isLatest }) => {
    const { t } = useTranslation()
    return (
        <span className="flex shrink-0 items-center gap-1">
            {release.draft && (
                <Badge variant="outline" className="h-5 rounded-full border-amber-500/40 bg-amber-500/10 px-2 text-[10px] text-amber-600 dark:text-amber-400">
                    {t('github.release.draft')}
                </Badge>
            )}
            {release.prerelease && (
                <Badge variant="outline" className="h-5 rounded-full border-violet-500/40 bg-violet-500/10 px-2 text-[10px] text-violet-600 dark:text-violet-400">
                    {t('github.release.prerelease')}
                </Badge>
            )}
            {!release.draft && !release.prerelease && isLatest && (
                <Badge variant="outline" className="h-5 rounded-full border-emerald-500/40 bg-emerald-500/10 px-2 text-[10px] text-emerald-600 dark:text-emerald-400">
                    {t('github.release.latest')}
                </Badge>
            )}
        </span>
    )
}

const AssetRow: React.FC<{ asset: GitHubReleaseAsset }> = ({ asset }) => (
    <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-[11px]">
        <span className="flex min-w-0 items-center gap-1.5">
            <Package className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="truncate" title={asset.name}>{asset.name}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
            <span>{formatBytes(asset.size)}</span>
            <span className="hidden sm:inline">{asset.download_count} downloads</span>
            <a
                href={asset.browser_download_url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded p-0.5 transition-colors hover:bg-muted hover:text-foreground"
                title="Download"
            >
                <Download className="h-3 w-3" />
            </a>
        </span>
    </div>
)

/**
 * Uploading release assets goes through the Electron main process because
 * GitHub's asset host (uploads.github.com) sends no CORS headers. On the web we
 * surface that limitation up-front instead of letting the upload fail.
 */
const DesktopOnlyNotice: React.FC = () => {
    const { t } = useTranslation()
    return (
        <div className="flex items-start gap-1.5 rounded-md border border-dashed bg-muted/20 px-2.5 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
            <Monitor className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{t('github.release.desktopOnlyNotice')}</span>
        </div>
    )
}

export const GitHubReleaseCard: React.FC<NodeViewProps> = ({ node, updateAttributes, editor, deleteNode }) => {
    const {
        owner,
        repo,
        tagName: attrTag,
        activeTab: savedTab,
        collapsed: attrCollapsed,
        htmlUrl,
    } = node.attrs as {
        owner: string
        repo: string
        tagName: string
        activeTab?: string
        collapsed?: boolean
        htmlUrl?: string
    }

    const isConfigured = Boolean(owner && repo)
    const editable = editor.isEditable
    const activeTab = savedTab || 'publish'
    const setActiveTab = (tab: string) => updateAttributes({ activeTab: tab })
    const collapsed = Boolean(attrCollapsed)
    const toggleCollapsed = () => updateAttributes({ collapsed: !collapsed })

    const { t } = useTranslation()
    const { config } = useGitHubConfig()
    const fileService = useOptionalFileService()
    const desktop = useDesktop()
    // Asset uploads proxy through the Electron main process; browsers cannot
    // POST to uploads.github.com because it sends no CORS headers.
    const desktopUploadAvailable = Boolean(desktop?.has('http.request'))
    const tagListId = 'gh-release-tags-' + useId().replace(/[:]/g, '')

    const { data, loading, error, token, refresh } = useGitHubData<ReleaseBoardData>({
        fetcher: async (t) => {
            const [repoData, releases, tags] = await Promise.all([
                getRepo(t, owner, repo),
                listReleases(t, owner, repo, { perPage: 50 }).catch(() => [] as GitHubRelease[]),
                listTags(t, owner, repo, 100).catch(() => [] as GitHubTag[]),
            ])
            return { repo: repoData, releases, tags }
        },
        enabled: isConfigured,
    })

    // --- Compose form state -------------------------------------------------
    const [formTag, setFormTag] = useState('')
    const [formTitle, setFormTitle] = useState('')
    const [formBody, setFormBody] = useState('')
    const [formTarget, setFormTarget] = useState('')
    const [formDraft, setFormDraft] = useState(config.releaseDraftDefault)
    const [formPrerelease, setFormPrerelease] = useState(config.releasePrereleaseDefault)
    const [notesSource, setNotesSource] = useState<NotesSource>(config.releaseAutoGenerateNotes ? 'auto' : 'none')
    const [formMakeLatest, setFormMakeLatest] = useState<'' | GitHubReleaseMakeLatest>('')
    const [formCreateTag, setFormCreateTag] = useState(false)
    const [formTagMessage, setFormTagMessage] = useState('')
    const [editing, setEditing] = useState<{ releaseId: number; tagName: string } | null>(null)
    const [busy, setBusy] = useState(false)
    const [generating, setGenerating] = useState(false)
    const [uploadingId, setUploadingId] = useState<number | null>(null)
    const [stagedAssets, setStagedAssets] = useState<SelectedFile[]>([])
    const [formError, setFormError] = useState<string | null>(null)
    const [notice, setNotice] = useState<string | null>(null)
    const [expandedId, setExpandedId] = useState<number | null>(null)
    const prefilledFor = useRef<string | null>(null)

    const releases = data?.releases || []
    const tags = data?.tags || []
    const defaultBranch = data?.repo?.default_branch || 'main'
    const tagNames = useMemo(() => tags.map(tag => tag.name), [tags])
    const previousTag = useMemo(() => tagNames.find(name => name !== formTag) || '', [tagNames, formTag])
    const latestPublishedId = useMemo(
        () => releases.find(release => !release.draft && !release.prerelease)?.id,
        [releases],
    )
    const editingRelease = useMemo(
        () => (editing ? releases.find(release => release.id === editing.releaseId) || null : null),
        [editing, releases],
    )

    // Prefill target branch once the repository metadata arrives.
    useEffect(() => {
        if (!formTarget && defaultBranch) setFormTarget(defaultBranch)
    }, [defaultBranch, formTarget])

    // Prefill tag prefix from settings when composing a brand new release.
    useEffect(() => {
        if (formTag || attrTag) return
        if (config.releaseTagPrefix) setFormTag(config.releaseTagPrefix)
    }, [config.releaseTagPrefix, formTag, attrTag])

    // Follow settings defaults for the draft/prerelease/notes toggles.
    useEffect(() => {
        setFormDraft(config.releaseDraftDefault)
        setFormPrerelease(config.releasePrereleaseDefault)
        setNotesSource(config.releaseAutoGenerateNotes ? 'auto' : 'none')
    }, [config.releaseDraftDefault, config.releasePrereleaseDefault, config.releaseAutoGenerateNotes])

    // If the node references an existing release, load it into the form once.
    useEffect(() => {
        if (!attrTag || !data) return
        if (prefilledFor.current === attrTag) return
        const found = releases.find(release => release.tag_name === attrTag)
        if (!found) return
        prefilledFor.current = attrTag
        setFormTag(found.tag_name)
        setFormTitle(found.name || '')
        setFormBody(found.body || '')
        setFormDraft(found.draft)
        setFormPrerelease(found.prerelease)
        setNotesSource('custom')
        setEditing({ releaseId: found.id, tagName: found.tag_name })
        if (savedTab !== 'publish') updateAttributes({ activeTab: 'publish' })
    }, [attrTag, data, releases, savedTab, updateAttributes])

    const resetForm = useCallback(() => {
        setEditing(null)
        setFormTag(config.releaseTagPrefix || '')
        setFormTitle('')
        setFormBody('')
        setFormTagMessage('')
        setFormCreateTag(false)
        setFormMakeLatest('')
        setStagedAssets([])
        setFormDraft(config.releaseDraftDefault)
        setFormPrerelease(config.releasePrereleaseDefault)
        setNotesSource(config.releaseAutoGenerateNotes ? 'auto' : 'none')
        setFormError(null)
        setNotice(null)
    }, [config.releaseTagPrefix, config.releaseDraftDefault, config.releasePrereleaseDefault, config.releaseAutoGenerateNotes])

    const startEdit = useCallback((release: GitHubRelease) => {
        setEditing({ releaseId: release.id, tagName: release.tag_name })
        setFormTag(release.tag_name)
        setFormTitle(release.name || '')
        setFormBody(release.body || '')
        setFormDraft(release.draft)
        setFormPrerelease(release.prerelease)
        setNotesSource('custom')
        setFormError(null)
        setNotice(null)
        setActiveTab('publish')
    }, [])

    const handleGenerateNotes = useCallback(async () => {
        if (!token) return
        if (!formTag.trim()) {
            setFormError(t('github.release.enterTagFirst'))
            return
        }
        setGenerating(true)
        setFormError(null)
        setNotice(null)
        try {
            if (notesSource === 'commits') {
                const changelog = await generateChangelog(token, owner, repo, {
                    base: previousTag || undefined,
                    head: formTarget || undefined,
                    version: formTag.trim(),
                })
                setFormBody(changelog.markdown)
            } else {
                const notes = await resolveReleaseNotes(token, owner, repo, {
                    tagName: formTag.trim(),
                    targetCommitish: formTarget || undefined,
                    previousTagName: previousTag || undefined,
                    version: formTag.trim(),
                })
                setFormBody(notes.body)
                if (!formTitle && notes.name) setFormTitle(notes.name)
                setNotice(notes.warning || t('github.release.notesGenerated'))
                return
            }
            setNotice(t('github.release.notesGenerated'))
        } catch (err: any) {
            setFormError(describeGitHubError(err))
        } finally {
            setGenerating(false)
        }
    }, [token, formTag, notesSource, owner, repo, previousTag, formTarget, formTitle])

    /** Read File Manager files and attach each one to a release as an asset. */
    const uploadAssetFiles = useCallback(async (
        release: GitHubRelease,
        files: SelectedFile[],
    ): Promise<{ uploaded: string[]; failed: string[] }> => {
        if (!token) throw new Error('GitHub PAT not configured.')
        const readFileBlob = fileService?.getFileBlob?.bind(fileService)
        const uploaded: string[] = []
        const failed: string[] = []
        for (const file of files) {
            const name = file.name || file.id
            try {
                let blob: Blob | null = null
                if (readFileBlob && file.id) {
                    blob = await readFileBlob(file.id)
                } else if (file.url) {
                    const response = await fetch(file.url)
                    if (!response.ok) throw new Error('HTTP ' + response.status)
                    blob = await response.blob()
                }
                if (!blob) throw new Error(t('github.release.unreadableFile'))
                await uploadReleaseAsset(token, owner, repo, {
                    releaseId: release.id,
                    tagName: release.tag_name,
                    name,
                    data: blob,
                    contentType: guessContentType(name, blob.type || undefined),
                })
                uploaded.push(name)
            } catch (err: any) {
                failed.push(name + ' (' + describeGitHubError(err) + ')')
            }
        }
        return { uploaded, failed }
    }, [token, fileService, owner, repo])

    /** Stage files from the File Manager; they upload when the release is saved. */
    const handleStageFromFileManager = useCallback(async () => {
        const fs = fileService
        if (!fs?.openFileSelector) {
            setFormError(t('github.release.fileManagerUnavailable'))
            return
        }
        setFormError(null)
        let selected: SelectedFile[] | null = null
        try {
            selected = await fs.openFileSelector(
                { multiple: true, target: 'file', title: t('github.release.selectAssetsTitle') },
                editor,
            )
        } catch (err: any) {
            setFormError(describeGitHubError(err))
            return
        }
        const files = (selected || []).filter(file => file && !file.isFolder)
        if (files.length === 0) return
        setStagedAssets(prev => {
            const seen = new Set(prev.map(item => item.id))
            const merged = [...prev]
            for (const file of files) {
                if (!seen.has(file.id)) {
                    merged.push(file)
                    seen.add(file.id)
                }
            }
            return merged
        })
    }, [fileService, editor])

    const removeStagedAsset = useCallback((fileId: string) => {
        setStagedAssets(prev => prev.filter(file => file.id !== fileId))
    }, [])

    const handleSubmit = useCallback(async () => {
        if (!token) return
        const tag = formTag.trim()
        if (!tag) {
            setFormError(t('github.release.tagRequired'))
            return
        }
        setBusy(true)
        setFormError(null)
        setNotice(null)
        try {
            let body = formBody
            let notesGenerator: string | undefined
            let notesWarning: string | undefined
            if (notesSource === 'auto') {
                const notes = await resolveReleaseNotes(token, owner, repo, {
                    tagName: tag,
                    targetCommitish: formTarget || undefined,
                    previousTagName: previousTag || undefined,
                    version: tag,
                })
                body = notes.body
                notesGenerator = notes.source
                notesWarning = notes.warning
            } else if (notesSource === 'commits') {
                const changelog = await generateChangelog(token, owner, repo, {
                    base: previousTag || undefined,
                    head: formTarget || undefined,
                    version: tag,
                })
                body = changelog.markdown
                notesGenerator = 'commit-changelog'
            } else if (notesSource === 'none') {
                body = ''
            }

            let savedRelease: GitHubRelease | null = null
            let actionNotice = ''

            if (editing) {
                const release = await updateRelease(token, owner, repo, {
                    releaseId: editing.releaseId,
                    newTagName: tag !== editing.tagName ? tag : undefined,
                    name: formTitle || tag,
                    body,
                    draft: formDraft,
                    prerelease: formPrerelease,
                    makeLatest: formMakeLatest || undefined,
                })
                savedRelease = release
                updateAttributes({
                    tagName: release.tag_name,
                    releaseName: release.name || '',
                    htmlUrl: release.html_url,
                    publishedAt: release.published_at || release.created_at,
                    draft: release.draft,
                    prerelease: release.prerelease,
                    lastSyncAt: new Date().toISOString(),
                })
                actionNotice = t('github.release.updated', { tag: release.tag_name }) + (notesGenerator ? t('github.release.notesSuffix', { gen: notesGenerator }) : '')
                setEditing(null)
            } else {
                if (formCreateTag) {
                    await createTag(token, owner, repo, {
                        tag,
                        target: formTarget || undefined,
                        message: formTagMessage || undefined,
                    }).catch((err: any) => {
                        if (!String(err.message).includes('already exists')) throw err
                    })
                }
                const release = await createRelease(token, owner, repo, {
                    tagName: tag,
                    targetCommitish: formTarget || undefined,
                    name: formTitle || tag,
                    body,
                    draft: formDraft,
                    prerelease: formPrerelease,
                    makeLatest: formMakeLatest || undefined,
                })
                savedRelease = release
                updateAttributes({
                    tagName: release.tag_name,
                    releaseName: release.name || '',
                    body: release.body || '',
                    htmlUrl: release.html_url,
                    publishedAt: release.published_at || release.created_at,
                    draft: release.draft,
                    prerelease: release.prerelease,
                    lastSyncAt: new Date().toISOString(),
                })
                actionNotice = release.draft
                    ? t('github.release.savedDraft', { tag: release.tag_name })
                    : t('github.release.published', { tag: release.tag_name })
            }

            // Attach any staged File Manager artifacts to the freshly saved release.
            if (savedRelease && stagedAssets.length > 0) {
                setUploadingId(savedRelease.id)
                const { uploaded, failed } = await uploadAssetFiles(savedRelease, stagedAssets)
                setUploadingId(null)
                if (uploaded.length > 0) {
                    actionNotice += ' ' + t('github.release.assetsUploaded', { count: uploaded.length })
                    setStagedAssets([])
                }
                if (failed.length > 0) {
                    setFormError(t('github.release.assetsUploadFailed', { details: failed.join('; ') }))
                }
            }

            setNotice(notesWarning ? actionNotice + ' ' + notesWarning : actionNotice)
            refresh()
        } catch (err: any) {
            setFormError(describeGitHubError(err))
        } finally {
            setBusy(false)
        }
    }, [
        token, formTag, formBody, notesSource, owner, repo, formTarget, previousTag, editing,
        formTitle, formDraft, formPrerelease, formMakeLatest, formCreateTag, formTagMessage,
        stagedAssets, uploadAssetFiles, refresh,
    ])

    const handlePublishDraft = useCallback(async (release: GitHubRelease) => {
        if (!token) return
        setBusy(true)
        setFormError(null)
        try {
            await updateRelease(token, owner, repo, { releaseId: release.id, draft: false })
            setNotice(t('github.release.publishedDraft', { tag: release.tag_name }))
            refresh()
        } catch (err: any) {
            setFormError(describeGitHubError(err))
        } finally {
            setBusy(false)
        }
    }, [token, owner, repo, refresh])

    const handleDelete = useCallback(async (release: GitHubRelease) => {
        if (!token) return
        if (typeof window !== 'undefined' && !window.confirm(t('github.release.deleteConfirm', { tag: release.tag_name }))) return
        setBusy(true)
        setFormError(null)
        try {
            await deleteRelease(token, owner, repo, { releaseId: release.id })
            setNotice(t('github.release.deleted', { tag: release.tag_name }))
            if (editing?.releaseId === release.id) resetForm()
            refresh()
        } catch (err: any) {
            setFormError(describeGitHubError(err))
        } finally {
            setBusy(false)
        }
    }, [token, owner, repo, refresh, editing, resetForm])

    const handleCopy = useCallback((text: string) => {
        if (!text) return
        navigator.clipboard.writeText(text)
        setNotice(t('github.release.copied'))
    }, [])

    /** Pick one or more files from the File Manager and attach them as release assets. */
    const handleUploadFromFileManager = useCallback(async (release: GitHubRelease) => {
        if (!token) return
        const fs = fileService
        if (!fs?.openFileSelector) {
            setFormError(t('github.release.fileManagerUnavailable'))
            return
        }
        setFormError(null)
        setNotice(null)

        let selected: SelectedFile[] | null = null
        try {
            selected = await fs.openFileSelector(
                {
                    multiple: true,
                    target: 'file',
                    title: t('github.release.selectUploadTitle', { tag: release.tag_name }),
                },
                editor,
            )
        } catch (err: any) {
            setFormError(describeGitHubError(err))
            return
        }

        const files = (selected || []).filter(file => file && !file.isFolder)
        if (files.length === 0) return

        setUploadingId(release.id)
        const { uploaded, failed } = await uploadAssetFiles(release, files)
        setUploadingId(null)
        if (uploaded.length > 0) {
            setNotice(t('github.release.assetsUploadedFromFM', { count: uploaded.length, names: uploaded.join(', ') }))
        }
        if (failed.length > 0) {
            setFormError(t('github.release.assetsUploadFailed', { details: failed.join('; ') }))
        }
        refresh()
    }, [token, fileService, editor, uploadAssetFiles, refresh])

    if (!isConfigured) {
        return (
            <NodeViewWrapper>
                <Card className={ghCardDashed}>
                    <GitHubUrlInput
                        type="repo"
                        onSubmit={(parsed) => updateAttributes({ owner: parsed.owner, repo: parsed.repo })}
                        onCancel={deleteNode}
                    />
                </Card>
            </NodeViewWrapper>
        )
    }

    const notesHint = t('github.release.' + (NOTES_SOURCES.find(source => source.value === notesSource)?.hintKey || 'notesAutoHint'))

    return (
        <NodeViewWrapper>
            <Card className={cn(ghCard, editable && ghCardInteractive)}>
                <div className={ghHeader}>
                    <div className={ghHeaderStart}>
                        <GhIconButton
                            label={collapsed ? t('github.release.expandCard') : t('github.release.collapseCard')}
                            onClick={toggleCollapsed}
                            className="-ml-1 h-6 w-6"
                        >
                            {collapsed
                                ? <ChevronRight className="h-3.5 w-3.5" />
                                : <ChevronDown className="h-3.5 w-3.5" />}
                        </GhIconButton>
                        <span className={ghIconTile}>
                            <GitHubMark className="h-3.5 w-3.5 text-foreground" />
                        </span>
                        <span className={ghRef}>{owner}/{repo}</span>
                        {attrTag && (
                            <Badge variant="secondary" className="h-5 shrink-0 gap-1 rounded-full px-2 font-mono text-[10px]">
                                <Tag className="h-3 w-3" /> {attrTag}
                            </Badge>
                        )}
                        {(node.attrs.draft || node.attrs.prerelease) && (
                            <span className="hidden items-center gap-1 sm:flex">
                                {node.attrs.draft && <Badge variant="outline" className="h-5 rounded-full px-2 text-[10px]">{t('github.release.draft')}</Badge>}
                                {node.attrs.prerelease && <Badge variant="outline" className="h-5 rounded-full px-2 text-[10px]">{t('github.release.prerelease')}</Badge>}
                            </span>
                        )}
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                        {loading && <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Loading" />}
                        {!loading && editable && (
                            <GhIconButton label={t('github.release.refresh')} onClick={refresh}>
                                <RefreshCw className="h-3.5 w-3.5" />
                            </GhIconButton>
                        )}
                        {htmlUrl && (
                            <GhIconLink label={t('github.release.openOnGitHub')} href={htmlUrl}>
                                <ExternalLink className="h-3.5 w-3.5" />
                            </GhIconLink>
                        )}
                        {editable && (
                            <GhIconButton label={t('github.release.removeCard')} onClick={deleteNode}>
                                <X className="h-3.5 w-3.5" />
                            </GhIconButton>
                        )}
                    </div>
                </div>

                {!collapsed && (
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <div className="border-b px-3 py-2">
                        <TabsList className="h-8 w-full justify-start gap-1 bg-transparent p-0">
                            <TabsTrigger value="publish" className={tabTriggerClass}>
                                <Rocket className="h-3.5 w-3.5" /> {editing ? t('github.release.tabEdit') : t('github.release.tabPublish')}
                            </TabsTrigger>
                            <TabsTrigger value="releases" className={tabTriggerClass}>
                                <History className="h-3.5 w-3.5" /> {t('github.release.tabReleases')}
                                {releases.length > 0 && <span className="text-muted-foreground">· {releases.length}</span>}
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    {/* ------------------------------ Publish ------------------------------ */}
                    <TabsContent value="publish" className="mt-0 space-y-3 p-3">
                        {!editable && (
                            <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                                {t('github.release.readOnly')}
                            </div>
                        )}

                        {!token && (
                            <div className="rounded-lg border border-dashed bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                                {t('github.release.noToken')}
                            </div>
                        )}

                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label className="text-xs" htmlFor={tagListId + '-tag'}>
                                    <Tag className="mr-1 inline h-3 w-3" /> {t('github.release.tag')} <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id={tagListId + '-tag'}
                                    list={tagListId}
                                    value={formTag}
                                    disabled={!editable}
                                    onChange={(e) => { setFormTag(e.target.value); setFormError(null) }}
                                    placeholder={config.releaseTagPrefix ? config.releaseTagPrefix + '1.0.0' : 'v1.0.0'}
                                    className="font-mono text-xs"
                                />
                                <datalist id={tagListId}>
                                    {tagNames.map(name => <option key={name} value={name} />)}
                                </datalist>
                                {previousTag && (
                                    <p className="text-[11px] text-muted-foreground">{t('github.release.detectedPrevious')} <span className="font-mono">{previousTag}</span></p>
                                )}
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs" htmlFor={tagListId + '-target'}>
                                    <GitBranch className="mr-1 inline h-3 w-3" /> {t('github.release.target')}
                                </Label>
                                <Input
                                    id={tagListId + '-target'}
                                    value={formTarget}
                                    disabled={!editable}
                                    onChange={(e) => setFormTarget(e.target.value)}
                                    placeholder={defaultBranch}
                                    className="font-mono text-xs"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs" htmlFor={tagListId + '-title'}>{t('github.release.title')}</Label>
                            <Input
                                id={tagListId + '-title'}
                                value={formTitle}
                                disabled={!editable}
                                onChange={(e) => setFormTitle(e.target.value)}
                                placeholder={formTag || 'Release title'}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <Label className="text-xs"><FileText className="mr-1 inline h-3 w-3" /> {t('github.release.notes')}</Label>
                                <div className="flex flex-wrap items-center gap-1">
                                    {NOTES_SOURCES.map(source => (
                                        <button
                                            key={source.value}
                                            type="button"
                                            disabled={!editable}
                                            title={t('github.release.' + source.hintKey)}
                                            onClick={() => setNotesSource(source.value)}
                                            className={cn(
                                                'rounded-md border px-1.5 py-0.5 text-[11px] transition-colors disabled:opacity-50',
                                                notesSource === source.value
                                                    ? 'border-primary bg-primary text-primary-foreground'
                                                    : 'bg-background hover:bg-muted',
                                            )}
                                        >
                                            {t('github.release.' + source.labelKey)}
                                        </button>
                                    ))}
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-6 gap-1 px-2 text-[11px]"
                                        disabled={!editable || !token || generating || !formTag.trim()}
                                        onClick={handleGenerateNotes}
                                    >
                                        {generating
                                            ? <Loader2 className="h-3 w-3 animate-spin" />
                                            : <Sparkles className="h-3 w-3" />}
                                        {t('github.release.generate')}
                                    </Button>
                                </div>
                            </div>
                            <Textarea
                                value={formBody}
                                disabled={!editable}
                                onChange={(e) => { setFormBody(e.target.value); if (notesSource !== 'custom') setNotesSource('custom') }}
                                placeholder={notesHint}
                                rows={8}
                                className="min-h-[140px] resize-y font-mono text-xs"
                            />
                            <p className="text-[11px] text-muted-foreground">{notesHint}</p>
                        </div>

                        {!editing && (
                            <div className="space-y-2 rounded-lg border px-3 py-2.5">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-xs font-medium">{t('github.release.createTagFirst')}</p>
                                        <p className="text-[11px] text-muted-foreground">{t('github.release.createTagFirstHint')}</p>
                                    </div>
                                    <Switch checked={formCreateTag} disabled={!editable} onCheckedChange={setFormCreateTag} />
                                </div>
                                {formCreateTag && (
                                    <Input
                                        value={formTagMessage}
                                        disabled={!editable}
                                        onChange={(e) => setFormTagMessage(e.target.value)}
                                        placeholder={t('github.release.tagMessagePlaceholder')}
                                        className="text-xs"
                                    />
                                )}
                            </div>
                        )}

                        {!editing && (
                            <div className="space-y-2 rounded-lg border px-3 py-2.5">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
                                        <Package className="h-3.5 w-3.5 shrink-0" /> {t('github.release.assetsTitle')}
                                        {stagedAssets.length > 0 ? ' · ' + stagedAssets.length : ''}
                                    </span>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-6 shrink-0 gap-1 px-2 text-[11px]"
                                        disabled={!editable || !token || busy || !desktopUploadAvailable}
                                        onClick={handleStageFromFileManager}
                                    >
                                        <Upload className="h-3 w-3" /> {t('github.release.addFromFileManager')}
                                    </Button>
                                </div>
                                {!desktopUploadAvailable ? (
                                    <DesktopOnlyNotice />
                                ) : stagedAssets.length > 0 ? (
                                    <div className="divide-y overflow-hidden rounded-md border bg-background">
                                        {stagedAssets.map(file => (
                                            <div key={file.id} className="flex items-center justify-between gap-2 px-2 py-1.5 text-[11px]">
                                                <span className="flex min-w-0 items-center gap-1.5">
                                                    <Package className="h-3 w-3 shrink-0 text-muted-foreground" />
                                                    <span className="truncate" title={file.name}>{file.name}</span>
                                                </span>
                                                <button
                                                    type="button"
                                                    className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                                                    onClick={() => removeStagedAsset(file.id)}
                                                    aria-label={'Remove ' + file.name}
                                                >
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-[11px] text-muted-foreground">
                                        {t('github.release.assetsHint')}
                                    </p>
                                )}
                            </div>
                        )}

                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
                                <div className="min-w-0">
                                    <p className="text-xs font-medium">{t('github.release.draft')}</p>
                                    <p className="text-[11px] text-muted-foreground">{t('github.release.draftHint')}</p>
                                </div>
                                <Switch checked={formDraft} disabled={!editable} onCheckedChange={setFormDraft} />
                            </div>
                            <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
                                <div className="min-w-0">
                                    <p className="text-xs font-medium">{t('github.release.prerelease')}</p>
                                    <p className="text-[11px] text-muted-foreground">{t('github.release.prereleaseHint')}</p>
                                </div>
                                <Switch checked={formPrerelease} disabled={!editable} onCheckedChange={setFormPrerelease} />
                            </div>
                        </div>

                        {editing && editingRelease && (
                            <div className="space-y-2 rounded-lg border px-3 py-2.5">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
                                        <Package className="h-3.5 w-3.5 shrink-0" />
                                        <span className="truncate">{t('github.release.assetsFor', { tag: editingRelease.tag_name })}</span>
                                    </span>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-6 shrink-0 gap-1 px-2 text-[11px]"
                                        disabled={!token || uploadingId === editingRelease.id || busy || !desktopUploadAvailable}
                                        onClick={() => handleUploadFromFileManager(editingRelease)}
                                    >
                                        {uploadingId === editingRelease.id
                                            ? <Loader2 className="h-3 w-3 animate-spin" />
                                            : <Upload className="h-3 w-3" />}
                                        {t('github.release.uploadFromFileManager')}
                                    </Button>
                                </div>
                                {(editingRelease.assets || []).length > 0 ? (
                                    <div className="divide-y overflow-hidden rounded-md border bg-background">
                                        {(editingRelease.assets || []).map(asset => <AssetRow key={asset.id} asset={asset} />)}
                                    </div>
                                ) : (
                                    <p className="text-[11px] text-muted-foreground">
                                        {t('github.release.noAssetsUpload')}
                                    </p>
                                )}
                                {!desktopUploadAvailable && <DesktopOnlyNotice />}
                            </div>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <Label className="text-xs text-muted-foreground">{t('github.release.makeLatest')}</Label>
                                <select
                                    value={formMakeLatest}
                                    disabled={!editable}
                                    onChange={(e) => setFormMakeLatest(e.target.value as '' | GitHubReleaseMakeLatest)}
                                    className="h-7 rounded-md border bg-background px-2 text-xs"
                                >
                                    <option value="">{t('github.release.makeLatestDefault')}</option>
                                    <option value="true">{t('github.release.makeLatestTrue')}</option>
                                    <option value="false">{t('github.release.makeLatestFalse')}</option>
                                    <option value="legacy">{t('github.release.makeLatestLegacy')}</option>
                                </select>
                            </div>

                            <div className="flex items-center gap-2">
                                {editing && (
                                    <Button variant="ghost" size="sm" onClick={resetForm} disabled={busy}>
                                        {t('github.release.cancelEdit')}
                                    </Button>
                                )}
                                <Button
                                    size="sm"
                                    variant={formDraft ? 'outline' : 'default'}
                                    className="gap-1.5"
                                    disabled={!editable || !token || busy}
                                    onClick={handleSubmit}
                                >
                                    {busy
                                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        : formDraft
                                            ? <Package className="h-3.5 w-3.5" />
                                            : <Rocket className="h-3.5 w-3.5" />}
                                    {editing ? t('github.release.updateRelease') : formDraft ? t('github.release.saveDraft') : t('github.release.publishRelease')}
                                </Button>
                            </div>
                        </div>
                    </TabsContent>

                    {/* ------------------------------ Releases ------------------------------ */}
                    <TabsContent value="releases" className="mt-0 p-3">
                        {loading && releases.length === 0 && (
                            <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
                                <RefreshCw className="h-3.5 w-3.5 animate-spin" /> {t('github.release.loadingReleases')}
                            </div>
                        )}
                        {!loading && releases.length === 0 && (
                            <div className={ghEmptyState}>
                                <Package className="h-5 w-5" />
                                {t('github.release.noReleases')}
                            </div>
                        )}
                        <ScrollArea className="max-h-[440px]">
                            <div className="space-y-2 pr-1">
                                {releases.map(release => {
                                    const isExpanded = expandedId === release.id
                                    const isLatest = release.id === latestPublishedId
                                    return (
                                        <div key={release.id} className="overflow-hidden rounded-lg border">
                                            <div className="flex items-start gap-2 px-3 py-2">
                                                <button
                                                    type="button"
                                                    className="mt-0.5 shrink-0 text-muted-foreground"
                                                    onClick={() => setExpandedId(isExpanded ? null : release.id)}
                                                    aria-label={isExpanded ? t('github.release.collapse') : t('github.release.expand')}
                                                >
                                                    {isExpanded
                                                        ? <ChevronDown className="h-3.5 w-3.5" />
                                                        : <ChevronRight className="h-3.5 w-3.5" />}
                                                </button>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        <span className="truncate text-sm font-medium">{release.name || release.tag_name}</span>
                                                        <ReleaseStateBadges release={release} isLatest={isLatest} />
                                                    </div>
                                                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                                                        <span className="font-mono text-primary">{release.tag_name}</span>
                                                        {release.published_at && <span>{formatDate(release.published_at)}</span>}
                                                        {(release.assets || []).length > 0 && (
                                                            <span className="inline-flex items-center gap-1">
                                                                <Package className="h-3 w-3" /> {(release.assets || []).length}
                                                            </span>
                                                        )}
                                                        {release.author?.login && <span>@{release.author.login}</span>}
                                                    </div>
                                                </div>
                                                <div className="flex shrink-0 items-center gap-0.5">
                                                    <GhIconButton label={t('github.release.copyNotes')} onClick={() => handleCopy(release.body || '')}>
                                                        <Copy className="h-3.5 w-3.5" />
                                                    </GhIconButton>
                                                    <GhIconLink label="Open release" href={release.html_url}>
                                                        <ExternalLink className="h-3.5 w-3.5" />
                                                    </GhIconLink>
                                                    {editable && (
                                                        <>
                                                            {release.draft && (
                                                                <GhIconButton label={t('github.release.publishDraft')} onClick={() => handlePublishDraft(release)}>
                                                                    <Rocket className="h-3.5 w-3.5" />
                                                                </GhIconButton>
                                                            )}
                                                            <GhIconButton label={t('github.release.editRelease')} onClick={() => startEdit(release)}>
                                                                <Pencil className="h-3.5 w-3.5" />
                                                            </GhIconButton>
                                                            <GhIconButton label={t('github.release.deleteRelease')} onClick={() => handleDelete(release)}>
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </GhIconButton>
                                                        </>
                                                    )}
                                                </div>
                                            </div>

                                            {isExpanded && (
                                                <div className="border-t bg-muted/20 px-3 py-2">
                                                    {release.body ? (
                                                        <p className="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-foreground/90">
                                                            {release.body.length > 4000 ? release.body.slice(0, 4000) + '…' : release.body}
                                                        </p>
                                                    ) : (
                                                        <p className="text-[11px] text-muted-foreground">{t('github.release.noReleaseNotes')}</p>
                                                    )}
                                                    <div className="mt-2">
                                                        <div className="mb-1.5 flex items-center justify-between gap-2">
                                                            <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                                                                <Package className="h-3 w-3" /> {t('github.release.assets')}
                                                                {(release.assets || []).length > 0 ? ' · ' + (release.assets || []).length : ''}
                                                            </span>
                                                            {editable && (
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    className="h-6 gap-1 px-2 text-[11px]"
                                                                    disabled={!token || uploadingId === release.id || !desktopUploadAvailable}
                                                                    onClick={() => handleUploadFromFileManager(release)}
                                                                >
                                                                    {uploadingId === release.id
                                                                        ? <Loader2 className="h-3 w-3 animate-spin" />
                                                                        : <Upload className="h-3 w-3" />}
                                                                    {t('github.release.uploadFromFileManager')}
                                                                </Button>
                                                            )}
                                                        </div>
                                                        {(release.assets || []).length > 0 ? (
                                                            <div className="divide-y overflow-hidden rounded-md border bg-background">
                                                                {(release.assets || []).map(asset => <AssetRow key={asset.id} asset={asset} />)}
                                                            </div>
                                                        ) : (
                                                            <div className="rounded-md border border-dashed px-3 py-2 text-[11px] text-muted-foreground">
                                                                {t('github.release.noAssetsSelect')}
                                                            </div>
                                                        )}
                                                        {!desktopUploadAvailable && (
                                                            <div className="mt-2"><DesktopOnlyNotice /></div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </ScrollArea>
                    </TabsContent>
                </Tabs>
                )}

                {(formError || notice) && (
                    <div
                        className={cn(
                            'flex items-start gap-1.5 border-t px-3 py-2 text-xs',
                            formError ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400',
                        )}
                    >
                        {formError
                            ? <X className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            : <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                        <span className="min-w-0 break-words">{formError || notice}</span>
                    </div>
                )}

                {error && <div className={ghErrorBox}>{error}</div>}
            </Card>
        </NodeViewWrapper>
    )
}
