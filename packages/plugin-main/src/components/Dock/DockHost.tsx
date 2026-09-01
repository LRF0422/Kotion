import React from "react"
import {
    DockPosition,
    ResolvedDockPanel,
    dockRuntime,
    useTranslation,
    DOCK_PANEL_RUNNING,
    event,
} from "@kn/common"
import {
    Button,
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
    cn,
    useResponsive,
} from "@kn/ui"
import { X } from "@kn/icon"
import { useDockState } from "./use-dock-state"

export interface DockHostProps {
    /** Which edge the dock sits on. Only 'right' is wired into the workspace today. */
    position?: DockPosition
    spaceId?: string
    /** Active page tab; panels that need a page use it (and opt out when absent). */
    pageId?: string
    className?: string
}

/** Rail of panel icons — the only always-visible part of the dock. */
const DockRail: React.FC<{
    panels: ResolvedDockPanel[]
    activeId: string | null
    runningIds: Set<string>
    onToggle: (id: string) => void
    title: (panel: ResolvedDockPanel) => string
    runningText: string
    side: 'left' | 'right'
}> = ({ panels, activeId, runningIds, onToggle, title, runningText, side }) => (
    <TooltipProvider delayDuration={300}>
        <div className={cn(
            "kn-dock-rail flex h-full w-11 flex-shrink-0 flex-col items-center gap-1 bg-muted/40 py-2 lg:w-10",
            side === 'right' ? "border-l" : "border-r"
        )}>
            {panels.map(panel => {
                const label = title(panel)
                const isActive = activeId === panel.id
                const isRunning = runningIds.has(panel.id)
                const statusLabel = isRunning ? `${label} · ${runningText}` : label
                return (
                    <Tooltip key={panel.id}>
                        <TooltipTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                data-active={isActive}
                                data-tone={panel.id === 'agent' ? 'ai' : undefined}
                                className="kn-rail-control relative h-11 w-11 rounded-lg lg:h-7 lg:w-7"
                                aria-label={statusLabel}
                                aria-pressed={isActive}
                                aria-busy={isRunning || undefined}
                                onClick={() => onToggle(panel.id)}
                            >
                                {isRunning && (
                                    <span
                                        aria-hidden
                                        className="kn-rail-running-dot pointer-events-none absolute right-1 top-1 h-1.5 w-1.5 rounded-full animate-pulse motion-reduce:animate-none"
                                    />
                                )}
                                <span className="relative z-10 flex items-center justify-center">
                                    {panel.icon}
                                </span>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side={side === 'right' ? 'left' : 'right'}>{statusLabel}</TooltipContent>
                    </Tooltip>
                )
            })}
        </div>
    </TooltipProvider>
)

/**
 * Renders one side dock: a thin icon rail plus the expanded panel.
 *
 * Panels come from `PluginManager.resolveDockPanels()` — plugin contributions
 * plus host built-ins — so the rail gains/loses icons as plugins are installed
 * or uninstalled, with no reload. On mobile there is no rail; panels open as a
 * full-height sheet driven by the TOGGLE_DOCK_PANEL event.
 */
