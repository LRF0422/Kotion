import { useContext, useMemo } from "react"
import { AppContext } from "../core/AppContext"
import { DockPosition, ResolvedDockPanel } from "../core/dock"
import { usePluginState } from "./use-plugin-state"

/**
 * Reactive list of dock panels for one dock position.
 *
 * Recomputed on every plugin mutation (`pluginVersion`), which is what makes the
 * dock hot-pluggable: installing or uninstalling a plugin adds/removes its rail
 * icon without a reload.
 */
export function useDockPanels(position: DockPosition = 'right'): ResolvedDockPanel[] {
    const { pluginManager } = useContext(AppContext)
    const { pluginVersion } = usePluginState()

    return useMemo(
        () => pluginManager?.resolveDockPanels(position) ?? [],
        [pluginManager, position, pluginVersion]
    )
}
