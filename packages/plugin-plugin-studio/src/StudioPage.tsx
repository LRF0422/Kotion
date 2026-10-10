/**
 * Plugin Studio — standalone manager page.
 *
 * A compact manager for the user's own dev plugins: pick a project (from the
 * host's managed directory or added folders), start/stop its watch, build and
 * hot-install it, or uninstall the running dev plugin. Opened from the app
 * rail's Plugin Studio menu entry (`menus` + `routes` in `./index.tsx`); the
 * scaffold dialog and conventions live on this page.
 *
 * All user-facing text goes through the plugin's zh/en locale bundles.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    Button,
    ConfirmDialog,
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Input,
    Label,
    ScrollArea,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    cn,
} from '@kn/ui'
import {
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    FolderOpen,
    Loader2,
    Palette,
    Play,
    Plus,
    RefreshCw,
    RotateCw,
    Sparkles,
    Square,
    Trash2,
    TriangleAlert,
    Unplug,
    Upload,
    Wrench,
    X,
} from '@kn/icon'
import type { DevLogEntry, DevProjectEntry, DevSessionStatus } from '@kn/common'
import { streamKnowledgeText, useOptionalService, useTranslation } from '@kn/common'
import {
    useBuildEvents,
    useDeleteProject,
    useDevCapability,
    useHasDesktop,
    describeInstallOutcome,
    useInstallBundle,
    usePluginDevHost,
    useProjects,
    formatBytes,
} from './studio-service'
import { usePublishProject } from './StudioMarketplacePanel'
import { applyPluginIcon, writePluginIconSvg } from './icons/icon-art'
import {
    AI_ICON_MAX_CHARS,
    AI_ICON_SYSTEM_PROMPT,
    buildAiIconPrompt,
    buildAiIconRepairPrompt,
    extractIconSvg,
    validateIconSvg,
} from './icons/icon-ai'

type Busy = 'start' | 'stop' | 'build' | 'uninstall' | 'delete' | 'icon' | 'icon-ai' | null

/** Scaffold templates the host can generate; see the desktop bundler. */
const SCAFFOLD_TEMPLATES = ['panel', 'page', 'settings', 'command', 'blank'] as const
type ScaffoldTemplate = (typeof SCAFFOLD_TEMPLATES)[number]

interface StudioRow {
    root: string
    label: string
    pluginKey?: string
    active?: boolean
    managed: boolean
}

const stateTone = (state?: string) => {
    switch (state) {
        case 'watching':
            return 'text-emerald-600 dark:text-emerald-400'
        case 'starting':
            return 'text-amber-600 dark:text-amber-400'
        case 'failed':
            return 'text-destructive'
        default:
            return 'text-muted-foreground'
    }
}

const dotTone = (state?: string, active?: boolean) => {
    if (state === 'failed') return 'bg-destructive'
    if (state === 'watching' || active) return 'bg-emerald-500'
    return 'bg-muted-foreground/40'
}

/** Centered, bordered hint used by empty lists. */
const EmptyHint: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => (
    <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-border/70 px-3 py-7 text-center">
        <span className="text-muted-foreground/50">{icon}</span>
        <p className="max-w-[220px] text-[11px] leading-snug text-muted-foreground">{text}</p>
    </div>
)

/** Viewer cap — larger files render their first lines only. */
const MAX_VIEW_LINES = 2000

interface FileTreeNode {
    /** Display name — a single path segment. */
    name: string
    /** Project-relative path with POSIX separators. */
    path: string
    /** Directories carry children; files are leaves. */
    children?: FileTreeNode[]
}

/** Fold the flat, sorted `dev.files` list into a directory tree. */
const buildFileTree = (files: string[]): FileTreeNode[] => {
    const roots: FileTreeNode[] = []
    const dirs = new Map<string, FileTreeNode>()
    for (const file of files) {
        const segments = file.split('/')
        let level = roots
        let prefix = ''
        for (let index = 0; index < segments.length - 1; index++) {
            prefix = prefix ? `${prefix}/${segments[index]}` : segments[index]
            let dir = dirs.get(prefix)
            if (!dir) {
                dir = { name: segments[index], path: prefix, children: [] }
                dirs.set(prefix, dir)
                level.push(dir)
            }
            level = dir.children as FileTreeNode[]
        }
        level.push({ name: segments[segments.length - 1], path: file })
    }
    return roots
}