export const DockHost: React.FC<DockHostProps> = ({
    position = 'right',
    spaceId,
    pageId,
    className,
}) => {
    const { t } = useTranslation()
    const { isMobile } = useResponsive()
    const {
        panels, activePanel, activeId, context, width, resizing, toggle, close, startResize,
    } = useDockState({ position, spaceId, pageId, restoreActive: !isMobile })

    // Let out-of-dock entry points know whether emitting TOGGLE_DOCK_PANEL will
    // reach a host, so they can fall back to a full page instead.
    React.useEffect(() => dockRuntime.markMounted(position), [position])

    // i18n key with the raw title as fallback, so plugins may pass either.
    const panelTitle = React.useCallback(
        (panel: ResolvedDockPanel) => t(panel.title, panel.title),
        [t]
    )

    // Track which panels are currently running (e.g. the agent streaming a
    // response) so the rail can show a compact status indicator. Panels emit
    // DOCK_PANEL_RUNNING; the host listens and flips the matching id in/out.
    const [runningIds, setRunningIds] = React.useState<Set<string>>(new Set)
    React.useEffect(() => {
        const handler = ({ id, running }: { id: string; running: boolean }) => {
            setRunningIds(prev => {
                const next = new Set(prev)
                if (running) next.add(id)
                else next.delete(id)
                return next
            })
        }
        event.on(DOCK_PANEL_RUNNING, handler)
        return () => { event.off(DOCK_PANEL_RUNNING, handler) }
    }, [])

    const PanelComponent = activePanel?.component

    // Keep the last panel mounted even when collapsed so in-flight work (agent
    // streams, live sessions) survives a collapse/re-expand cycle. The 0-width
    // outer viewport clips the content from view, so there is no need to unmount.
    // Switching to a *different* panel still replaces the old one via the effect.
    const [rendered, setRendered] = React.useState<ResolvedDockPanel | undefined>(activePanel)
    React.useEffect(() => {
        if (activePanel) setRendered(activePanel)
    }, [activePanel])

    if (isMobile) {
        return (
            <Sheet open={!!activePanel} onOpenChange={(open) => { if (!open) close() }}>
                <SheetContent side="right" className="w-full p-0 flex flex-col gap-0">
                    {activePanel?.hideHeader ? (
                        /* Keep the title for Radix a11y, just not visible — the
                           panel's own header bar takes over on screen. */
                        <SheetTitle className="sr-only">
                            {panelTitle(activePanel)}
                        </SheetTitle>
                    ) : (
                        <SheetHeader className="px-3 py-2 border-b text-left">
                            <SheetTitle className="text-sm font-medium">
                                {activePanel ? panelTitle(activePanel) : ''}
                            </SheetTitle>
                        </SheetHeader>
                    )}
                    <div className="flex-1 min-h-0 overflow-hidden">
                        {PanelComponent && <PanelComponent {...context} close={close} />}
                    </div>
                </SheetContent>
            </Sheet>
        )
    }

    if (panels.length === 0) return null

    const RenderedComponent = rendered?.component

    return (
        <div
            className={cn("flex h-full", className)}
            data-expanded={!!activePanel}
            data-position={position}
        >
            {/* Animated viewport: collapses to 0 so the editor reclaims the space.
                The panel inside keeps its full width and is clipped, which reads as
                a slide rather than a squeeze. */}
            <div
                className={cn(
                    "kn-dock-viewport relative h-full flex-shrink-0 overflow-hidden",
                    // Drag-resize writes width on every mousemove; transitioning
                    // there would make the panel lag behind the pointer.
                    !resizing && "transition-[width] duration-200 ease-out"
                )}
                style={{ width: activePanel ? width : 0 }}
                onTransitionEnd={(e) => {
                    if (e.target !== e.currentTarget || e.propertyName !== 'width') return
                    // Intentionally NOT unmounting here: keeping the panel mounted
                    // while collapsed lets in-flight agent streams continue running.
                    // The 0-width viewport already clips the content from view.
                }}
            >
                {rendered && RenderedComponent && (
                    <div
                        className={cn(
                            "kn-dock-panel absolute top-0 flex h-full flex-col border-l bg-background",
                            // Anchored to the edge the rail sits on, so the clipped
                            // side is the one facing the document.
                            position === 'right' ? "right-0" : "left-0",
                            // Hide from AT and pointer events while collapsed.
                            !activePanel && "pointer-events-none"
                        )}
                        style={{ width }}
                        aria-hidden={!activePanel}
                    >
                        {/* Drag handle: sits on the panel's outer edge, 4px hit area. */}
                        <div
                            role="separator"
                            aria-orientation="vertical"
                            className={cn(
                                "absolute top-0 z-10 h-full w-1 cursor-col-resize hover:bg-primary/30",
                                resizing && "bg-primary/40",
                                position === 'right' ? "left-0" : "right-0"
                            )}
                            onMouseDown={startResize}
                        />
                        {/* Panels that own their header (hideHeader) skip this
                            generic bar so their title/actions don't stack twice. */}
                        {!rendered.hideHeader && (
                            <div className="flex h-9 flex-shrink-0 items-center justify-between border-b px-3">
                                <span className="truncate text-xs font-medium">{panelTitle(rendered)}</span>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-muted-foreground"
                                    aria-label={t('dock.collapse', 'Collapse panel')}
                                    onClick={close}
                                >
                                    <X className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        )}
                        <div className="min-h-0 flex-1 overflow-hidden">
                            <RenderedComponent {...context} close={close} />
                        </div>
                    </div>
                )}
            </div>
            <DockRail
                panels={panels}
                activeId={activeId}
                runningIds={runningIds}
                onToggle={toggle}
                title={panelTitle}
                runningText={t('dock.running', 'Running')}
                side={position}
            />
        </div>
    )
}
