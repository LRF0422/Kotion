import { ReactNode } from "react"

export interface RouteConfig {
    path: string
    name: string
    element?: ReactNode
    children?: RouteConfig[]
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
