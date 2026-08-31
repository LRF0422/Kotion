import { useState, useEffect, useCallback } from 'react'
import { type PageSummary, useSpacePageService } from '@kn/common'

export interface RecentPageItem {
    id: string
    title: string
    icon?: { icon: string }
    updatedAt?: string
    spaceId?: string
}

const STORAGE_KEY = 'kn:recent-pages'
const MAX_RECENT_ITEMS = 8

const toRecentPageItem = (page: PageSummary): RecentPageItem => ({
    id: page.id,
    title: page.title,
    icon: page.icon && typeof page.icon === 'object' && 'icon' in page.icon
        ? page.icon as RecentPageItem['icon']
        : undefined,
    updatedAt: page.updatedAt == null ? undefined : String(page.updatedAt),
    spaceId: page.spaceId,
})

/**
 * Custom hook to manage recently visited pages.
 * Uses localStorage as primary store with optional backend sync.
 * Call `recordVisit` whenever a page is opened to track history.
 */
export const useRecentPages = (spaceId: string | undefined) => {
    const [recentPages, setRecentPages] = useState<RecentPageItem[]>([])
    const [loading, setLoading] = useState(false)
    const service = useSpacePageService()

    const loadFromLocalStorage = useCallback((sid: string) => {
        try {
            const raw = localStorage.getItem(`${STORAGE_KEY}:${sid}`)
            if (raw) {
                const parsed = JSON.parse(raw) as RecentPageItem[]
                setRecentPages(parsed.slice(0, MAX_RECENT_ITEMS))
            }
        } catch {
            setRecentPages([])
        }
    }, [])

    // Try to load from backend first, fall back to localStorage
    useEffect(() => {
        if (!spaceId) return

        setLoading(true)
        service.pages.queryRecentPages({ spaceId, pageSize: MAX_RECENT_ITEMS })
            .then((result) => {
                setRecentPages(result.records.slice(0, MAX_RECENT_ITEMS).map(toRecentPageItem))
            })
            .catch(() => {
                // Fallback to localStorage on API failure
                loadFromLocalStorage(spaceId)
            })
            .finally(() => setLoading(false))
    }, [loadFromLocalStorage, service, spaceId])

    /**
     * Record a page visit. Adds the page to the top of the recent list
     * and persists to localStorage.
     */
    const recordVisit = useCallback((page: RecentPageItem) => {
        if (!spaceId) return

        setRecentPages((prev) => {
            // Remove duplicate if already exists
            const filtered = prev.filter((p) => p.id !== page.id)
            // Add to front
            const updated = [{ ...page, updatedAt: new Date().toISOString() }, ...filtered].slice(0, MAX_RECENT_ITEMS)

            // Persist to localStorage
            try {
                localStorage.setItem(`${STORAGE_KEY}:${spaceId}`, JSON.stringify(updated))
            } catch { /* ignore quota errors */ }

            return updated
        })
    }, [spaceId])

    /**
     * Remove a page from recent history.
     */
    const removeFromRecent = useCallback((pageId: string) => {
        if (!spaceId) return

        setRecentPages((prev) => {
            const updated = prev.filter((p) => p.id !== pageId)
            try {
                localStorage.setItem(`${STORAGE_KEY}:${spaceId}`, JSON.stringify(updated))
            } catch { /* ignore */ }
            return updated
        })
    }, [spaceId])

    return {
        recentPages,
        loading,
        recordVisit,
        removeFromRecent,
    }
}
