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
import { CheckCircle2, FileCode2, PanelRight, TriangleAlert, Upload, Wrench } from '@kn/icon'
import { useTranslation, type AgentToolResultProps } from '@kn/common'
import { formatBytes } from '../studio-service'
import { baseName, readBuildView, readProjectView, type StudioArtifact } from './surface'

/** The studio's cards open the artifact the tool's mapper produced. */
const asStudioArtifact = (artifact: AgentToolResultProps['artifact']): StudioArtifact | null =>
    artifact && typeof artifact.id === 'string' ? (artifact as StudioArtifact) : null

/**
 * One successful build / run / publish.
 *
 * Read-only: the actions that mutate a project (watch, hot reload, stop) stay in
 * the studio panel, so a chat card can never start a child process by accident.
 */
export const PluginBuildCard: React.FC<AgentToolResultProps> = ({ result, args, artifact, openArtifact }) => {
    const { t } = useTranslation()
    const view = readBuildView(result, args)
    if (!view) return null

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
