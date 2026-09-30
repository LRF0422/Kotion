/**
 * Plugin Studio — the side-pane view for a generated plugin icon.
 *
 * Small on purpose: an icon artifact is one image plus how it was wired in. Two
 * paths reach it, exactly like the other studio kinds:
 *
 *  - the shelf / a card opens the artifact the mapper produced, whose `data`
 *    carries the SVG (so nothing is read back from disk);
 *  - `focusArtifact({ kind: 'plugin-icon', id: <root> })` carries no payload, so
 *    the pane falls back to reading the manifest's declared icon from the dev
 *    bridge — the file `generatePluginIcon` wrote.
 */
import React, { useEffect, useState } from 'react'
import { useTranslation, type AgentArtifactProps } from '@kn/common'
import { useDevCapability } from '../studio-service'
import { readArtifactSnapshot } from './surface'
import { svgDataUrl } from './cards'

/** Read the project's declared icon file when the artifact carries no payload. */
const useFallbackArtwork = (root: string | undefined, hasPayload: boolean) => {
    const capability = useDevCapability()
    const [svg, setSvg] = useState<string | undefined>()
    const [path, setPath] = useState<string | undefined>()

    useEffect(() => {
        let cancelled = false
        setSvg(undefined)
        setPath(undefined)
        if (!capability || !root || hasPayload) return () => { cancelled = true }
        void (async () => {
            try {
                const manifest = JSON.parse(await capability.dev.readFile({ path: `${root}/package.json` })) as {
                    knPluginStudio?: { icon?: unknown }
                    knPlugin?: { icon?: unknown }
                }
                const declared = manifest?.knPluginStudio?.icon ?? manifest?.knPlugin?.icon
                if (typeof declared !== 'string' || !declared || /^(https?:|data:)/i.test(declared)) return
                const text = await capability.dev.readFile({ path: `${root}/${declared.replace(/^[\\/]+/, '')}` })
                if (cancelled) return
                setSvg(text)
                setPath(declared)
            } catch {
                // No declared icon (or no session): the pane says so instead.
            }
        })()
        return () => { cancelled = true }
    }, [capability, root, hasPayload])

    return { svg, path }
}

export const PluginIconPane: React.FC<AgentArtifactProps> = ({ artifact }) => {
    const { t } = useTranslation()
    const snapshot = readArtifactSnapshot(artifact)
    const icon = snapshot?.icon
    const fallback = useFallbackArtwork(snapshot?.root, Boolean(icon?.svg))
    const svg = icon?.svg ?? fallback.svg
    const relativePath = icon?.relativePath ?? fallback.path

    if (!snapshot) return null

    return (
        <div className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-3 text-xs">
            <div className="flex items-center gap-3">
                {svg ? (
                    <img
                        src={svgDataUrl(svg)}
                        alt=""
                        className="h-16 w-16 shrink-0 rounded-xl border border-border/50"
                    />
                ) : (
                    <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl border border-border/50 text-3xl">
                        {icon?.glyph ?? '🎨'}
                    </span>
                )}
                <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-medium">{artifact.title ?? snapshot.root}</div>
                    <div className="truncate font-mono text-[10.5px] text-muted-foreground">
                        {relativePath ?? snapshot.root}
                    </div>
                    {icon?.color ? (
                        <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                            <span
                                className="h-3 w-3 shrink-0 rounded-sm border border-border/50"
                                style={{ background: icon.color }}
                            />
                            <span className="font-mono">{icon.color}</span>
                        </div>
                    ) : null}
                </div>
            </div>

            <div className="space-y-1 rounded-md border border-border/60 bg-muted/20 p-2">
                <div className="flex items-baseline gap-2">
                    <span className="w-[74px] shrink-0 text-[10.5px] text-muted-foreground">
                        {t('pluginStudio.icon.glyph')}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[10.5px]">
                        {icon?.glyph ?? '—'}
                        {icon?.isInitial ? ` · ${t('pluginStudio.icon.initial')}` : ''}
                    </span>
                </div>
                <div className="flex items-baseline gap-2">
                    <span className="w-[74px] shrink-0 text-[10.5px] text-muted-foreground">
                        {t('pluginStudio.icon.manifest')}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[10.5px]">
                        {icon?.previousIcon ? `${icon.previousIcon} → ${relativePath ?? ''}` : (relativePath ?? '—')}
                    </span>
                </div>
                <div className="flex items-baseline gap-2">
                    <span className="w-[74px] shrink-0 text-[10.5px] text-muted-foreground">
                        {t('pluginStudio.icon.rail')}
                    </span>
                    <span className="min-w-0 flex-1 text-[10.5px]">
                        {icon?.railUpdated
                            ? t('pluginStudio.icon.railApplied')
                            : t('pluginStudio.icon.railSkipped', { status: icon?.railStatus ?? '—' })}
                    </span>
                </div>
            </div>

            {icon && !icon.railUpdated && icon.railSnippet ? (
                <div className="space-y-1">
                    <div className="text-[10.5px] text-muted-foreground">{t('pluginStudio.icon.snippetHint')}</div>
                    <pre className="overflow-auto whitespace-pre-wrap break-words rounded-md border border-border/60 bg-muted/20 p-2 font-mono text-[10.5px]">
                        {icon.railSnippet}
                    </pre>
                </div>
            ) : null}

            <p className="text-[10.5px] leading-relaxed text-muted-foreground/80">
                {t('pluginStudio.icon.publishHint')}
            </p>
        </div>
    )
}
