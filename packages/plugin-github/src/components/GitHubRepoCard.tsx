import React, { useState, useCallback } from 'react'
import { NodeViewWrapper, NodeViewProps } from '@kn/editor'
import { Card, Badge, cn, Tabs, TabsList, TabsTrigger, TabsContent, ScrollArea, CodeEditor } from '@kn/ui'
import {
    RefreshCw, ExternalLink, Star, GitFork, CircleDot,
    Folder, FileText, GitCommit, ChevronRight, ArrowLeft, Copy, Check,
} from '@kn/icon'
import { GitHubUrlInput } from './shared/GitHubUrlInput'
import { useGitHubData } from '../hooks/use-github-data'
import { getRepo, getRepoContents, getRepoCommits, getFileContent } from '../services/github-repo-service'
import type { GitHubTreeItem, GitHubCommit as GitHubCommitType } from '../types/github'

function formatCount(n: number): string {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
    return String(n)
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatCommitDate(dateStr: string): string {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return 'today'
    if (diffDays === 1) return 'yesterday'
    if (diffDays < 30) return `${diffDays} days ago`
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`
    return `${Math.floor(diffDays / 365)} years ago`
}

function shortenSha(sha: string): string {
    return sha.substring(0, 7)
}

const MAX_VIEWABLE_SIZE = 256 * 1024 // 256KB

function isTextFile(name: string): boolean {
    const textExts = [
        'txt', 'md', 'markdown', 'rst', 'adoc',
        'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs',
        'py', 'rb', 'go', 'rs', 'java', 'kt', 'scala', 'cs', 'c', 'cpp', 'h', 'hpp',
        'swift', 'dart', 'lua', 'r', 'pl', 'php', 'sh', 'bash', 'zsh', 'fish', 'ps1',
        'html', 'htm', 'css', 'scss', 'sass', 'less', 'vue', 'svelte',
        'json', 'yaml', 'yml', 'toml', 'xml', 'csv', 'tsv', 'ini', 'cfg', 'conf',
        'sql', 'graphql', 'gql', 'proto',
        'dockerfile', 'makefile', 'cmake',
        'gitignore', 'gitattributes', 'editorconfig', 'env', 'env.example',
        'lock', 'log',
        'license', 'readme', 'changelog',
    ]
    const lower = name.toLowerCase()
    const ext = lower.includes('.') ? lower.split('.').pop()! : lower
    return textExts.includes(ext)
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
        setTimeout(() => setCopied(false), 2000)
    }

    const lineCount = content ? content.split('\n').length : 0

    return (
        <div className="mt-2">
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs min-w-0">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-0.5 text-muted-foreground hover:text-foreground"
                    >
                        <ArrowLeft className="h-3 w-3" />
                    </button>
                    <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="font-medium truncate">{fileName}</span>
                    <span className="text-muted-foreground flex-shrink-0">{formatSize(fileSize)}</span>
                    {lineCount > 0 && (
                        <span className="text-muted-foreground flex-shrink-0">{lineCount} lines</span>
                    )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                    {content && (
                        <button onClick={handleCopy} className="p-0.5 hover:bg-muted rounded" title="Copy content">
                            {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
                        </button>
                    )}
                    <a href={htmlUrl} target="_blank" rel="noopener noreferrer" className="p-0.5 hover:bg-muted rounded" title="Open on GitHub">
                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                    </a>
                </div>
            </div>

            {fileLoading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center">
                    <RefreshCw className="h-3 w-3 animate-spin" /> Loading file...
                </div>
            )}

            {fileError && (
                <div className="text-xs text-red-500 py-2">{fileError}</div>
            )}

            {!fileLoading && !fileError && content !== null && (
                <div className="border rounded-md overflow-hidden">
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

    // Load root on first render
    React.useEffect(() => {
        if (!loaded && token) {
            loadFiles('')
        }
    }, [loaded, token, loadFiles])

    // If viewing a file, show the file viewer
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
            {/* Breadcrumb */}
            <div className="flex items-center gap-0.5 text-xs text-muted-foreground mb-2 flex-wrap">
                <button
                    onClick={() => loadFiles('')}
                    className={cn(
                        'hover:text-foreground hover:underline',
                        currentPath === '' && 'text-foreground font-medium'
                    )}
                >
                    {repo}
                </button>
                {pathParts.map((part, i) => {
                    const fullPath = pathParts.slice(0, i + 1).join('/')
                    const isLast = i === pathParts.length - 1
                    return (
                        <React.Fragment key={fullPath}>
                            <ChevronRight className="h-3 w-3" />
                            <button
                                onClick={() => !isLast && loadFiles(fullPath)}
                                className={cn(
                                    'hover:text-foreground hover:underline',
                                    isLast && 'text-foreground font-medium'
                                )}
                            >
                                {part}
                            </button>
                        </React.Fragment>
                    )
                })}
            </div>

            {filesLoading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center">
                    <RefreshCw className="h-3 w-3 animate-spin" /> Loading files...
                </div>
            )}

            {filesError && (
                <div className="text-xs text-red-500 py-2">{filesError}</div>
            )}

            {!filesLoading && !filesError && (
                <ScrollArea className="max-h-[280px]">
                    <div className="border rounded-md divide-y">
                        {currentPath && (
                            <button
                                onClick={() => {
                                    const parent = currentPath.split('/').slice(0, -1).join('/')
                                    loadFiles(parent)
                                }}
                                className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted w-full text-left"
                            >
                                <span className="text-muted-foreground">..</span>
                            </button>
                        )}
                        {files.map((item) => (
                            <div
                                key={item.sha}
                                className="flex items-center justify-between px-3 py-1.5 text-xs hover:bg-muted"
                            >
                                <button
                                    className="flex items-center gap-2 min-w-0 text-left"
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
                                        <Folder className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                                    ) : (
                                        <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                    )}
                                    <span className={cn(
                                        'truncate',
                                        item.type === 'dir' ? 'text-foreground font-medium' : 'text-foreground'
                                    )}>
                                        {item.name}
                                    </span>
                                </button>
                                <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                                    {item.type !== 'dir' && item.size > 0 && (
                                        <span className="text-muted-foreground">
                                            {formatSize(item.size)}
                                        </span>
                                    )}
                                    {item.type !== 'dir' && (
                                        <a
                                            href={item.html_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="p-0.5 hover:bg-accent rounded opacity-0 group-hover:opacity-100"
                                            title="Open on GitHub"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <ExternalLink className="h-3 w-3 text-muted-foreground" />
                                        </a>
                                    )}
                                </div>
                            </div>
                        ))}
                        {files.length === 0 && (
                            <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                                Empty directory
                            </div>
                        )}
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

    return (
        <div className="mt-2">
            {commitsLoading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center">
                    <RefreshCw className="h-3 w-3 animate-spin" /> Loading commits...
                </div>
            )}

            {commitsError && (
                <div className="text-xs text-red-500 py-2">{commitsError}</div>
            )}

            {!commitsLoading && !commitsError && (
                <ScrollArea className="max-h-[280px]">
                    <div className="space-y-0 border rounded-md divide-y">
                        {commits.map((commit) => (
                            <div key={commit.sha} className="px-3 py-2 hover:bg-muted">
                                <div className="flex items-start gap-2">
                                    {commit.avatar_url ? (
                                        <img
                                            src={commit.avatar_url}
                                            alt={commit.author.name}
                                            className="w-5 h-5 rounded-full flex-shrink-0 mt-0.5"
                                        />
                                    ) : (
                                        <div className="w-5 h-5 rounded-full bg-muted flex-shrink-0 mt-0.5 flex items-center justify-center text-[10px] text-muted-foreground">
                                            {commit.author.name.charAt(0).toUpperCase()}
                                        </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <div className="text-xs font-medium leading-snug line-clamp-1">
                                            {commit.message.split('\n')[0]}
                                        </div>
                                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                                            <span>{commit.author.name}</span>
                                            <span>{formatCommitDate(commit.author.date)}</span>
                                        </div>
                                    </div>
                                    <a
                                        href={commit.html_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[11px] font-mono text-blue-500 hover:underline flex-shrink-0 mt-0.5"
                                    >
                                        {shortenSha(commit.sha)}
                                    </a>
                                </div>
                            </div>
                        ))}
                        {commits.length === 0 && (
                            <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                                No commits found
                            </div>
                        )}
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
                <Card className="my-4 border-2 border-dashed">
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

    return (
        <NodeViewWrapper>
            <Card className={cn(
                'my-4 p-3 transition-all duration-200 border',
                editor.isEditable && 'hover:border-primary/50'
            )}>
                {/* Header: name + visibility + actions */}
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="font-bold">▪</span>
                        <span className="font-mono font-medium text-foreground">{owner}/{repo}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
                            {visibility || 'public'}
                        </Badge>
                        {loading && <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />}
                        {!loading && editor.isEditable && (
                            <button onClick={refresh} className="p-0.5 hover:bg-muted rounded">
                                <RefreshCw className="h-3 w-3 text-muted-foreground" />
                            </button>
                        )}
                        {htmlUrl && (
                            <a href={htmlUrl} target="_blank" rel="noopener noreferrer" className="p-0.5 hover:bg-muted rounded">
                                <ExternalLink className="h-3 w-3 text-muted-foreground" />
                            </a>
                        )}
                    </div>
                </div>

                {/* Tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-2">
                    <TabsList className="h-7 p-0.5">
                        <TabsTrigger value="overview" className="text-xs h-6 px-2.5">Overview</TabsTrigger>
                        <TabsTrigger value="files" className="text-xs h-6 px-2.5 gap-1">
                            <Folder className="h-3 w-3" /> Files
                        </TabsTrigger>
                        <TabsTrigger value="commits" className="text-xs h-6 px-2.5 gap-1">
                            <GitCommit className="h-3 w-3" /> Commits
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="mt-2">
                        {/* Description */}
                        {description && (
                            <div className="text-sm text-muted-foreground line-clamp-2">{description}</div>
                        )}

                        {/* Stats: language + stars + forks + issues */}
                        <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                            {language && (
                                <span className="flex items-center gap-1">
                                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-primary" />
                                    {language}
                                </span>
                            )}
                            <span className="flex items-center gap-0.5">
                                <Star className="h-3 w-3" /> {formatCount(stars || 0)}
                            </span>
                            <span className="flex items-center gap-0.5">
                                <GitFork className="h-3 w-3" /> {formatCount(forks || 0)}
                            </span>
                            {openIssues > 0 && (
                                <span className="flex items-center gap-0.5">
                                    <CircleDot className="h-3 w-3" /> {openIssues} issues
                                </span>
                            )}
                        </div>

                        {/* Topics */}
                        {(topics || []).length > 0 && (
                            <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                                {topics.map((topic: string, i: number) => (
                                    <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0">
                                        {topic}
                                    </Badge>
                                ))}
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="files" className="mt-0">
                        <FileBrowser
                            owner={owner}
                            repo={repo}
                            defaultBranch={defaultBranch || 'main'}
                            token={token}
                        />
                    </TabsContent>

                    <TabsContent value="commits" className="mt-0">
                        <CommitsList
                            owner={owner}
                            repo={repo}
                            defaultBranch={defaultBranch || 'main'}
                            token={token}
                        />
                    </TabsContent>
                </Tabs>

                {error && <div className="mt-2 text-xs text-red-500">{error}</div>}
            </Card>
        </NodeViewWrapper>
    )
}
