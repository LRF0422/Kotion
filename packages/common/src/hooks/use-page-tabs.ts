import { useCallback, useEffect } from "react"
import { useDispatch, useSelector } from "react-redux"
import { GlobalState } from "../store/GlobalState"

export interface PageTab {
    pageId: string
    title?: string
    /** Page's own icon (emoji string, e.g. "📊"). Falls back to a file icon. */
    icon?: string
    lastActiveAt: number
}

const storageKey = (spaceId: string) => `kn:page-tabs:${spaceId}`

interface PersistedTabs {
    openPages: { pageId: string; title?: string; icon?: string }[]
    activePageId?: string
}

/**
 * Spaces hydrated from localStorage during this page-load, shared across all
 * `usePageTabs` instances. Must NOT be per-instance: `usePageTabs` is mounted by
 * several components (e.g. `PageRouteSync` remounts on every navigation), and a
 * per-instance guard would let a freshly-mounted instance re-hydrate stale tabs
 * from cache right after the user cleared them ("close all"). Module scope means
 * we hydrate exactly once per space per page-load; a refresh resets it.
 */
const hydratedSpaces = new Set<string>()

/**
 * Manages the set of open page tabs for a single space.
 *
 * URL stays the source of truth for which tab is *active* — callers navigate
 * to a page and `PageRouteSync` reports it here. This hook only owns the
 * open-set + ordering metadata. Tab *list* (not editor instances) is persisted
 * to localStorage so a refresh restores the open tabs; instances always remount.
 */
export const usePageTabs = (spaceId?: string) => {
    const dispatch = useDispatch()
    const bucket = useSelector((state: GlobalState) =>
        spaceId ? state.pageTabs?.bySpace?.[spaceId] : undefined
    )
    const openPages = bucket?.openPages ?? []
    const activePageId = bucket?.activePageId

    const openTab = useCallback((pageId: string, title?: string, icon?: string) => {
        if (!spaceId || !pageId) return
        dispatch({ type: "PAGE_TAB_OPEN", payload: { spaceId, pageId, title, icon, lastActiveAt: Date.now() } })
    }, [dispatch, spaceId])

    const activateTab = useCallback((pageId: string) => {
        if (!spaceId || !pageId) return
        dispatch({ type: "PAGE_TAB_ACTIVATE", payload: { spaceId, pageId, lastActiveAt: Date.now() } })
    }, [dispatch, spaceId])

    const closeTab = useCallback((pageId: string) => {
        if (!spaceId || !pageId) return
        dispatch({ type: "PAGE_TAB_CLOSE", payload: { spaceId, pageId } })
    }, [dispatch, spaceId])

    const closeTabs = useCallback((pageIds: string[]) => {
        if (!spaceId || pageIds.length === 0) return
        dispatch({ type: "PAGE_TAB_CLOSE_MANY", payload: { spaceId, pageIds } })
    }, [dispatch, spaceId])

    const updateMeta = useCallback((pageId: string, meta: { title?: string; icon?: string }) => {
        if (!spaceId || !pageId) return
        dispatch({ type: "PAGE_TAB_UPDATE_META", payload: { spaceId, pageId, ...meta } })
    }, [dispatch, spaceId])

    // Hydrate once per space per page-load from localStorage when Redux has no
    // tabs yet. The guard is module-level (see `hydratedSpaces`) so a remounting
    // instance can't re-hydrate stale tabs after the user cleared them.
    useEffect(() => {
        if (!spaceId || hydratedSpaces.has(spaceId)) return
        hydratedSpaces.add(spaceId)
        if ((bucket?.openPages?.length ?? 0) > 0) return
        try {
            const raw = localStorage.getItem(storageKey(spaceId))
            if (!raw) return
            const data: PersistedTabs = JSON.parse(raw)
            data.openPages?.forEach(p =>
                dispatch({ type: "PAGE_TAB_OPEN", payload: { spaceId, pageId: p.pageId, title: p.title, icon: p.icon, lastActiveAt: 0 } })
            )
        } catch {
            // ignore malformed cache
        }
    }, [spaceId, bucket, dispatch])

    // Write-through persist of the tab list (not instances).
    useEffect(() => {
        if (!spaceId) return
        try {
            const data: PersistedTabs = {
                openPages: openPages.map(p => ({ pageId: p.pageId, title: p.title, icon: p.icon })),
                activePageId,
            }
            localStorage.setItem(storageKey(spaceId), JSON.stringify(data))
        } catch {
            // ignore quota / serialization errors
        }
    }, [spaceId, openPages, activePageId])

    return { openPages, activePageId, openTab, activateTab, closeTab, closeTabs, updateMeta }
}
