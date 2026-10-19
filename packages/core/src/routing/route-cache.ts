/**
 * Route cache (keep-alive) bookkeeping, shell policy and defaults.
 *
 * The React half lives in `RouteCacheOutlet.tsx`; everything here is deliberate
 * plain TypeScript so the retention rules can be checked without a DOM
 * (`route-cache.check.ts`). Read the outlet first if the terminology is new:
 * a "slot" is one page route kept mounted, keyed by its route pattern.
 */

/** How many page routes stay mounted on a desktop-class viewport. */
export const ROUTE_CACHE_MAX_DESKTOP = 5

/**
 * Mobile keeps fewer trees alive: a cached workspace still owns its editor
 * instances (ProseMirror + Y.Doc + WebSocket), and mobile runtimes are the ones
 * that get killed for memory.
 */
export const ROUTE_CACHE_MAX_MOBILE = 3

/**
 * Route patterns that must never stay mounted after navigation.
 *
 * Public share viewers and one-shot invite/collaboration flows are entry points
 * of their own: a visitor leaves them by closing the tab, not by browsing back,
 * so keeping their document and collaboration session alive only costs memory
 * (and, for shares, keeps a visitor's session attached to a page they are no
 * longer looking at).
 */
export const ROUTE_CACHE_EXCLUDED_PATHS = ["/share/:shortCode", "/collaborate/:token"] as const

/**
 * Escape hatch for a bad interaction: `localStorage.setItem("kn:route-cache",
 * "off")` plus a reload turns keep-alive off for that browser without a build.
 * Anything other than `"off"` (including an absent key) leaves it on.
 */
export const ROUTE_CACHE_STORAGE_KEY = "kn:route-cache"

export function isRouteCacheDisabledByFlag(): boolean {
    if (typeof window === "undefined") return false
    try {
        return window.localStorage.getItem(ROUTE_CACHE_STORAGE_KEY) === "off"
    } catch {
        // Private mode / disabled storage: keep the feature (the default).
        return false
    }
}

/** Outcome of matching the current URL against the shell's route tree. */
export interface RouteCachePolicy {
    /** Stable cache slot key. Always present so a stale slot can be dropped. */
    key: string
    /** `false` for routes that must unmount on navigation. */
    cacheable: boolean
}

export interface RouteCacheStoreEntry<E, C> {
    readonly key: string
    /** React element of this slot: the live outlet while visible, frozen otherwise. */
    element: E
    /**
     * Route context captured while the slot was last visible (used to freeze
     * `useLocation()` for background pages — see `RouteCacheOutlet`).
     */
    context: C
    /** Monotonic counter; the oldest visible-ago entry is evicted first. */
    lastActiveAt: number
}

/**
 * LRU of mounted route subtrees.
 *
 * Only the shell's `RouteCacheOutlet` mutates this, and only during render — an
 * entry is added/refreshed on every render of the route that is on screen, so
 * "active" is simply "the key passed to the last `enter()`". Entries other than
 * that key are background slots, and a background slot is what gets evicted when
 * the limit is exceeded. The active slot is never evicted.
 */
export class RouteCacheStore<E = unknown, C = unknown> {
    private readonly entriesByKey = new Map<string, RouteCacheStoreEntry<E, C>>()
    private clock = 0
    private activeKey: string | null = null
    private limit: number

    constructor(maxEntries: number = ROUTE_CACHE_MAX_DESKTOP) {
        this.limit = normalizeLimit(maxEntries)
    }

    get max(): number {
        return this.limit
    }

    /** Key of the route currently on screen, if it is cached. */
    get active(): string | null {
        return this.activeKey
    }

    get size(): number {
        return this.entriesByKey.size
    }

    /** Change retention; returns the slots evicted by a shrinking limit. */
    setMax(maxEntries: number): string[] {
        this.limit = normalizeLimit(maxEntries)
        return this.prune()
    }

    /**
     * Route `key` is on screen: create its slot or refresh it in place, make it
     * the active slot, then evict down to the limit.
     */
    enter(key: string, element: E, context: C): string[] {
        this.clock += 1
        const existing = this.entriesByKey.get(key)
        if (existing) {
            existing.element = element
            existing.context = context
            existing.lastActiveAt = this.clock
        } else {
            this.entriesByKey.set(key, {
                key,
                element,
                context,
                lastActiveAt: this.clock,
            })
        }
        this.activeKey = key
        return this.prune()
    }

    /**
     * The route on screen is **not** cacheable. It has no slot of its own; if a
     * stale slot happens to use the same key (e.g. the route opted out after
     * being cached, or an unmatched path reuses a former pattern), drop it, and
     * mark the cache as having no visible slot so every kept tree is backgrounded.
     */
    leaveUncached(key: string | null): string[] {
        this.activeKey = null
        if (!key) return []
        if (!this.entriesByKey.delete(key)) return []
        return [key]
    }

    /** Slots in render order (stable: reactivation does not reorder the DOM). */
    list(): RouteCacheStoreEntry<E, C>[] {
        return Array.from(this.entriesByKey.values())
    }

    /** Drop every slot; returns the evicted keys. */
    clear(): string[] {
        const keys = Array.from(this.entriesByKey.keys())
        this.entriesByKey.clear()
        this.activeKey = null
        return keys
    }

