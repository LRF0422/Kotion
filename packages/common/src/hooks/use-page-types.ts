import { useContext, useMemo } from "react"
import { AppContext } from "../core/AppContext"
import type { ResolvedPageType } from "../core/page-type"
import { usePluginState } from "./use-plugin-state"

/** Reactive list of validated page types contributed by active plugins. */
export function usePageTypes(): ResolvedPageType[] {
    const { pluginManager } = useContext(AppContext)
    const { pluginVersion } = usePluginState()

    return useMemo(
        () => pluginManager?.resolvePageTypes() ?? [],
        [pluginManager, pluginVersion]
    )
}

/** Reactive lookup for one stable namespaced page-type id. */
export function usePageType(id?: string): ResolvedPageType | undefined {
    const { pluginManager } = useContext(AppContext)
    const { pluginVersion } = usePluginState()

    return useMemo(
        () => id ? pluginManager?.resolvePageType(id) : undefined,
        [id, pluginManager, pluginVersion]
    )
}
