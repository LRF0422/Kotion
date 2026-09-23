/**
 * Plugin Studio — side-dock manager.
 *
 * A compact manager for the user's own dev plugins: pick a project (from the
 * host's managed directory or added folders), start/stop its watch, build and
 * hot-install it, or uninstall the running dev plugin — without leaving the
 * document. The full editor (scaffold dialog, conventions) stays in Settings.
 *
 * All user-facing text goes through the plugin's zh/en locale bundles.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
    Badge,
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

export const StudioDockPanel: React.FC<DockPanelProps> = ({ close }) => {
    const { t } = useTranslation()
    const capability = useDevCapability()
    const isDesktop = useHasDesktop()
    const desktop = useOptionalService('desktop')
    const pluginHost = useOptionalService('pluginHost')
    const installBundle = useInstallBundle()
    const { projects, addProject, removeProject, touchProject } = useProjects()

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

    useEffect(() => {
        void refreshManaged()
    }, [refreshManaged])

    useEffect(() => {
        void refreshStatus()
    }, [refreshStatus])

    const onBuild = useCallback(
        (next: DevSessionStatus) => {
            if (next.root !== selectedRoot) return
            setStatus(next)
            void refreshStatus()
            void refreshManaged()
        },
        [refreshManaged, refreshStatus, selectedRoot],
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
            if (next.build) await installBundle(next)
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
            if (next.build) await installBundle(next)
            await refreshStatus()
        })

    const uninstallRunning = () =>
        run('uninstall', async () => {
            if (!pluginHost || !status?.plugin) return
            pluginHost.uninstall(status.plugin.name)
            await refreshStatus()
        })

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
            if (next.build) await installBundle(next)
            await refreshManaged()
        })

    if (!isDesktop || !capability) {
        return (
            <div className="flex h-full flex-col">
                <header className="flex items-center justify-between border-b px-3 py-2">
                    <div className="flex items-center gap-2 text-xs font-medium">
                        <Wrench className="h-3.5 w-3.5" />
                        {t('pluginStudio.title')}
                    </div>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={close}>
                        <X className="h-3.5 w-3.5" />
                    </Button>
                </header>
                <div className="flex items-start gap-2 p-3 text-xs text-muted-foreground">
                    {isDesktop ? <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" /> : null}
                    <span>{isDesktop ? t('pluginStudio.missingDev') : t('pluginStudio.desktopOnly')}</span>
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
        <div className="flex h-full flex-col">
            <header className="flex items-center justify-between border-b px-3 py-2">
                <div className="flex min-w-0 items-center gap-2 text-xs font-medium">
                    <Wrench className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{t('pluginStudio.title')}</span>
                    <Badge variant="secondary" className="text-[10px]">
                        {rows.length}
                    </Badge>
                </div>
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        title={t('pluginStudio.refresh')}
                        onClick={() => {
                            void refreshManaged()
                            void refreshStatus()
                        }}
                    >
                        <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={close}>
                        <X className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </header>

            <div className="border-b">
                <ScrollArea className="max-h-44">
                    <div className="space-y-0.5 p-2">
                        {rows.length === 0 ? (
                            <p className="px-1 py-2 text-xs text-muted-foreground">
                                {t('pluginStudio.noProjectsDock')}
                            </p>
                        ) : (
                            rows.map((row) => {
                                const isSelected = row.root === selectedRoot
                                const state = isSelected ? status?.state : undefined
                                return (
                                    <button
                                        key={row.root}
                                        type="button"
                                        onClick={() => {
                                            setSelectedRoot(row.root)
                                            touchProject(row.root)
                                        }}
                                        className={cn(
                                            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                                            isSelected ? 'bg-primary/10' : 'hover:bg-accent',
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                'h-1.5 w-1.5 shrink-0 rounded-full',
                                                dotTone(state, row.active),
                                            )}
                                        />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate font-medium">{row.label}</span>
                                            <span className="block truncate text-[10px] text-muted-foreground">
                                                {row.pluginKey || row.root}
                                            </span>
                                        </span>
                                        {row.active ? (
                                            <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />
                                        ) : null}
                                    </button>
                                )
                            })
                        )}
                    </div>
                </ScrollArea>
                <div className="flex items-center gap-1 px-2 pb-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 flex-1 text-[11px]"
                        onClick={() => setScaffoldOpen(true)}
                    >
                        <Plus className="mr-1 h-3 w-3" />
                        {t('pluginStudio.newProject')}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 flex-1 text-[11px]"
                        onClick={() => void addExisting()}
                    >
                        <FolderOpen className="mr-1 h-3 w-3" />
                        {t('pluginStudio.addFolder')}
                    </Button>
                </div>
            </div>

            {selected ? (
                <div className="space-y-2 border-b p-3 text-xs">
                    <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">{t('pluginStudio.status')}</span>
                        <span className={cn(stateTone(status?.state))}>{stateText}</span>
                    </div>
                    {status?.build ? (
                        <div className="flex items-center justify-between text-muted-foreground">
                            <span>{t('pluginStudio.output')}</span>
                            <span>
                                #{status.buildCount} · {formatBytes(status.build.bytes)} · {status.build.durationMs}ms
                            </span>
                        </div>
                    ) : null}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                        <Button
                            size="sm"
                            className="h-7 text-[11px]"
                            onClick={watching ? stopWatching : startWatching}
                            disabled={busy !== null}
                        >
                            {busy === 'start' ? (
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            ) : watching ? (
                                <Square className="mr-1 h-3 w-3" />
                            ) : (
                                <Play className="mr-1 h-3 w-3" />
                            )}
                            {watching ? t('pluginStudio.stop') : t('pluginStudio.watch')}
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px]"
                            onClick={buildAndInstall}
                            disabled={busy !== null}
                        >
                            {busy === 'build' ? (
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            ) : (
                                <Upload className="mr-1 h-3 w-3" />
                            )}
                            {t('pluginStudio.hotReload')}
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-[11px]"
                            title={t('pluginStudio.uninstallHint')}
                            onClick={uninstallRunning}
                            disabled={busy !== null || !status?.plugin}
                        >
                            <Trash2 className="mr-1 h-3 w-3" />
                            {t('pluginStudio.uninstall')}
                        </Button>
                        {!selected.managed ? (
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-[11px] text-muted-foreground"
                                title={t('pluginStudio.removeHint')}
                                onClick={removeFromList}
                                disabled={busy !== null}
                            >
                                {t('pluginStudio.remove')}
                            </Button>
                        ) : null}
                    </div>
                    {status?.error || error ? (
                        <pre className="max-h-24 overflow-auto whitespace-pre-wrap rounded bg-destructive/10 p-1.5 text-[11px] text-destructive">
                            {status?.error || error}
                        </pre>
                    ) : null}
                </div>
            ) : (
                <div className="border-b p-3 text-xs text-muted-foreground">{t('pluginStudio.selectOrCreate')}</div>
            )}

            <div className="flex items-center justify-between px-3 pt-2 text-[11px] text-muted-foreground">
                <span>{t('pluginStudio.buildLogs')}</span>
                <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={() => void refreshStatus()}>
                    {t('pluginStudio.refresh')}
                </Button>
            </div>
            <ScrollArea className="flex-1">
                <div className="space-y-0.5 p-3 font-mono text-[11px] leading-relaxed">
                    {logs.length === 0 ? (
                        <p className="text-muted-foreground">{t('pluginStudio.noLogs')}</p>
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
