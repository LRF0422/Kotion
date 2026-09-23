/**
 * Plugin Studio — settings panel.
 *
 * Lists plugin source projects, drives their dev-server sessions (start /
 * hot-install / build / stop), scaffolds new projects, and shows build output.
 *
 * Every action degrades to an explanation instead of throwing when the host is
 * the web build or a desktop build without the studio runtime. All user-facing
 * text goes through the plugin's zh/en locale bundles.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
    Badge,
    Button,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Input,
    Label,
    ScrollArea,
    Separator,
    Switch,
    cn,
} from '@kn/ui'
import {
    Boxes,
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
} from '@kn/icon'
import type { DevSessionStatus, DevLogEntry, DevProjectEntry } from '@kn/common'
import { Trans, useOptionalService, useTranslation } from '@kn/common'
import {
    formatBytes,
    useBuildEvents,
    useDevCapability,
    useHasDesktop,
    useInstallBundle,
    useProjects,
    type StudioProject,
} from './studio-service'

type Busy = 'start' | 'stop' | 'build' | 'install' | null

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

export const StudioSettings: React.FC<{ pluginKey?: string }> = () => {
    const { t } = useTranslation()
    const capability = useDevCapability()
    const isDesktop = useHasDesktop()
    const desktop = useOptionalService('desktop')
    const { projects, addProject, removeProject, touchProject } = useProjects()
    const installBundle = useInstallBundle()

    const [selectedRoot, setSelectedRoot] = useState<string | undefined>(projects[0]?.root)
    const [status, setStatus] = useState<DevSessionStatus | undefined>()
    const [logs, setLogs] = useState<DevLogEntry[]>([])
    const [busy, setBusy] = useState<Busy>(null)
    const [error, setError] = useState<string | null>(null)
    const [autoInstall, setAutoInstall] = useState(true)
    const [scaffoldOpen, setScaffoldOpen] = useState(false)
    /** Projects the host finds in its managed directory (agent-created included). */
    const [managed, setManaged] = useState<DevProjectEntry[]>([])
    const [scaffoldName, setScaffoldName] = useState('my-kn-plugin')
    const [scaffoldDisplayName, setScaffoldDisplayName] = useState('My Plugin')

    const stateLabel = (state?: string) => {
        switch (state) {
            case 'watching':
                return t('pluginStudio.state.watching')
            case 'starting':
                return t('pluginStudio.state.starting')
            case 'failed':
                return t('pluginStudio.state.failed')
            case 'stopped':
                return t('pluginStudio.state.stopped')
            default:
                return t('pluginStudio.state.idle')
        }
    }

    const selected = useMemo(
        () => projects.find((project) => project.root === selectedRoot),
        [projects, selectedRoot],
    )

    /**
     * Pick a directory through the native dialog.
     *
     * Deliberately goes through `dialog.openFolder` rather than the dev
     * surface: the main process grants whatever the user picks into its fs
     * allowlist, which is what makes the chosen project root reachable by
     * `fs.*` and `dev.*` afterwards. There is no "open any path" escape hatch.
     */
    const pickDirectory = useCallback(
        async (title: string): Promise<string | undefined> => {
            if (!desktop) return undefined
            const result = await desktop.invoke('dialog.openFolder', { title })
            if (!result || result.canceled || !result.folderPath) return undefined
            return result.folderPath
        },
        [desktop],
    )

    /* ---- data loading ---------------------------------------------------- */

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
        void refreshStatus()
    }, [refreshStatus, projects.length, managed.length])

    /**
     * The host's managed projects directory is the source of truth for what the
     * studio (and the agent) can work on; the local list only adds remembered
     * folders the user picked themselves.
     */
    const refreshManaged = useCallback(async () => {
        if (!capability) return
        try {
            setManaged(await capability.dev.list())
        } catch (cause) {
            setError(String((cause as Error)?.message ?? cause))
        }
    }, [capability])

    useEffect(() => {
        void refreshManaged()
    }, [refreshManaged])

    /* ---- hot reload ------------------------------------------------------ */

    const handleBuild = useCallback(
        async (next: DevSessionStatus) => {
            if (next.root !== selectedRoot) return
            setStatus(next)
            setError(null)
            if (autoInstall) {
                try {
                    await installBundle(next)
                } catch (cause) {
                    setError(t('pluginStudio.autoInstallFailed', { message: String((cause as Error)?.message ?? cause) }))
                }
            }
            const entries = await capability?.dev.logs({ root: next.root, limit: 120 })
            if (entries) setLogs(entries)
        },
        [autoInstall, capability, installBundle, selectedRoot, t],
    )

    useBuildEvents(handleBuild)

    /* ---- actions --------------------------------------------------------- */

    const runAction = async (kind: Busy, action: () => Promise<void>) => {
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

    const createProject = async () => {
        await runAction('start', async () => {
            if (!capability) throw new Error(t('pluginStudio.unsupported'))
            const name = scaffoldName.trim()
            if (!name) throw new Error(t('pluginStudio.nameRequired'))

            // No folder dialog: the host creates the project in its own managed
            // directory, which is what lets an agent do this on its own too.
            const created = await capability.dev.scaffold({
                name,
                displayName: scaffoldDisplayName.trim() || name,
            })
            addProject({ root: created.root, label: name, pluginKey: created.pluginKey })
            setSelectedRoot(created.root)
            setScaffoldOpen(false)
            await refreshManaged()
            const next = await capability.dev.start({ root: created.root, watch: true })
            setStatus(next)
            if (autoInstall && next.build) await installBundle(next)
        })
    }

    /** Put an existing on-disk project folder under the studio. */
    const addExistingProject = async () => {
        const folder = await pickDirectory(t('pluginStudio.pickFolderTitle'))
        if (!folder) return
        addProject({ root: folder, label: folder.split(/[\\/]/).filter(Boolean).pop() || folder })
        setSelectedRoot(folder)
    }

    const startWatching = () =>
        runAction('start', async () => {
            if (!capability || !selectedRoot) throw new Error(t('pluginStudio.selectFirst'))
            const next = await capability.dev.start({ root: selectedRoot, watch: true })
            setStatus(next)
            if (autoInstall && next.build) await installBundle(next)
        })

    const stopWatching = () =>
        runAction('stop', async () => {
            if (!capability || !selectedRoot) return
            await capability.dev.stop({ root: selectedRoot })
            await refreshStatus()
        })

    const buildOnce = () =>
        runAction('build', async () => {
            if (!capability || !selectedRoot) throw new Error(t('pluginStudio.selectFirst'))
            const next = await capability.dev.build({ root: selectedRoot })
            setStatus(next)
            if (next.build) await installBundle(next)
        })

    const installNow = () =>
        runAction('install', async () => {
            if (!status) throw new Error(t('pluginStudio.noBuildYet'))
            const activated = await installBundle(status)
            if (!activated) throw new Error(t('pluginStudio.installRejected'))
        })

    /* ---- capability fallbacks ------------------------------------------- */

    if (!isDesktop) {
        return (
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm">{t('pluginStudio.desktopOnlyTitle')}</CardTitle>
                    <CardDescription className="text-xs">{t('pluginStudio.desktopOnly')}</CardDescription>
                </CardHeader>
            </Card>
        )
    }

    if (!capability) {
        return (
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                        <TriangleAlert className="h-4 w-4 text-amber-500" />
                        <CardTitle className="text-sm">{t('pluginStudio.missingDevTitle')}</CardTitle>
                    </div>
                    <CardDescription className="text-xs">{t('pluginStudio.missingDev')}</CardDescription>
                </CardHeader>
            </Card>
        )
    }

    /* ---- main panel ------------------------------------------------------ */

    const watching = status?.state === 'watching'

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <div className="rounded-lg bg-primary/10 p-1.5">
                                <Wrench className="h-3.5 w-3.5 text-primary" />
                            </div>
                            <div>
                                <CardTitle className="text-sm">{t('pluginStudio.title')}</CardTitle>
                                <CardDescription className="text-xs">{t('pluginStudio.subtitle')}</CardDescription>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button size="sm" variant="ghost" onClick={addExistingProject}>
                                <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                                {t('pluginStudio.addExisting')}
                            </Button>
                            <Button size="sm" onClick={() => setScaffoldOpen(true)}>
                                <Plus className="mr-1.5 h-3.5 w-3.5" />
                                {t('pluginStudio.newProjectLong')}
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {projects.length === 0 ? (
                        <div className="rounded-lg border border-dashed p-6 text-center">
                            <Boxes className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
                            <p className="text-sm font-medium">{t('pluginStudio.emptyTitle')}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{t('pluginStudio.emptyHint')}</p>
                            <Button className="mt-3" size="sm" onClick={() => setScaffoldOpen(true)}>
                                <Plus className="mr-1.5 h-3.5 w-3.5" />
                                {t('pluginStudio.newProjectLong')}
                            </Button>
                        </div>
                    ) : (
                        <div className="grid gap-3 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
                            {/* project list */}
                            <div className="space-y-1.5">
                                {managed.length > 0 && (
                                    <p className="px-1 pt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                                        {t('pluginStudio.managedGroup')}
                                    </p>
                                )}
                                {managed.map((project) => (
                                    <button
                                        key={project.root}
                                        type="button"
                                        onClick={() => {
                                            addProject({
                                                root: project.root,
                                                label: project.displayName || project.name,
                                                pluginKey: project.pluginKey,
                                            })
                                            setSelectedRoot(project.root)
                                        }}
                                        className={cn(
                                            'w-full rounded-lg border px-3 py-2 text-left transition-colors',
                                            project.root === selectedRoot
                                                ? 'border-primary bg-primary/5'
                                                : 'border-transparent hover:bg-accent',
                                        )}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="truncate text-sm font-medium">
                                                {project.displayName || project.name}
                                            </span>
                                            {project.active && (
                                                <Badge variant="secondary" className="text-[10px]">
                                                    watching
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="truncate text-[11px] text-muted-foreground">
                                            {project.pluginKey || project.root}
                                        </div>
                                    </button>
                                ))}
                                {managed.length > 0 && projects.length > 0 && (
                                    <p className="px-1 pt-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                                        {t('pluginStudio.addedGroup')}
                                    </p>
                                )}
                                {projects.map((project: StudioProject) => (
                                    <button
                                        key={project.root}
                                        type="button"
                                        onClick={() => {
                                            setSelectedRoot(project.root)
                                            touchProject(project.root)
                                        }}
                                        className={cn(
                                            'w-full rounded-lg border px-3 py-2 text-left transition-colors',
                                            project.root === selectedRoot
                                                ? 'border-primary bg-primary/5'
                                                : 'border-transparent hover:bg-accent',
                                        )}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="truncate text-sm font-medium">{project.label}</span>
                                            {project.root === selectedRoot && status && (
                                                <span className={cn('text-[10px]', stateTone(status.state))}>
                                                    {stateLabel(status.state)}
                                                </span>
                                            )}
                                        </div>
                                        <div className="truncate text-[11px] text-muted-foreground">{project.root}</div>
                                    </button>
                                ))}
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="w-full justify-start text-xs"
                                    onClick={() => setScaffoldOpen(true)}
                                >
                                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                                    {t('pluginStudio.newProjectLong')}
                                </Button>
                            </div>

                            {/* selected project detail */}
                            <div className="space-y-3">
                                {selected && (
                                    <>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Button
                                                size="sm"
                                                onClick={watching ? stopWatching : startWatching}
                                                disabled={busy !== null}
                                            >
                                                {busy === 'start' ? (
                                                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                                ) : watching ? (
                                                    <Square className="mr-1.5 h-3.5 w-3.5" />
                                                ) : (
                                                    <Play className="mr-1.5 h-3.5 w-3.5" />
                                                )}
                                                {watching ? t('pluginStudio.stopWatching') : t('pluginStudio.startWatching')}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={buildOnce}
                                                disabled={busy !== null}
                                            >
                                                <RefreshCw
                                                    className={cn(
                                                        'mr-1.5 h-3.5 w-3.5',
                                                        busy === 'build' && 'animate-spin',
                                                    )}
                                                />
                                                {t('pluginStudio.buildOnce')}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={installNow}
                                                disabled={busy !== null || !status?.build}
                                            >
                                                <Upload className="mr-1.5 h-3.5 w-3.5" />
                                                {t('pluginStudio.installNow')}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => {
                                                    removeProject(selected.root)
                                                    setSelectedRoot(undefined)
                                                }}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                                            <label className="flex items-center gap-2">
                                                <Switch
                                                    checked={autoInstall}
                                                    onCheckedChange={setAutoInstall}
                                                />
                                                {t('pluginStudio.autoInstall')}
                                            </label>
                                            {status?.plugin?.pluginKey && (
                                                <span className="text-muted-foreground">
                                                    {t('pluginStudio.pluginKeyLabel')}
                                                    <code className="rounded bg-muted px-1 py-0.5">
                                                        {status.plugin.pluginKey}
                                                    </code>
                                                </span>
                                            )}
                                            {status?.build && (
                                                <span className="text-muted-foreground">
                                                    #{status.buildCount} · {formatBytes(status.build.bytes)} ·{' '}
                                                    {status.build.durationMs}ms
                                                </span>
                                            )}
                                            {status?.watching && (
                                                <Badge variant="secondary" className="gap-1 text-[10px]">
                                                    <CheckCircle2 className="h-3 w-3" />
                                                    {t('pluginStudio.state.watching')}
                                                </Badge>
                                            )}
                                        </div>

                                        {status?.build?.modules?.length ? (
                                            <p className="truncate text-[11px] text-muted-foreground">
                                                {t('pluginStudio.modulesLabel')}
                                                {status.build.modules.join(', ')}
                                            </p>
                                        ) : null}

                                        {status?.error && (
                                            <pre className="max-h-40 overflow-auto rounded-md bg-destructive/10 p-2 text-[11px] text-destructive">
                                                {status.error}
                                            </pre>
                                        )}
                                        {error && (
                                            <pre className="max-h-40 overflow-auto rounded-md bg-destructive/10 p-2 text-[11px] text-destructive">
                                                {error}
                                            </pre>
                                        )}

                                        <Separator />

                                        <div>
                                            <div className="mb-1.5 flex items-center justify-between">
                                                <span className="text-xs font-medium">
                                                    {t('pluginStudio.buildLogs')}
                                                </span>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 text-[11px]"
                                                    onClick={() => void refreshStatus()}
                                                >
                                                    {t('pluginStudio.refresh')}
                                                </Button>
                                            </div>
                                            <ScrollArea className="h-40 rounded-md border">
                                                <div className="space-y-0.5 p-2 font-mono text-[11px] leading-relaxed">
                                                    {logs.length === 0 ? (
                                                        <p className="text-muted-foreground">
                                                            {t('pluginStudio.noLogs')}
                                                        </p>
                                                    ) : (
                                                        logs.map((entry, index) => (
                                                            <div
                                                                key={entry.at + '-' + index}
                                                                className={cn(
                                                                    entry.level === 'error' && 'text-destructive',
                                                                    entry.level === 'warn' &&
                                                                        'text-amber-600 dark:text-amber-400',
                                                                )}
                                                            >
                                                                {entry.message}
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </ScrollArea>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm">{t('pluginStudio.conventionsTitle')}</CardTitle>
                    <CardDescription className="text-xs">
                        <Trans
                            i18nKey="pluginStudio.conventions"
                            components={{ code: <code />, br: <br /> }}
                        />
                    </CardDescription>
                </CardHeader>
            </Card>

            <Dialog open={scaffoldOpen} onOpenChange={setScaffoldOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-base">{t('pluginStudio.createTitle')}</DialogTitle>
                        <DialogDescription className="text-xs">{t('pluginStudio.emptyHint')}</DialogDescription>
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
                    </div>
                    <DialogFooter>
                        <Button variant="outline" size="sm" onClick={() => setScaffoldOpen(false)}>
                            {t('pluginStudio.cancel')}
                        </Button>
                        <Button size="sm" onClick={createProject} disabled={busy !== null}>
                            {t('pluginStudio.createAndStart')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
