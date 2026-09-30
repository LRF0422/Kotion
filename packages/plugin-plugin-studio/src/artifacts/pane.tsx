/**
 * Plugin Studio — the artifact's side-pane view.
 *
 * Primary content is a LIVE preview of the plugin itself
 * ({@link PluginUiPreview}): its dock panel / page type / settings component
 * rendered for real, plus a summary of the contributions that have no UI. The
 * build metadata (size, modules, logs) sits underneath, because "what does this
 * plugin do" is the question the pane exists to answer.
 *
 * Two entry points reach it:
 *  - the artifacts shelf / a conversation card opens the artifact the tool's
 *    mapper produced, which carries a small snapshot in `artifact.data`;
 *  - the model calls the host's `focusArtifact({ kind, id })`, which reconstructs
 *    a bare artifact with no payload.
 *
 * So the pane renders the snapshot AND live-loads the project's session from the
 * dev bridge, keyed by the artifact id (the project root). That makes the
 * artifact a real working target: focusing "the plugin I'm building" shows what
 * it does right now, and both the preview and the state update as the watcher
 * rebuilds and the studio hot-installs.
 *
 * Read-only by design: actions that spawn or stop a build live in the studio
 * panel, so a preview can never start a child process.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { ScrollArea } from '@kn/ui'
import { FileCode2, TriangleAlert, Upload, Wrench } from '@kn/icon'
import {
    useTranslation,
    type AgentArtifactProps,
    type DevLogEntry,
    type DevSessionStatus,
} from '@kn/common'
import { useBuildEvents, useDevCapability, formatBytes } from '../studio-service'
import { PluginUiPreview } from './PluginUiPreview'
import {
    PLUGIN_BUILD_KIND,
    readArtifactSnapshot,
    type StudioArtifactSnapshot,
} from './surface'

const MAX_LISTED_MODULES = 12
const MAX_LISTED_FILES = 16
const MAX_LISTED_LOGS = 8

const stateKey = (state: string | undefined, watching: boolean | undefined): string => {
    if (state === 'failed') return 'pluginStudio.state.failed'
    if (watching || state === 'watching') return 'pluginStudio.state.watching'
    if (state === 'starting') return 'pluginStudio.state.starting'
    if (state === 'stopped') return 'pluginStudio.state.stopped'
    return 'pluginStudio.state.idle'
}

const stateTone = (state: string | undefined, watching: boolean | undefined): string => {
    if (state === 'failed') return 'text-destructive'
    if (watching || state === 'watching') return 'text-emerald-600 dark:text-emerald-400'
    return 'text-muted-foreground'
}

/** One `label: value` pair in the build section. */
const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="flex min-w-0 items-baseline gap-2">
        <span className="w-[74px] shrink-0 text-[10.5px] text-muted-foreground">{label}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] tabular-nums">{children}</span>
    </div>
)

const ModuleList: React.FC<{ title: string; items: string[]; total: number; max: number }> = ({
    title,
    items,
    total,
    max,
}) => {
    if (total === 0) return null
    const shown = items.slice(0, max)
    return (
        <div className="space-y-0.5">
            <div className="text-[10.5px] text-muted-foreground">
                {title}
                <span className="ml-1 tabular-nums">({total})</span>
            </div>
            <div className="space-y-0.5">
                {shown.map((item) => (
                    <div key={item} className="truncate font-mono text-[10.5px] text-muted-foreground">
                        {item}
                    </div>
                ))}
                {total > shown.length ? (
                    <div className="text-[10.5px] text-muted-foreground/70">+{total - shown.length}</div>
                ) : null}
            </div>
        </div>
    )
}

