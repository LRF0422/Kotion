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
import {
    streamKnowledgeText,
    useDockPanels,
    useOptionalService,
    usePluginMenus,
    usePluginRoutes,
    usePluginState,
    useTranslation,
} from '@kn/common'
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
import { CodeView } from './files/CodeView'
import { svgDataUrl } from './artifacts/cards'
import {
    PLUGIN_ICON_RELATIVE_PATH,
    applyPluginIcon,
    readPluginIcon,
    restorePluginIcon,
    writePluginIconSvg,
    type PluginIconIo,
} from './icons/icon-art'
import {
    classifyIconAiError,
    designAiIcon,
    type AiIconProgress,
} from './icons/icon-ai'

type Busy = 'start' | 'stop' | 'build' | 'uninstall' | 'delete' | 'icon' | 'icon-ai' | null

/** Where the AI icon dialog is: waiting, streaming a design, or reviewing one. */
type AiIconPhase = 'idle' | 'designing' | 'review'
/** What went wrong, mapped to an actionable hint (see `classifyIconAiError`). */
type AiIconErrorKind = ReturnType<typeof classifyIconAiError>

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

/** Viewer cap — larger files render their first lines only (`CodeView`). */
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
    /**
     * The icon that was in the project before an AI icon was applied, so the
     * apply can be undone without leaving the project with an image its manifest
     * no longer points at. Session-scoped on purpose: `iconResult` is a preview
     * of this run, not durable project state.
     */
    const [iconUndo, setIconUndo] = useState<{ icon: string | null; svg: string | null } | null>(null)
    /** AI icon dialog: the optional design brief, live stream count, last error. */
    const [aiIconOpen, setAiIconOpen] = useState(false)
    const [aiIconBrief, setAiIconBrief] = useState('')
    const [aiIconPhase, setAiIconPhase] = useState<AiIconPhase>('idle')
    /**
     * The reviewed artwork AND the project it was designed for. The root travels
     * with the candidate so a project switch (or a project disappearing from the
     * list mid-run) can never apply project A's artwork to project B.
     */
    const [aiIconCandidate, setAiIconCandidate] = useState<{ svg: string; root: string } | null>(null)
    const [aiIconError, setAiIconError] = useState<string | null>(null)
    const [aiIconErrorKind, setAiIconErrorKind] = useState<AiIconErrorKind | null>(null)
    const [aiIconStage, setAiIconStage] = useState<AiIconProgress['stage']>('designing')
    const [aiIconRound, setAiIconRound] = useState(1)
    const [aiIconChars, setAiIconChars] = useState(0)
    /** The artwork the selected project currently declares, shown in its header. */
    const [currentIcon, setCurrentIcon] = useState<{ src: string; path: string } | null>(null)
    /** Aborts the running generation when the dialog is closed or cancelled. */
    const aiIconAbortRef = useRef<AbortController | null>(null)
    /** Live rendering of the values async handlers must compare against. */
    const selectedRootRef = useRef<string | undefined>(selectedRoot)
    const aiIconOpenRef = useRef(false)
    const aiIconCandidateRef = useRef<{ svg: string; root: string } | null>(null)
    selectedRootRef.current = selectedRoot
    aiIconOpenRef.current = aiIconOpen
    aiIconCandidateRef.current = aiIconCandidate
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

    /**
     * What the selected project contributes to the shell **right now**.
     *
     * Read from the same registry the rail, the router and the dock read, so a
     * missing entry becomes a two-second question instead of an investigation:
     * "does the studio see it?" If this says `menus 1` and the rail shows nothing,
     * the loss is between the registry and the rail; if it says `menus 0`, it is
     * between the build and the registry.
     */
    const { pluginVersion } = usePluginState()
    const pluginMenus = usePluginMenus()
    const pluginRoutes = usePluginRoutes()
    const dockPanelsRight = useDockPanels('right')
    /** See `hostCapabilities`: does this host's resolveRoutes() carry provenance? */
    const routeProvenance = pluginRoutes.length === 0
        || pluginRoutes.every(route => Boolean((route as { pluginKey?: string }).pluginKey))
    const dockPanelsLeft = useDockPanels('left')
    const runningEntry = useMemo(() => {
        const key = selected?.pluginKey
        if (!key || !pluginManagement) return undefined
        return pluginManagement.list().find(entry => entry.pluginKey === key)
    }, [pluginManagement, selected?.pluginKey, pluginVersion])
    /**
     * Which host capabilities this build is talking to.
     *
     * Deliberately derived from the *running host*, not from a version string
     * someone has to keep in sync: `typed-install` means the host publishes the
     * typed `installBundle`, `menu-provenance` means resolved menus carry the
     * contributing `pluginKey` (this build's registry). When a symptom is
     * "it still does not work", this line says in one glance whether the window is
     * actually running the code under discussion — which, in this project, has been
     * the single most expensive ambiguity.
     */
    const hostCapabilities = useMemo(() => {
        const marks: string[] = []
        if (typeof (pluginManagement as { installBundle?: unknown } | undefined)?.installBundle === 'function') {
            marks.push('typed-install')
        }
        if (pluginMenus.length === 0 || pluginMenus.every(menu => Boolean(menu.pluginKey))) {
            marks.push('menu-provenance')
        }
        if (devHost) marks.push('dev-host')
        if (routeProvenance) marks.push('route-provenance')
        return marks.join(' · ') || 'legacy-host'
    }, [pluginManagement, pluginMenus, devHost, routeProvenance])
    const shellContribution = useMemo(() => {
        const key = selected?.pluginKey
        if (!key) return undefined
        return {
            menus: pluginMenus.filter(menu => menu.pluginKey === key),
            routes: pluginRoutes.filter(route => route.pluginKey === key),
            panels: [...dockPanelsRight, ...dockPanelsLeft].filter(panel => panel.pluginKey === key),
        }
    }, [selected?.pluginKey, pluginMenus, pluginRoutes, dockPanelsRight, dockPanelsLeft])

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

    // Icon state is a preview of ONE project's run. Switching projects must not
    // leave the previous project's artwork (or its undo snapshot) on screen —
    // that read as "this project already has that icon".
    useEffect(() => {
        // A run started for the previous project must not finish into this one:
        // abort it, and close the dialog (a Radix modal normally blocks the row
        // click, but the project can also disappear from the host list).
        aiIconAbortRef.current?.abort()
        setAiIconOpen(false)
        setIconResult(null)
        setIconUndo(null)
        setAiIconPhase('idle')
        setAiIconCandidate(null)
        setAiIconError(null)
        setAiIconErrorKind(null)
        setAiIconChars(0)
        setAiIconRound(1)
        setAiIconStage('designing')
    }, [selectedRoot])

    // Show the icon the project already has (file or URL) as soon as it is
    // selected. Without this the header had no artwork until the author generated
    // a new one, which made an existing icon look like it had been lost.
    useEffect(() => {
        let cancelled = false
        setCurrentIcon(null)
        if (!capability || !selectedRoot) return () => { cancelled = true }
        void (async () => {
            try {
                const result = await readPluginIcon({
                    root: selectedRoot,
                    io: {
                        readFile: (options) => capability.dev.readFile({ path: options.path }),
                        writeFile: (options) => capability.dev.writeFile({ path: options.path, contents: options.contents }),
                    },
                })
                if (cancelled || !result.icon) return
                if (result.svg) {
                    setCurrentIcon({ src: svgDataUrl(result.svg), path: result.icon })
                } else if (/^data:/i.test(result.icon)) {
                    // A data: URI is local. An http(s) icon is NOT loaded here:
                    // selecting an untrusted project must not fire a request at
                    // an author-controlled URL.
                    setCurrentIcon({ src: result.icon, path: result.icon })
                }
            } catch {
                // No readable icon (or no manifest): the header shows no thumbnail.
            }
        })()
        return () => { cancelled = true }
    }, [capability, selectedRoot])

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
            // Unbind first: a session that kept its last build would install the
            // plugin straight back after the uninstall below.
            devHost?.unwatch(selectedRoot)
            await capability.dev.stop({ root: selectedRoot })
            /**
             * Stopping **is** leaving the window.
             *
             * The development session is over, so the dev version goes with it —
             * leaving it running was the old behaviour, and it read as "stop did
             * nothing": the plugin's menu, panel and routes stayed in the app until
             * the window was reloaded. Files on disk are untouched; "热更" or
             * "开始监听" brings it back.
             */
            if (pluginHost && status?.plugin) {
                pluginHost.uninstall(status.plugin.pluginKey || status.plugin.name)
            }
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
     * The icon helpers take an injected IO surface so `./icons/icon-art` stays
     * import-free (its tests import the module under plain Node). The dev bridge
     * already speaks the same shape; `deleteFile` is optional because a host
     * predating that capability can still undo the manifest pointer.
     */
    const iconIo = (root: string): PluginIconIo | undefined => {
        if (!capability) return undefined
        return {
            readFile: (options) => capability.dev.readFile({ path: options.path }),
            writeFile: (options) => capability.dev.writeFile({ path: options.path, contents: options.contents }),
            // The bridge wants the project root for its allowlist check too.
            deleteFile: typeof capability.dev.deleteFile === 'function'
                ? (options) => capability.dev.deleteFile({ root, path: options.path })
                : undefined,
        }
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
            const root = selectedRoot
            const io = iconIo(root)
            if (!io) return
            setIconResult(null)
            // The deterministic path also rewrites the rail icon, which the undo
            // snapshot does not cover: offer no one-click undo instead of a
            // half-restored project.
            setIconUndo(null)
            setAiIconOpen(false)
            setAiIconPhase('idle')
            setAiIconCandidate(null)
            const applied = await applyPluginIcon({
                root,
                seed: selected?.pluginKey || selected?.label || root,
                title: selected?.label,
                io,
            })
            // The write landed in `root` either way; only paint it as the
            // selected project's icon if that project is still selected.
            if (selectedRootRef.current !== root) return
            setIconResult({ svg: applied.svg, glyph: applied.glyph, rail: applied.railIcon.status })
            setCurrentIcon({ src: svgDataUrl(applied.svg), path: applied.relativePath })
            await refreshManaged()
            if (activeTab === 'files') refreshFilePane()
        })

    /**
     * Design the plugin's icon with the host's cloud model instead of the
     * deterministic renderer: stream an SVG, hard-validate it (`./icons/icon-ai`),
     * and — on a broken document — hand the model its concrete problems for up to
     * two repair rounds. The result is only a CANDIDATE: nothing is written into
     * the project until the author reviews it and presses apply.
     */
    const generateAiIcon = async () => {
        if (!capability || !selectedRoot) return
        const root = selectedRoot
        const controller = new AbortController()
        aiIconAbortRef.current = controller
        setBusy('icon-ai')
        setAiIconPhase('designing')
        setAiIconCandidate(null)
        setAiIconError(null)
        setAiIconErrorKind(null)
        setAiIconChars(0)
        setAiIconRound(1)
        setAiIconStage('designing')
        try {
            const result = await designAiIcon({
                seed: selected?.pluginKey || selected?.label || root,
                title: selected?.label,
                brief: aiIconBrief,
                signal: controller.signal,
                onProgress: (progress) => {
                    setAiIconStage(progress.stage)
                    setAiIconChars(progress.chars)
                    setAiIconRound(progress.round)
                },
                stream: (prompt, options) =>
                    streamKnowledgeText(prompt, {
                        system: options.system,
                        signal: options.signal,
                    }).textStream,
            })
            // Aborted by a project switch / dialog close: never publish a
            // candidate that belongs to a project the author has left.
            if (controller.signal.aborted || selectedRootRef.current !== root) return
            setAiIconCandidate({ svg: result.svg, root })
            setAiIconPhase('review')
        } catch (cause) {
            // A dialog-close abort is not a failure. Any OTHER error — including
            // a transport-originated cancel — must replace the spinner with a
            // real state, never leave "designing…" forever.
            if (controller.signal.aborted) return
            setAiIconErrorKind(classifyIconAiError(cause))
            setAiIconError(String((cause as Error)?.message ?? cause))
            setAiIconPhase('idle')
        } finally {
            aiIconAbortRef.current = null
            setBusy(null)
        }
    }

    /**
     * Commit the reviewed AI artwork.
     *
     * The candidate carries the project it was designed for; a mismatch (the
     * project changed while the dialog was open) is refused instead of writing
     * one project's artwork into another. The previous icon is snapshotted
     * before the write, and a write failure puts the snapshot back, so a partial
     * failure cannot silently lose the old icon.
     */
    const applyAiIcon = async () => {
        const candidate = aiIconCandidate
        if (!capability || !selectedRoot || !candidate) return
        if (candidate.root !== selectedRoot) {
            setAiIconErrorKind('unknown')
            setAiIconError(t('pluginStudio.aiIconProjectChanged'))
            setAiIconPhase('idle')
            setAiIconCandidate(null)
            return
        }
        const root = candidate.root
        const svg = candidate.svg
        const io = iconIo(root)
        if (!io) return
        const showApplyFailure = (cause: unknown): void => {
            const message = String((cause as Error)?.message ?? cause)
            if (!aiIconOpenRef.current || !aiIconCandidateRef.current) {
                // The dialog was closed while the write was in flight: report it
                // on the page instead of reopening a review state with no preview.
                setError(message)
                setAiIconPhase('idle')
                return
            }
            setAiIconErrorKind(classifyIconAiError(cause))
            setAiIconError(message)
            setAiIconPhase('review')
        }

        setBusy('icon-ai')
        setAiIconError(null)
        setAiIconErrorKind(null)
        let previous: Awaited<ReturnType<typeof readPluginIcon>> | null = null
        try {
            previous = await readPluginIcon({ root, io })
            await writePluginIconSvg({ root, io, svg })
        } catch (cause) {
            // Best effort: put the snapshot back if the write was partial.
            if (previous) {
                await restorePluginIcon({ root, io, icon: previous.icon, svg: previous.svg }).catch(() => undefined)
            }
            setBusy(null)
            showApplyFailure(cause)
            return
        }

        setIconUndo(previous)
        setBusy(null)
        if (selectedRootRef.current !== root) return
        setIconResult({ svg, ai: true })
        setCurrentIcon({ src: svgDataUrl(svg), path: PLUGIN_ICON_RELATIVE_PATH })
        setAiIconOpen(false)
        setAiIconPhase('idle')
        setAiIconCandidate(null)
        try {
            await refreshManaged()
            if (activeTab === 'files') refreshFilePane()
        } catch (cause) {
            setError(String((cause as Error)?.message ?? cause))
        }
    }

    /** Put the previous icon (file + manifest pointer) back after an AI apply. */
    const undoIcon = async () => {
        if (!capability || !selectedRoot || !iconUndo) return
        const root = selectedRoot
        const io = iconIo(root)
        if (!io) return
        setBusy('icon')
        setError(null)
        try {
            const restored = await restorePluginIcon({
                root,
                io,
                icon: iconUndo.icon,
                svg: iconUndo.svg,
            })
            if (selectedRootRef.current !== root) return
            setIconUndo(null)
            setIconResult(null)
            setCurrentIcon(
                iconUndo.icon && iconUndo.svg
                    ? { src: svgDataUrl(iconUndo.svg), path: iconUndo.icon }
                    : iconUndo.icon && /^data:/i.test(iconUndo.icon)
                        ? { src: iconUndo.icon, path: iconUndo.icon }
                        : null,
            )
            if (!restored.contentRestored) setError(t('pluginStudio.iconUndoIncomplete'))
            await refreshManaged()
            if (activeTab === 'files') refreshFilePane()
        } catch (cause) {
            setError(String((cause as Error)?.message ?? cause))
        } finally {
            setBusy(null)
        }
    }

    /** Show the generated artwork in the Files tab instead of a tiny thumbnail. */
    const openGeneratedIcon = () => {
        setActiveTab('files')
        void refreshFiles().then(() => void openFile(PLUGIN_ICON_RELATIVE_PATH))
    }

    /**
     * The offline renderer is the reliable half of the icon feature: when the AI
     * channel is unavailable or keeps failing, one click still leaves the author
     * with a valid, wired icon.
     */
    const useOfflineIcon = () => {
        closeAiIconDialog()
        void generateIcon()
    }

    /** Close the AI icon dialog; a running generation is aborted with it. */
    const closeAiIconDialog = () => {
        aiIconAbortRef.current?.abort()
        setAiIconOpen(false)
        setAiIconPhase('idle')
        setAiIconCandidate(null)
        setAiIconError(null)
        setAiIconErrorKind(null)
        setAiIconChars(0)
        setAiIconRound(1)
        setAiIconStage('designing')
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
                                        {currentIcon ? (
                                            <img
                                                src={currentIcon.src}
                                                alt=""
                                                title={currentIcon.path}
                                                className="h-8 w-8 shrink-0 rounded-lg border border-border/60"
                                            />
                                        ) : null}
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

                                {/* Registry truth for this project: whether it is
                                    running, and what the shell would get from it. */}
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10px] leading-relaxed text-muted-foreground">
                                    <span>{t('pluginStudio.shellTitle', 'In the window')}</span>
                                    <span className={cn(!runningEntry && 'text-amber-600 dark:text-amber-500')}>
                                        {runningEntry
                                            ? `${runningEntry.pluginKey} · ${runningEntry.source}`
                                                + (runningEntry.version ? ` · ${runningEntry.version}` : '')
                                            : t('pluginStudio.shellNotRunning', 'not running')}
                                    </span>
                                    <span aria-hidden>·</span>
                                    <span className="text-muted-foreground/70">{hostCapabilities}</span>
                                    {shellContribution ? (
                                        <>
                                            <span aria-hidden>·</span>
                                            <span>{t('pluginStudio.shellContributions', 'contributes')}</span>
                                            <span>
                                                {t('pluginStudio.shellMenus', 'menus')}{' '}
                                                <b className="tabular-nums">{shellContribution.menus.length}</b>
                                            </span>
                                            <span>
                                                {t('pluginStudio.shellRoutes', 'routes')}{' '}
                                                <b className="tabular-nums">{shellContribution.routes.length}</b>
                                            </span>
                                            <span>
                                                {t('pluginStudio.shellPanels', 'panels')}{' '}
                                                <b className="tabular-nums">{shellContribution.panels.length}</b>
                                            </span>
                                        </>
                                    ) : null}
                                </div>

                                <div className="flex flex-wrap items-center gap-1.5">
                                    <Button
                                        size="sm"
                                        className="h-8 gap-1.5 px-3 text-[11px]"
                                        onClick={watching ? stopWatching : startWatching}
                                        disabled={busy !== null}
                                        title={watching
                                            ? t('pluginStudio.stopHint', 'Stop watching and uninstall the dev version from the window (files on disk are kept)')
                                            : t('pluginStudio.watchHint', 'Watch the project: every save hot-reloads the window')}
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
                                    <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-2">
                                        <img
                                            src={svgDataUrl(iconResult.svg)}
                                            alt=""
                                            className="h-12 w-12 shrink-0 rounded-lg border"
                                        />
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-[10.5px] leading-snug text-muted-foreground">
                                                {iconResult.ai
                                                    ? t('pluginStudio.iconGeneratedAi')
                                                    : t('pluginStudio.iconGenerated', {
                                                        glyph: iconResult.glyph,
                                                        rail: t(`pluginStudio.iconRail.${iconResult.rail}`),
                                                    })}
                                            </div>
                                            <div className="truncate font-mono text-[10px] leading-snug text-muted-foreground/70">
                                                {PLUGIN_ICON_RELATIVE_PATH}
                                            </div>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-1">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 px-1.5 text-[10px]"
                                                title={t('pluginStudio.iconOpenInFiles')}
                                                onClick={openGeneratedIcon}
                                                disabled={busy !== null}
                                            >
                                                {t('pluginStudio.iconOpen')}
                                            </Button>
                                            {iconUndo ? (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 px-1.5 text-[10px]"
                                                    title={t('pluginStudio.iconUndoHint')}
                                                    onClick={() => void undoIcon()}
                                                    disabled={busy !== null}
                                                >
                                                    {t('pluginStudio.iconUndo')}
                                                </Button>
                                            ) : null}
                                        </div>
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
                                                        <CodeView
                                                            text={fileContent}
                                                            path={selectedFile ?? ''}
                                                            maxLines={MAX_VIEW_LINES}
                                                        />
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
                                disabled={aiIconPhase === 'designing' || busy !== null}
                            />
                        </div>
                        {aiIconPhase === 'designing' ? (
                            <div className="space-y-1 rounded-md border bg-muted/20 p-2">
                                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    {t(`pluginStudio.aiIconStage.${aiIconStage}`)}
                                </p>
                                <p className="font-mono text-[10px] leading-snug text-muted-foreground/70">
                                    {t('pluginStudio.aiIconProgress', {
                                        round: aiIconRound,
                                        size: formatBytes(aiIconChars),
                                    })}
                                </p>
                            </div>
                        ) : null}
                        {aiIconPhase === 'review' && aiIconCandidate ? (
                            <div className="flex flex-col items-center gap-2 rounded-md border bg-muted/20 p-3">
                                <img
                                    src={svgDataUrl(aiIconCandidate.svg)}
                                    alt=""
                                    className="h-40 w-40 rounded-2xl border shadow-sm"
                                />
                                <p className="text-center text-[10.5px] leading-snug text-muted-foreground">
                                    {t('pluginStudio.aiIconReviewHint')}
                                </p>
                            </div>
                        ) : null}
                        {aiIconError ? (
                            <div className="space-y-1.5 rounded-md border border-destructive/20 bg-destructive/5 p-2">
                                <pre className="max-h-32 overflow-auto whitespace-pre-wrap text-[10.5px] leading-relaxed text-destructive">
                                    {t('pluginStudio.aiIconFailed', { error: aiIconError })}
                                </pre>
                                {aiIconErrorKind ? (
                                    <p className="text-[10.5px] leading-snug text-destructive/90">
                                        {t(`pluginStudio.aiIconErrorHint.${aiIconErrorKind}`)}
                                    </p>
                                ) : null}
                            </div>
                        ) : null}
                        {aiIconPhase !== 'review' ? (
                            <p className="text-[10.5px] leading-snug text-muted-foreground/80">
                                {t('pluginStudio.aiIconNote')}
                            </p>
                        ) : null}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" size="sm" onClick={closeAiIconDialog}>
                            {t('pluginStudio.cancel')}
                        </Button>
                        {aiIconPhase === 'review' ? (
                            <>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => void generateAiIcon()}
                                    disabled={busy !== null}
                                >
                                    {t('pluginStudio.aiIconRegenerate')}
                                </Button>
                                <Button size="sm" onClick={() => void applyAiIcon()} disabled={busy !== null}>
                                    {busy === 'icon-ai' ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : null}
                                    {t('pluginStudio.aiIconApply')}
                                </Button>
                            </>
                        ) : (
                            <>
                                {aiIconError ? (
                                    <Button variant="outline" size="sm" onClick={useOfflineIcon}>
                                        {t('pluginStudio.aiIconFallback')}
                                    </Button>
                                ) : null}
                                <Button size="sm" onClick={() => void generateAiIcon()} disabled={busy !== null}>
                                    {busy === 'icon-ai' ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <Sparkles className="h-3.5 w-3.5" />
                                    )}
                                    {aiIconPhase === 'designing'
                                        ? t('pluginStudio.aiIconGenerating', { size: formatBytes(aiIconChars) })
                                        : t('pluginStudio.aiIconGenerate')}
                                </Button>
                            </>
                        )}
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
