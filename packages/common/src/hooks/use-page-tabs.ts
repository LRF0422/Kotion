import { useCallback, useLayoutEffect } from "react"
import { useDispatch, useSelector, useStore } from "react-redux"
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
    /** Kept for backward-compatible parsing; the URL owns active-page state. */
    activePageId?: string
}

function readPersistedTabs(spaceId: string): PersistedTabs | undefined {
    try {
        const raw = localStorage.getItem(storageKey(spaceId))
        if (!raw) return undefined
        const parsed: unknown = JSON.parse(raw)
        if (!parsed || typeof parsed !== "object") return undefined

        const value = parsed as { openPages?: unknown; activePageId?: unknown }
        if (!Array.isArray(value.openPages)) return undefined

        const seen = new Set<string>()
        const openPages = value.openPages.flatMap(page => {
            if (!page || typeof page !== "object") return []
            const candidate = page as { pageId?: unknown; title?: unknown; icon?: unknown }
            if (typeof candidate.pageId !== "string" || !candidate.pageId || seen.has(candidate.pageId)) {
                return []
            }
            seen.add(candidate.pageId)
            return [{
                pageId: candidate.pageId,
                ...(typeof candidate.title === "string" ? { title: candidate.title } : {}),
                ...(typeof candidate.icon === "string" ? { icon: candidate.icon } : {}),
            }]
        })

        return {
            openPages,
            ...(typeof value.activePageId === "string" ? { activePageId: value.activePageId } : {}),
        }
    } catch {
        return undefined
    }
}

function serializeTabs(openPages: PageTab[]) {
    const data: PersistedTabs = {
        openPages: openPages.map(page => ({
            pageId: page.pageId,
            title: page.title,
            icon: page.icon,
        })),
    }
    return JSON.stringify(data)
}

function persistTabs(spaceId: string, snapshot: string) {
    try {
        const key = storageKey(spaceId)
        if (localStorage.getItem(key) !== snapshot) {
            localStorage.setItem(key, snapshot)
        }
        return true
    } catch {
        // Leave the last successful snapshot unchanged so a later Redux update
        // or remount retries unavailable/quota-limited storage.
        return false
    }
}

/**
 * How long a metadata-only tab change waits before it is written.
 *
 * The tab strip mirrors the document title/icon while the user edits, so a
 * title keystroke is a `PAGE_TAB_UPDATE_META` dispatch — writing the whole list
 * to `localStorage` on every one of them is sync I/O for a change that is only
 * cosmetic. Structural changes (open/close) are written immediately; this only
 * coalesces title/icon churn.
 */
const TAB_PERSIST_DEBOUNCE_MS = 250

/**
 * Owns localStorage synchronization for one space. Mount exactly once at the
 * space shell boundary; `usePageTabs` consumers remain side-effect-free.
 */
export const usePageTabsStorage = (spaceId?: string) => {
    const dispatch = useDispatch()
    const store = useStore<GlobalState>()

    useLayoutEffect(() => {
        if (!spaceId || typeof window === "undefined") return

        const bucketBeforeHydration = store.getState().pageTabs?.bySpace?.[spaceId]
        const wasAlreadyHydrated = bucketBeforeHydration?.hydrated === true
        let hadPersistedSnapshot = false

        if (!wasAlreadyHydrated) {
            const persisted = readPersistedTabs(spaceId)
            hadPersistedSnapshot = persisted !== undefined
            dispatch({
                type: "PAGE_TABS_HYDRATE",
                payload: { spaceId, openPages: persisted?.openPages ?? [] },
            })
        }

        let previousBucket = store.getState().pageTabs?.bySpace?.[spaceId]
        let persistedSnapshot: string | undefined
        /** Page ids of the last successful write; a changed set means a structural write. */
        let persistedIds = ""
        let pending: { snapshot: string; ids: string } | null = null
        let timer: ReturnType<typeof setTimeout> | null = null

        const flush = () => {
            if (timer) {
                clearTimeout(timer)
                timer = null
            }
            if (!pending) return
            const { snapshot, ids } = pending
            pending = null
            if (persistTabs(spaceId, snapshot)) {
                persistedSnapshot = snapshot
                persistedIds = ids
            }
        }

        const schedule = (snapshot: string, ids: string) => {
            pending = { snapshot, ids }
            if (timer) return
            timer = setTimeout(() => {
                timer = null
                flush()
            }, TAB_PERSIST_DEBOUNCE_MS)
        }

        // Re-entry with an explicit empty bucket must retry clearing stale
        // storage, while a brand-new empty space waits for route activation and
        // never writes a transient empty list before first paint.
        if (
            previousBucket &&
            (wasAlreadyHydrated || hadPersistedSnapshot || previousBucket.openPages.length > 0)
        ) {
            const snapshot = serializeTabs(previousBucket.openPages)
            const ids = previousBucket.openPages.map(page => page.pageId).join(",")
            if (persistTabs(spaceId, snapshot)) {
                persistedSnapshot = snapshot
                persistedIds = ids
            }
        }

        const unsubscribe = store.subscribe(() => {
            const bucket = store.getState().pageTabs?.bySpace?.[spaceId]
            if (!bucket || bucket === previousBucket) return
            previousBucket = bucket

            const snapshot = serializeTabs(bucket.openPages)
            const ids = bucket.openPages.map(page => page.pageId).join(",")
            // Activation only changes lastActiveAt, which is intentionally not
            // persisted. Avoid blocking dispatch with an identical full write.
            if (snapshot === persistedSnapshot) return
            if (ids !== persistedIds) {
                // Open/close changes the durable shape: write it now.
                pending = { snapshot, ids }
                flush()
                return
            }
            schedule(snapshot, ids)
        })

        // A tab switch does not unmount this hook, but a window close must not
        // lose the last debounced title write.
        window.addEventListener("pagehide", flush)

        return () => {
            unsubscribe()
            flush()
            window.removeEventListener("pagehide", flush)
        }
    }, [dispatch, spaceId, store])
}

/**
 * Manages the set of open page tabs for a single space.
 *
 * URL stays the source of truth for which tab is active. Activating a page also
 * ensures it exists in the open set, so the editor and visible tab strip cannot
 * diverge. Tab instances themselves are still managed by `TabbedEditorArea`.
 */
export const usePageTabs = (spaceId?: string) => {
    const dispatch = useDispatch()
    const bucket = useSelector((state: GlobalState) =>
        spaceId ? state.pageTabs?.bySpace?.[spaceId] : undefined
    )
    const openPages = bucket?.openPages ?? []
    const activePageId = bucket?.activePageId

    /**
     * Ensure a page exists in the strip **without** making it the active tab.
     *
     * Preloading / "open in background" is the only shape this exposes; the
     * shell never needs it today (navigation goes through `activateTab`, which
     * opens and activates in one action), but the reducer action stays for the
     * API's completeness. Callers that mean "show this page" want
     * {@link activateTab}.
     */
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

    return { openPages, activePageId, openTab, activateTab, closeTab, closeTabs, updateMeta }
}