    private prune(): string[] {
        const evicted: string[] = []
        while (this.entriesByKey.size > this.limit) {
            let oldest: RouteCacheStoreEntry<E, C> | null = null
            for (const entry of this.entriesByKey.values()) {
                if (entry.key === this.activeKey) continue
                if (!oldest || entry.lastActiveAt < oldest.lastActiveAt) oldest = entry
            }
            // Only the active slot is left (limit 0/1 with nothing to evict).
            if (!oldest) break
            this.entriesByKey.delete(oldest.key)
            evicted.push(oldest.key)
        }
        return evicted
    }
}

function normalizeLimit(value: number): number {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, Math.floor(value))
}

// ---------------------------------------------------------------------------
// Policy: which slot does the current URL belong to, and may it be kept?
// ---------------------------------------------------------------------------

/** The subset of react-router's `UIMatch` the policy needs. */
export interface MatchedRouteView {
    /**
     * Route `handle` as attached by the shell's route builder. The pattern has
     * to ride here rather than be read from the match: `useMatches()` exposes
     * `id`/`pathname`/`handle`, not the route object (v6.30).
     */
    handle?: unknown
}

/** `handle` payload the route builder attaches to every page route. */
export interface RouteCacheHandle {
    routeCache: {
        /** Route pattern, e.g. `/space-detail/:id`. */
        pattern: string
        /** `false` opts the route out of keep-alive. */
        keepAlive?: boolean
    }
}

/** Build the `handle` a page route carries for the route cache. */
export function createRouteCacheHandle(pattern: string, keepAlive?: boolean): RouteCacheHandle {
    return {
        routeCache: keepAlive === undefined ? { pattern } : { pattern, keepAlive },
    }
}

/** The subset of a plugin `RouteConfig` the policy needs. */
export interface LiveRouteView {
    path?: string
    keepAlive?: boolean
    children?: readonly LiveRouteView[]
}

/**
 * `matchPath`-shaped matcher, injected so this module stays free of React
 * Router imports (the shell passes the real one).
 */
export type RoutePatternMatcher = (pattern: string, pathname: string, end: boolean) => boolean

export interface RouteCachePolicyInput {
    /** `useMatches()` output. `matches[1]` is the page route inside the shell. */
    matches: readonly MatchedRouteView[]
    pathname: string
    /** `usePluginRoutes()` output — needed because live plugin routes are not baked. */
    liveRoutes?: readonly LiveRouteView[]
    /** Route patterns that must not be cached (`ROUTE_CACHE_EXCLUDED_PATHS`). */
    excludedPaths?: readonly string[]
    matcher: RoutePatternMatcher
}

/**
 * Decide the cache slot for the URL on screen.
 *
 * Baked routes use their pattern (`/space-detail/:id`), so navigating between
 * two spaces or two pages of one space reuses a single slot — state survives a
 * parameter change, exactly like Vue's default `<keep-alive>` behaviour. Live
 * plugin routes (resolved by `*`, see `LivePluginRoutes`) have no baked pattern,
 * so the best matching registry route supplies it. Anything else (a 404, a
 * loading fallback) is not cached: it has no page to preserve.
 */
export function resolveRouteCachePolicy(input: RouteCachePolicyInput): RouteCachePolicy {
    const { matches, pathname, liveRoutes = [], excludedPaths = [], matcher } = input
    const pageMatch = matches.length > 1 ? matches[1] : undefined
    const routeCache = readRouteCacheHandle(pageMatch?.handle)
    const pattern = routeCache?.pattern?.trim()

    if (pattern && pattern !== "*") {
        return {
            key: `route:${pattern}`,
            cacheable: routeCache?.keepAlive !== false && !isExcluded(pathname, excludedPaths, matcher),
        }
    }

    const live = findLiveRoute(liveRoutes, pathname, matcher)
    if (live) {
        return {
            key: `plugin:${live.path}`,
            cacheable: (live.keepAlive !== false) && !isExcluded(pathname, excludedPaths, matcher),
        }
    }

    // Unmatched (or still-loading) fallback: render it live, never cache it.
    return { key: `unmatched:${pathname}`, cacheable: false }
}

function readRouteCacheHandle(handle: unknown): { pattern?: string; keepAlive?: boolean } | null {
    if (!handle || typeof handle !== "object") return null
    const routeCache = (handle as { routeCache?: unknown }).routeCache
    if (!routeCache || typeof routeCache !== "object") return null
    const { pattern, keepAlive } = routeCache as { pattern?: unknown; keepAlive?: unknown }
    return {
        ...(typeof pattern === "string" ? { pattern } : {}),
        ...(keepAlive === false ? { keepAlive: false } : {}),
    }
}

function isExcluded(
    pathname: string,
    excludedPaths: readonly string[],
    matcher: RoutePatternMatcher,
): boolean {
    return excludedPaths.some((pattern) => matcher(pattern, pathname, false))
}

/**
 * Best matching **top-level** live route. Top-level, because the shell caches
 * the tree directly under the layout: a plugin's child routes live inside the
 * same slot and must not each become one. Longest pattern wins, so a plugin with
 * both `/notes` and `/notes/archive` keeps them in separate slots.
 */
function findLiveRoute(
    routes: readonly LiveRouteView[],
    pathname: string,
    matcher: RoutePatternMatcher,
): LiveRouteView | undefined {
    let best: LiveRouteView | undefined
    for (const route of routes) {
        if (!route.path) continue
        // Leaf routes match exactly; a parent route stays matched while its
        // children are (same rule `useRoutes` applies to nested route objects).
        const end = !route.children?.length
        if (!matcher(route.path, pathname, end)) continue
        if (!best?.path || route.path.length > best.path.length) best = route
    }
    return best
}
