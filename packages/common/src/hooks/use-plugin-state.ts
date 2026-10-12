import { useContext, useMemo, useSyncExternalStore } from "react"
import { AppContext } from "../core/AppContext"
import type { KPlugin, PluginApiIncompatibility } from "../core/PluginManager"

/**
 * Reactive hook for tracking plugin state changes.
 *
 * **This is the subscription every registry-driven view depends on** — dock
 * panels, page types, routes, menus, settings panels, tours, agent cards. Reading
 * `pluginManager.*` without it shows whatever the registry held at the last
 * unrelated render.
 *
 * It reads through `useSyncExternalStore` rather than
 * `useState(initial) + useEffect(subscribe)`, and that difference is not
 * cosmetic: the effect form has a window between the first render and the effect
 * in which a commit is **lost forever** (nothing re-reads the version). The
 * symptom was a plugin studio dev build that installed while the shell was
 * mounting: the sidebar kept the menu set it had rendered on the first paint and
 * never showed the plugin's entry — for the rest of the session, until some
 * *other* commit happened to re-render it. `useSyncExternalStore` re-checks the
 * snapshot after subscribing, so no update can slip through.
 *
 * The registry's `version` counter is the snapshot: **every** mutation path goes
 * through `_commit()`, which bumps it and notifies listeners, so the manager's own
 * observable is a complete change stream. (The consumer hook used to also listen
 * for `PLUGIN_CHANGED` / `PLUGIN_INIT_SUCCESS`; registry mutations no longer
 * bypass the manager, and those events do not change plugin contributions.)
 *
 * @returns An object with:
 *  - `plugins` – the current list of loaded KPlugin instances
 *  - `loadedPluginNames` – a Set of plugin names currently in the runtime
 *  - `incompatiblePlugins` – installed plugins skipped because their plugin API
 *    major version does not match the host.
 *  - `pluginVersion` – a counter that changes on every plugin mutation;
 *    use this as a useMemo/useEffect dependency when you need to recompute
 *    derived data after plugins change.
 */
export function usePluginState(): {
    plugins: KPlugin<any>[]
    loadedPluginNames: Set<string>
    incompatiblePlugins: PluginApiIncompatibility[]
    pluginVersion: number
} {
    const { pluginManager } = useContext(AppContext)

    const subscribe = useMemo(
        () => (onStoreChange: () => void) => pluginManager?.onChange(onStoreChange) ?? (() => undefined),
        [pluginManager]
    )
    const getSnapshot = useMemo(
        () => () => pluginManager?.version ?? 0,
        [pluginManager]
    )
    const version = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

    const loadedPluginNames = useMemo(() =>
        new Set(pluginManager?.plugins.map(p => p.name) ?? []),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [pluginManager, version]
    )
    const incompatiblePlugins = useMemo(
        () => pluginManager?.incompatiblePlugins ?? [],
        [pluginManager, version]
    )

    return {
        plugins: pluginManager?.plugins ?? [],
        loadedPluginNames,
        incompatiblePlugins,
        pluginVersion: version,
    }
}
