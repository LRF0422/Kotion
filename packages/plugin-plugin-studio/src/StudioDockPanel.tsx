/**
 * Plugin Studio — side-dock manager.
 *
 * A compact manager for the user's own dev plugins: pick a project (from the
 * host's managed directory or added folders), start/stop its watch, build and
 * hot-install it, or uninstall the running dev plugin — without leaving the
 * document. The scaffold dialog and conventions live in this panel.
 *
 * All user-facing text goes through the plugin's zh/en locale bundles.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    Button,
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Input,
    Label,
    ScrollArea,
    cn,
} from '@kn/ui'
import {
    CheckCircle2,
    FolderOpen,
    Loader2,
    Play,
    Plus,
    RefreshCw,
    RotateCw,
    Square,
    Trash2,
    TriangleAlert,
    Upload,
    Wrench,
    X,
} from '@kn/icon'
import type { DevLogEntry, DevProjectEntry, DevSessionStatus, DockPanelProps } from '@kn/common'
import { useOptionalService, useTranslation } from '@kn/common'
import {
    formatBytes,
    useBuildEvents,
    useDevCapability,
    useHasDesktop,
    useInstallBundle,
    useProjects,
} from './studio-service'
import { usePublishProject } from './StudioMarketplacePanel'

type Busy = 'start' | 'stop' | 'build' | 'uninstall' | null

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

export const StudioDockPanel: React.FC<DockPanelProps> = ({ close }) => {
    const { t } = useTranslation()
    const capability = useDevCapability()
    const isDesktop = useHasDesktop()
    const desktop = useOptionalService('desktop')
    const pluginHost = useOptionalService('pluginHost')
    const installBundle = useInstallBundle()
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

    useEffect(() => {
        void refreshManaged()
    }, [refreshManaged])

    useEffect(() => {
        void refreshStatus()
    }, [refreshStatus])

    /**
     * Hot-install a successfully built bundle, at most once per (root, build).
     * A failed rebuild is skipped, so the previous (stale) build is never
     * re-installed on top of the user's broken edit.
     */
    const maybeInstall = useCallback(
        async (next: DevSessionStatus | undefined) => {
            if (!next?.build?.code || next.error) return false
            const previous = installedBuildRef.current
            if (previous.root === next.root && previous.count === next.buildCount) return false
            installedBuildRef.current = { root: next.root, count: next.buildCount }
            return installBundle(next)
        },
        [installBundle],
    )

    const onBuild = useCallback(
        (next: DevSessionStatus) => {
            if (next.root !== selectedRoot) return
            setStatus(next)
            void refreshLogs()
            void refreshManaged()
            // Saving a file in a watched project hot-reloads it, which is the
            // point of the studio. maybeInstall dedupes the first build against
            // the explicit start path and skips failed rebuilds.
            if (next.watching) {
                void maybeInstall(next).catch((cause) =>
                    setError(String((cause as Error)?.message ?? cause)),
                )
            }
        },
        [maybeInstall, refreshLogs, refreshManaged, selectedRoot],
    )
    useBuildEvents(onBuild, selectedRoot)

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
            await maybeInstall(next)
            await Promise.all([refreshStatus(), refreshManaged()])
        })

    const stopWatching = () =>
        run('stop', async () => {
            if (!capability || !selectedRoot) return
            await capability.dev.stop({ root: selectedRoot })
            await Promise.all([refreshStatus(), refreshManaged()])
        })

    const buildAndInstall = () =>
        run('build', async () => {
            if (!capability || !selectedRoot) return
            const next = await capability.dev.build({ root: selectedRoot })
            setStatus(next)
            await maybeInstall(next)
            await refreshStatus()
        })

    const uninstallRunning = () =>
        run('uninstall', async () => {
            if (!pluginHost || !status?.plugin) return
            pluginHost.uninstall(status.plugin.name)
            await refreshStatus()
        })

    const publishProject = (row: StudioRow) => {
        setError(null)
        void publish({ root: row.root, pluginKey: row.pluginKey, name: row.label }).catch((cause) => {
            setError(String((cause as Error)?.message ?? cause))
        })
    }

    const removeFromList = () => {
        if (!selectedRoot) return
        removeProject(selectedRoot)
        setSelectedRoot(undefined)
    }

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

    if (!isDesktop || !capability) {
        return (
            <div className="flex h-full flex-col bg-background">
                <header className="flex h-10 shrink-0 items-center justify-between border-b px-3">
                    <div className="flex items-center gap-2">
                        <span className="grid h-5 w-5 place-items-center rounded-md bg-primary/10 text-primary">
                            <Wrench className="h-3 w-3" />
                        </span>
                        <span className="text-[13px] font-semibold">{t('pluginStudio.title')}</span>
                    </div>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={close}>
                        <X className="h-3.5 w-3.5" />
                    </Button>
                </header>
                <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
                    <TriangleAlert className={cn('h-5 w-5', isDesktop ? 'text-amber-500' : 'text-muted-foreground')} />
                    <p className="max-w-[240px] text-[11px] leading-relaxed text-muted-foreground">
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
            <header className="flex h-10 shrink-0 items-center justify-between border-b px-3">
                <div className="flex min-w-0 items-center gap-2">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                        <Wrench className="h-3 w-3" />
                    </span>
                    <span className="truncate text-[13px] font-semibold tracking-tight">
                        {t('pluginStudio.title')}
                    </span>
                </div>
                <div className="flex items-center gap-0.5">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground"
                        title={t('pluginStudio.refresh')}
                        onClick={() => {
                            void refreshManaged()
                            void refreshStatus()
                        }}
                    >
                        <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground"
                        onClick={close}
                    >
                        <X className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </header>

            <div className="flex min-h-0 flex-1 flex-col">
                <div className="shrink-0 border-b">
                    <ScrollArea className="max-h-56">
                        <div className="space-y-0.5 p-2">
                            {rows.length === 0 ? (
                                <EmptyHint
                                    icon={<FolderOpen className="h-5 w-5" />}
                                    text={t('pluginStudio.noProjectsDock')}
                                />
                            ) : (
                                rows.map((row) => {
                                    const isSelected = row.root === selectedRoot
                                    const state = isSelected ? status?.state : undefined
                                    return (
                                        <div
                                            key={row.root}
                                            className={cn(
                                                'group flex items-center gap-1 rounded-md pr-1 transition-colors',
                                                isSelected ? 'bg-primary/10' : 'hover:bg-accent/60',
                                            )}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setSelectedRoot(row.root)
                                                    touchProject(row.root)
                                                }}
                                                className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left"
                                            >
                                                <span
                                                    className={cn(
                                                        'h-1.5 w-1.5 shrink-0 rounded-full',
                                                        dotTone(state, row.active),
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
                                                {row.active ? (
                                                    <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />
                                                ) : null}
                                            </button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 w-6 shrink-0 p-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                                                title={t('pluginStudio.publishAction')}
                                                onClick={() => {
                                                    setSelectedRoot(row.root)
                                                    publishProject(row)
                                                }}
                                            >
                                                <Upload className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    </ScrollArea>
                    <div className="flex items-center gap-1.5 px-2 pb-2 pt-0.5">
                        <Button
                            size="sm"
                            className="h-7 flex-1 gap-1 px-2 text-[11px]"
                            onClick={() => setScaffoldOpen(true)}
                        >
                            <Plus className="h-3.5 w-3.5" />
                            {t('pluginStudio.newProject')}
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-7 flex-1 gap-1 px-2 text-[11px]"
                            onClick={() => void addExisting()}
                        >
                            <FolderOpen className="h-3.5 w-3.5" />
                            {t('pluginStudio.addFolder')}
                        </Button>
                    </div>
                </div>

                {selected ? (
                    <div className="shrink-0 space-y-2 border-b bg-muted/30 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-1.5">
                                <span
                                    className={cn(
                                        'h-1.5 w-1.5 shrink-0 rounded-full',
                                        dotTone(status?.state, selected.active),
                                    )}
                                />
                                <span className={cn('truncate text-[11px] font-medium', stateTone(status?.state))}>
                                    {stateText}
                                </span>
                            </div>
                            {status?.build ? (
                                <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                                    #{status.buildCount} · {formatBytes(status.build.bytes)} ·{' '}
                                    {status.build.durationMs}ms
                                </span>
                            ) : null}
                        </div>

                        <div className="flex flex-wrap items-center gap-1">
                            <Button
                                size="sm"
                                className="h-7 gap-1 px-2.5 text-[11px]"
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
                                className="h-7 gap-1 px-2 text-[11px]"
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
                                className="h-7 gap-1 px-2 text-[11px]"
                                title={t('pluginStudio.publishAction')}
                                onClick={() => selected && publishProject(selected)}
                            >
                                <Upload className="h-3.5 w-3.5" />
                                {t('pluginStudio.publishAction')}
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                title={t('pluginStudio.uninstallHint')}
                                onClick={uninstallRunning}
                                disabled={busy !== null || !status?.plugin}
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                            {!selected.managed ? (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                    title={t('pluginStudio.removeHint')}
                                    onClick={removeFromList}
                                    disabled={busy !== null}
                                >
                                    <X className="h-3.5 w-3.5" />
                                </Button>
                            ) : null}
                        </div>

                        {status?.error || error ? (
                            <pre className="max-h-24 overflow-auto whitespace-pre-wrap rounded-md border border-destructive/20 bg-destructive/5 p-2 text-[10.5px] leading-relaxed text-destructive">
                                {status?.error || error}
                            </pre>
                        ) : null}
                    </div>
                ) : (
                    <div className="shrink-0 border-b px-3 py-6 text-center text-[11px] text-muted-foreground">
                        {t('pluginStudio.selectOrCreate')}
                    </div>
                )}

                <div className="flex min-h-0 flex-1 flex-col">
                    <div className="flex shrink-0 items-center justify-between px-3 pb-1 pt-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {t('pluginStudio.buildLogs')}
                        </span>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 gap-1 px-1.5 text-[10px] text-muted-foreground"
                            onClick={() => void refreshStatus()}
                        >
                            <RefreshCw className="h-3 w-3" />
                            {t('pluginStudio.refresh')}
                        </Button>
                    </div>
                    <ScrollArea className="min-h-0 flex-1">
                        <div className="space-y-0.5 break-words px-3 pb-3 font-mono text-[11px] leading-relaxed">
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
                </div>
            </div>

            <Dialog open={scaffoldOpen} onOpenChange={setScaffoldOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-base">{t('pluginStudio.createTitle')}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="dock-studio-name" className="text-xs">
                                {t('pluginStudio.packageName')}
                            </Label>
                            <Input
                                id="dock-studio-name"
                                value={scaffoldName}
                                onChange={(event) => setScaffoldName(event.target.value)}
                                placeholder="my-kn-plugin"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="dock-studio-display" className="text-xs">
                                {t('pluginStudio.displayName')}
                            </Label>
                            <Input
                                id="dock-studio-display"
                                value={scaffoldDisplayName}
                                onChange={(event) => setScaffoldDisplayName(event.target.value)}
                                placeholder="My Plugin"
                            />
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
        </div>
    )
}