export const PluginArtifactPane: React.FC<AgentArtifactProps> = ({ artifact }) => {
    const { t } = useTranslation()
    const capability = useDevCapability()
    const snapshot: StudioArtifactSnapshot | null = readArtifactSnapshot(artifact)
    const root = snapshot?.root

    const [status, setStatus] = useState<DevSessionStatus | undefined>()
    const [logs, setLogs] = useState<DevLogEntry[]>([])

    const refreshLogs = useCallback(async () => {
        if (!capability || !root) return
        try {
            setLogs(await capability.dev.logs({ root, limit: 30 }))
        } catch {
            // Best-effort: the pane still shows the snapshot and the status.
        }
    }, [capability, root])

    useEffect(() => {
        let cancelled = false
        setStatus(undefined)
        setLogs([])
        if (!capability || !root) return () => { cancelled = true }
        void (async () => {
            try {
                const [statuses, entries] = await Promise.all([
                    capability.dev.status({ root }),
                    capability.dev.logs({ root, limit: 30 }),
                ])
                if (cancelled) return
                setStatus(statuses[0])
                setLogs(entries)
            } catch {
                // No session for this project yet — the snapshot is all we have.
            }
        })()
        return () => { cancelled = true }
    }, [capability, root])

    const onBuild = useCallback(
        (next: DevSessionStatus) => {
            if (next.root !== root) return
            setStatus(next)
            void refreshLogs()
        },
        [root, refreshLogs],
    )
    useBuildEvents(onBuild, root)

    if (!snapshot || !root) return null

    const isBuild = artifact.kind === PLUGIN_BUILD_KIND
    const live = status?.build
    const bytes = live?.bytes ?? snapshot.bytes
    const durationMs = live?.durationMs ?? snapshot.durationMs
    const buildCount = status?.buildCount ?? snapshot.buildCount
    const modules = live?.modules?.length ? live.modules : snapshot.modules
    const moduleCount = live?.modules?.length ? live.modules.length : snapshot.moduleCount
    const watching = status?.watching
    const error = status?.error
    const title =
        snapshot.name ?? snapshot.displayName ?? snapshot.pluginKey ?? artifact.title ?? root
    /** The runtime name the host installed the dev plugin under. */
    const pluginName = status?.plugin?.name ?? snapshot.name ?? snapshot.displayName
    const pluginKey = snapshot.pluginKey

    return (
        <div className="flex h-full min-h-0 flex-col gap-2.5 overflow-hidden p-3 text-xs">
            <div className="flex shrink-0 items-start gap-2">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                    {isBuild ? <Wrench className="h-3 w-3" /> : <FileCode2 className="h-3 w-3" />}
                </span>
                <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-medium">{title}</div>
                    <div className="truncate text-[10.5px] text-muted-foreground">
                        {pluginKey ?? root}
                    </div>
                </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-70 ${stateTone(status?.state, watching)}`} />
                <span className={stateTone(status?.state, watching)}>
                    {status ? t(stateKey(status.state, watching)) : t('pluginStudio.artifact.noSession')}
                </span>
                {watching ? <span className="text-[10.5px] text-muted-foreground">· {t('pluginStudio.artifact.watching')}</span> : null}
            </div>

            {error ? (
                <pre className="max-h-32 shrink-0 overflow-auto whitespace-pre-wrap break-words rounded-md border border-destructive/20 bg-destructive/5 p-2 font-mono text-[10.5px] leading-relaxed text-destructive">
                    {error}
                </pre>
            ) : null}

            <ScrollArea className="min-h-0 flex-1">
                <div className="space-y-3 pr-1">
                    {/* What the plugin does — the reason this pane exists. */}
                    <PluginUiPreview name={pluginName} pluginKey={pluginKey} />

                    {/* How it was built — secondary, but the dev loop needs it. */}
                    <div className="space-y-1.5">
                        <div className="text-[10.5px] font-medium text-muted-foreground">
                            {t('pluginStudio.artifact.build')}
                        </div>
                        <div className="space-y-1 rounded-md border border-border/60 bg-muted/20 p-2">
                            {isBuild ? (
                                <>
                                    {buildCount !== undefined ? <Row label={t('pluginStudio.artifact.build')}>#{buildCount}</Row> : null}
                                    {bytes !== undefined ? <Row label={t('pluginStudio.artifact.size')}>{formatBytes(bytes)}</Row> : null}
                                    {durationMs !== undefined ? <Row label={t('pluginStudio.artifact.time')}>{durationMs}ms</Row> : null}
                                    <Row label={t('pluginStudio.artifact.modules')}>{moduleCount}</Row>
                                    <Row label={t('pluginStudio.artifact.hotReload')}>
                                        {snapshot.installed || status?.build ? t('pluginStudio.artifact.installed') : '—'}
                                    </Row>
                                    {snapshot.published ? (
                                        <Row label={t('pluginStudio.artifact.published')}>
                                            {snapshot.published.version ?? snapshot.published.mode}
                                        </Row>
                                    ) : null}
                                </>
                            ) : (
                                <>
                                    <Row label={t('pluginStudio.templateLabel')}>
                                        {t(`pluginStudio.template.${snapshot.template ?? 'panel'}`)}
                                    </Row>
                                    <Row label={t('pluginStudio.artifact.files')}>{snapshot.fileCount}</Row>
                                    <Row label={t('pluginStudio.artifact.managed')}>
                                        {snapshot.managed ? t('pluginStudio.artifact.managedBadge') : '—'}
                                    </Row>
                                </>
                            )}
                            <Row label={t('pluginStudio.artifact.path')}>
                                <span title={root}>{root}</span>
                            </Row>
                        </div>

                        <ModuleList
                            title={isBuild ? t('pluginStudio.artifact.moduleList') : t('pluginStudio.artifact.files')}
                            items={isBuild ? modules : snapshot.files}
                            total={isBuild ? moduleCount : snapshot.fileCount}
                            max={isBuild ? MAX_LISTED_MODULES : MAX_LISTED_FILES}
                        />

                        {logs.length > 0 ? (
                            <div className="space-y-0.5">
                                <div className="text-[10.5px] text-muted-foreground">{t('pluginStudio.buildLogs')}</div>
                                {logs.slice(-MAX_LISTED_LOGS).map((entry, index) => (
                                    <div
                                        key={entry.at + '-' + index}
                                        className={
                                            entry.level === 'error'
                                                ? 'text-destructive'
                                                : entry.level === 'warn'
                                                  ? 'text-amber-600 dark:text-amber-400'
                                                  : 'text-muted-foreground'
                                        }
                                    >
                                        <span className="break-words font-mono text-[10.5px]">{entry.message}</span>
                                    </div>
                                ))}
                            </div>
                        ) : null}
                    </div>
                </div>
            </ScrollArea>

            {!capability ? (
                <div className="flex shrink-0 items-start gap-1.5 text-[10.5px] text-muted-foreground">
                    <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>{t('pluginStudio.artifact.desktopOnlyHint')}</span>
                </div>
            ) : (
                <div className="shrink-0 text-[10.5px] text-muted-foreground/80">
                    {t('pluginStudio.artifact.paneHint')}
                </div>
            )}

            {snapshot.published ? (
                <div className="flex shrink-0 items-center gap-1.5 text-[10.5px] text-muted-foreground">
                    <Upload className="h-3 w-3 shrink-0" />
                    <span className="truncate">
                        {snapshot.published.mode === 'version'
                            ? t('pluginStudio.artifact.publishedVersion', { version: snapshot.published.version ?? '' })
                            : t('pluginStudio.artifact.submitted')}
                    </span>
                </div>
            ) : null}
        </div>
    )
}
