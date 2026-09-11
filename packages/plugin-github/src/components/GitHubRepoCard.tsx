import React, { useState, useCallback } from 'react'
import { NodeViewWrapper, NodeViewProps } from '@kn/editor'
import { Card, Badge, cn, Tabs, TabsList, TabsTrigger, TabsContent, ScrollArea, CodeEditor } from '@kn/ui'
import {
    RefreshCw, ExternalLink, Star, GitFork, CircleDot,
    Folder, FolderTree, FileText, GitCommit, ChevronDown, ChevronRight, ArrowLeft, Copy, Check,
} from '@kn/icon'
import { GitHubUrlInput } from './shared/GitHubUrlInput'
import { GitHubRepoStructure } from './GitHubRepoStructure'
import { GitHubMark } from './GitHubLogo'
import {
    GhIconButton,
    GhIconLink,
    ghCard,
    ghCardDashed,
    ghCardInteractive,
    ghChip,
    ghEmptyState,
    ghErrorBox,
    ghHeader,
    ghHeaderStart,
    ghIconTile,
    ghRef,
    ghRowHover,
    ghStatAdd,
    ghStatDel,
} from './shared/styles'
import { useGitHubData } from '../hooks/use-github-data'
import { getRepo, getRepoContents, getRepoCommits, getRepoCommit, getFileContent } from '../services/github-repo-service'
import type { GitHubTreeItem, GitHubCommit as GitHubCommitType, GitHubCommitDetail } from '../types/github'

function formatCount(n: number): string {
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
    return String(n)
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function formatCommitDate(dateStr: string): string {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return 'today'
    if (diffDays === 1) return 'yesterday'
    if (diffDays < 30) return diffDays + ' days ago'
    if (diffDays < 365) return Math.floor(diffDays / 30) + ' months ago'
    return Math.floor(diffDays / 365) + ' years ago'
}

function shortenSha(sha: string): string {
    return sha.substring(0, 7)
}

const MAX_VIEWABLE_SIZE = 256 * 1024 // 256KB

const TEXT_EXTENSIONS = [
    'txt', 'md', 'markdown', 'rst', 'adoc',
    'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs',
    'py', 'rb', 'go', 'rs', 'java', 'kt', 'scala', 'cs', 'c', 'cpp', 'h', 'hpp',
    'swift', 'dart', 'lua', 'r', 'pl', 'php', 'sh', 'bash', 'zsh', 'fish', 'ps1',
    'html', 'htm', 'css', 'scss', 'sass', 'less', 'vue', 'svelte',
    'json', 'yaml', 'yml', 'toml', 'xml', 'csv', 'tsv', 'ini', 'cfg', 'conf',
    'sql', 'graphql', 'gql', 'proto',
    'dockerfile', 'makefile', 'cmake',
    'gitignore', 'gitattributes', 'editorconfig', 'env', 'env.example',
    'lock', 'log', 'license', 'readme', 'changelog',
]

function isTextFile(name: string): boolean {
    const lower = name.toLowerCase()
    const ext = lower.includes('.') ? lower.split('.').pop()! : lower
    return TEXT_EXTENSIONS.includes(ext)
}

// --- File Viewer Sub-component ---
const FileViewer: React.FC<{
    owner: string
    repo: string
    defaultBranch: string
    token: string
    filePath: string
    fileName: string
    fileSize: number
    htmlUrl: string
    onBack: () => void
}> = ({ owner, repo, defaultBranch, token, filePath, fileName, fileSize, htmlUrl, onBack }) => {
    const [content, setContent] = useState<string | null>(null)
    const [fileLoading, setFileLoading] = useState(true)
    const [fileError, setFileError] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)

    React.useEffect(() => {
        let cancelled = false
        const load = async () => {
            setFileLoading(true)
            setFileError(null)
            try {
                const result = await getFileContent(token, owner, repo, filePath, defaultBranch)
                if (!cancelled) setContent(result.content)
            } catch (err: any) {
                if (!cancelled) setFileError(err.message || 'Failed to load file')
            } finally {
                if (!cancelled) setFileLoading(false)
            }
        }
        load()
        return () => { cancelled = true }
    }, [token, owner, repo, filePath, defaultBranch])

    const handleCopy = () => {
        if (!content) return
        navigator.clipboard.writeText(content)
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
    }

    const lineCount = content ? content.split('\n').length : 0

    return (
        <div className="mt-2">
            <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5 text-xs">
                    <GhIconButton label="Back" onClick={onBack} className="h-6 w-6">
                        <ArrowLeft className="h-3.5 w-3.5" />
                    </GhIconButton>
                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate font-medium">{fileName}</span>
                    <span className="shrink-0 text-muted-foreground">{formatSize(fileSize)}</span>
                    {lineCount > 0 && <span className="hidden shrink-0 text-muted-foreground sm:inline">{lineCount} lines</span>}
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                    {content && (
                        <GhIconButton label={copied ? 'Copied' : 'Copy content'} onClick={handleCopy}>
                            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                        </GhIconButton>
                    )}
                    <GhIconLink label="Open on GitHub" href={htmlUrl}>
                        <ExternalLink className="h-3.5 w-3.5" />
                    </GhIconLink>
                </div>
            </div>

            {fileLoading && (
                <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading file…
                </div>
            )}
            {fileError && <div className="py-2 text-xs text-destructive">{fileError}</div>}
            {!fileLoading && !fileError && content !== null && (
                <div className="overflow-hidden rounded-lg border">
                    <CodeEditor
                        value={content}
                        readOnly
                        editable={false}
                        basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: false }}
                        maxHeight="360px"
                        className="text-xs [&_.cm-editor]:!border-0 [&_.cm-gutters]:!border-r [&_.cm-gutters]:!border-border"
                    />
                </div>
            )}
        </div>
    )
}

