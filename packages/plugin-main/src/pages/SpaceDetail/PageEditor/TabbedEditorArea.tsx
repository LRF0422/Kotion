import React, { useEffect, useMemo, useState } from "react"
import { useNavigator, usePageTabs } from "@kn/common"
import { useResponsive } from "@kn/ui"
import { PageEditor } from "./index"
import { TabBar } from "./TabBar"

export interface TabbedEditorAreaProps {
    spaceId?: string
}

/**
 * Owns the open-page tab strip + an LRU keep-alive pool of editors.
 *
 * Performance: each live `PageEditor` holds a ProseMirror editor + a Y.Doc + a
 * WebSocket. So we only keep a small number alive (desktop 2, mobile 1) — the
 * active tab plus the most-recently-used. Tabs beyond that stay in the strip
 * but their editor is unmounted (which tears down the provider via PageEditor's
 * cleanup) and remounts on click. URL remains the source of truth for *active*.
 */
export const TabbedEditorArea: React.FC<TabbedEditorAreaProps> = ({ spaceId }) => {
    const { openPages, activePageId, activateTab, closeTab } = usePageTabs(spaceId)
    const navigator = useNavigator()
    const { isMobile } = useResponsive()
    const cap = isMobile ? 1 : 2

    // LRU pool of currently-mounted pageIds, most-recently-active last.
    const [keepAlive, setKeepAlive] = useState<string[]>([])
    const openIdsKey = openPages.map(p => p.pageId).join(",")

    useEffect(() => {
        const openIds = new Set(openPages.map(p => p.pageId))
        setKeepAlive(prev => {
            // Drop any tab that was closed.
            let next = prev.filter(id => openIds.has(id))
            if (activePageId && openIds.has(activePageId)) {
                // Move active to the end (most recent).
                next = next.filter(id => id !== activePageId)
                next.push(activePageId)
            }
            // Evict oldest from the front; the active tab sits at the end so it
            // is never evicted.
            while (next.length > cap) next.shift()
            return next
        })
    }, [activePageId, openIdsKey, cap])

    const navigateTo = (pageId: string) => {
        console.log('[TAB] navigateTo', pageId, 'spaceId', spaceId)
        // Switch active state immediately (don't wait for the URL → PageRouteSync
        // → Redux roundtrip), then keep the URL in sync so refresh/deep-link work.
        activateTab(pageId)
        navigator.go({ to: `/space-detail/${spaceId}/page/edit/${pageId}` })
    }

    const handleClose = (pageId: string) => {
        const wasActive = pageId === activePageId
        const remaining = openPages.filter(p => p.pageId !== pageId)
        closeTab(pageId)
        if (!wasActive) return
        if (remaining.length === 0) {
            // Closed the last tab — fall back to the space (which auto-opens home).
            navigator.go({ to: `/space-detail/${spaceId}` })
            return
        }
        // Mirror the reducer's choice: most-recently-active remaining tab.
        const next = [...remaining].sort((a, b) => b.lastActiveAt - a.lastActiveAt)[0]
        navigateTo(next.pageId)
    }

    // Always render the active editor even if the LRU effect hasn't caught up
    // yet (avoids a blank frame on first navigation to a page).
    const visibleIds = useMemo(() => {
        if (activePageId && !keepAlive.includes(activePageId)) {
            return [...keepAlive, activePageId]
        }
        return keepAlive
    }, [keepAlive, activePageId])

    return (
        <div className="flex h-full w-full flex-col">
            {!isMobile && (
                <TabBar
                    tabs={openPages}
                    activePageId={activePageId}
                    onActivate={navigateTo}
                    onClose={handleClose}
                />
            )}
            <div className="relative flex-1 min-h-0">
                {visibleIds.map(pid => (
                    <div
                        key={pid}
                        className="absolute inset-0 h-full w-full"
                        style={{ display: pid === activePageId ? "block" : "none" }}
                    >
                        <PageEditor pageId={pid} spaceId={spaceId} active={pid === activePageId} />
                    </div>
                ))}
            </div>
        </div>
    )
}
