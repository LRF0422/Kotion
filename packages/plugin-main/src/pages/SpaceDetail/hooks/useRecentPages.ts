import { useState, useEffect, useCallback } from 'react'
import { useApi } from '@kn/common'
import { APIS } from '../../../api'

export interface RecentPageItem {
    id: string
    title: string
    icon?: { icon: string }
    updatedAt?: string
    spaceId?: string
}

const STORAGE_KEY = 'kn:recent-pages'
const MAX_RECENT_ITEMS = 8

/**
 * Custom hook to manage recently visited pages.
 * Uses localStorage as primary store with optional backend sync.
 * Call `recordVisit` whenever a page is opened to track history.
 */
export const useRecentPages = (spaceId: string | undefined) => {
    const [recentPages, setRecentPages] = useState<RecentPageItem[]>([])
    const [loading, setLoading] = useState(false)

    // Try to load from backend first, fall back to localStorage
    useEffect(() => {
        if (!spaceId) return

        setLoading(true)
        useApi(APIS.QUERY_RECENT_PAGE, { spaceId, pageSize: MAX_RECENT_ITEMS })
            .then((res) => {
                if (res?.data && Array.isArray(res.data)) {
                    setRecentPages(res.data.slice(0, MAX_RECENT_ITEMS))
                } else {
                    // Fallback to localStorage
                    loadFromLocalStorage(spaceId)
                }
            })
            .catch(() => {
                // Fallback to localStorage on API failure
                loadFromLocalStorage(spaceId)
            })
            .finally(() => setLoading(false))
    }, [spaceId])

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