// --- File Browser Sub-component ---
const FileBrowser: React.FC<{
    owner: string
    repo: string
    defaultBranch: string
    token: string | null
}> = ({ owner, repo, defaultBranch, token }) => {
    const [currentPath, setCurrentPath] = useState('')
    const [files, setFiles] = useState<GitHubTreeItem[]>([])
    const [filesLoading, setFilesLoading] = useState(false)
    const [filesError, setFilesError] = useState<string | null>(null)
    const [loaded, setLoaded] = useState(false)
    const [viewingFile, setViewingFile] = useState<GitHubTreeItem | null>(null)

    const loadFiles = useCallback(async (path: string) => {
        if (!token) return
        setFilesLoading(true)
        setFilesError(null)
        setViewingFile(null)
        try {
            const items = await getRepoContents(token, owner, repo, path, defaultBranch)
            setFiles(items)
            setCurrentPath(path)
            setLoaded(true)
        } catch (err: any) {
            setFilesError(err.message || 'Failed to load files')
        } finally {
            setFilesLoading(false)
        }
    }, [token, owner, repo, defaultBranch])

    React.useEffect(() => {
        if (!loaded && token) {
            loadFiles('')
        }
    }, [loaded, token, loadFiles])

    if (viewingFile && token) {
        return (
            <FileViewer
                owner={owner}
                repo={repo}
                defaultBranch={defaultBranch}
                token={token}
                filePath={viewingFile.path}
                fileName={viewingFile.name}
                fileSize={viewingFile.size}
                htmlUrl={viewingFile.html_url}
                onBack={() => setViewingFile(null)}
            />
        )
    }

    const pathParts = currentPath ? currentPath.split('/') : []

    return (
        <div className="mt-2">
            <div className="mb-2 flex flex-wrap items-center gap-0.5 text-xs text-muted-foreground">
                <button
                    onClick={() => loadFiles('')}
                    className={cn('rounded px-1 py-0.5 transition-colors hover:bg-muted hover:text-foreground', currentPath === '' && 'font-medium text-foreground')}
                >
                    {repo}
                </button>
                {pathParts.map((part, i) => {
                    const fullPath = pathParts.slice(0, i + 1).join('/')
                    const isLast = i === pathParts.length - 1
                    return (
                        <React.Fragment key={fullPath}>
                            <ChevronRight className="h-3 w-3 shrink-0 opacity-60" />
                            <button
                                onClick={() => !isLast && loadFiles(fullPath)}
                                className={cn('rounded px-1 py-0.5 transition-colors hover:bg-muted hover:text-foreground', isLast && 'font-medium text-foreground')}
                            >
                                {part}
                            </button>
                        </React.Fragment>
                    )
                })}
            </div>

            {filesLoading && (
                <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading files…
                </div>
            )}
            {filesError && <div className="py-2 text-xs text-destructive">{filesError}</div>}

            {!filesLoading && !filesError && (
                <ScrollArea className="max-h-[280px]">
                    <div className="divide-y overflow-hidden rounded-lg border">
                        {currentPath && (
                            <button
                                onClick={() => loadFiles(currentPath.split('/').slice(0, -1).join('/'))}
                                className={cn('flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs', ghRowHover)}
                            >
                                <span className="text-muted-foreground">..</span>
                            </button>
                        )}
                        {files.map((item) => (
                            <div key={item.sha} className={cn('group flex items-center justify-between gap-2 px-3 py-1.5 text-xs', ghRowHover)}>
                                <button
                                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                    onClick={() => {
                                        if (item.type === 'dir') {
                                            loadFiles(item.path)
                                        } else if (isTextFile(item.name) && item.size <= MAX_VIEWABLE_SIZE) {
                                            setViewingFile(item)
                                        } else {
                                            window.open(item.html_url, '_blank')
                                        }
                                    }}
                                >
                                    {item.type === 'dir' ? (
                                        <Folder className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                                    ) : (
                                        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                    )}
                                    <span className={cn('truncate', item.type === 'dir' ? 'font-medium text-foreground' : 'text-foreground/90')}>
                                        {item.name}
                                    </span>
                                </button>
                                <div className="flex shrink-0 items-center gap-1.5">
                                    {item.type !== 'dir' && item.size > 0 && (
                                        <span className="text-muted-foreground">{formatSize(item.size)}</span>
                                    )}
                                    {item.type !== 'dir' && (
                                        <a
                                            href={item.html_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
                                            title="Open on GitHub"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <ExternalLink className="h-3 w-3" />
                                        </a>
                                    )}
                                </div>
                            </div>
                        ))}
                        {files.length === 0 && <div className={ghEmptyState}>Empty directory</div>}
                    </div>
                </ScrollArea>
            )}
        </div>
    )
}

// --- Commits Sub-component ---
const CommitsList: React.FC<{
    owner: string
    repo: string
    defaultBranch: string
    token: string | null
}> = ({ owner, repo, defaultBranch, token }) => {
    const [commits, setCommits] = useState<GitHubCommitType[]>([])
    const [commitsLoading, setCommitsLoading] = useState(false)
    const [commitsError, setCommitsError] = useState<string | null>(null)
    const [loaded, setLoaded] = useState(false)
    const [expandedSha, setExpandedSha] = useState<string | null>(null)
    const [details, setDetails] = useState<Record<string, GitHubCommitDetail>>({})
    const [detailLoading, setDetailLoading] = useState<string | null>(null)
    const [detailError, setDetailError] = useState<string | null>(null)

    const loadCommits = useCallback(async () => {
        if (!token) return
        setCommitsLoading(true)
        setCommitsError(null)
        try {
            const data = await getRepoCommits(token, owner, repo, { per_page: 20, sha: defaultBranch })
            setCommits(data)
            setLoaded(true)
        } catch (err: any) {
            setCommitsError(err.message || 'Failed to load commits')
        } finally {
            setCommitsLoading(false)
        }
    }, [token, owner, repo, defaultBranch])

    React.useEffect(() => {
        if (!loaded && token) {
            loadCommits()
        }
    }, [loaded, token, loadCommits])

    const toggleDetails = useCallback(async (sha: string) => {
        if (expandedSha === sha) {
            setExpandedSha(null)
            return
        }
        setExpandedSha(sha)
        setDetailError(null)
        if (details[sha] || !token) return
        setDetailLoading(sha)
        try {
            const detail = await getRepoCommit(token, owner, repo, sha)
            setDetails(prev => ({ ...prev, [sha]: detail }))
        } catch (err: any) {
            setDetailError(err.message || 'Failed to load commit details')
        } finally {
            setDetailLoading(null)
        }
    }, [expandedSha, details, token, owner, repo])

    return (
        <div className="mt-2">
            {commitsLoading && (
                <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading commits…
                </div>
            )}
            {commitsError && <div className="py-2 text-xs text-destructive">{commitsError}</div>}

            {!commitsLoading && !commitsError && (
                <ScrollArea className="max-h-[300px]">
                    <div className="divide-y overflow-hidden rounded-lg border">
                        {commits.map((commit) => {
                            const isExpanded = expandedSha === commit.sha
                            const detail = details[commit.sha]
                            return (
                                <div key={commit.sha}>
                                    <button
                                        type="button"
                                        onClick={() => toggleDetails(commit.sha)}
                                        className={cn('w-full px-3 py-2 text-left', ghRowHover)}
                                    >
                                        <div className="flex items-start gap-2">
                                            {commit.avatar_url ? (
                                                <img src={commit.avatar_url} alt={commit.author.name} loading="lazy" className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-muted object-cover ring-1 ring-inset ring-border" />
                                            ) : (
                                                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-1 ring-inset ring-border">
                                                    {commit.author.name.charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <div className="line-clamp-1 text-xs font-medium leading-snug">{commit.message.split('\n')[0]}</div>
                                                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                                                    <span>{commit.author.name}</span>
                                                    <span>{formatCommitDate(commit.author.date)}</span>
                                                    {detail?.stats && <span className={ghStatAdd}>+{detail.stats.additions}</span>}
                                                    {detail?.stats && <span className={ghStatDel}>-{detail.stats.deletions}</span>}
                                                </div>
                                            </div>
                                            <div className="mt-0.5 flex shrink-0 items-center gap-1">
                                                <span className="font-mono text-[11px] text-primary">{shortenSha(commit.sha)}</span>
                                                {isExpanded
                                                    ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                                    : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                                            </div>
                                        </div>
                                    </button>

                                    {isExpanded && (
                                        <div className="px-3 pb-2">
                                            {detailLoading === commit.sha && (
                                                <div className="py-1 text-[11px] text-muted-foreground">Loading changed files…</div>
                                            )}
                                            {detailError && <div className="py-1 text-[11px] text-destructive">{detailError}</div>}
                                            {detail && (
                                                <div className="divide-y overflow-hidden rounded-lg border bg-muted/20">
                                                    {(detail.files || []).slice(0, 20).map((file) => (
                                                        <div key={file.filename} className="flex items-center justify-between gap-2 px-2 py-1 text-[11px]">
                                                            <span className="truncate" title={file.filename}>{file.filename}</span>
                                                            <span className="flex shrink-0 items-center gap-1.5">
                                                                <span className={ghStatAdd}>+{file.additions}</span>
                                                                <span className={ghStatDel}>-{file.deletions}</span>
                                                            </span>
                                                        </div>
                                                    ))}
                                                    {(detail.files || []).length === 0 && (
                                                        <div className="px-2 py-1 text-[11px] text-muted-foreground">No file changes</div>
                                                    )}
                                                    {(detail.files || []).length > 20 && (
                                                        <div className="px-2 py-1 text-[11px] text-muted-foreground">
                                                            +{(detail.files || []).length - 20} more files
                                                        </div>
                                                    )}
                                                    <a
                                                        href={commit.html_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="block px-2 py-1 text-[11px] text-primary underline-offset-2 hover:underline"
                                                    >
                                                        View full diff on GitHub
                                                    </a>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                        {commits.length === 0 && <div className={ghEmptyState}>No commits found</div>}
                    </div>
                </ScrollArea>
            )}
        </div>
    )
}

// --- Main Card ---
export const GitHubRepoCard: React.FC<NodeViewProps> = ({ node, updateAttributes, editor, deleteNode }) => {
    const { owner, repo, description, language, stars, forks, openIssues, topics, visibility, htmlUrl, defaultBranch, activeTab: savedTab } = node.attrs
    const activeTab = savedTab || 'overview'
    const setActiveTab = (tab: string) => updateAttributes({ activeTab: tab })

    const isConfigured = owner && repo

    const { loading, error, token, refresh } = useGitHubData({
        fetcher: async (t) => {
            const repoData = await getRepo(t, owner, repo)
            updateAttributes({
                description: repoData.description || '',
                language: repoData.language || '',
                stars: repoData.stargazers_count,
                forks: repoData.forks_count,
                openIssues: repoData.open_issues_count,
                topics: repoData.topics || [],
                visibility: repoData.visibility,
                htmlUrl: repoData.html_url,
                defaultBranch: repoData.default_branch,
                lastSyncAt: new Date().toISOString(),
            })
            return repoData
        },
        enabled: !!isConfigured,
    })

    if (!isConfigured) {
        return (
            <NodeViewWrapper>
                <Card className={ghCardDashed}>
                    <GitHubUrlInput
                        type="repo"
                        onSubmit={(parsed) => {
                            updateAttributes({ owner: parsed.owner, repo: parsed.repo })
                        }}
                        onCancel={deleteNode}
                    />
                </Card>
            </NodeViewWrapper>
        )
    }

    const tabTriggerClass = 'h-7 gap-1.5 rounded-md px-2.5 text-xs'

    return (
        <NodeViewWrapper>
            <Card className={cn(ghCard, editor.isEditable && ghCardInteractive)}>
                <div className={ghHeader}>
                    <div className={ghHeaderStart}>
                        <span className={ghIconTile}>
                            <GitHubMark className="h-3.5 w-3.5 text-foreground" />
                        </span>
                        <span className={ghRef}>{owner}/{repo}</span>
                        <Badge variant="outline" className="h-5 shrink-0 rounded-full px-2 text-[10px] capitalize">
                            {visibility || 'public'}
                        </Badge>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                        {loading && <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Loading" />}
                        {!loading && editor.isEditable && (
                            <GhIconButton label="Refresh" onClick={refresh}>
                                <RefreshCw className="h-3.5 w-3.5" />
                            </GhIconButton>
                        )}
                        {htmlUrl && (
                            <GhIconLink label="Open on GitHub" href={htmlUrl}>
                                <ExternalLink className="h-3.5 w-3.5" />
                            </GhIconLink>
                        )}
                    </div>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <div className="border-b px-3 py-2">
                        <TabsList className="h-8 w-full justify-start gap-1 bg-transparent p-0">
                            <TabsTrigger value="overview" className={tabTriggerClass}>
                                <CircleDot className="h-3.5 w-3.5" /> Overview
                            </TabsTrigger>
                            <TabsTrigger value="files" className={tabTriggerClass}>
                                <Folder className="h-3.5 w-3.5" /> Files
                            </TabsTrigger>
                            <TabsTrigger value="commits" className={tabTriggerClass}>
                                <GitCommit className="h-3.5 w-3.5" /> Commits
                            </TabsTrigger>
                            <TabsTrigger value="structure" className={tabTriggerClass}>
                                <FolderTree className="h-3.5 w-3.5" /> Structure
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value="overview" className="mt-0 p-3">
                        {description && <p className="line-clamp-2 text-sm text-muted-foreground">{description}</p>}

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            {language && (
                                <span className={ghChip}>
                                    <span className="inline-block h-2 w-2 rounded-full bg-primary" />
                                    {language}
                                </span>
                            )}
                            <span className={ghChip}>
                                <Star className="h-3 w-3" /> {formatCount(stars || 0)}
                            </span>
                            <span className={ghChip}>
                                <GitFork className="h-3 w-3" /> {formatCount(forks || 0)}
                            </span>
                            {openIssues > 0 && (
                                <span className={ghChip}>
                                    <CircleDot className="h-3 w-3" /> {openIssues} issues
                                </span>
                            )}
                        </div>

                        {(topics || []).length > 0 && (
                            <div className="mt-2 flex flex-wrap items-center gap-1">
                                {topics.map((topic: string, i: number) => (
                                    <Badge key={i} variant="secondary" className="rounded-full px-2 py-0 text-[10px] font-normal">
                                        {topic}
                                    </Badge>
                                ))}
                            </div>
                        )}

                        {!description && (topics || []).length === 0 && (
                            <div className="mt-2 text-xs text-muted-foreground">No description provided.</div>
                        )}
                    </TabsContent>

                    <TabsContent value="files" className="mt-0 p-3">
                        <FileBrowser owner={owner} repo={repo} defaultBranch={defaultBranch || 'main'} token={token} />
                    </TabsContent>

                    <TabsContent value="commits" className="mt-0 p-3">
                        <CommitsList owner={owner} repo={repo} defaultBranch={defaultBranch || 'main'} token={token} />
                    </TabsContent>

                    <TabsContent value="structure" className="mt-0 p-3">
                        <GitHubRepoStructure owner={owner} repo={repo} defaultBranch={defaultBranch || 'main'} token={token} />
                    </TabsContent>
                </Tabs>

                {error && <div className={ghErrorBox}>{error}</div>}
            </Card>
        </NodeViewWrapper>
    )
}
