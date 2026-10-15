/**
 * Plugin Studio — conversation cards for its tool results.
 *
 * These render INSIDE the kernel chat (plugin-ai's transcript), which is outside
 * the studio's own DOM scope: the studio's scoped stylesheet
 * (`[data-kn-plugin="PluginStudio"]`) does not reach here. Only host-wide
 * utilities are used, exactly like `plugin-main`'s `PageArtifactCard`, and
 * `@kn/ui` components are the host's own.
 *
 * The kernel renders a card only when the plugin registered one; returning null
 * hands the step back to the generic JSON block, which is the right answer for
 * a result this card does not understand (an older host, a thrown error).
 */
import React from 'react'
import { Button } from '@kn/ui'
import { CheckCircle2, FileCode2, Loader2, PanelRight, TriangleAlert, Upload, Wrench } from '@kn/icon'
import {
    useBackgroundTask,
    useTranslation,
    type AgentToolResultProps,
    type BackgroundTaskView,
} from '@kn/common'
import { formatBytes } from '../studio-service'
import {
    baseName,
    readBackgroundAck,
    readBuildView,
    readIconView,
    readProjectView,
    type StudioArtifact,
    type StudioBackgroundAck,
} from './surface'

/** Inline SVG as a data URL — no `dangerouslySetInnerHTML` for generated art. */
export const svgDataUrl = (svg: string): string =>
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

/** The studio's cards open the artifact the tool's mapper produced. */
const asStudioArtifact = (artifact: AgentToolResultProps['artifact']): StudioArtifact | null =>
    artifact && typeof artifact.id === 'string' ? (artifact as StudioArtifact) : null

/**
 * A build that is still running in the background (`background: true`).
 *
 * Its card cannot show numbers yet — there are none — so it shows the task's
 * state instead, live from the task board: progress while it runs, why it
 * stopped if it was cancelled, and always the way into the artifact, which is
 * already the conversation's working target.
 */
