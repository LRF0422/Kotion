import { useContext, useMemo } from "react"
import { AppContext } from "../core/AppContext"
import type { SiderMenuItemProps } from "../core/menu"
import type { PluginSettingsConfig } from "../core/PluginManager"
import type { TourConfig } from "../core/tour"
import { usePluginState } from "./use-plugin-state"

/**
 * Reactive views of the contributions a plugin makes to the *shell*.
 *
 * Each of these is a **projection of the registry**, so it has to be read through
 * a hook that subscribes to the registry — which is what `usePluginState()` is.
 * Reading `pluginManager.resolveX()` from a memo, or refreshing it on the global
 * `PLUGIN_CHANGED` event, silently misses the plugin studio's dev builds: a dev
 * install deliberately never emits that event (emitting it would rebuild the
 * router and remount the window on every save). The symptoms were one and the
 * same bug wearing four hats — a dev plugin whose panel hot-reloaded fine but
 * whose sidebar entry, settings panel, tours and translations never appeared.
 *
 * (Dock panels, page types, routes and agent cards already had their own reactive
 * hooks; the shell-facing ones were the ones still reading the manager directly.)
 */
export function usePluginMenus(): SiderMenuItemProps[] {
    const { pluginManager } = useContext(AppContext)
    const { pluginVersion } = usePluginState()

    return useMemo(
        () => pluginManager?.resolveMenus() ?? [],
        [pluginManager, pluginVersion]
    )
}

export function usePluginSettings(): Array<PluginSettingsConfig & { pluginName: string }> {
    const { pluginManager } = useContext(AppContext)
    const { pluginVersion } = usePluginState()

    return useMemo(
        () => pluginManager?.resolvePluginSettings() ?? [],
        [pluginManager, pluginVersion]
    )
}

export function usePluginTours(): TourConfig[] {
    const { pluginManager } = useContext(AppContext)
    const { pluginVersion } = usePluginState()

    return useMemo(
        () => pluginManager?.resolveTours() ?? [],
        [pluginManager, pluginVersion]
    )
}

/** i18n resources contributed by plugins, merged by `resolveLocales()`. */
export function usePluginLocales(): Record<string, unknown> {
    const { pluginManager } = useContext(AppContext)
    const { pluginVersion } = usePluginState()

    return useMemo(
        () => (pluginManager?.resolveLocales() ?? {}) as Record<string, unknown>,
        [pluginManager, pluginVersion]
    )
}
