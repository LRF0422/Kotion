/**
 * Plugin Studio — live preview of what a plugin actually contributes.
 *
 * The point of the preview is the reverse of a build log: instead of "how big is
 * the bundle", it answers "what does this plugin DO". So it renders the plugin's
 * own components, taken from the live plugin instance the host has active:
 *
 *   dockPanels[].component      → rendered here, in a box, with the plugin's CSS scope
 *   pageTypes[].renderer        → rendered with a synthetic read-only page
 *   settings.component          → rendered with the plugin's registry key
 *   editorExtensions / tools / skills / menus / routes → listed (nothing to render)
 *
 * Three details make this honest rather than approximate:
 *  - The instance comes from `usePluginState()`, which bumps on every plugin
 *    mutation — so a hot reload (the agent edits code → the studio installs the
 *    rebuild) re-renders the preview without any extra wiring.
 *  - Each live component is wrapped in `[data-kn-plugin="<pluginKey>"]`, the same
 *    attribute the dock host sets. That is what makes the plugin's injected,
 *    scoped stylesheet apply here too, instead of rendering an unstyled box.
 *  - Every component sits behind its own error boundary. The plugin under
 *    preview is BY DEFINITION work in progress; a crash must show up as one
 *    broken box, never as a dead conversation.
 */
import React from 'react'
import { PanelRight, TriangleAlert, Wrench } from '@kn/icon'
import {
    useDockPanels,
    usePluginState,
    useTranslation,
    type DockPanelConfig,
    type PageTypeConfig,
    type PluginSettingsConfig,
} from '@kn/common'

/* ------------------------------------------------------------------ *
 * Guards
 * ------------------------------------------------------------------ */

interface BoundaryProps {
    label: string
    children: React.ReactNode
}

/**
 * Isolates one previewed component. Local (not the kernel's card boundary)
 * because the pane host does NOT wrap artifact renderers, and a dev plugin that
 * throws during render would otherwise unmount the whole surface.
 */
class PreviewBoundary extends React.Component<BoundaryProps, { failed: boolean; message: string }> {
    state = { failed: false, message: '' }

    static getDerivedStateFromError(error: unknown): { failed: boolean; message: string } {
        return { failed: true, message: error instanceof Error ? error.message : String(error) }
    }

    render(): React.ReactNode {
        if (!this.state.failed) return this.props.children
        return (
            <div className="flex flex-col gap-1 p-2.5">
                <div className="flex items-center gap-1.5 text-[11px] text-destructive">
                    <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{this.props.label}</span>
                </div>
                <pre className="whitespace-pre-wrap break-words font-mono text-[10.5px] text-destructive/90">
                    {this.state.message}
                </pre>
            </div>
        )
    }
}

/** A titled frame for one rendered contribution. */
const PreviewBox: React.FC<{
    title: string
    meta?: string
    hint?: string
    height?: string
    children: React.ReactNode
}> = ({ title, meta, hint, height = 'h-[200px]', children }) => (
    <div className="overflow-hidden rounded-md border border-border/60">
        <div className="flex items-baseline gap-1.5 border-b border-border/50 bg-muted/30 px-2 py-1">
            <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{title}</span>
            {meta ? <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{meta}</span> : null}
        </div>
        {hint ? <div className="px-2 pt-1 text-[10px] text-muted-foreground">{hint}</div> : null}
        <div className={`${height} overflow-auto bg-background`}>{children}</div>
    </div>
)

/** A one-line contribution summary (nothing to render, but still "what it does"). */
const SummaryRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className="flex min-w-0 items-baseline gap-2">
        <span className="w-[64px] shrink-0 text-[10.5px] text-muted-foreground">{label}</span>
        <span className="min-w-0 flex-1 break-words text-[10.5px]">{value}</span>
    </div>
)

/* ------------------------------------------------------------------ *
 * Preview
 * ------------------------------------------------------------------ */