const BackgroundBuildCard: React.FC<{
    ack: StudioBackgroundAck
    task?: BackgroundTaskView
    artifact: AgentToolResultProps['artifact']
    openArtifact: AgentToolResultProps['openArtifact']
}> = ({ ack, task, artifact, openArtifact }) => {
    const { t } = useTranslation()
    const target = asStudioArtifact(artifact)
    const title = ack.title ?? baseName(ack.root)
    const cancelled = task?.status === 'cancelled'
    const label = cancelled
        ? t('pluginStudio.artifact.backgroundCancelled')
        : task
            ? t('pluginStudio.artifact.backgroundRunning')
            : t('pluginStudio.artifact.backgroundDetached')
    const tone = cancelled
        ? 'border-destructive/30 bg-destructive/5 text-destructive'
        : 'border-border/60 bg-card/40 text-muted-foreground'

    return (
        <div className={`mt-1.5 ml-[22px] rounded-lg border p-2 ${tone}`}>
            <div className="flex items-center gap-2">
                {cancelled ? (
                    <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                ) : task ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                ) : (
                    <Wrench className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{title}</span>
                <span className="shrink-0 text-[10.5px]">{label}</span>
                {target ? (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 shrink-0 gap-1 px-2 text-[11px]"
                        onClick={() => openArtifact(target)}
                    >
                        <PanelRight className="h-3 w-3" />
                        {t('pluginStudio.artifact.openBeside')}
                    </Button>
                ) : null}
            </div>
            {task?.progress ? (
                <div className="mt-1 truncate font-mono text-[10.5px]">{task.progress}</div>
            ) : null}
        </div>
    )
}

/**
 * One successful build / run / publish.
 *
 * Read-only: the actions that mutate a project (watch, hot reload, stop) stay in
 * the studio panel, so a chat card can never start a child process by accident.
 *
 * A `background: true` call lands here too: its result is a handle, so the card
 * follows the task and renders the build the moment the task produces one.
 */
export const PluginBuildCard: React.FC<AgentToolResultProps> = ({ result, args, artifact, openArtifact }) => {
    const { t } = useTranslation()
    const ack = readBackgroundAck(result, args)
    const task = useBackgroundTask(ack?.taskId)

    // Foreground: the result IS the build. Background: the handle is, until the
    // task settles — and then the task's own result is.
    const effective = ack
        ? task?.status === 'succeeded'
            ? task.result
            : task?.status === 'failed'
                ? { ok: false, root: ack.root, error: task.error }
                : null
        : result
    const view = readBuildView(effective, args)
    if (!view) {
        return ack ? (
            <BackgroundBuildCard ack={ack} task={task} artifact={artifact} openArtifact={openArtifact} />
        ) : null
    }

    const target = asStudioArtifact(artifact)
    const title = view.name ?? view.pluginKey ?? baseName(view.root)

    if (!view.ok) {
        return (
            <div className="mt-1.5 ml-[22px] rounded-lg border border-destructive/30 bg-destructive/5 p-2">
                <div className="flex items-center gap-2">
                    <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-destructive" />
                    <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-destructive">
                        {t('pluginStudio.artifact.buildFailed', { name: title })}
                    </span>
                </div>
                {view.error ? (
                    <pre className="mt-1.5 max-h-28 overflow-auto whitespace-pre-wrap break-words font-mono text-[10.5px] leading-relaxed text-destructive">
                        {view.error}
                    </pre>
                ) : null}
            </div>
        )
    }

    return (
        <div className="mt-1.5 ml-[22px] rounded-lg border border-border/60 bg-card/40 p-2">
            <div className="flex items-center gap-2">
                <Wrench className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{title}</span>
                {view.installed ? (
                    <span className="flex shrink-0 items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" />
                        {t('pluginStudio.artifact.installed')}
                    </span>
                ) : null}
                {target ? (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 shrink-0 gap-1 px-2 text-[11px]"
                        onClick={() => openArtifact(target)}
                    >
                        <PanelRight className="h-3 w-3" />
                        {t('pluginStudio.artifact.openBeside')}
                    </Button>
                ) : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 font-mono text-[10.5px] tabular-nums text-muted-foreground">
                {view.pluginKey ? <span className="truncate">{view.pluginKey}</span> : null}
                {view.buildCount !== undefined ? <span>#{view.buildCount}</span> : null}
                {view.bytes !== undefined ? <span>{formatBytes(view.bytes)}</span> : null}
                {view.durationMs !== undefined ? <span>{view.durationMs}ms</span> : null}
                {view.moduleCount > 0 ? (
                    <span>{t('pluginStudio.artifact.moduleCount', { n: view.moduleCount })}</span>
                ) : null}
            </div>
            {view.published ? (
                <div className="mt-1 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                    <Upload className="h-3 w-3 shrink-0" />
                    <span className="truncate">
                        {view.published.mode === 'version'
                            ? t('pluginStudio.artifact.publishedVersion', { version: view.published.version ?? '' })
                            : t('pluginStudio.artifact.submitted')}
                    </span>
                </div>
            ) : null}
        </div>
    )
}

/** One created project: where it lives and where to start editing. */
export const PluginProjectCard: React.FC<AgentToolResultProps> = ({ result, args, artifact, openArtifact }) => {
    const { t } = useTranslation()
    const view = readProjectView(result, args)
    if (!view) return null

    const target = asStudioArtifact(artifact)
    const title = view.displayName ?? view.pluginKey ?? baseName(view.root)

    return (
        <div className="mt-1.5 ml-[22px] rounded-lg border border-border/60 bg-card/40 p-2">
            <div className="flex items-center gap-2">
                <FileCode2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{title}</span>
                {target ? (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 shrink-0 gap-1 px-2 text-[11px]"
                        onClick={() => openArtifact(target)}
                    >
                        <PanelRight className="h-3 w-3" />
                        {t('pluginStudio.artifact.openBeside')}
                    </Button>
                ) : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10.5px] text-muted-foreground">
                <span className="truncate font-mono">{view.pluginKey ?? baseName(view.root)}</span>
                <span>{t(`pluginStudio.template.${view.template}`)}</span>
                <span>{t('pluginStudio.artifact.fileCount', { n: view.fileCount })}</span>
                {view.managed ? <span>{t('pluginStudio.artifact.managedBadge')}</span> : null}
            </div>
        </div>
    )
}

/** One generated icon: the artwork itself, plus how it was wired in. */
export const PluginIconCard: React.FC<AgentToolResultProps> = ({ result, artifact, openArtifact }) => {
    const { t } = useTranslation()
    const view = readIconView(result)
    if (!view) return null

    const target = asStudioArtifact(artifact)
    return (
        <div className="mt-1.5 ml-[22px] rounded-lg border border-border/60 bg-card/40 p-2">
            <div className="flex items-center gap-2">
                {view.svg ? (
                    <img
                        src={svgDataUrl(view.svg)}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded-md border border-border/50"
                    />
                ) : (
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border/50 text-base">
                        {view.glyph}
                    </span>
                )}
                <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-medium">{baseName(view.root)}</div>
                    <div className="truncate font-mono text-[10.5px] text-muted-foreground">
                        {view.relativePath}
                        {view.color ? ` · ${view.color}` : ''}
                    </div>
                </div>
                {target ? (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 shrink-0 gap-1 px-2 text-[11px]"
                        onClick={() => openArtifact(target)}
                    >
                        <PanelRight className="h-3 w-3" />
                        {t('pluginStudio.artifact.openBeside')}
                    </Button>
                ) : null}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                {view.railUpdated ? (
                    <>
                        <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        <span className="truncate">{t('pluginStudio.icon.railApplied')}</span>
                    </>
                ) : (
                    <span className="truncate">{t('pluginStudio.icon.railSkipped', { status: view.railStatus ?? '' })}</span>
                )}
            </div>
        </div>
    )
}
