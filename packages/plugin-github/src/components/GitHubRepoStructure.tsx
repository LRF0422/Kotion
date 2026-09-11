import React, { useCallback, useEffect, useState } from 'react'
import { ScrollArea, CodeEditor, cn } from '@kn/ui'
import {
    RefreshCw, Folder, FolderOpen, FileText, ChevronRight, ChevronDown,
    ExternalLink, ArrowLeft, Copy, Check,
} from '@kn/icon'
import { getFileContent, getRepoTree } from '../services/github-repo-service'
import type { GitHubTreeItem } from '../types/github'

const MAX_VIEWABLE_SIZE = 256 * 1024

const TEXT_EXTENSIONS = [
    'txt', 'md', 'markdown', 'rst', 'adoc',
    'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs',
    'py', 'rb', 'go', 'rs', 'java', 'kt', 'scala', 'cs', 'c', 'cpp', 'h', 'hpp',
    'swift', 'dart', 'lua', 'r', 'pl', 'php', 'sh', 'bash', 'zsh', 'fish', 'ps1',
    'html', 'htm', 'css', 'scss', 'sass', 'less', 'vue', 'svelte',
    'json', 'yaml', 'yml', 'toml', 'xml', 'csv', 'tsv', 'ini', 'cfg', 'conf',
    'sql', 'graphql', 'gql', 'proto',
    'dockerfile', 'makefile', 'cmake',
    'gitignore', 'gitattributes', 'editorconfig', 'env', 'lock', 'log',
    'license', 'readme', 'changelog',
]

