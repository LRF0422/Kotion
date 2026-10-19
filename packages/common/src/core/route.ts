import { ReactNode } from "react"

export interface RouteConfig {
    path: string
    name: string
    element?: ReactNode
    children?: RouteConfig[]
    /**
     * Route cache (keep-alive) participation for this page route.
     *
     * The shell keeps a page route's component tree mounted — state, scroll,
     * open editors and WebSocket subscriptions included — when the user
     * navigates away, and re-attaches it instantly on return (the same contract
     * as Vue's `<keep-alive>`). Caching is on by default; `false` opts this route
     * out, which is what you want for one-shot flows (invites, public shares) or
     * pages that own exclusive global side effects.
     *
     * Only the route rendered directly inside the app shell is considered: a
     * nested child route inherits its parent's lifetime.
     */
    keepAlive?: boolean
}

/**
 * A route as returned by `PluginManager.resolveRoutes()`.
 *
 * Provenance like dock panels and menus, for the same reason: it lets a caller
 * answer "what does this plugin contribute to the shell" (the studio shows exactly
 * that) instead of inferring it from the plugin's config, which may not be what the
 * registry is running.
 */
export interface ResolvedRouteConfig extends RouteConfig {
    source: "plugin" | "core"
    owner: string
    pluginKey: string
}
