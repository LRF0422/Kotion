import { Editor } from "@tiptap/core"
import { ComponentType, ReactNode } from "react"

/**
 * Dock panels — the side-dock contribution point.
 *
 * A dock panel is a self-contained view that the host renders in a collapsible
 * side dock (SiYuan-style: a thin icon rail plus one visible panel). Panels are
 * contributed by plugins through `PluginConfig.dockPanels`, so installing or
 * uninstalling a plugin adds/removes its rail icon at runtime — no reload.
 * The host itself contributes built-in panels via
 * `PluginManager.registerCoreDockPanel()`.
 */

export type DockPosition = 'right' | 'left'

/**
 * Workspace context the host injects into every panel. All fields are optional:
 * a panel may be visible while no page is open (e.g. on a space's home route).
 */
export interface DockPanelContext {
    /** Space the dock is currently rendered in. */
    spaceId?: string
    /** Active page tab, if any. */
    pageId?: string
    /** Editor instance of the active page tab, once its content is ready. */
    editor?: Editor
}

export interface DockPanelProps extends DockPanelContext {
    /** Collapse the dock (deactivates this panel). */
    close: () => void
}

export interface DockPanelConfig {
    /** Unique across all plugins; later duplicates are skipped. */
    id: string
    /** i18n key resolved by the host; falls back to the raw string. */
    title: string
    /** Rail icon. Render at h-4 w-4 to match the rail's other icons. */
    icon: ReactNode
    /** Which dock to attach to. Defaults to 'right'. */
    position?: DockPosition
    /** Ascending rail order. Defaults to 100. */
    order?: number
    /** Initial panel width in px. Defaults to 320. */
    defaultWidth?: number
    minWidth?: number
    maxWidth?: number
    /**
     * Hide the rail icon when this returns false — e.g. a panel that needs an
     * open page returns `!!ctx.pageId`. Called on every context change.
     */
    visible?: (ctx: DockPanelContext) => boolean
    component: ComponentType<DockPanelProps>
}

/** A dock panel as returned by `PluginManager.resolveDockPanels()`. */
export interface ResolvedDockPanel extends DockPanelConfig {
    /** Whether the panel came from a plugin bundle or from the host itself. */
    source: 'plugin' | 'core'
    /** Contributing plugin name, or 'core' for built-in panels. */
    owner: string
}

export const DOCK_DEFAULT_WIDTH = 320
export const DOCK_MIN_WIDTH = 240
export const DOCK_MAX_WIDTH = 720

/**
 * Which dock positions currently have a host mounted.
 *
 * The dock lives inside the space workspace, so entry points that live outside
 * it (sidebar menu, mobile tab bar) need to know whether emitting
 * TOGGLE_DOCK_PANEL will reach anyone before falling back to a full page.
 */
const mountedDocks = new Set<DockPosition>()

export const dockRuntime = {
    markMounted(position: DockPosition) {
        mountedDocks.add(position)
        return () => { mountedDocks.delete(position) }
    },
    isMounted(position: DockPosition = 'right') {
        return mountedDocks.has(position)
    },
}
