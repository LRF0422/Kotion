/**
 * "固定到主菜单" for user pages: the data, the rules, and the service contract.
 *
 * Deliberately free of runtime dependencies (the one React import is type-only)
 * so the rules can be exercised by `shortcuts.check.ts` without the app bundle.
 * Three writers touch this list (the page-tree menu, the rail's context menu,
 * the startup hydration) and they must all agree on identity — `pageId` — and
 * on ordering, because that ordering *is* the rail's icon order.
 *
 * The stored shape carries the title and icon, not just the id: the rail has to
 * paint something before (and without) fetching the page, and a pinned page in a
 * space the user has not opened yet would otherwise render as an empty slot.
 */
import type { ReactNode } from "react"

/** Icon payload of a page, as the space/page API returns it. */
export interface PinnedPageIcon {
    type?: string
    icon: string
    config?: unknown
}

/** One pinned page, as persisted and as rendered in the rail. */
export interface PinnedPage {
    pageId: string
    /** Which space the page lives in — required to build its route. */
    spaceId: string
    /** Display title; empty when the page is still untitled. */
    title: string
    icon?: PinnedPageIcon
    /** Epoch ISO string of when the page was pinned (newest last). */
    pinnedAt?: string
}

/** What callers hand over; the service fills in `pinnedAt` and drops junk icons. */
export interface PinnedPageInput {
    pageId: string
    spaceId: string
    title?: string
    icon?: unknown
}

/** The observable state of the pinned-page set. */
export interface PinnedPagesSnapshot {
    /** Pinned pages, in rail order. */
    pages: PinnedPage[]
    /**
     * The page the app opens at `/` on instead of the home dashboard.
     *
     * Always one of `pages`: setting it pins the page, and unpinning a page
     * clears it — a startup page that is not on the rail would be state the user
     * can neither see nor undo.
     */
    home: PinnedPage | null
    /** False until the durable copy has been read; the rail waits for it. */
    hydrated: boolean
    /**
     * Whether this session's pins are actually reaching durable storage.
     *
     * `false` means the shortcuts work now and are gone after a restart — the
     * host has no storage, storage is not durable (in-memory fallback), or a
     * write has failed. Surfaced so the UI can say so instead of promising a
     * shortcut it cannot keep.
     */
    persistent: boolean
}

/**
 * Host surface for pinned pages (`Services['pinnedPages']`).
 *
 * Every mutation is optimistic: the in-memory set changes and the rail is
 * notified before the (best-effort) write lands, so a slow SQLite round-trip can
 * never make the pin button feel dead.
 */
export interface PinnedPagesService {
    snapshot(): PinnedPagesSnapshot
    subscribe(listener: () => void): () => void
    isPinned(pageId: string): boolean
    isHome(pageId: string): boolean
    pin(page: PinnedPageInput): Promise<void>
    unpin(pageId: string): Promise<void>
    /** Pin when absent, unpin when present. Resolves the resulting pinned state. */
    toggle(page: PinnedPageInput): Promise<boolean>
    /** `null` clears the startup page. */
    setHome(page: PinnedPageInput | null): Promise<void>
    /** Read the durable copy once; safe to call twice. */
    hydrate(): Promise<void>
    /**
     * How a pinned page is drawn (title, rail glyph, right-click menu).
     *
     * The kernel owns *what* is pinned; the host owns *how it looks*. Setting
     * it re-publishes the rail, so a host may register the presentation after
     * the service has already hydrated.
     */
    setPresentation(presentation: PinnedPagesPresentation | null): void
}

/**
 * Host-supplied rendering of one pinned page.
 *
 * Deliberately three small functions rather than a component: the same page is
 * drawn in the rail (icon + title + right-click menu) and the kernel must not
 * import a component library to do it. Every field falls back to a plain,
 * dependency-free rendering so a host that supplies nothing still gets a
 * working rail.
 */
export interface PinnedPagesPresentation {
    /** Hover label / accessible name of the rail entry. */
    title(page: PinnedPage): string
    /** Rail glyph. */
    icon(page: PinnedPage): ReactNode
    /** Body of the entry's right-click menu; `null` for no menu. */
    menu(page: PinnedPage): ReactNode
}

/** `app.*` is the shell's namespace root (see `StorageService`). */
export const PINNED_PAGES_NAMESPACE = "app.shortcuts"
export const PINNED_PAGES_KEY = "pinned-pages"
export const PINNED_HOME_KEY = "home-page"

/**
 * The rail is an icon column, not a list: beyond a handful of entries it stops
 * being a shortcut and starts being a second page tree.
 */
export const MAX_PINNED_PAGES = 8

/** Registry key of one pinned entry; `pin:` keeps it out of plugin ids. */
export const pinnedMenuKey = (pageId: string): string => `pin:${pageId}`