export interface PluginUiPreviewProps {
    /** Runtime plugin name (what the host installed it under). */
    name?: string
    /** Registry key, for the CSS scope and the fallback match by dock panel. */
    pluginKey?: string
}

/** Slash-menu entries of an editor extension, for the summary list. */
const slashLabels = (slash?: Array<{ slash?: string; text?: string; divider?: boolean; title?: string }>): string => {
    if (!Array.isArray(slash)) return ''
    return slash
        .map((entry) => (entry?.divider ? entry.title : entry?.slash || entry?.text))
        .filter((value): value is string => Boolean(value))
        .join('、')
}

export const PluginUiPreview: React.FC<PluginUiPreviewProps> = ({ name, pluginKey }) => {
    const { t } = useTranslation()
    const { plugins } = usePluginState()
    // The registry key lives in the manager's meta map, not on the instance, so
    // the dock resolver is the public way to go from key → runtime name. Only
    // needed when the artifact carries no name (e.g. focusing by id alone).
    const leftPanels = useDockPanels('left')
    const rightPanels = useDockPanels('right')
    const panels = React.useMemo(() => [...leftPanels, ...rightPanels], [leftPanels, rightPanels])
    const ownerByKey = pluginKey ? panels.find((panel) => panel.pluginKey === pluginKey)?.owner : undefined

    const plugin = React.useMemo(
        () => plugins.find((candidate) => candidate.name === name || candidate.name === ownerByKey),
        [plugins, name, ownerByKey],
    )

    if (!plugin) {
        return (
            <div className="rounded-md border border-dashed border-border/70 px-3 py-4 text-center text-[10.5px] leading-relaxed text-muted-foreground">
                {t('pluginStudio.preview.notRunning')}
            </div>
        )
    }

    const dockPanels: DockPanelConfig[] = plugin.dockPanels ?? []
    const pageTypes: PageTypeConfig[] = plugin.pageTypes ?? []
    const settings: PluginSettingsConfig | undefined = plugin.settings
    const editorExtensions = plugin.editorExtensions ?? []
    const tools = plugin.tools ?? []
    const skills = plugin.skills ?? []
    const menus = plugin.menus ?? []
    // Only `routes` is exposed on the instance; `globalRoutes` has no getter.
    const routes = plugin.routes ?? []
    // Services this plugin registers into the host registry: the callable
    // surface it adds for everyone else (names only — the contract lives in
    // @kn/common's `Services` interface).
    const services = Object.keys(plugin.services ?? {}).sort()
    const cssKey = pluginKey || name || plugin.name

    const hasAnything =
        dockPanels.length > 0
        || pageTypes.length > 0
        || Boolean(settings)
        || editorExtensions.length > 0
        || tools.length > 0
        || skills.length > 0
        || menus.length > 0
        || routes.length > 0
        || services.length > 0

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                <PanelRight className="h-3 w-3 shrink-0" />
                <span>{t('pluginStudio.preview.liveHint')}</span>
            </div>

            {/* Dock panels: the plugin's own UI, rendered for real. */}
            {dockPanels.map((panel) => (
                <PreviewBox
                    key={panel.id}
                    title={typeof panel.title === 'string' ? panel.title : panel.id}
                    meta={panel.position === 'left' ? t('pluginStudio.preview.left') : t('pluginStudio.preview.right')}
                >
                    <div data-kn-plugin={cssKey} className="h-full">
                        <PreviewBoundary label={t('pluginStudio.preview.crashed', { name: panel.id })}>
                            <panel.component close={() => undefined} />
                        </PreviewBoundary>
                    </div>
                </PreviewBox>
            ))}

            {/* Page types: a whole-page renderer, mounted with a read-only stub. */}
            {pageTypes.map((pageType) => {
                if (pageType.renderer?.type === 'editor-component') {
                    return (
                        <PreviewBox
                            key={pageType.id}
                            title={pageType.label}
                            meta={pageType.id}
                            height="h-auto"
                        >
                            <div className="px-2 py-2 text-[10.5px] text-muted-foreground">
                                {t('pluginStudio.preview.editorComponent')}
                            </div>
                        </PreviewBox>
                    )
                }
                const Renderer = pageType.renderer?.component
                if (!Renderer) return null
                const stubPage = {
                    id: pageType.id,
                    title: pageType.defaultTitle || pageType.label,
                    pageType: pageType.id,
                }
                return (
                    <PreviewBox
                        key={pageType.id}
                        title={pageType.label}
                        meta={t('pluginStudio.preview.page')}
                        height="h-[240px]"
                    >
                        <div data-kn-plugin={cssKey} className="h-full">
                            <PreviewBoundary label={t('pluginStudio.preview.crashed', { name: pageType.id })}>
                                {/* A page renderer expects real page data; the stub is
                                    enough for a layout preview and readOnly keeps a
                                    preview from writing anything. */}
                                <Renderer
                                    page={stubPage as never}
                                    pageId={pageType.id as never}
                                    spaceId={'' as never}
                                    active={false}
                                    readOnly
                                    mode="view"
                                />
                            </PreviewBoundary>
                        </div>
                    </PreviewBox>
                )
            })}

            {/* Settings panel. */}
            {settings ? (
                <PreviewBox title={settings.label} meta={t('pluginStudio.preview.settings')} height="h-auto">
                    <div data-kn-plugin={cssKey} className="h-full">
                        <PreviewBoundary label={t('pluginStudio.preview.crashed', { name: settings.key })}>
                            <settings.component pluginKey={cssKey} />
                        </PreviewBoundary>
                    </div>
                </PreviewBox>
            ) : null}

            {/* Everything without a renderable component: say what it is. */}
            {editorExtensions.map((extension) => {
                const slash = slashLabels(extension.slashConfig)
                const parts = [
                    slash ? t('pluginStudio.preview.slash', { list: slash }) : '',
                    extension.menuConfig ? t('pluginStudio.preview.toolbar') : '',
                    extension.bubbleMenu ? t('pluginStudio.preview.bubble') : '',
                    extension.pageFooter ? t('pluginStudio.preview.footer') : '',
                    extension.floatingUI ? t('pluginStudio.preview.floating') : '',
                ].filter(Boolean)
                return (
                    <SummaryRow
                        key={extension.name}
                        label={t('pluginStudio.preview.editor')}
                        value={`${extension.name}${parts.length ? ' — ' + parts.join('、') : ''}`}
                    />
                )
            })}
            {tools.length > 0 ? (
                <SummaryRow label={t('pluginStudio.preview.tools')} value={tools.map((tool) => tool.name).join('、')} />
            ) : null}
            {services.length > 0 ? (
                <SummaryRow
                    label={t('pluginStudio.preview.services')}
                    value={services.join('、')}
                />
            ) : null}
            {skills.length > 0 ? (
                <SummaryRow label={t('pluginStudio.preview.skills')} value={skills.map((skill) => skill.name).join('、')} />
            ) : null}
            {menus.length > 0 ? (
                <SummaryRow
                    label={t('pluginStudio.preview.menus')}
                    value={menus.map((menu) => menu.name ?? '').filter(Boolean).join('、')}
                />
            ) : null}
            {routes.length > 0 ? (
                <SummaryRow label={t('pluginStudio.preview.routes')} value={routes.map((route) => route.path).join('、')} />
            ) : null}
            {plugin.desktopOnly ? (
                <SummaryRow label={t('pluginStudio.preview.desktop')} value={t('pluginStudio.preview.desktopOnly')} />
            ) : null}

            {!hasAnything ? (
                <div className="flex items-start gap-1.5 rounded-md border border-dashed border-border/70 px-2.5 py-2 text-[10.5px] leading-relaxed text-muted-foreground">
                    <Wrench className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>{t('pluginStudio.preview.nothing')}</span>
                </div>
            ) : null}
        </div>
    )
}
