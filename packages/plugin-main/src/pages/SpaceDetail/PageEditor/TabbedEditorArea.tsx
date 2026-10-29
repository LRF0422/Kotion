import React, { useEffect, useMemo, useRef, useState } from "react"
import { useNavigator, usePageTabs } from "@kn/common"
import { cn, useResponsive } from "@kn/ui"
import { PageHost } from "./PageHost"
import { TabBar } from "./TabBar"

export interface TabbedEditorAreaProps {
    spaceId?: string
}

interface EditorTabLayerProps {
    pageId: string
    spaceId?: string
    isActive: boolean
}

/**
 * One stacked editor layer.
 *
 * Inactive editors stay mounted (keep-alive) but must be invisible *and*
 * unreachable: `aria-hidden` alone leaves their controls in the tab order, and
 * Tiptap can move focus into a contenteditable programmatically. `inert` — the
 * same mechanism the route cache uses for background pages — closes both holes;
 * focus that is already inside is dropped before the attribute is set.
 */
const EditorTabLayer: React.FC<EditorTabLayerProps> = ({ pageId, spaceId, isActive }) => {
    const layerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const node = layerRef.current
        if (!node) return
        if (isActive) {
            node.removeAttribute("inert")
            node.removeAttribute("aria-hidden")
            return
        }
        node.setAttribute("inert", "")
        const focused = document.activeElement
        if (focused instanceof HTMLElement && node.contains(focused)) focused.blur()
        // Set after blurring: a focused descendant's ancestor is (correctly)
        // rejected by the browser when it becomes aria-hidden.
        node.setAttribute("aria-hidden", "true")
    }, [isActive])

    return (
        // Editors are kept mounted (LRU) and stacked; crossfade by opacity
        // instead of hard display toggle so switching is smooth. Inactive layers
        // sit behind and are non-interactive. `transform-gpu` promotes each
        // editor to its own compositor layer so the opacity fade is GPU-only (no
        // per-frame repaint of the editor subtree).
        //
        // `data-editor-tab-layer` is consumed by editor hooks (see
        // `use-margin-cards`) that need to detect "my tab was backgrounded"
        // without being tricked by Radix modals stamping aria-hidden on the app
        // root when a Dialog / Sheet / DropdownMenu opens.
        <div
            ref={layerRef}
            data-editor-tab-layer
            className={cn(
                // animate-in fades freshly-mounted (uncached) tabs in;
                // transition-opacity crossfades switches between the two
                // kept-alive editors. fade-in-0 targets each layer's own
                // opacity, so inactive mounts stay invisible.
                "absolute inset-0 h-full w-full transform-gpu animate-in fade-in-0 transition-opacity duration-150 ease-out motion-reduce:animate-none motion-reduce:transition-none",
                isActive ? "z-10 opacity-100" : "z-0 opacity-0 pointer-events-none"
            )}
        >
            <PageHost pageId={pageId} spaceId={spaceId} active={isActive} />
        </div>
    )
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
    const { openPages, activePageId, activateTab, closeTab, closeTabs } = usePageTabs(spaceId)
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

    // Batch close (close others / to the right / all). Mirrors handleClose's
    // navigation: only re-navigate when the active tab was among those closed.
    const handleCloseMany = (pageIds: string[]) => {
        if (pageIds.length === 0) return
        const closing = new Set(pageIds)
        const remaining = openPages.filter(p => !closing.has(p.pageId))
        closeTabs(pageIds)
        if (!activePageId || !closing.has(activePageId)) return
        if (remaining.length === 0) {
            navigator.go({ to: `/space-detail/${spaceId}` })
            return
        }
        const next = [...remaining].sort((a, b) => b.lastActiveAt - a.lastActiveAt)[0]
        navigateTo(next.pageId)
    }

    const handleCloseOthers = (pageId: string) => {
        handleCloseMany(openPages.filter(p => p.pageId !== pageId).map(p => p.pageId))
    }

    const handleCloseRight = (pageId: string) => {
        const idx = openPages.findIndex(p => p.pageId === pageId)
        if (idx < 0) return
        handleCloseMany(openPages.slice(idx + 1).map(p => p.pageId))
    }

    const handleCloseAll = () => {
        handleCloseMany(openPages.map(p => p.pageId))
    }

    // The LRU pool is pruned in an effect (after paint). Filtering against the
    // *current* space's open tabs at render time is what keeps a space switch
    // from painting the previous space's page ids under the new `spaceId` for a
    // frame (the workspace route slot is reused across spaces).
    const visibleIds = useMemo(() => {
        const openIds = new Set(openPages.map(page => page.pageId))
        const kept = keepAlive.filter(id => openIds.has(id))
        // Always render the active editor even if the LRU effect hasn't caught up
        // yet (avoids a blank frame on first navigation to a page).
        if (activePageId && !kept.includes(activePageId)) kept.push(activePageId)
        return kept
    }, [keepAlive, openPages, activePageId])

    return (
        <div className="flex h-full w-full flex-col">
            {!isMobile && (
                <TabBar
                    tabs={openPages}
                    activePageId={activePageId}
                    onActivate={navigateTo}
                    onClose={handleClose}
                    onCloseOthers={handleCloseOthers}
                    onCloseRight={handleCloseRight}
                    onCloseAll={handleCloseAll}
                />
            )}
            <div className="relative flex-1 min-h-0">
                {visibleIds.map(pid => (
                    <EditorTabLayer
                        key={pid}
                        pageId={pid}
                        spaceId={spaceId}
                        isActive={pid === activePageId}
                    />
                ))}
            </div>
        </div>
    )
}
