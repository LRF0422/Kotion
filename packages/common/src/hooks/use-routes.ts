import { useContext, useMemo } from "react"
import { AppContext } from "../core/AppContext"
import type { RouteConfig } from "../core/route"
import { usePluginState } from "./use-plugin-state"

/**
 * Reactive plugin routes.
 *
 * The host renders these **live** from a splat outlet inside the shell, rather
 * than only baking them into the router's tree. Why it has to be live: the router
 * is created before plugins load and is only rebuilt when a plugin change happens
 * to emit `PLUGIN_CHANGED` — which the plugin studio's dev install deliberately
 * does *not* do (otherwise every save would rebuild the router and remount the
 * window). A plugin that appears after boot therefore had a sidebar entry whose
 * path the router had never heard of, and clicking it landed on nothing. Reading
 * the routes from the registry on each render is what makes a route exist as soon
 * as its plugin does — and what lets a hot reload change a route's *code* without
 * touching the router at all.
 */
export function usePluginRoutes(): RouteConfig[] {
    const { pluginManager } = useContext(AppContext)
    const { pluginVersion } = usePluginState()

    return useMemo(
        () => pluginManager?.resolveRoutes() ?? [],
        [pluginManager, pluginVersion]
    )
}
