import React from "react"
import {
    DockPosition,
    ResolvedDockPanel,
    dockRuntime,
    resolveMountedPanels,
    useTranslation,
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
    /** Which edge the dock sits on. Only 'right' is wired into the shell today. */
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
    runningIds: ReadonlySet<string>
    /**
     * Panel locked open by a running job. Every rail control is disabled while
     * it is set: clicking an icon must neither hide the running conversation nor
     * switch away from it.
     */
    pinnedId?: string | null
    onToggle: (id: string) => void
    title: (panel: ResolvedDockPanel) => string
    runningText: string
    lockedText: string
    side: 'left' | 'right'
}> = ({ panels, activeId, runningIds, pinnedId, onToggle, title, runningText, lockedText, side }) => (
    <TooltipProvider delayDuration={300}>
        <div className={cn(
            "kn-dock-rail flex h-full w-11 flex-shrink-0 flex-col items-center gap-1 bg-muted/40 py-2 lg:w-10",
            side === 'right' ? "border-l" : "border-r"
        )}
            data-locked={pinnedId ? 'true' : undefined}
        >
            {panels.map(panel => {
                const label = title(panel)
                const isActive = activeId === panel.id
                const isRunning = runningIds.has(panel.id)
                const isPinned = pinnedId === panel.id
                const statusLabel = isPinned
                    ? `${label} · ${lockedText}`
                    : isRunning ? `${label} · ${runningText}` : label
                return (
                    <Tooltip key={panel.id}>
                        <TooltipTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                data-active={isActive}
                                data-tone={panel.id === 'agent' ? 'ai' : undefined}
                                data-pinned={isPinned || undefined}
                                className="kn-rail-control relative h-11 w-11 rounded-lg lg:h-7 lg:w-7"
                                aria-label={statusLabel}
                                aria-pressed={isActive}
                                aria-busy={isRunning || undefined}
                                // Locked while a panel runs: the rail stays a
                                // status indicator instead of a control. Kept
                                // clickable (not `disabled`) so its tooltip still
                                // explains why; the toggle itself is a no-op.
                                aria-disabled={pinnedId ? true : undefined}
                                onClick={() => onToggle(panel.id)}
                            >
                                {(isRunning || isPinned) && (
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
        panels,
        activePanel,
        activeId,
        pinnedId,
        runningIds,
        context,
        width,
        minWidth,
        maxWidth,
        resizing,
        toggle,
        close,
        startResize,
        resizeTo,
    } = useDockState({ position, spaceId, pageId, restoreActive: !isMobile })
    const panelId = React.useId()

    // Let out-of-dock entry points know whether emitting TOGGLE_DOCK_PANEL will
    // reach a host, so they can fall back to a full page instead.
    React.useEffect(() => dockRuntime.markMounted(position), [position])

    // i18n key with the raw title as fallback, so plugins may pass either.
    const panelTitle = React.useCallback(
        (panel: ResolvedDockPanel) => t(panel.title, panel.title),
        [t]
    )

    const handleResizeKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
        const step = e.shiftKey ? 40 : 10
        let nextWidth: number | undefined

        switch (e.key) {
            case 'ArrowLeft':
                nextWidth = width + (position === 'right' ? step : -step)
                break
            case 'ArrowRight':
                nextWidth = width + (position === 'right' ? -step : step)
                break
            case 'Home':
                nextWidth = minWidth
                break
            case 'End':
                nextWidth = maxWidth
                break
            default:
                return
        }

        e.preventDefault()
        resizeTo(nextWidth)
    }, [maxWidth, minWidth, position, resizeTo, width])

    // Which panels are running (e.g. the agent streaming a response) comes from
    // the shared dock runtime: the same snapshot pins the running panel open and
    // drives the rail's status dot, and it survives this host unmounting (a
    // route without the shell) so a run is never lost track of.

    // Mount each panel the first time it becomes active and KEEP it mounted
    // afterwards (just hidden). Unmounting the Agent panel would abort its
    // in-flight run and drop the chat's in-memory history, so switching dock
    // panels must not tear the previous panel down. Inactive panels are hidden
    // with visibility (not unmounted) and cannot receive pointer events.
    const [mountedPanels, setMountedPanels] = React.useState<ResolvedDockPanel[]>(
        () => (activePanel ? [activePanel] : [])
    )
    React.useEffect(() => {
        if (!activePanel) return
        setMountedPanels(prev => (
            prev.some(panel => panel.id === activePanel.id) ? prev : [...prev, activePanel]
        ))
    }, [activePanel])

    /**
     * What the kept-alive panels actually render.
     *
     * `mountedPanels` is a *snapshot*: the dock keeps a panel mounted after its
     * first activation, so the entry (and the component function inside it) is
     * whatever it was at that moment. Re-resolving against the live contribution
     * list is what makes a plugin-studio hot reload visible — otherwise the dock
     * keeps rendering the code the panel was opened with, and the developer's
     * edit only appears after the whole window is reloaded.
     */
    const renderedPanels = React.useMemo(
        () => resolveMountedPanels(mountedPanels, panels),
        [mountedPanels, panels]
    )

    // Mobile uses a single-panel Sheet, so it still resolves the active
    // component directly.
    const PanelComponent = activePanel?.component

    // A running panel keeps its sheet open: the backdrop, Esc and the close
    // button must not dismiss the conversation that is streaming into it (on
    // mobile the sheet body is the only mounted copy, so dismissing it would
    // tear the run down).
    const locked = !!pinnedId

    if (isMobile) {
        return (
            <Sheet open={!!activePanel} onOpenChange={(open) => { if (!open && !locked) close() }}>
                <SheetContent
                    side="right"
                    className="w-full p-0 flex flex-col gap-0"
                    hideClose={locked}
                    onInteractOutside={(e) => { if (locked) e.preventDefault() }}
                    onEscapeKeyDown={(e) => { if (locked) e.preventDefault() }}
                >
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
                    <div
                        className="flex-1 min-h-0 overflow-hidden"
                        data-kn-plugin={activePanel?.pluginKey}
                    >
                        {PanelComponent && <PanelComponent {...context} close={close} />}
                    </div>
                </SheetContent>
            </Sheet>
        )
    }

    if (panels.length === 0) return null

    return (
        <div
            className={cn("relative flex h-full", className)}
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
                {renderedPanels.map(panel => {
                    const PanelComponent = panel.component
                    const isPanelActive = activePanel?.id === panel.id
                    return (
                        <div
                            key={panel.id}
                            id={isPanelActive ? panelId : undefined}
                            data-kn-plugin={panel.pluginKey}
                            className={cn(
                                "kn-dock-panel absolute top-0 flex h-full flex-col border-l bg-background",
                                // Anchored to the edge the rail sits on, so the
                                // clipped side is the one facing the document.
                                position === 'right' ? "right-0" : "left-0",
                                // Hidden but still mounted: a panel switch must
                                // not abort in-flight work or drop state.
                                !isPanelActive && "invisible pointer-events-none"
                            )}
                            style={{ width }}
                            aria-hidden={!isPanelActive}
                        >
                            {/* Panels that own their header (hideHeader) skip this
                                generic bar so their title/actions don't stack twice. */}
                            {!panel.hideHeader && (
                                <div className="flex h-9 flex-shrink-0 items-center justify-between border-b px-3">
                                    <span className="truncate text-xs font-medium">{panelTitle(panel)}</span>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 text-muted-foreground"
                                        aria-label={locked && isPanelActive
                                            ? t('dock.locked', 'Running — panel stays open')
                                            : t('dock.collapse', 'Collapse panel')}
                                        aria-disabled={locked && isPanelActive ? true : undefined}
                                        onClick={close}
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            )}
                            <div className="min-h-0 flex-1 overflow-hidden">
                                <PanelComponent {...context} close={close} />
                            </div>
                        </div>
                    )
                })}
            </div>
            {activePanel && (
                <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={t('dock.resize', 'Resize panel')}
                    aria-controls={panelId}
                    aria-valuemin={minWidth}
                    aria-valuemax={maxWidth}
                    aria-valuenow={Math.round(width)}
                    aria-valuetext={`${Math.round(width)}px`}
                    tabIndex={0}
                    className="group absolute top-0 z-30 h-full w-3 -translate-x-1/2 cursor-col-resize touch-none outline-none"
                    style={{
                        left: position === 'right'
                            ? 'calc(var(--kn-workspace-gap, 0px) * -0.5)'
                            : `calc(${width}px + var(--kn-workspace-gap, 0px) * 0.5)`,
                    }}
                    onMouseDown={startResize}
                    onKeyDown={handleResizeKeyDown}
                >
                    <span
                        aria-hidden
                        className={cn(
                            "pointer-events-none absolute left-1/2 top-1/2 h-8 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full border border-muted-foreground/40 bg-muted-foreground/30 opacity-20 shadow-sm transition-[color,background-color,border-color,opacity]",
                            "group-hover:border-primary/70 group-hover:bg-primary/60 group-hover:opacity-100",
                            "group-focus-visible:border-primary group-focus-visible:bg-primary group-focus-visible:opacity-100 group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2",
                            resizing && "border-primary bg-primary opacity-100"
                        )}
                    />
                </div>
            )}
            <DockRail
                panels={panels}
                activeId={activeId}
                runningIds={runningIds}
                pinnedId={pinnedId}
                onToggle={toggle}
                title={panelTitle}
                runningText={t('dock.running', 'Running')}
                lockedText={t('dock.locked', 'Running — panel stays open')}
                side={position}
            />
        </div>
    )
}
