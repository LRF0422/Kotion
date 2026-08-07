import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react"
import {
    DOCK_DEFAULT_WIDTH,
    DOCK_MAX_WIDTH,
    DOCK_MIN_WIDTH,
    DockPanelContext,
    DockPosition,
    ResolvedDockPanel,
    TOGGLE_DOCK_PANEL,
    event,
    useActiveEditor,
    useDockPanels,
} from "@kn/common"

const storageKey = (position: DockPosition, key: string) => `kn:dock:${position}:${key}`

const readStored = (position: DockPosition, key: string): string | null => {
    try { return localStorage.getItem(storageKey(position, key)) } catch { return null }
}

const writeStored = (position: DockPosition, key: string, value: string | null) => {
    try {
        if (value === null) localStorage.removeItem(storageKey(position, key))
        else localStorage.setItem(storageKey(position, key), value)
    } catch { /* ignore quota / privacy errors */ }
}

const clampWidth = (width: number, panel?: ResolvedDockPanel) => {
    const min = panel?.minWidth ?? DOCK_MIN_WIDTH
    const max = panel?.maxWidth ?? DOCK_MAX_WIDTH
    return Math.min(max, Math.max(min, width))
}

export interface UseDockStateOptions {
    position: DockPosition
    spaceId?: string
    pageId?: string
    /**
     * Restore the last expanded panel on mount. Off on mobile, where a panel is
     * a full-screen sheet: reopening it on load would hide the document.
     */
    restoreActive?: boolean
}

/**
 * Owns everything stateful about one dock: which panels are currently available
 * (reactive to plugin install/uninstall), which one is expanded, its width, and
 * the drag-to-resize interaction. Active panel + width survive reloads.
 */
export const useDockState = ({ position, spaceId, pageId, restoreActive = true }: UseDockStateOptions) => {
    const allPanels = useDockPanels(position)
    const { editor, pageId: editorPageId } = useActiveEditor()

    // The published editor belongs to whichever tab is active; only hand it to
    // panels when it actually matches the page this dock is showing.
    const context: DockPanelContext = useMemo(() => ({
        spaceId,
        pageId,
        editor: pageId && editorPageId === pageId ? editor : undefined,
    }), [spaceId, pageId, editor, editorPageId])

    // Panels can opt out of the rail for the current context (e.g. "needs an open page").
    const panels = useMemo(
        () => allPanels.filter(panel => (panel.visible ? panel.visible(context) : true)),
        [allPanels, context]
    )

    const [activeId, setActiveId] = useState<string | null>(() => restoreActive ? readStored(position, 'active') : null)
    const [width, setWidth] = useState<number>(() => {
        const stored = Number(readStored(position, 'width'))
        return Number.isFinite(stored) && stored > 0 ? stored : DOCK_DEFAULT_WIDTH
    })
    const [resizing, setResizing] = useState(false)

    // A panel whose plugin was uninstalled (or that opted out of the current
    // context) simply renders as collapsed; the preference is kept so the panel
    // reappears expanded once it is available again.
    const activePanel = useMemo(
        () => panels.find(panel => panel.id === activeId),
        [panels, activeId]
    )

    const activate = useCallback((id: string | null) => {
        setActiveId(id)
        writeStored(position, 'active', id)
    }, [position])

    const toggle = useCallback((id: string) => {
        activate(activeId === id ? null : id)
    }, [activate, activeId])

    const close = useCallback(() => activate(null), [activate])

    // Imperative entry points (sidebar menu, editor toolbar, mobile tab bar).
    useEffect(() => {
        const handler = (payload: { id: string; position?: DockPosition }) => {
            if ((payload?.position ?? 'right') !== position) return
            if (!payload?.id) return
            toggle(payload.id)
        }
        event.on(TOGGLE_DOCK_PANEL, handler)
        return () => { event.off(TOGGLE_DOCK_PANEL, handler) }
    }, [position, toggle])

    // Keep the width within the active panel's own bounds when switching panels.
    useEffect(() => {
        if (!activePanel) return
        setWidth(prev => {
            const next = clampWidth(activePanel.defaultWidth && prev === DOCK_DEFAULT_WIDTH ? activePanel.defaultWidth : prev, activePanel)
            return next === prev ? prev : next
        })
    }, [activePanel])

    const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)

    const startResize = useCallback((e: ReactMouseEvent) => {
        e.preventDefault()
        dragRef.current = { startX: e.clientX, startWidth: width }
        setResizing(true)
    }, [width])

    useEffect(() => {
        if (!resizing) return

        const onMove = (e: MouseEvent) => {
            const drag = dragRef.current
            if (!drag) return
            // Right dock grows as the pointer moves left; mirrored for a left dock.
            const delta = position === 'right' ? drag.startX - e.clientX : e.clientX - drag.startX
            setWidth(clampWidth(drag.startWidth + delta, activePanel))
        }
        const onUp = () => {
            dragRef.current = null
            setResizing(false)
        }

        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
        // Suppress text selection / iframe hijacking of the pointer while dragging.
        const previousUserSelect = document.body.style.userSelect
        document.body.style.userSelect = 'none'
        return () => {
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
            document.body.style.userSelect = previousUserSelect
        }
    }, [resizing, position, activePanel])

    useEffect(() => {
        if (resizing) return
        writeStored(position, 'width', String(width))
    }, [resizing, width, position])

    return { panels, activePanel, activeId, context, width, resizing, toggle, close, startResize }
}
