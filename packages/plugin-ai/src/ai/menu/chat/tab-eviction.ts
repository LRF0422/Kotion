/**
 * Which conversation tab to drop when the open-tab ceiling is reached.
 *
 * Opening a seventh tab used to evict the oldest non-active tab unconditionally
 * — including a tab whose agent was mid-run. That unmounted the panel, aborted
 * the stream and (when the run was waiting for a frontend tool result) left the
 * backend to time out. A live run must never be the eviction victim: dropping
 * the *soft* tab ceiling is strictly cheaper than dropping a run.
 *
 * Pure and dependency-free so the rule can be pinned by a plain node check.
 */

/** Oldest tab that is safe to drop, or -1 when every other tab is running. */
export function pickEvictableTab(
    tabs: readonly string[],
    activeId: string,
    isRunning: (id: string) => boolean,
): number {
    for (let index = 0; index < tabs.length; index += 1) {
        const id = tabs[index]
        if (!id || id === activeId) continue
        if (isRunning(id)) continue
        return index
    }
    return -1
}

export interface OpenTabPlan {
    /** The tab list after opening `id`. */
    tabs: string[]
    /** The tab that was dropped to make room, or null. */
    evicted: string | null
}

/**
 * Plan opening one tab: evict the oldest idle tab when at the ceiling, keep
 * every running tab, and append the new id even if that briefly exceeds the
 * ceiling (the new tab's stream is queued by the client budget anyway).
 */
export function planOpenTab(
    tabs: readonly string[],
    id: string,
    activeId: string,
    maxOpenTabs: number,
    isRunning: (id: string) => boolean,
): OpenTabPlan {
    const next = [...tabs]
    if (next.includes(id)) return { tabs: next, evicted: null }
    let evicted: string | null = null
    if (next.length >= maxOpenTabs) {
        const index = pickEvictableTab(next, activeId, isRunning)
        if (index >= 0) {
            evicted = next[index]
            next.splice(index, 1)
        }
    }
    next.push(id)
    return { tabs: next, evicted }
}