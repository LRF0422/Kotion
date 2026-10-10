import React, { useMemo } from 'react'
import { useLocation, useRoutes } from 'react-router-dom'
import type { RouteObject } from 'react-router-dom'
import { usePluginRoutes, type RouteConfig } from '@kn/common'
import { ErrorPage } from '../components/ErrorPage'
import { PluginErrorBoundary } from '../components/PluginErrorBoundary'

/**
 * Plugin routes the router's own tree does not know about — resolved live.
 *
 * The router is created once (before plugins load), so the routes that existed at
 * that moment are baked into it. Everything a plugin contributes *later* has no
 * route at all: the plugin studio's dev build is the important case, and it never
 * emits the `PLUGIN_CHANGED` that would rebuild the router — deliberately, because
 * rebuilding the router remounts the whole window on every save. The result was a
 * plugin whose sidebar entry navigated to a path the router had never heard of.
 *
 * This component is the shell route's `*` child, so it sees exactly those paths and
 * matches them against the live registry (`usePluginRoutes`, reactive to plugin
 * changes). A plugin's routes therefore work the moment the plugin is active, with
 * no router rebuild — and because the matched element's component carries the
 * hot-reload identity (see `KPlugin.mapComponents`), a save updates the page in
 * place instead of remounting it.
 *
 * Routes that *were* baked keep winning: react-router ranks a static path above a
 * splat, so this only ever handles what the tree cannot match.
 */
export const LivePluginRoutes: React.FC<{ ready: boolean }> = ({ ready }) => {
    const routes = usePluginRoutes()
    const location = useLocation()

    const objects = useMemo<RouteObject[]>(
        () => routes.map(toRouteObject).filter((route): route is RouteObject => route !== null),
        [routes],
    )

    // `useRoutes` matches relative to this outlet's parent (`*`), whose remaining
    // pathname is the whole URL, so the plugins' absolute paths resolve as written.
    const matched = useRoutes(objects, location)

    if (matched) return <>{matched}</>
    if (!ready) {
        return (
            <div className="flex h-full items-center justify-center text-muted-foreground">
                Loading…
            </div>
        )
    }
    return <ErrorPage />
}

/**
 * One route config → one route object, isolating the page in the same error
 * boundary the baked routes use (a crashing plugin page must not take the shell
 * with it). Returns null for a config with nothing to render, so a path-only
 * marker cannot shadow the not-found fallback with a blank page.
 */
const toRouteObject = (route: RouteConfig): RouteObject | null => {
    const children = (route.children ?? [])
        .map(toRouteObject)
        .filter((child): child is RouteObject => child !== null)
    if (!route.element && children.length === 0) return null

    return {
        path: route.path,
        ...(route.element
            ? {
                element: (
                    <PluginErrorBoundary pluginName={route.name} variant="page">
                        {route.element}
                    </PluginErrorBoundary>
                ),
            }
            : {}),
        ...(children.length ? { children } : {}),
    }
}
