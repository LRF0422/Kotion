/* ------------------------------------------------------------------ *
 * background — host-driven timers
 *
 * A plugin cannot poll reliably with `setInterval` in the renderer: Chromium
 * throttles background timers, and the panel that owns the interval is unmounted
 * the moment the user switches pages. `background.schedule` moves the *clock*
 * into the main process, which then wakes the renderer on `desktop:event:background`
 * even while the plugin's UI is closed. The plugin still runs the work — the
 * host only owns the timing (and, optionally, keeps the machine awake for it).
 * ------------------------------------------------------------------ */

/** What one scheduled tick carries to the renderer. */
export interface DesktopBackgroundTickEvent {
    taskId: string
    /** Scheduled occurrence time (epoch ms) — late ticks carry the intended time. */
    scheduledAt: number
    /** Actual dispatch time, for drift diagnostics. */
    firedAt: number
    /** How many occurrences were skipped while the host was asleep/busy. */
    missed: number
    /** Monotonic run counter, starting at 1. */
    run: number
}

export interface DesktopBackgroundTask {
    taskId: string
    /** Opaque plugin label; the host echoes it back and never interprets it. */
    name?: string
    intervalMs: number
    /** First run offset from registration; defaults to `intervalMs`. */
    initialDelayMs: number
    /** Epoch ms of the next occurrence. */
    nextAt: number
    createdAt: number
    /** Occurrences dispatched so far. */
    runs: number
    /** Occurrences skipped because the host slept through them. */
    missed: number
    /** True when this task holds a power-save blocker. */
    keepAwake: boolean
}

export interface DesktopBackgroundScheduleOptions {
    /** Stable id the plugin owns; re-scheduling the same id replaces the task. */
    taskId: string
    name?: string
    /** Interval in ms (min 1000, max 24h). */
    intervalMs: number
    /** Delay before the first tick (default `intervalMs`, max `intervalMs`). */
    initialDelayMs?: number
    /**
     * Hold a `powerSaveBlocker` while the task is scheduled. Refused (falls back
     * to false) when the OS blocks it; reported in the returned task.
     */
    keepAwake?: boolean
}

/** The timer surface (feature-detect `desktop.background`). */
export interface BackgroundBridge {
    /** Register or replace a task; ticks arrive on `background.onTick`. */
    schedule(options: DesktopBackgroundScheduleOptions): Promise<DesktopBackgroundTask>
    list(): Promise<DesktopBackgroundTask[]>
    cancel(options: { taskId: string }): Promise<boolean>
    /** Stop every task this caller owns (or all, when `scope` is `all`). */
    cancelAll(options?: { scope?: 'all' }): Promise<number>
    /** Subscribe to ticks; returns an unsubscribe function. */
    onTick(listener: (event: DesktopBackgroundTickEvent) => void): () => void
}
