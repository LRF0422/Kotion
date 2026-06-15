import React, { useEffect, useRef } from "react"
import { cn } from "@kn/ui"
import { FileText, X } from "@kn/icon"
import type { PageTab } from "@kn/common"

export interface TabBarProps {
    tabs: PageTab[]
    activePageId?: string
    onActivate: (pageId: string) => void
    onClose: (pageId: string) => void
}

/**
 * Presentational tab strip for open pages. Navigation/keep-alive logic lives in
 * the parent (`TabbedEditorArea`); this just renders and emits intent.
 */
export const TabBar: React.FC<TabBarProps> = ({ tabs, activePageId, onActivate, onClose }) => {
    const activeRef = useRef<HTMLDivElement>(null)

    // Keep the active tab in view when it changes (overflow scroll).
    useEffect(() => {
        activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" })
    }, [activePageId])

    if (tabs.length === 0) return null

    return (
        <div className="relative z-40 flex h-9 w-full flex-shrink-0 items-stretch overflow-x-auto border-b bg-muted/30 no-scrollbar">
            {tabs.map((tab) => {
                const isActive = tab.pageId === activePageId
                return (
                    <div
                        key={tab.pageId}
                        ref={isActive ? activeRef : undefined}
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => { console.log('[TAB] click', tab.pageId); onActivate(tab.pageId) }}
                        className={cn(
                            "group flex max-w-[180px] flex-shrink-0 cursor-pointer select-none items-center gap-1.5 border-r px-3 text-sm transition-colors",
                            isActive
                                ? "bg-background text-foreground"
                                : "bg-muted/30 text-muted-foreground hover:bg-muted/60"
                        )}
                        title={tab.title}
                    >
                        <FileText className="h-3.5 w-3.5 flex-shrink-0 opacity-70" />
                        <span className="truncate">
                            {tab.title || "Untitled"}
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
                )
            })}
        </div>
    )
}
