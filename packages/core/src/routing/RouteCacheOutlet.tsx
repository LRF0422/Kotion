import React, { useContext, useEffect, useRef } from "react"
import {
    RouteCacheActivityProvider,
    UNSAFE_LocationContext,
    matchPath,
    useLocation,
    useMatches,
    useOutlet,
    usePluginRoutes,
} from "@kn/common"
import { cn, useIsMobile } from "@kn/ui"
import {
    ROUTE_CACHE_EXCLUDED_PATHS,
    ROUTE_CACHE_MAX_DESKTOP,
    ROUTE_CACHE_MAX_MOBILE,
    RouteCacheStore,
    resolveRouteCachePolicy,
    type RouteCacheStoreEntry,
} from "./route-cache"

/** Route context as react-router provides it to the shell. */
type LocationContextValue = React.ContextType<typeof UNSAFE_LocationContext>

export interface RouteCacheOutletProps {
    /** Skip keep-alive entirely (navigation unmounts pages, as before). */
    disabled?: boolean
}

/**
 * `<Outlet />` with Vue-`<keep-alive>` semantics: page routes stay mounted when
 * the user navigates away, and come back with their state intact.
 *
 * Why the shell owns this: the app is a workspace of heavy pages (a page editor
 * alone holds ProseMirror + Y.Doc + a collaboration socket), and every trip to
 * Home, Settings or the plugin hub used to tear the whole tree down — losing
 * tree expansion, filters, scroll and the open-editor pool, then paying the full
 * mount cost on return. Keeping the last few page trees mounted makes those
 * round trips instant.
 *
 * How it works:
 *
 * - The route on screen is matched to a **slot** keyed by its route pattern
 *   (`route:/space-detail/:id`), so switching between two spaces or two pages of
 *   one space reuses one slot — like Vue's default `<keep-alive>`.
 * - Every slot is rendered inside an absolutely positioned layer. The visible
 *   layer is on top; background layers stay mounted but `visibility: hidden`,
 *   `inert` and `aria-hidden`, so they cannot take pointer or keyboard input.
 * - Background layers render their **frozen** element: the last element object
 *   the router produced for that slot. Their route context (params, matches) is
 *   frozen with it, and `useLocation()` is served the location captured while
 *   the slot was visible, so a background page cannot react to — or redirect —
 *   the navigation that just happened.
 * - `visibility`, not `display: none`, is deliberate: it keeps the layers'
 *   layout boxes, so inner scroll positions and media/animation state survive
 *   the hidden period.
 * - At most `max` slots exist (desktop 5 / mobile 3, see `route-cache.ts`); the
 *   least recently visible background slot is unmounted when the limit is hit.
 *
 * Page-side contract: while hidden, a page is still mounted. Global listeners,
 * header registration and "only while visible" timers must be gated with
 * `useRouteCacheActive()` from `@kn/common` — see its docs and
 * `docs/ROUTE_CACHE.md`.
 */
export const RouteCacheOutlet: React.FC<RouteCacheOutletProps> = ({ disabled = false }) => {
    const outlet = useOutlet()
    const location = useLocation()
    const matches = useMatches()
    const liveRoutes = usePluginRoutes()
    const locationContext = useContext(UNSAFE_LocationContext)
    const isMobile = useIsMobile()

    const storeRef = useRef<RouteCacheStore<React.ReactNode, LocationContextValue> | null>(null)
    if (!storeRef.current) {
        storeRef.current = new RouteCacheStore<React.ReactNode, LocationContextValue>(
            isMobile ? ROUTE_CACHE_MAX_MOBILE : ROUTE_CACHE_MAX_DESKTOP,
        )
    }
    const store = storeRef.current

    const max = isMobile ? ROUTE_CACHE_MAX_MOBILE : ROUTE_CACHE_MAX_DESKTOP
    if (store.max !== max) store.setMax(max)

    const policy = disabled
        ? null
        : resolveRouteCachePolicy({
            matches,
            pathname: location.pathname,
            liveRoutes,
            excludedPaths: ROUTE_CACHE_EXCLUDED_PATHS,
            matcher: (pattern, pathname, end) => Boolean(matchPath({ path: pattern, end }, pathname)),
        })

    if (policy?.cacheable) {
        // Refresh the visible slot's element/context in place; this is also what
        // reactivates a slot on return (a new element updates the same subtree
        // instead of remounting it).
        store.enter(policy.key, outlet, locationContext)
    } else {
        store.leaveUncached(policy?.key ?? null)
    }

    if (disabled) {
        // No wrapper at all when the feature is off: the shell's output must be
        // byte-for-byte what it was before keep-alive existed.
        store.clear()
        return <>{outlet}</>
    }

    const entries = store.list()
    const activeKey = store.active

    return (
        <div className="relative h-full min-h-0 w-full" data-route-cache>
            {entries.map((entry) => (
                <RouteCacheLayer
                    key={entry.key}
                    entry={entry}
                    active={entry.key === activeKey}
                    liveContext={locationContext}
                >
                    {entry.element}
                </RouteCacheLayer>
            ))}
            {activeKey === null && (
                // The visible route is not cached (404, loading fallback, an
                // opted-out page). It renders in its own transient layer while
                // the kept trees stay backgrounded behind it.
                <RouteCacheLayer
                    key="__live__"
                    entry={null}
                    active
                    liveContext={locationContext}
                >
                    {outlet}
                </RouteCacheLayer>
            )}
        </div>
    )
}

interface RouteCacheLayerProps {
    /** Slot metadata; `null` for the transient uncached layer. */
    entry: RouteCacheStoreEntry<React.ReactNode, LocationContextValue> | null
    active: boolean
    liveContext: LocationContextValue
    children: React.ReactNode
}

const RouteCacheLayer: React.FC<RouteCacheLayerProps> = ({ entry, active, liveContext, children }) => {
    const layerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const layer = layerRef.current
        if (!layer) return
        if (active) {
            layer.removeAttribute("inert")
            layer.removeAttribute("aria-hidden")
            return
        }
        // A hidden-but-mounted page must not be reachable by keyboard (or by
        // screen readers): keep-alive layered the whole page out of sight, not
        // out of the tab order. `inert` also drops focus that was already inside.
        layer.setAttribute("inert", "")
        const focused = document.activeElement
        if (focused instanceof HTMLElement && layer.contains(focused)) focused.blur()
        // Set after blurring: an ancestor of the focused element that becomes
        // aria-hidden is (correctly) rejected by the browser.
        layer.setAttribute("aria-hidden", "true")
    }, [active])

    // Background pages see the location they were left on, not the one the user
    // just navigated to (see the component doc above).
    const context = active || !entry ? liveContext : entry.context

    return (
        <div
            ref={layerRef}
            data-route-cache-layer={entry?.key ?? "__live__"}
            data-route-cache-active={active ? "" : undefined}
            className={cn(
                "absolute inset-0 min-h-0 w-full",
                active
                    ? "z-10 visible opacity-100"
                    : "pointer-events-none invisible z-0 opacity-0",
            )}
        >
            <RouteCacheActivityProvider active={active} cacheKey={entry?.key}>
                <UNSAFE_LocationContext.Provider value={context}>
                    {children}
                </UNSAFE_LocationContext.Provider>
            </RouteCacheActivityProvider>
        </div>
    )
}
