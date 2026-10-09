/**
 * Dock pinning — which panel the dock MUST keep expanded.
 *
 * A panel that is running background work (the agent streaming a turn) must not
 * be hidden by any click: switching rail icons, collapsing the panel, the
 * toolbar/shortcut entry points or an outside click on the mobile sheet. The
 * user asked for the running conversation to stay visible in the right sidebar
 * until the run ends, and for those clicks to never tear the run down.
 *
 * Pure decision table, kept out of the component so it can be checked without a
 * DOM (see ./dock-pinning.check.ts).
 */

/** Panel id of the AI assistant — the panel a running conversation lives in. */
export const AGENT_PANEL_ID = 'agent'

export interface DockPinInput {
    /** Panel ids this dock can host, in rail order. */
    panelIds: readonly string[]
    /** Panels that reported running work (see `DOCK_PANEL_RUNNING`). */
    runningIds: ReadonlySet<string>
}

export interface DockPin {
    /** Panel that must stay expanded and cannot be dismissed, or null. */
    pinnedId: string | null
    /** Panel the dock should actually expand right now. */
    activeId: string | null
}

/**
 * Resolve the pin for one dock.
 *
 * `activeId` is the user's preference; while something is running the pin wins,
 * and a preference that points at a panel this dock no longer hosts (plugin
 * uninstalled, panel opted out of the current context) collapses instead of
 * rendering nothing.
 */
export function resolveDockPin(
    { panelIds, runningIds }: DockPinInput,
    activeId: string | null,
): DockPin {
    const hosted = panelIds.filter(id => runningIds.has(id))
    if (hosted.length === 0) {
        const preferred = activeId && panelIds.includes(activeId) ? activeId : null
        return { pinnedId: null, activeId: preferred }
    }
    // The assistant wins when several panels run at once: losing sight of a
    // conversation is worse than losing sight of a graph or a preview.
    const pinnedId = hosted.includes(AGENT_PANEL_ID) ? AGENT_PANEL_ID : hosted[0]
    return { pinnedId, activeId: pinnedId }
}
