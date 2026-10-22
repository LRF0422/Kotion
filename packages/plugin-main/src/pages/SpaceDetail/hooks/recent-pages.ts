/**
 * Pure state rules for the workspace sidebar's "Recent" list.
 *
 * Kept free of React and `@kn/common` imports so the rules can be exercised by
 * `recent-pages.check.ts` without the app bundle: the list has two writers (the
 * server query and page-visit recording) and one hard invariant — a page that
 * was moved to the trash must never be listed as a place you can go back to.
 */

/** One entry in the sidebar's "Recent" list. */
export interface RecentPageItem {
    id: string
    title: string
    icon?: { icon: string }
    updatedAt?: string
    spaceId?: string
    /** Page status as reported by the API; absent on older cached entries. */
    status?: string
}

/** Structural subset of `PageSummary` that the recent list consumes. */
export interface RecentPageSource {
    id: string
    title: string
    icon?: unknown
    spaceId?: string
    updatedAt?: unknown
    status?: unknown
}

export const RECENT_PAGES_STORAGE_KEY = 'kn:recent-pages'
export const MAX_RECENT_ITEMS = 8

/**
 * The backend serializes its page-status enum as `{ value, desc }` (see the
 * Java `EnumSerializer`); the domain layer unwraps that, but this helper keeps
 * the list correct even if a row reaches it pre-normalization.
 */
const statusValue = (status: unknown): string | undefined => {
    const raw = status && typeof status === 'object'
        ? (status as { value?: unknown }).value ?? (status as { code?: unknown }).code
        : status
    if (typeof raw !== 'string') return undefined
    const trimmed = raw.trim()
    return trimmed || undefined
}

/**
 * TRASH/DELETED pages are not part of the reader's world: listing one would
 * offer a link to a page that can no longer be edited (or, before this was
 * handled, still opened normally). Unknown/absent status counts as live so the
 * localStorage fallback written by older versions stays usable.
 */
export const isLivePageStatus = (status?: unknown): boolean => {
    const value = statusValue(status)
    return value !== 'TRASH' && value !== 'DELETED'
}

export const toRecentPageItem = (page: RecentPageSource): RecentPageItem => ({
    id: page.id,
    title: page.title,
    icon: page.icon && typeof page.icon === 'object' && 'icon' in page.icon && typeof (page.icon as { icon?: unknown }).icon === 'string'
        ? page.icon as RecentPageItem['icon']
        : undefined,
    updatedAt: page.updatedAt == null ? undefined : String(page.updatedAt),
    spaceId: page.spaceId,
    status: statusValue(page.status),
})

/** Map an API result to the recent list: live pages only, capped, order kept. */
export const toRecentPageItems = (pages: RecentPageSource[]): RecentPageItem[] =>
    pages
        .filter((page) => isLivePageStatus(page.status))
        .slice(0, MAX_RECENT_ITEMS)
        .map(toRecentPageItem)

/**
 * Record a visit: move the page to the front, drop the previous occurrence and
 * trim to the cap. Trashed pages are refused outright.
 */
export const recordRecentPage = (
    pages: RecentPageItem[],
    page: Omit<RecentPageItem, 'updatedAt'> & { updatedAt?: string },
    visitedAt: string = new Date().toISOString(),
): RecentPageItem[] => {
    if (!isLivePageStatus(page.status)) return pages.filter(isLiveRecentPage)
    // A trashed entry must never survive a write, whichever path added it.
    return [
        { ...page, updatedAt: visitedAt },
        ...pages.filter((item) => item.id !== page.id && isLiveRecentPage(item)),
    ].slice(0, MAX_RECENT_ITEMS)
}

/** Forget one page (used when it is trashed/deleted while the shell is alive). */
export const dropRecentPage = (pages: RecentPageItem[], pageId: string): RecentPageItem[] =>
    pages.filter((item) => item.id !== pageId)

export const isLiveRecentPage = (page: RecentPageItem): boolean => isLivePageStatus(page.status)

/**
 * Parse the localStorage fallback defensively. It is user-writable data, so a
 * malformed value must degrade to "no history" rather than crash the sidebar,
 * and entries already known to be trashed must not be resurrected.
 */
export const parseRecentPages = (raw: string | null): RecentPageItem[] => {
    if (!raw) return []
    try {
        const parsed: unknown = JSON.parse(raw)
        if (!Array.isArray(parsed)) return []
        const seen = new Set<string>()
        const items: RecentPageItem[] = []
        for (const value of parsed) {
            if (!value || typeof value !== 'object') continue
            const candidate = value as Partial<RecentPageItem>
            if (typeof candidate.id !== 'string' || !candidate.id || seen.has(candidate.id)) continue
            if (!isLivePageStatus(candidate.status)) continue
            seen.add(candidate.id)
            const status = statusValue(candidate.status)
            items.push({
                id: candidate.id,
                title: typeof candidate.title === 'string' ? candidate.title : '',
                ...(candidate.icon && typeof candidate.icon === 'object' && typeof candidate.icon.icon === 'string'
                    ? { icon: { icon: candidate.icon.icon } }
                    : {}),
                ...(typeof candidate.updatedAt === 'string' ? { updatedAt: candidate.updatedAt } : {}),
                ...(typeof candidate.spaceId === 'string' ? { spaceId: candidate.spaceId } : {}),
                ...(status ? { status } : {}),
            })
            if (items.length >= MAX_RECENT_ITEMS) break
        }
        return items
    } catch {
        return []
    }
}

export const serializeRecentPages = (pages: RecentPageItem[]): string => JSON.stringify(pages)