function isTextFile(name: string): boolean {
    const lower = name.toLowerCase()
    const ext = lower.includes('.') ? lower.split('.').pop()! : lower
    return TEXT_EXTENSIONS.includes(ext)
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

interface TreeDir {
    name: string
    path: string
    type: 'dir' | 'file'
    size: number
    html_url: string
    children: TreeDir[]
}

function buildTree(items: GitHubTreeItem[], maxDepth: number): TreeDir[] {
    const root: TreeDir = { name: '', path: '', type: 'dir', size: 0, html_url: '', children: [] }
    const byPath = new Map<string, TreeDir>()
    byPath.set('', root)

    const sorted = [...items].sort((a, b) => a.path.localeCompare(b.path))
    for (const item of sorted) {
        const depth = item.path.split('/').filter(Boolean).length
        if (depth > maxDepth) continue
        const parentPath = item.path.split('/').slice(0, -1).join('/')
        const parent = byPath.get(parentPath)
        if (!parent) continue
        const node: TreeDir = {
            name: item.name,
            path: item.path,
            type: item.type === 'dir' ? 'dir' : 'file',
            size: item.size,
            html_url: item.html_url,
            children: [],
        }
        parent.children.push(node)
        if (node.type === 'dir') byPath.set(node.path, node)
    }

    const sortNodes = (nodes: TreeDir[]) => {
        nodes.sort((a, b) => {
            if (a.type === 'dir' && b.type !== 'dir') return -1
            if (a.type !== 'dir' && b.type === 'dir') return 1
            return a.name.localeCompare(b.name)
        })
        nodes.forEach(node => sortNodes(node.children))
    }
    sortNodes(root.children)
    return root.children
}

const StructureFileViewer: React.FC<{
    owner: string
    repo: string
    ref: string
    token: string
    file: GitHubTreeItem
    onBack: () => void
}> = ({ owner, repo, ref, token, file, onBack }) => {
    const [content, setContent] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        let cancelled = false
        const load = async () => {
            setLoading(true)
            setError(null)
            try {
                const result = await getFileContent(token, owner, repo, file.path, ref)
                if (!cancelled) setContent(result.content)
            } catch (err: any) {
                if (!cancelled) setError(err.message || 'Failed to load file')
            } finally {
                if (!cancelled) setLoading(false)
            }
        }
        load()
        return () => { cancelled = true }
    }, [token, owner, repo, ref, file.path])

    const handleCopy = () => {
        if (!content) return
        navigator.clipboard.writeText(content)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const lineCount = content ? content.split('\n').length : 0

    return (
        <div className="mt-1">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs min-w-0">
                    <button onClick={onBack} className="flex items-center gap-0.5 text-muted-foreground hover:text-foreground">
                        <ArrowLeft className="h-3 w-3" />
                    </button>
                    <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="font-medium truncate">{file.name}</span>
                    <span className="text-muted-foreground flex-shrink-0">{formatSize(file.size)}</span>
                    {lineCount > 0 && <span className="text-muted-foreground flex-shrink-0">{lineCount} lines</span>}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                    {content && (
                        <button onClick={handleCopy} className="p-0.5 hover:bg-muted rounded" title="Copy content">
                            {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
                        </button>
                    )}
                    <a href={file.html_url} target="_blank" rel="noopener noreferrer" className="p-0.5 hover:bg-muted rounded" title="Open on GitHub">
                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                    </a>
                </div>
            </div>

            {loading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center">
                    <RefreshCw className="h-3 w-3 animate-spin" /> Loading file...
                </div>
            )}
            {error && <div className="text-xs text-red-500 py-2">{error}</div>}
            {!loading && !error && content !== null && (
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

export const GitHubRepoStructure: React.FC<{
    owner: string
    repo: string
    defaultBranch: string
    token: string | null
}> = ({ owner, repo, defaultBranch, token }) => {
    const [items, setItems] = useState<GitHubTreeItem[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [loaded, setLoaded] = useState(false)
    const [truncated, setTruncated] = useState(false)
    const [ref, setRef] = useState(defaultBranch || 'main')
    const [expanded, setExpanded] = useState<Set<string>>(new Set())
    const [viewingFile, setViewingFile] = useState<GitHubTreeItem | null>(null)
    const [depth, setDepth] = useState(3)

    const load = useCallback(async (targetRef: string, targetDepth: number) => {
        if (!token) return
        setLoading(true)
        setError(null)
        setViewingFile(null)
        try {
            const result = await getRepoTree(token, owner, repo, {
                ref: targetRef,
                recursive: true,
                depth: targetDepth,
            })
            setItems(result.items)
            setRef(result.ref)
            setTruncated(result.truncated)
            setLoaded(true)
        } catch (err: any) {
            setError(err.message || 'Failed to load project structure')
        } finally {
            setLoading(false)
        }
    }, [token, owner, repo])

    useEffect(() => {
        if (!loaded && token) load(defaultBranch || 'main', depth)
    }, [loaded, token, load, defaultBranch, depth])

    const toggle = (path: string) => {
        setExpanded(prev => {
            const next = new Set(prev)
            if (next.has(path)) next.delete(path)
            else next.add(path)
            return next
        })
    }

    const handleFileClick = (item: GitHubTreeItem) => {
        if (isTextFile(item.name) && item.size <= MAX_VIEWABLE_SIZE) setViewingFile(item)
        else window.open(item.html_url, '_blank')
    }

    if (viewingFile && token) {
        return (
            <StructureFileViewer
                owner={owner}
                repo={repo}
                ref={ref}
                token={token}
                file={viewingFile}
                onBack={() => setViewingFile(null)}
            />
        )
    }

    const tree = buildTree(items, depth)

    const renderNodes = (nodes: TreeDir[], level: number): React.ReactNode => nodes.map(node => {
        if (node.type === 'dir') {
            const isOpen = expanded.has(node.path)
            return (
                <React.Fragment key={node.path}>
                    <button
                        onClick={() => toggle(node.path)}
                        className="flex items-center gap-1.5 px-2 py-1 text-xs hover:bg-muted w-full text-left"
                        style={{ paddingLeft: 8 + level * 14 }}
                    >
                        {isOpen ? <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 flex-shrink-0 text-muted-foreground" />}
                        {isOpen ? <FolderOpen className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" /> : <Folder className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />}
                        <span className="truncate font-medium">{node.name}</span>
                    </button>
                    {isOpen && renderNodes(node.children, level + 1)}
                </React.Fragment>
            )
        }
        return (
            <button
                key={node.path}
                onClick={() => handleFileClick({ name: node.name, path: node.path, type: 'file', size: node.size, sha: '', html_url: node.html_url })}
                className="flex items-center gap-1.5 px-2 py-1 text-xs hover:bg-muted w-full text-left"
                style={{ paddingLeft: 8 + level * 14 + 16 }}
                title={node.path}
            >
                <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <span className="truncate">{node.name}</span>
                {node.size > 0 && <span className="ml-auto text-[10px] text-muted-foreground flex-shrink-0">{formatSize(node.size)}</span>}
            </button>
        )
    })

    return (
        <div className="mt-2">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="font-mono">{ref}</span>
                    <span>· {items.length} entries</span>
                </div>
                <div className="flex items-center gap-1">
                    <select
                        value={depth}
                        onChange={(event) => {
                            const next = parseInt(event.target.value, 10) || 3
                            setDepth(next)
                            load(ref, next)
                        }}
                        className="h-6 rounded border border-input bg-transparent px-1 text-[11px]"
                        title="Directory depth"
                    >
                        <option value={2}>2 levels</option>
                        <option value={3}>3 levels</option>
                        <option value={4}>4 levels</option>
                        <option value={6}>6 levels</option>
                    </select>
                    <button
                        onClick={() => load(ref, depth)}
                        className="p-0.5 hover:bg-muted rounded"
                        disabled={loading}
                        title="Reload structure"
                    >
                        <RefreshCw className={cn('h-3 w-3 text-muted-foreground', loading && 'animate-spin')} />
                    </button>
                </div>
            </div>

            {loading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center">
                    <RefreshCw className="h-3 w-3 animate-spin" /> Loading structure...
                </div>
            )}
            {error && <div className="text-xs text-red-500 py-2">{error}</div>}

            {!loading && !error && (
                <ScrollArea className="max-h-[320px]">
                    <div className="border rounded-md divide-y py-1">
                        {tree.length === 0 ? (
                            <div className="px-3 py-4 text-xs text-muted-foreground text-center">Empty repository</div>
                        ) : renderNodes(tree, 0)}
                    </div>
                </ScrollArea>
            )}

            {truncated && (
                <div className="mt-1 text-[10px] text-amber-500">GitHub truncated this tree; some entries may be missing.</div>
            )}
        </div>
    )
}
