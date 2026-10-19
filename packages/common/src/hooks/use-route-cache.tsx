import React, { createContext, useContext, useMemo } from "react"

/**
 * Route cache (keep-alive) activity, provided by the app shell.
 *
 * The shell keeps the last few page routes mounted while the user navigates
 * elsewhere (see `RouteCacheOutlet` in `@kn/core`). That is what preserves
 * editor state, scroll and in-flight requests across navigation — but it also
 * changes a fact pages used to be able to rely on: **a page that is no longer on
 * screen is still mounted**. An effect that was previously "unmount means stop"
 * keeps running, and a document-level listener keeps listening.
 *
 * A page can tell the difference with this context:
 *
 * ```tsx
 * const active = useRouteCacheActive()
 * useEffect(() => {
 *     if (!active) return
 *     const onKeyDown = (e: KeyboardEvent) => { ... }
 *     document.addEventListener("keydown", onKeyDown)
 *     return () => document.removeEventListener("keydown", onKeyDown)
 * }, [active])
 * ```
 *
 * The default value is `true`, so anything rendered outside a cached route (the
 * shell, login/sign-up screens, plugin-owned overlays) behaves exactly as before.
 */
export interface RouteCacheActivity {
    /** `false` while this route is cached in the background. */
    active: boolean
    /**
     * Cache slot of the enclosing route, e.g. `route:/space-detail/:id`. Useful
     * for logging/telemetry; treat as opaque.
     */
    cacheKey?: string
}

const VISIBLE_ROUTE: RouteCacheActivity = { active: true }

/**
 * Provided once per cached route layer by the shell. Exported for the shell
 * itself (`RouteCacheOutlet`); pages should use {@link useRouteCacheActive}.
 */
export const RouteCacheActivityContext = createContext<RouteCacheActivity>(VISIBLE_ROUTE)

export const RouteCacheActivityProvider: React.FC<{
    active: boolean
    cacheKey?: string
    children: React.ReactNode
}> = ({ active, cacheKey, children }) => {
    const value = useMemo<RouteCacheActivity>(
        () => (active ? { active: true, cacheKey } : { active: false, cacheKey }),
        [active, cacheKey],
    )
    return (
        <RouteCacheActivityContext.Provider value={value}>
            {children}
        </RouteCacheActivityContext.Provider>
    )
}

/** The full activity descriptor of the enclosing cached route. */
export function useRouteCacheActivity(): RouteCacheActivity {
    return useContext(RouteCacheActivityContext)
}

/**
 * `true` when the enclosing route is the one on screen (or is not cached at
 * all). `false` when the route tree is kept alive in the background.
 *
 * Gate document/window listeners, timers, title/header registration and other
 * "only while visible" work on this value — see the module doc above.
 */
export function useRouteCacheActive(): boolean {
    return useContext(RouteCacheActivityContext).active
}

/**
 * Run `callback` when the enclosing route becomes visible again.
 *
 * Keep-alive means a returning page does **not** re-run its mount effects, so a
 * page that wants to refresh stale data on return (the usual counterpart of
 * Vue's `onActivated`) registers it here. The callback is not invoked on the
 * initial mount — mount effects already run for that — only on the
 * background→visible transition.
 */
export function useOnRouteCacheActivated(callback: () => void, deps: React.DependencyList = []): void {
    const active = useRouteCacheActive()
    const previousActive = React.useRef(active)

    React.useEffect(() => {
        const wasActive = previousActive.current
        previousActive.current = active
        if (active && !wasActive) callback()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, ...deps])
}