export const StudioPage: React.FC = () => {
    const { t } = useTranslation()
    const capability = useDevCapability()
    const isDesktop = useHasDesktop()
    const desktop = useOptionalService('desktop')
    const pluginHost = useOptionalService('pluginHost')
    const pluginManagement = useOptionalService('pluginManagement')
    const installBundle = useInstallBundle()
    /**
     * The host's dev-session binding, when the host publishes it. Present in every
     * desktop build of this plugin's era; the page keeps its own install path for
     * a host that predates the service.
     */
    const devHost = usePluginDevHost()
    const deleteFiles = useDeleteProject()
    const { projects, addProject, removeProject, touchProject } = useProjects()
    const publish = usePublishProject()
    /**
     * Last (root, buildCount) hot-installed. A build event and the explicit
     * start/build path both want to install the same build; this dedupes them.
     */
    const installedBuildRef = useRef<{ root?: string; count: number }>({ count: 0 })

    const [managed, setManaged] = useState<DevProjectEntry[]>([])
    const [selectedRoot, setSelectedRoot] = useState<string | undefined>()
    const [status, setStatus] = useState<DevSessionStatus | undefined>()
    const [logs, setLogs] = useState<DevLogEntry[]>([])
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState<Busy>(null)
    const [scaffoldOpen, setScaffoldOpen] = useState(false)
    const [scaffoldName, setScaffoldName] = useState('my-kn-plugin')
    const [scaffoldDisplayName, setScaffoldDisplayName] = useState('My Plugin')
    const [scaffoldTemplate, setScaffoldTemplate] = useState<ScaffoldTemplate>('panel')
    /** Project whose files are about to be deleted (confirm dialog). */
    const [deleteTarget, setDeleteTarget] = useState<StudioRow | null>(null)
    /** Result of the last "generate icon" run: the artwork + how it was wired. */
    const [iconResult, setIconResult] = useState<
        ({ svg: string } & ({ ai: true } | { ai?: false; glyph: string; rail: string })) | null
    >(null)
    /** AI icon dialog: the optional design brief, live stream count, last error. */
    const [aiIconOpen, setAiIconOpen] = useState(false)
    const [aiIconBrief, setAiIconBrief] = useState('')
    const [aiIconError, setAiIconError] = useState<string | null>(null)
    const [aiIconChars, setAiIconChars] = useState(0)
    /** Aborts the running generation when the dialog is closed or cancelled. */
    const aiIconAbortRef = useRef<AbortController | null>(null)
    /** Bottom pane tab — build output first, the file browser on demand. */
    const [activeTab, setActiveTab] = useState<'logs' | 'files'>('logs')
    /** Project-relative source files of the selected project (flat, sorted). */
    const [files, setFiles] = useState<string[]>([])
    const [filesTruncated, setFilesTruncated] = useState(false)
    const [filesLoading, setFilesLoading] = useState(false)
    const [filesError, setFilesError] = useState<string | null>(null)
    /** File open in the read-only viewer (project-relative); null = tree only. */
    const [selectedFile, setSelectedFile] = useState<string | null>(null)
    const [fileContent, setFileContent] = useState<string | null>(null)
    const [fileError, setFileError] = useState<string | null>(null)
    /** Directory paths collapsed in the tree; everything starts expanded. */
    const [collapsedDirs, setCollapsedDirs] = useState<ReadonlySet<string>>(new Set())

    /** Managed projects first, then locally added folders, deduped by root. */
    const rows = useMemo<StudioRow[]>(() => {
        const merged = new Map<string, StudioRow>()
        for (const project of managed) {
            merged.set(project.root, {
                root: project.root,
                label: project.displayName || project.name,
                pluginKey: project.pluginKey,
                active: project.active,
                managed: true,
            })
        }
        for (const project of projects) {
            if (!merged.has(project.root)) {
                merged.set(project.root, {
                    root: project.root,
                    label: project.label,
                    pluginKey: project.pluginKey,
                    managed: false,
                })
            }
        }
        return Array.from(merged.values())
    }, [managed, projects])

    const selected = useMemo(
        () => rows.find((row) => row.root === selectedRoot),
        [rows, selectedRoot],
    )

    /** List groups: host-managed projects first, then locally added folders. */
    const managedRows = useMemo(() => rows.filter((row) => row.managed), [rows])
    const addedRows = useMemo(() => rows.filter((row) => !row.managed), [rows])

    useEffect(() => {
        if (selectedRoot && rows.some((row) => row.root === selectedRoot)) return
        setSelectedRoot(rows[0]?.root)
    }, [rows, selectedRoot])

    const refreshManaged = useCallback(async () => {
        if (!capability) return
        try {
            setManaged(await capability.dev.list())
        } catch (cause) {
            setError(String((cause as Error)?.message ?? cause))
        }
    }, [capability])

    const refreshStatus = useCallback(async () => {
        if (!capability || !selectedRoot) {
            setStatus(undefined)
            setLogs([])
            return
        }
        try {
            const [statuses, entries] = await Promise.all([
                capability.dev.status({ root: selectedRoot }),
                capability.dev.logs({ root: selectedRoot, limit: 120 }),
            ])
            setStatus(statuses[0])
            setLogs(entries)
        } catch (cause) {
            setError(String((cause as Error)?.message ?? cause))
        }
    }, [capability, selectedRoot])

    /** Logs only — used after a build event, which already carried the status. */
    const refreshLogs = useCallback(async () => {
        if (!capability || !selectedRoot) {
            setLogs([])
            return
        }
        try {
            setLogs(await capability.dev.logs({ root: selectedRoot, limit: 120 }))
        } catch (cause) {
            setError(String((cause as Error)?.message ?? cause))
        }
    }, [capability, selectedRoot])

    /** Source files of the selected project; loads lazily with the Files tab. */
    const refreshFiles = useCallback(async () => {
        if (!capability || !selectedRoot) {
            setFiles([])
            setFilesTruncated(false)
            return
        }
        // A desktop build predating the dev.files capability has no method here.
        if (typeof capability.dev.files !== 'function') {
            setFiles([])
            setFilesError(t('pluginStudio.filesUnavailable'))
            return
        }
        setFilesLoading(true)
        setFilesError(null)
        try {
            const result = await capability.dev.files({ root: selectedRoot })
            if (result.kind === 'list') {
                setFiles(result.files)
                setFilesTruncated(result.truncated)
            }
        } catch (cause) {
            setFilesError(String((cause as Error)?.message ?? cause))
        } finally {
            setFilesLoading(false)
        }
    }, [capability, selectedRoot, t])

    useEffect(() => {
        void refreshManaged()
    }, [refreshManaged])

    useEffect(() => {
        void refreshStatus()
    }, [refreshStatus])

    // The file snapshot belongs to one project: switching projects drops the
    // open file and the collapsed set, and the list reloads when its tab shows.
    useEffect(() => {
        setSelectedFile(null)
        setFileContent(null)
        setFileError(null)
        setCollapsedDirs(new Set())
    }, [selectedRoot])

    useEffect(() => {
        if (activeTab === 'files') void refreshFiles()
    }, [activeTab, refreshFiles])

    /** Open one project file into the read-only viewer. */
    const openFile = useCallback(
        async (relativePath: string) => {
            if (!capability || !selectedRoot) return
            setSelectedFile(relativePath)
            setFileContent(null)
            setFileError(null)
            try {
                const root = selectedRoot.replace(/[\\/]+$/, '')
                setFileContent(await capability.dev.readFile({ path: `${root}/${relativePath}` }))
            } catch (cause) {
                setFileError(String((cause as Error)?.message ?? cause))
            }
        },
        [capability, selectedRoot],
    )

    /** Refresh the Files pane: the list, then the open file's contents. */
    const refreshFilePane = () => {
        void refreshFiles().then(() => {
            if (selectedFile) void openFile(selectedFile)
        })
    }

    const toggleDir = (path: string) =>
        setCollapsedDirs((current) => {
            const next = new Set(current)
            if (next.has(path)) next.delete(path)
            else next.add(path)
            return next
        })

    /** Directory tree folded from the flat, sorted file list. */
    const fileTree = useMemo(() => buildFileTree(files), [files])

    /**
     * Install a build.
     *
     * When the host publishes the dev-session service, that service is doing the
     * installing already — it is bound to the *project*, not to this page, so the
     * window hot-reloads even while the developer is looking at the plugin rather
     * than at this page. The page then only reports what the host decided; the
     * direct path below is the fallback for a desktop build without the service.
     *
     * Either way, a rejected reload is never swallowed: it says why, and the next
     * build (or an explicit "Hot reload") retries it.
     */
    const maybeInstall = useCallback(
        async (next: DevSessionStatus | undefined) => {
            if (!next?.build?.code || next.error) return false
            if (devHost) return true
            const previous = installedBuildRef.current
            if (previous.root === next.root && previous.count === next.buildCount) return false
            const outcome = await installBundle(next)
            if (outcome.ok) installedBuildRef.current = { root: next.root, count: next.buildCount }
            else setError(describeInstallOutcome(outcome))
            return outcome.ok
        },
        [devHost, installBundle],
    )

    const onBuild = useCallback(
        (next: DevSessionStatus) => {
            if (next.root !== selectedRoot) return
            setStatus(next)
            void refreshLogs()
            void refreshManaged()
            // With the host service bound, the install has already happened by the
            // time this event reaches us; the fallback path installs here.
            if (next.watching && !devHost) {
                void maybeInstall(next).catch((cause) =>
                    setError(String((cause as Error)?.message ?? cause)),
                )
            }
        },
        [devHost, maybeInstall, refreshLogs, refreshManaged, selectedRoot],
    )
    useBuildEvents(onBuild, selectedRoot)

    /**
     * What the host service did with the selected project's builds.
     *
     * Its refusals are the studio's error banner: the host is the only party that
     * knows *why* (the bundle threw while being evaluated, its service is owned,
     * it asked for another plugin API version…).
     */
    useEffect(() => {
        if (!devHost) return undefined
        const unsubscribe = devHost.subscribe(() => {
            const binding = devHost.list().find(entry => entry.root === selectedRoot)
            setError(binding?.outcome ? describeInstallOutcome(binding.outcome) : null)
        })
        return unsubscribe
    }, [devHost, selectedRoot])

    const run = async (kind: Busy, action: () => Promise<void>) => {
        setBusy(kind)
        setError(null)
        try {
            await action()
        } catch (cause) {
            setError(String((cause as Error)?.message ?? cause))
        } finally {
            setBusy(null)
        }
    }

    const startWatching = () =>
        run('start', async () => {
            if (!capability || !selectedRoot) return
            const next = await capability.dev.start({ root: selectedRoot, watch: true })
            setStatus(next)
            if (devHost) {
                // Bind the project: from here on its builds hot-reload the window on
                // their own, whatever page is open.
                const binding = await devHost.watch({
                    root: next.root,
                    pluginKey: next.plugin.pluginKey,
                    name: next.plugin.name,
                })
                setError(describeInstallOutcome(binding.outcome))
            } else {
                await maybeInstall(next)
            }
            await Promise.all([refreshStatus(), refreshManaged()])
        })

    const stopWatching = () =>
        run('stop', async () => {
            if (!capability || !selectedRoot) return
            devHost?.unwatch(selectedRoot)
            await capability.dev.stop({ root: selectedRoot })
            await Promise.all([refreshStatus(), refreshManaged()])
        })

    const buildAndInstall = () =>
        run('build', async () => {
            if (!capability || !selectedRoot) return
            if (devHost) {
                const { status: next, outcome } = await devHost.build({ root: selectedRoot })
                if (next) setStatus(next)
                setError(describeInstallOutcome(outcome))
            } else {
                const next = await capability.dev.build({ root: selectedRoot })
                setStatus(next)
                await maybeInstall(next)
            }
            await refreshStatus()
        })

    const uninstallRunning = () =>
        run('uninstall', async () => {
            if (!pluginHost || !status?.plugin) return
            // Unbind first: otherwise the next build of a still-watching session
            // would install the plugin straight back.
            devHost?.unwatch(status.root)
            pluginHost.uninstall(status.plugin.pluginKey || status.plugin.name)
            await refreshStatus()
        })

    const publishProject = (row: StudioRow) => {
        setError(null)
        void publish({ root: row.root, pluginKey: row.pluginKey, name: row.label }).catch((cause) => {
            setError(String((cause as Error)?.message ?? cause))
        })
    }

    /**
     * Generate the plugin's own icon — the same deterministic art the agent tool
     * uses (`./icons/icon-art`), so a human never has to ask the agent for one.
     * It writes `assets/icon.svg`, points the manifest at it, and swaps the
     * scaffold's emoji rail icon when it finds it.
     */
    const generateIcon = () =>
        run('icon', async () => {
            if (!capability || !selectedRoot) return
            setIconResult(null)
            const applied = await applyPluginIcon({
                root: selectedRoot,
                seed: selected?.pluginKey || selected?.label || selectedRoot,
                title: selected?.label,
                io: {
                    readFile: (options) => capability.dev.readFile({ path: options.path }),
                    writeFile: (options) => capability.dev.writeFile({ path: options.path, contents: options.contents }),
                },
            })
            setIconResult({ svg: applied.svg, glyph: applied.glyph, rail: applied.railIcon.status })
            await refreshManaged()
        })

    /**
     * Design the plugin's icon with the host's cloud model instead of the
     * deterministic renderer: stream an SVG, check it hard (`./icons/icon-ai`),
     * and — on a broken document — give the model exactly one repair round.
     * Applied through the same file/manifest contract as the palette button, so
     * previews, publishing and the marketplace upload need no special casing.
     */
    const generateAiIcon = async () => {
        if (!capability || !selectedRoot) return
        const controller = new AbortController()
        aiIconAbortRef.current = controller
        setBusy('icon-ai')
        setAiIconError(null)
        setAiIconChars(0)
        try {
            const receive = async (prompt: string): Promise<string> => {
                setAiIconChars(0)
                const { textStream } = streamKnowledgeText(prompt, {
                    system: AI_ICON_SYSTEM_PROMPT,
                    signal: controller.signal,
                })
                let text = ''
                for await (const part of textStream) {
                    text += part
                    if (text.length > AI_ICON_MAX_CHARS) throw new Error(t('pluginStudio.aiIconTooLong'))
                    setAiIconChars(text.length)
                }
                return text
            }

            let reply = await receive(
                buildAiIconPrompt({
                    seed: selected?.pluginKey || selected?.label || selectedRoot,
                    title: selected?.label,
                    brief: aiIconBrief,
                }),
            )
            let svg = extractIconSvg(reply)
            let problems = svg ? validateIconSvg(svg) : [t('pluginStudio.aiIconNoSvg')]
            if (problems.length && !controller.signal.aborted) {
                reply = await receive(buildAiIconRepairPrompt(svg ?? reply.slice(0, 12_000), problems))
                svg = extractIconSvg(reply)
                problems = svg ? validateIconSvg(svg) : [t('pluginStudio.aiIconNoSvg')]
            }
            if (!svg || problems.length) throw new Error(problems.join('；'))

            await writePluginIconSvg({
                root: selectedRoot,
                io: {
                    readFile: (options) => capability.dev.readFile({ path: options.path }),
                    writeFile: (options) => capability.dev.writeFile({ path: options.path, contents: options.contents }),
                },
                svg,
            })
            setIconResult({ svg, ai: true })
            setAiIconOpen(false)
            await refreshManaged()
        } catch (cause) {
            // A cancel (dialog closed) is not a failure — only real errors show.
            if (!controller.signal.aborted) setAiIconError(String((cause as Error)?.message ?? cause))
        } finally {
            aiIconAbortRef.current = null
            setBusy(null)
        }
    }

    /** Close the AI icon dialog; a running generation is aborted with it. */
    const closeAiIconDialog = () => {
        aiIconAbortRef.current?.abort()
        setAiIconOpen(false)
        setAiIconError(null)
        setAiIconChars(0)
    }

    const removeFromList = () => {
        if (!selectedRoot) return
        removeProject(selectedRoot)
        setSelectedRoot(undefined)
    }

    /**
     * Delete a plugin project for good: stop its watcher, drop any build that is
     * still hot-installed in this window, then remove the directory from disk.
     * Only reachable through the confirm dialog — it cannot be undone.
     */
    const deleteProject = (row: StudioRow) =>
        run('delete', async () => {
            // Stop watching first: on Windows an open file handle would make the
            // recursive delete fail, and a lingering session would keep reporting
            // the project after its files are gone.
            if (capability) await capability.dev.stop({ root: row.root }).catch(() => undefined)

            // A deleted project must not stay active in the current window.
            const active = pluginManagement?.list().filter(
                (entry) =>
                    entry.source === 'dev' &&
                    (row.pluginKey ? entry.pluginKey === row.pluginKey : entry.name === row.label),
            )
            for (const entry of active ?? []) pluginManagement?.uninstall(entry.name)

            await deleteFiles(row.root)
            removeProject(row.root)
            if (selectedRoot === row.root) setSelectedRoot(undefined)
            await Promise.all([refreshStatus(), refreshManaged()])
        })

    const addExisting = async () => {
        if (!desktop) return
        setError(null)
        const result = await desktop.invoke('dialog.openFolder', { title: t('pluginStudio.pickFolderTitle') })
        if (!result || result.canceled || !result.folderPath) return
        const root = result.folderPath
        const label = root.split(/[\\/]/).filter(Boolean).pop() || root
        addProject({ root, label })
        setSelectedRoot(root)
    }

    const createProject = () =>
        run('start', async () => {
            if (!capability) return
            const name = scaffoldName.trim()
            if (!name) throw new Error(t('pluginStudio.nameRequired'))
            const created = await capability.dev.scaffold({
                name,
                displayName: scaffoldDisplayName.trim() || name,
                template: scaffoldTemplate,
            })
            addProject({
                root: created.root,
                label: scaffoldDisplayName.trim() || name,
                pluginKey: created.pluginKey,
            })
            setSelectedRoot(created.root)
            setScaffoldOpen(false)
            const next = await capability.dev.start({ root: created.root, watch: true })
            setStatus(next)
            await maybeInstall(next)
            await refreshManaged()
        })

    /** One list row; selection only — every action lives in the detail pane. */
    const renderProjectRow = (row: StudioRow) => {
        const isSelected = row.root === selectedRoot
        return (
            <button
                key={row.root}
                type="button"
                onClick={() => {
                    setSelectedRoot(row.root)
                    touchProject(row.root)
                }}
                className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                    isSelected ? 'bg-primary/10' : 'hover:bg-accent/60',
                )}
            >
                <span
                    className={cn(
                        'h-1.5 w-1.5 shrink-0 rounded-full',
                        dotTone(isSelected ? status?.state : undefined, row.active),
                    )}
                />
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-medium leading-tight">
                        {row.label}
                    </span>
                    <span className="block truncate text-[10px] leading-tight text-muted-foreground">
                        {row.pluginKey || row.root}
                    </span>
                </span>
                {row.active ? <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" /> : null}
            </button>
        )
    }

    /** Recursive tree renderer: directories collapse, files open the viewer. */
    const renderFileNodes = (nodes: FileTreeNode[], depth: number): React.ReactNode =>
        nodes.map((node) => {
            if (node.children) {
                const collapsed = collapsedDirs.has(node.path)
                return (
                    <React.Fragment key={node.path}>
                        <button
                            type="button"
                            onClick={() => toggleDir(node.path)}
                            className="flex w-full items-center gap-1 rounded-md py-1 pr-2 text-left text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent/60"
                            style={{ paddingLeft: `${6 + depth * 12}px` }}
                        >
                            {collapsed ? (
                                <ChevronRight className="h-3 w-3 shrink-0" />
                            ) : (
                                <ChevronDown className="h-3 w-3 shrink-0" />
                            )}
                            <span className="truncate">{node.name}</span>
                        </button>
                        {collapsed ? null : renderFileNodes(node.children, depth + 1)}
                    </React.Fragment>
                )
            }
            const isActive = selectedFile === node.path
            return (
                <button
                    key={node.path}
                    type="button"
                    title={node.path}
                    onClick={() => void openFile(node.path)}
                    className={cn(
                        'flex w-full items-center rounded-md py-1 pr-2 text-left text-[11px] transition-colors',
                        isActive
                            ? 'bg-primary/10 text-foreground'
                            : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                    )}
                    style={{ paddingLeft: `${22 + depth * 12}px` }}
                >
                    <span className="truncate">{node.name}</span>
                </button>
            )
        })

    /** Numbered source lines; capped so a huge file cannot stall the window. */
    const renderFileLines = (text: string) => {
        const lines = text.split('\n')
        const capped = lines.length > MAX_VIEW_LINES ? lines.slice(0, MAX_VIEW_LINES) : lines
        return (
            <>
                {capped.map((line, index) => (
                    <div key={index} className="flex">
                        <span className="w-10 shrink-0 select-none pr-2 text-right text-muted-foreground/40 tabular-nums">
                            {index + 1}
                        </span>
                        <span className="min-w-0 flex-1 whitespace-pre-wrap break-words pr-3">
                            {line || ' '}
                        </span>
                    </div>
                ))}
                {capped.length < lines.length ? (
                    <div className="px-3 py-1 text-muted-foreground/70">…</div>
                ) : null}
            </>
        )
    }

    if (!isDesktop || !capability) {
        return (
            <div className="flex h-full flex-col bg-background">
                <header className="flex h-14 shrink-0 items-center gap-2.5 border-b px-4">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                        <Wrench className="h-4 w-4" />
                    </span>
                    <span className="truncate text-sm font-semibold tracking-tight">
                        {t('pluginStudio.title')}
                    </span>
                </header>
                <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                    <TriangleAlert className={cn('h-6 w-6', isDesktop ? 'text-amber-500' : 'text-muted-foreground')} />
                    <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
                        {isDesktop ? t('pluginStudio.missingDev') : t('pluginStudio.desktopOnly')}
                    </p>
                </div>
            </div>
        )
    }

    const watching = status?.state === 'watching'
    const stateText =
        status?.state === 'watching'
            ? t('pluginStudio.state.watching')
            : status?.state === 'starting'
              ? t('pluginStudio.state.starting')
              : status?.state === 'failed'
                ? t('pluginStudio.state.failed')
                : status?.state === 'stopped'
                  ? t('pluginStudio.state.stopped')
                  : t('pluginStudio.state.idle')

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-xs">
            <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
                <div className="flex min-w-0 items-center gap-2.5">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                        <Wrench className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                        <div className="truncate text-sm font-semibold leading-tight tracking-tight">
                            {t('pluginStudio.title')}
                        </div>
                        <div className="truncate text-[11px] leading-tight text-muted-foreground">
                            {t('pluginStudio.subtitle')}
                        </div>
                    </div>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 shrink-0 p-0 text-muted-foreground"
                    title={t('pluginStudio.refresh')}
                    onClick={() => {
                        void refreshManaged()
                        void refreshStatus()
                    }}
                >
                    <RefreshCw className="h-3.5 w-3.5" />
                </Button>
            </header>

            <div className="flex min-h-0 flex-1">
                {/* Left column: the project list. Selection only — every action
                    lives on the right, where there is room to say what it does. */}
                <aside className="flex w-72 shrink-0 flex-col border-r">
                    <div className="flex shrink-0 items-center justify-between gap-2 px-3 pb-1.5 pt-3">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {t('pluginStudio.projects')}
                        </span>
                        {rows.length > 0 ? (
                            <span className="font-mono text-[10px] tabular-nums text-muted-foreground/70">
                                {rows.length}
                            </span>
                        ) : null}
                    </div>
                    <ScrollArea className="min-h-0 flex-1">
                        <div className="space-y-0.5 px-2 pb-3">
                            {rows.length === 0 ? (
                                <EmptyHint
                                    icon={<FolderOpen className="h-5 w-5" />}
                                    text={t('pluginStudio.noProjects')}
                                />
                            ) : (
                                <>
                                    {managedRows.length > 0 ? (
                                        <>
                                            <div className="px-2 pb-1 pt-2 text-[10px] font-medium text-muted-foreground/80">
                                                {t('pluginStudio.managedGroup')}
                                            </div>
                                            {managedRows.map(renderProjectRow)}
                                        </>
                                    ) : null}
                                    {addedRows.length > 0 ? (
                                        <>
                                            <div className="px-2 pb-1 pt-2 text-[10px] font-medium text-muted-foreground/80">
                                                {t('pluginStudio.addedGroup')}
                                            </div>
                                            {addedRows.map(renderProjectRow)}
                                        </>
                                    ) : null}
                                </>
                            )}
                        </div>
                    </ScrollArea>
                    <div className="flex shrink-0 items-center gap-1.5 border-t p-2">
                        <Button
                            size="sm"
                            className="h-8 flex-1 gap-1.5 px-2 text-[11px]"
                            onClick={() => setScaffoldOpen(true)}
                        >
                            <Plus className="h-3.5 w-3.5" />
                            {t('pluginStudio.newProjectLong')}
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-8 flex-1 gap-1.5 px-2 text-[11px]"
                            onClick={() => void addExisting()}
                        >
                            <FolderOpen className="h-3.5 w-3.5" />
                            {t('pluginStudio.addExisting')}
                        </Button>
                    </div>
                </aside>

                {/* Right column: the selected project — head, actions, logs. */}
                <section className="flex min-w-0 flex-1 flex-col">
                    {selected ? (
                        <>
                            <div className="shrink-0 space-y-2.5 border-b p-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex min-w-0 items-start gap-2">
                                        <span
                                            className={cn(
                                                'mt-1 h-2 w-2 shrink-0 rounded-full',
                                                dotTone(status?.state, selected.active),
                                            )}
                                        />
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <span className="truncate text-sm font-medium leading-tight">
                                                    {selected.label}
                                                </span>
                                                {selected.active ? (
                                                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                                                ) : null}
                                            </div>
                                            <div
                                                className="truncate font-mono text-[10.5px] leading-relaxed text-muted-foreground"
                                                title={selected.root}
                                            >
                                                {selected.pluginKey ? `${selected.pluginKey} · ` : ''}
                                                {selected.root}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                                        <span className={cn('text-[11px] font-medium', stateTone(status?.state))}>
                                            {stateText}
                                        </span>
                                        {status?.build ? (
                                            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                                                #{status.buildCount} · {formatBytes(status.build.bytes)} ·{' '}
                                                {status.build.durationMs}ms
                                            </span>
                                        ) : null}
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-1.5">
                                    <Button
                                        size="sm"
                                        className="h-8 gap-1.5 px-3 text-[11px]"
                                        onClick={watching ? stopWatching : startWatching}
                                        disabled={busy !== null}
                                    >
                                        {busy === 'start' || busy === 'stop' ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : watching ? (
                                            <Square className="h-3.5 w-3.5" />
                                        ) : (
                                            <Play className="h-3.5 w-3.5" />
                                        )}
                                        {watching ? t('pluginStudio.stop') : t('pluginStudio.watch')}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 gap-1.5 px-3 text-[11px]"
                                        onClick={buildAndInstall}
                                        disabled={busy !== null}
                                    >
                                        {busy === 'build' ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                            <RotateCw className="h-3.5 w-3.5" />
                                        )}
                                        {t('pluginStudio.hotReload')}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 gap-1.5 px-3 text-[11px]"
                                        title={t('pluginStudio.publishAction')}
                                        onClick={() => publishProject(selected)}
                                    >
                                        <Upload className="h-3.5 w-3.5" />
                                        {t('pluginStudio.publishAction')}
                                    </Button>
                                    <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                                        title={t('pluginStudio.uninstallHint')}
                                        onClick={uninstallRunning}
                                        disabled={busy !== null || !status?.plugin}
                                    >
                                        {busy === 'uninstall' ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                            <Unplug className="h-3.5 w-3.5" />
                                        )}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                                        title={t('pluginStudio.generateIconHint')}
                                        onClick={generateIcon}
                                        disabled={busy !== null}
                                    >
                                        {busy === 'icon' ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                            <Palette className="h-3.5 w-3.5" />
                                        )}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                                        title={t('pluginStudio.aiIconHint')}
                                        onClick={() => {
                                            setAiIconError(null)
                                            setAiIconOpen(true)
                                        }}
                                        disabled={busy !== null}
                                    >
                                        {busy === 'icon-ai' ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                            <Sparkles className="h-3.5 w-3.5" />
                                        )}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-8 w-8 p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                        title={t('pluginStudio.deleteProjectHint')}
                                        onClick={() => setDeleteTarget(selected)}
                                        disabled={busy !== null}
                                    >
                                        {busy === 'delete' ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                            <Trash2 className="h-3.5 w-3.5" />
                                        )}
                                    </Button>
                                    {!selected.managed ? (
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                                            title={t('pluginStudio.removeHint')}
                                            onClick={removeFromList}
                                            disabled={busy !== null}
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </Button>
                                    ) : null}
                                </div>

                                {status?.error || error ? (
                                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-destructive/20 bg-destructive/5 p-2 text-[10.5px] leading-relaxed text-destructive">
                                        {status?.error || error}
                                    </pre>
                                ) : null}

                                {iconResult ? (
                                    <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-1.5">
                                        <img
                                            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconResult.svg)}`}
                                            alt=""
                                            className="h-9 w-9 shrink-0 rounded-md border"
                                        />
                                        <span className="min-w-0 flex-1 text-[10.5px] leading-snug text-muted-foreground">
                                            {iconResult.ai
                                                ? t('pluginStudio.iconGeneratedAi')
                                                : t('pluginStudio.iconGenerated', {
                                                    glyph: iconResult.glyph,
                                                    rail: t(`pluginStudio.iconRail.${iconResult.rail}`),
                                                })}
                                        </span>
                                    </div>
                                ) : null}
                            </div>

                            <div className="flex min-h-0 flex-1 flex-col">
                                {/* One strip for the bottom pane: build output, or the
                                    project's source files with a read-only viewer. */}
                                <div className="flex shrink-0 items-center justify-between gap-2 border-b px-2 py-1">
                                    <div className="flex items-center gap-0.5">
                                        {(['logs', 'files'] as const).map((tab) => (
                                            <button
                                                key={tab}
                                                type="button"
                                                onClick={() => setActiveTab(tab)}
                                                className={cn(
                                                    'rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors',
                                                    activeTab === tab
                                                        ? 'bg-accent text-foreground'
                                                        : 'text-muted-foreground hover:text-foreground',
                                                )}
                                            >
                                                {tab === 'logs'
                                                    ? t('pluginStudio.buildLogs')
                                                    : t('pluginStudio.files')}
                                            </button>
                                        ))}
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-5 gap-1 px-1.5 text-[10px] text-muted-foreground"
                                        onClick={() => {
                                            if (activeTab === 'logs') void refreshStatus()
                                            else refreshFilePane()
                                        }}
                                    >
                                        <RefreshCw className="h-3 w-3" />
                                        {t('pluginStudio.refresh')}
                                    </Button>
                                </div>
                                {activeTab === 'logs' ? (
                                    <ScrollArea className="min-h-0 flex-1">
                                        <div className="space-y-0.5 break-words px-3 py-2 font-mono text-[11px] leading-relaxed">
                                            {logs.length === 0 ? (
                                                <p className="text-muted-foreground/70">{t('pluginStudio.noLogs')}</p>
                                            ) : (
                                                logs.map((entry, index) => (
                                                    <div
                                                        key={entry.at + '-' + index}
                                                        className={cn(
                                                            entry.level === 'error' && 'text-destructive',
                                                            entry.level === 'warn' && 'text-amber-600 dark:text-amber-400',
                                                        )}
                                                    >
                                                        {entry.message}
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </ScrollArea>
                                ) : (
                                    <div className="flex min-h-0 flex-1">
                                        <div className="flex w-60 shrink-0 flex-col border-r">
                                            <ScrollArea className="min-h-0 flex-1">
                                                <div className="px-1.5 py-1.5">
                                                    {filesError ? (
                                                        <pre className="mx-1.5 my-1 whitespace-pre-wrap rounded-md border border-destructive/20 bg-destructive/5 p-2 text-[10px] leading-relaxed text-destructive">
                                                            {filesError}
                                                        </pre>
                                                    ) : files.length === 0 ? (
                                                        <p className="px-2 py-6 text-center text-[11px] leading-snug text-muted-foreground/70">
                                                            {filesLoading
                                                                ? t('pluginStudio.filesLoading')
                                                                : t('pluginStudio.filesEmpty')}
                                                        </p>
                                                    ) : (
                                                        renderFileNodes(fileTree, 0)
                                                    )}
                                                </div>
                                            </ScrollArea>
                                            {filesTruncated ? (
                                                <p className="shrink-0 border-t px-2.5 py-1.5 text-[10px] leading-snug text-muted-foreground/70">
                                                    {t('pluginStudio.filesTruncated', { n: files.length })}
                                                </p>
                                            ) : null}
                                        </div>
                                        <div className="flex min-w-0 flex-1 flex-col">
                                            {selectedFile ? (
                                                <div className="flex shrink-0 items-center border-b px-3 py-1">
                                                    <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-muted-foreground">
                                                        {selectedFile}
                                                    </span>
                                                </div>
                                            ) : null}
                                            <ScrollArea className="min-h-0 flex-1">
                                                {fileError ? (
                                                    <pre className="m-3 whitespace-pre-wrap rounded-md border border-destructive/20 bg-destructive/5 p-2 text-[10.5px] leading-relaxed text-destructive">
                                                        {fileError}
                                                    </pre>
                                                ) : fileContent !== null ? (
                                                    <div className="py-2 font-mono text-[11px] leading-relaxed">
                                                        {renderFileLines(fileContent)}
                                                    </div>
                                                ) : selectedFile ? (
                                                    <div className="flex items-center justify-center py-8">
                                                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                                                    </div>
                                                ) : (
                                                    <p className="px-4 py-8 text-center text-[11px] text-muted-foreground/70">
                                                        {t('pluginStudio.selectFile')}
                                                    </p>
                                                )}
                                            </ScrollArea>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                            <span className="grid h-12 w-12 place-items-center rounded-2xl border border-dashed border-border/70 text-muted-foreground/50">
                                <FolderOpen className="h-5 w-5" />
                            </span>
                            {rows.length === 0 ? (
                                <div className="space-y-1">
                                    <p className="text-sm font-medium">{t('pluginStudio.emptyTitle')}</p>
                                    <p className="mx-auto max-w-sm text-xs leading-relaxed text-muted-foreground">
                                        {t('pluginStudio.emptyHint')}
                                    </p>
                                </div>
                            ) : (
                                <p className="text-xs text-muted-foreground">
                                    {t('pluginStudio.selectOrCreate')}
                                </p>
                            )}
                        </div>
                    )}
                </section>
            </div>

            <Dialog open={scaffoldOpen} onOpenChange={setScaffoldOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-base">{t('pluginStudio.createTitle')}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="studio-name" className="text-xs">
                                {t('pluginStudio.packageName')}
                            </Label>
                            <Input
                                id="studio-name"
                                value={scaffoldName}
                                onChange={(event) => setScaffoldName(event.target.value)}
                                placeholder="my-kn-plugin"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="studio-display" className="text-xs">
                                {t('pluginStudio.displayName')}
                            </Label>
                            <Input
                                id="studio-display"
                                value={scaffoldDisplayName}
                                onChange={(event) => setScaffoldDisplayName(event.target.value)}
                                placeholder="My Plugin"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="studio-template" className="text-xs">
                                {t('pluginStudio.templateLabel')}
                            </Label>
                            <Select
                                value={scaffoldTemplate}
                                onValueChange={(value) => setScaffoldTemplate(value as ScaffoldTemplate)}
                            >
                                <SelectTrigger id="studio-template" className="h-9">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {SCAFFOLD_TEMPLATES.map((template) => (
                                        <SelectItem key={template} value={template}>
                                            {t(`pluginStudio.template.${template}`)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-[11px] leading-snug text-muted-foreground">
                                {t(`pluginStudio.templateHint.${scaffoldTemplate}`)}
                            </p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" size="sm" onClick={() => setScaffoldOpen(false)}>
                            {t('pluginStudio.cancel')}
                        </Button>
                        <Button size="sm" onClick={createProject} disabled={busy !== null}>
                            {t('pluginStudio.createAndWatch')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                open={aiIconOpen}
                onOpenChange={(open) => {
                    if (open) setAiIconOpen(true)
                    else closeAiIconDialog()
                }}
            >
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-base">{t('pluginStudio.aiIcon')}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <p className="text-[11px] leading-snug text-muted-foreground">
                            {t('pluginStudio.aiIconIntro', { name: selected?.label ?? '' })}
                        </p>
                        <div className="space-y-1.5">
                            <Label htmlFor="studio-ai-brief" className="text-xs">
                                {t('pluginStudio.aiIconBriefLabel')}
                            </Label>
                            <Input
                                id="studio-ai-brief"
                                value={aiIconBrief}
                                onChange={(event) => setAiIconBrief(event.target.value)}
                                placeholder={t('pluginStudio.aiIconBriefPlaceholder')}
                                disabled={busy === 'icon-ai'}
                            />
                        </div>
                        {busy === 'icon-ai' ? (
                            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                {t('pluginStudio.aiIconGenerating', { size: formatBytes(aiIconChars) })}
                            </p>
                        ) : null}
                        {aiIconError ? (
                            <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-md border border-destructive/20 bg-destructive/5 p-2 text-[10.5px] leading-relaxed text-destructive">
                                {t('pluginStudio.aiIconFailed', { error: aiIconError })}
                            </pre>
                        ) : null}
                        <p className="text-[10.5px] leading-snug text-muted-foreground/80">
                            {t('pluginStudio.aiIconNote')}
                        </p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" size="sm" onClick={closeAiIconDialog}>
                            {t('pluginStudio.cancel')}
                        </Button>
                        <Button size="sm" onClick={generateAiIcon} disabled={busy !== null}>
                            {busy === 'icon-ai' ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <Sparkles className="h-3.5 w-3.5" />
                            )}
                            {t('pluginStudio.aiIconGenerate')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                open={deleteTarget !== null}
                title={t('pluginStudio.deleteConfirmTitle')}
                description={t('pluginStudio.deleteConfirmDesc', { path: deleteTarget?.root ?? '' })}
                confirmLabel={t('pluginStudio.deleteConfirmAction')}
                cancelLabel={t('pluginStudio.cancel')}
                variant="destructive"
                confirmDisabled={busy !== null}
                onOpenChange={(open) => {
                    if (!open) setDeleteTarget(null)
                }}
                onConfirm={() => {
                    if (deleteTarget) deleteProject(deleteTarget)
                }}
            />
        </div>
    )
}
