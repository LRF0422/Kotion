import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import {
    cn,
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    FlatEmoji,
} from "@kn/ui"
import { ChevronDown, FileText, X } from "@kn/icon"
import { useTranslation, type PageTab } from "@kn/common"

// Minimum width a tab may shrink to before extra tabs move into the overflow menu.
const MIN_TAB_WIDTH = 120
// Width reserved for the overflow dropdown trigger.
const OVERFLOW_BTN_WIDTH = 36

export interface TabBarProps {
    tabs: PageTab[]
    activePageId?: string
    onActivate: (pageId: string) => void
    onClose: (pageId: string) => void
    onCloseOthers?: (pageId: string) => void
    onCloseRight?: (pageId: string) => void
    onCloseAll?: () => void
}

/**
 * Presentational tab strip for open pages. Navigation/keep-alive logic lives in
 * the parent (`TabbedEditorArea`); this just renders and emits intent.
 *
 * Tabs stretch to equally fill the bar width (no empty tail); once each tab's
 * share would drop below a minimum usable width, the extra tabs are collected
 * into an overflow dropdown instead of horizontal scrolling.
 */
export const TabBar: React.FC<TabBarProps> = ({
    tabs,
    activePageId,
    onActivate,
    onClose,
    onCloseOthers,
    onCloseRight,
    onCloseAll,
}) => {
    const { t } = useTranslation()
    const containerRef = useRef<HTMLDivElement>(null)
    const [visibleCount, setVisibleCount] = useState(tabs.length)

    // Since tabs always fill the bar equally, their widths are container-driven
    // — no per-tab measurement needed. Fit as many tabs as can keep at least
    // MIN_TAB_WIDTH each; the rest go into the overflow dropdown.
    const computeVisibleCount = useCallback(() => {
        const container = containerRef.current
        if (!container) return
        const containerWidth = container.clientWidth
        if (containerWidth <= 0) return
        const maxFit = Math.max(1, Math.floor(containerWidth / MIN_TAB_WIDTH))
        if (tabs.length <= maxFit) {
            setVisibleCount(tabs.length)
            return
        }
        // Reserve room for the overflow dropdown button.
        const fitWithOverflow = Math.max(1, Math.floor((containerWidth - OVERFLOW_BTN_WIDTH) / MIN_TAB_WIDTH))
        setVisibleCount(Math.min(tabs.length, fitWithOverflow))
    }, [tabs])

    useLayoutEffect(() => {
        computeVisibleCount()
    }, [computeVisibleCount])

    useEffect(() => {
        const container = containerRef.current
        if (!container) return
        const observer = new ResizeObserver(() => computeVisibleCount())
        observer.observe(container)
        return () => observer.disconnect()
    }, [computeVisibleCount])

    if (tabs.length === 0) return null

    const visibleTabs = tabs.slice(0, visibleCount)
    const overflowTabs = tabs.slice(visibleCount)

    // Ensure the active tab is always visible: if the active tab is in overflow,
    // swap it with the last visible tab.
    const activeInOverflow = overflowTabs.find(t => t.pageId === activePageId)
    if (activeInOverflow && visibleTabs.length > 0) {
        const lastVisible = visibleTabs[visibleTabs.length - 1]
        visibleTabs[visibleTabs.length - 1] = activeInOverflow
        const idx = overflowTabs.indexOf(activeInOverflow)
        overflowTabs[idx] = lastVisible
    }

    return (
        <div ref={containerRef} className="relative z-40 flex h-9 w-full flex-shrink-0 items-stretch overflow-hidden border-b bg-muted/30">
            {visibleTabs.map((tab, index) => {
                const isActive = tab.pageId === activePageId
                const hasOthers = tabs.length > 1
                const globalIndex = tabs.findIndex(t => t.pageId === tab.pageId)
                const hasRight = globalIndex < tabs.length - 1
                return (
                    <ContextMenu key={tab.pageId}>
                        <ContextMenuTrigger asChild>
                            <div
                                role="tab"
                                aria-selected={isActive}
                                onClick={() => onActivate(tab.pageId)}
                                onAuxClick={(e) => {
                                    if (e.button === 1) {
                                        e.preventDefault()
                                        onClose(tab.pageId)
                                    }
                                }}
                                className={cn(
                                    "group flex min-w-0 flex-1 cursor-pointer select-none items-center gap-1.5 border-r px-3 text-sm transition-colors",
                                    isActive
                                        ? "bg-background text-foreground"
                                        : "bg-muted/30 text-muted-foreground hover:bg-muted/60"
                                )}
                                title={tab.title}
                            >
                                {tab.icon ? (
                                    <span className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center leading-none">
                                        <FlatEmoji emoji={tab.icon} size={13} />
                                    </span>
                                ) : (
                                    <FileText className="h-3.5 w-3.5 flex-shrink-0 opacity-70" />
                                )}
                                <span className="truncate">
                                    {tab.title || t("pageEditor.tabBar.untitled")}
                                </span>
                                <button
                                    type="button"
                                    aria-label="Close tab"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onClose(tab.pageId)
                                    }}
                                    className={cn(
                                        "ml-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded transition-opacity hover:bg-muted-foreground/20",
                                        isActive ? "opacity-60 hover:opacity-100" : "opacity-0 group-hover:opacity-60 group-hover:hover:opacity-100"
                                    )}
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </div>
                        </ContextMenuTrigger>
                        <ContextMenuContent className="w-44">
                            <ContextMenuItem onSelect={() => onClose(tab.pageId)}>
                                {t("pageEditor.tabBar.close")}
                            </ContextMenuItem>
                            <ContextMenuItem
                                disabled={!hasOthers}
                                onSelect={() => onCloseOthers?.(tab.pageId)}
                            >
                                {t("pageEditor.tabBar.closeOthers")}
                            </ContextMenuItem>
                            <ContextMenuItem
                                disabled={!hasRight}
                                onSelect={() => onCloseRight?.(tab.pageId)}
                            >
                                {t("pageEditor.tabBar.closeRight")}
                            </ContextMenuItem>
                            <ContextMenuSeparator />
                            <ContextMenuItem onSelect={() => onCloseAll?.()}>
                                {t("pageEditor.tabBar.closeAll")}
                            </ContextMenuItem>
                        </ContextMenuContent>
                    </ContextMenu>
                )
            })}

            {/* Overflow dropdown */}
            {overflowTabs.length > 0 && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            className="flex h-full w-9 flex-shrink-0 items-center justify-center border-l bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
                            title={t("pageEditor.tabBar.moreTabs", "{{count}} more tabs", { count: overflowTabs.length })}
                        >
                            <ChevronDown className="h-4 w-4" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="max-h-[300px] overflow-y-auto">
                        {overflowTabs.map((tab) => (
                            <DropdownMenuItem
                                key={tab.pageId}
                                className="flex items-center gap-2 cursor-pointer"
                                onSelect={() => onActivate(tab.pageId)}
                            >
                                {tab.icon ? (
                                    <span className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center leading-none">
                                        <FlatEmoji emoji={tab.icon} size={13} />
                                    </span>
                                ) : (
                                    <FileText className="h-3.5 w-3.5 flex-shrink-0 opacity-70" />
                                )}
                                <span className="truncate max-w-[200px]">
                                    {tab.title || t("pageEditor.tabBar.untitled")}
                                </span>
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
        </div>
    )
}
