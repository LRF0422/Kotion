import React from "react"
import { DockPanelConfig } from "@kn/common"
import { Network } from "@kn/icon"
import { GraphPanel } from "./GraphPanel"

export { GraphPanel } from "./GraphPanel"

/**
 * Dock panels contributed by the basic plugin.
 *
 * These go through the same `PluginConfig.dockPanels` contribution point as any
 * third-party plugin, so the built-in panels carry no privilege over remote ones.
 *
 * The document outline is deliberately absent: the editor already renders its
 * own Notion-style floating ToC (`NotionToC`), so a dock copy would duplicate it.
 */
export const mainDockPanels: DockPanelConfig[] = [
    {
        id: "graph",
        title: "dock.graph",
        icon: <Network className="h-4 w-4" />,
        order: 30,
        // The graph needs room to be readable, so it opens wider than the default.
        defaultWidth: 420,
        minWidth: 300,
        component: GraphPanel,
    },
]