/**
 * Route the rail navigates to for a pinned page.
 *
 * A shortcut opens the *page*, not the workspace it lives in: `/page/...` renders
 * the page on its own (no page tree, no tab strip), which is what "click the
 * shortcut and you are reading the page" has to mean. The space stays one
 * breadcrumb click away from there.
 */
export const pinnedPageRoute = (page: Pick<PinnedPage, "pageId" | "spaceId">): string =>
    `/page/${encodeURIComponent(page.spaceId)}/${encodeURIComponent(page.pageId)}`

/** Non-empty trimmed string, or null. */
const asText = (value: unknown): string | null => {
    if (typeof value !== "string") return null
    const text = value.trim()
    return text ? text : null
}

/**
 * Accept only the icon shape the rail can draw; anything else is dropped rather
 * than persisted. A pinned page whose icon is garbage still renders (as the
 * default glyph) — the alternative was a stored value that throws on read.
 */
const parseIcon = (value: unknown): PinnedPageIcon | undefined => {
    if (!value || typeof value !== "object") return undefined
    const record = value as Record<string, unknown>
    if (typeof record.icon !== "string" || !record.icon) return undefined
    const icon: PinnedPageIcon = { icon: record.icon }
    if (typeof record.type === "string" && record.type) icon.type = record.type
    if (record.config !== undefined) icon.config = record.config
    return icon
}

/**
 * Normalize one pin request. Returns null when the identity is incomplete:
 * without a `spaceId` the entry has no route to navigate to, and a rail entry
 * that does nothing is worse than no entry.
 */
export const toPinnedPage = (input: PinnedPageInput, pinnedAt?: string): PinnedPage | null => {
    const pageId = asText(input?.pageId)
    const spaceId = asText(input?.spaceId)
    if (!pageId || !spaceId) return null
    const page: PinnedPage = {
        pageId,
        spaceId,
        title: typeof input.title === "string" ? input.title : "",
    }
    const icon = parseIcon(input.icon)
    if (icon) page.icon = icon
    if (pinnedAt) page.pinnedAt = pinnedAt
    return page
}

/** Two entries naming the same page. Identity is the page id, never the title. */
export const isSamePinnedPage = (page: PinnedPage, other: Pick<PinnedPage, "pageId">): boolean =>
    page.pageId === other.pageId

export const hasPinnedPage = (pages: PinnedPage[], pageId: string): boolean =>
    pages.some((page) => page.pageId === pageId)

/**
 * Add a page, or refresh its title/icon when it is already pinned.
 *
 * The slot is kept in place on refresh — the user's chosen order must survive a
 * rename — and the list is capped from the *front* on insert, because new pins
 * append (the rail reads top-down as "in the order I pinned them").
 */
export const upsertPinnedPage = (
    pages: PinnedPage[],
    page: PinnedPage,
    max: number = MAX_PINNED_PAGES,
): PinnedPage[] => {
    const index = pages.findIndex((candidate) => isSamePinnedPage(candidate, page))
    if (index >= 0) {
        const existing = pages[index]
        const next = [...pages]
        // A refresh must not lose when the page was originally pinned.
        next[index] = { ...page, pinnedAt: existing.pinnedAt ?? page.pinnedAt }
        return next
    }
    return [...pages, page].slice(-Math.max(1, max))
}

export const removePinnedPage = (pages: PinnedPage[], pageId: string): PinnedPage[] =>
    pages.filter((page) => page.pageId !== pageId)

/** Parse one persisted entry defensively (user-writable data). */
export const parsePinnedPage = (value: unknown): PinnedPage | null => {
    if (!value || typeof value !== "object") return null
    const record = value as Record<string, unknown>
    const pageId = asText(record.pageId)
    const spaceId = asText(record.spaceId)
    if (!pageId || !spaceId) return null
    const page: PinnedPage = {
        pageId,
        spaceId,
        title: typeof record.title === "string" ? record.title : "",
    }
    const icon = parseIcon(record.icon)
    if (icon) page.icon = icon
    const pinnedAt = asText(record.pinnedAt)
    if (pinnedAt) page.pinnedAt = pinnedAt
    return page
}

/**
 * Parse the persisted list: duplicates collapse (first wins), unusable entries
 * are skipped, and the cap is re-applied — a build with a larger cap may have
 * written more entries than this one can show.
 */
export const parsePinnedPages = (value: unknown, max: number = MAX_PINNED_PAGES): PinnedPage[] => {
    if (!Array.isArray(value)) return []
    const pages: PinnedPage[] = []
    for (const entry of value) {
        const page = parsePinnedPage(entry)
        if (!page) continue
        if (hasPinnedPage(pages, page.pageId)) continue
        pages.push(page)
    }
    return pages.slice(-Math.max(1, max))
}
