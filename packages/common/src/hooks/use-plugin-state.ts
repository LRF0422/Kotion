import { useContext, useEffect, useMemo, useState } from "react"
import { AppContext, KPlugin, PluginApiIncompatibility, PLUGIN_CHANGED, PLUGIN_INIT_SUCCESS, event } from ".."

/**
 * Reactive hook for tracking plugin state changes.
 *
 * Consolidates all plugin-change subscription logic (onChange, PLUGIN_CHANGED,
 * PLUGIN_INIT_SUCCESS) into a single reusable hook so individual components
 * don't need to duplicate event listener boilerplate.
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
    const [version, setVersion] = useState(pluginManager?.version ?? 0)

    useEffect(() => {
        if (!pluginManager) return

        // Subscribe to PluginManager's internal observable
        const unsub = pluginManager.onChange(() => {
            setVersion(pluginManager.version)
        })

        // Also listen for global events emitted after Layout re-inits plugins
        const handleGlobalChange = () => {
            setVersion(pluginManager.version)
        }
        event.on(PLUGIN_CHANGED, handleGlobalChange)
        event.on(PLUGIN_INIT_SUCCESS, handleGlobalChange)

        return () => {
            unsub()
            event.off(PLUGIN_CHANGED, handleGlobalChange)
            event.off(PLUGIN_INIT_SUCCESS, handleGlobalChange)
        }
    }, [pluginManager])

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
