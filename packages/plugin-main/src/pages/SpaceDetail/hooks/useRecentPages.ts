import { useCallback, useEffect, useState } from 'react'
import { useOnRouteCacheActivated, useSpacePageService } from '@kn/common'
import {
    MAX_RECENT_ITEMS,
    RECENT_PAGES_STORAGE_KEY,
    dropRecentPage,
    parseRecentPages,
    recordRecentPage,
    serializeRecentPages,
    toRecentPageItems,
    type RecentPageItem,
} from './recent-pages'

export type { RecentPageItem } from './recent-pages'

const storageKey = (spaceId: string) => `${RECENT_PAGES_STORAGE_KEY}:${spaceId}`

/**
 * Custom hook to manage recently visited pages for one workspace.
 *
 * The authoritative list comes from the server (`GET /space/page/recent`, which
 * excludes trashed/deleted pages). The local list is only a fallback when that
 * call fails, but it is still a live mirror: the workspace shell is kept alive
 * by the route cache, so a page trashed while the sidebar stays mounted must be
 * dropped here too — otherwise "Recent" keeps offering a link to a page the
 * user just deleted. `page.trashed`/`page.deleted`/`page.restoredFromTrash`
 * from `service.changes` are the invalidation signal.
 */
export const useRecentPages = (spaceId: string | undefined) => {
    const [recentPages, setRecentPages] = useState<RecentPageItem[]>([])
    const [loading, setLoading] = useState(false)
    const service = useSpacePageService()

    const persist = useCallback((pages: RecentPageItem[]) => {
        if (!spaceId) return
        try {
            localStorage.setItem(storageKey(spaceId), serializeRecentPages(pages))
        } catch { /* quota errors must not break navigation */ }
    }, [spaceId])

    const readFallback = useCallback((): RecentPageItem[] => {
        if (!spaceId) return []
        try {
            return parseRecentPages(localStorage.getItem(storageKey(spaceId)))
        } catch {
            return []
        }
    }, [spaceId])

    const load = useCallback(() => {
        if (!spaceId) return
        setLoading(true)
        service.pages.queryRecentPages({ spaceId, pageSize: MAX_RECENT_ITEMS })
            .then((result) => {
                const items = toRecentPageItems(result.records)
                setRecentPages(items)
                persist(items)
            })
            .catch(() => {
                // Fall back to the local mirror only when the server cannot answer.
                setRecentPages(readFallback())
            })
            .finally(() => setLoading(false))
    }, [persist, readFallback, service, spaceId])

    // Try to load from backend first, fall back to localStorage on failure.
    useEffect(() => {
        load()
    }, [load])

    // The workspace is route-cached: coming back to it does not remount, so a
    // trash performed elsewhere (other tab/device — the change stream is
    // in-process only) has to be picked up on the visible transition.
    useOnRouteCacheActivated(load, [load])

    // Keep the list in step with page lifecycle changes while the workspace is
    // mounted (the shell caches routes, so this component may never remount).
    useEffect(() => {
        if (!spaceId) return

        const forget = (pageId: string) => {
            setRecentPages((prev) => {
                const next = dropRecentPage(prev, pageId)
                persist(next)
                return next
            })
        }
        const matchesSpace = (eventSpaceId?: string) =>
            !eventSpaceId || String(eventSpaceId) === String(spaceId)

        const unsubscribers = [
            service.changes.subscribe('page.trashed', ({ payload }) => {
                if (!matchesSpace(payload.spaceId)) return
                // Drop immediately (optimistic) and refetch so the freed slot is
                // filled by the next candidate from the server.
                forget(payload.pageId)
                load()
            }),
            // `page.deleted` has no emitter in the client service yet (today a
            // page leaves through trash), but the change map defines it — a
            // future hard-delete path must invalidate the list without touching
            // this hook.
            service.changes.subscribe('page.deleted', ({ payload }) => {
                if (!matchesSpace(payload.spaceId)) return
                forget(payload.pageId)
            }),
            service.changes.subscribe('page.restoredFromTrash', ({ payload }) => {
                if (!matchesSpace(payload.spaceId)) return
                load()
            }),
        ]
        return () => unsubscribers.forEach((unsubscribe) => unsubscribe())
    }, [load, persist, service, spaceId])

    /**
     * Record a page visit. Adds the page to the top of the recent list
     * and persists to localStorage.
     */
    const recordVisit = useCallback((page: Omit<RecentPageItem, 'updatedAt'>) => {
        if (!spaceId) return

        setRecentPages((prev) => {
            const updated = recordRecentPage(prev, page)
            persist(updated)
            return updated
        })
    }, [persist, spaceId])

    /**
     * Remove a page from recent history.
     */
    const removeFromRecent = useCallback((pageId: string) => {
        setRecentPages((prev) => {
            const updated = dropRecentPage(prev, pageId)
            persist(updated)
            return updated
        })
    }, [persist])

    return {
        recentPages,
        loading,
        recordVisit,
        removeFromRecent,
        refresh: load,
    }
}
