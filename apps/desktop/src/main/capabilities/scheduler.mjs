/**
 * Host-driven timers for `background.*` (main process).
 *
 * The problem this solves: a plugin that wants to poll every minute cannot
 * honestly do it with `setInterval` in the renderer. Chromium throttles
 * background timers (a hidden window is not a hidden tab, but the panel that
 * owned the interval is unmounted the moment the user navigates away), and the
 * page a plugin runs in is not alive while the user is elsewhere in the app.
 *
 * So the host owns the *clock*: it keeps one timer for every registered task,
 * survives the plugin's UI being closed, and wakes the renderer with a tick
 * event. The plugin still performs the work — the host has no idea what a task
 * does, and deliberately does not run plugin code itself.
 *
 * Two properties are worth being precise about:
 *   - **Late ticks, not skipped ticks.** If the machine slept through three
 *     occurrences, one tick fires with `missed: 3` and the counter says so,
 *     rather than three bursts arriving at once. A plugin that needs every
 *     occurrence must reconcile against its own stored cursor (which is why the
 *     payload carries `scheduledAt`).
 *   - **`keepAwake` is a request, not a promise.** The OS can refuse a
 *     power-save blocker; the task reports the effective value.
 *
 * Pure `node:timers` + injected clock/blocker hooks: no `electron` import, so
 * the scheduling math is testable directly.
 */

/** Interval bounds, in ms. */
export const BACKGROUND_MIN_INTERVAL_MS = 1000
export const BACKGROUND_MAX_INTERVAL_MS = 24 * 60 * 60 * 1000
/** Tasks per renderer. */
export const BACKGROUND_MAX_TASKS = 32
/** Never jump more than this far back when counting missed occurrences. */
const MAX_MISSED_REPORT = 1000

/** A validation failure that travels to the renderer as a rejected invoke. */
export class BackgroundParamError extends Error {
    constructor(message) {
        super(message)
        this.name = 'BackgroundParamError'
    }
}

const TASK_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/

/**
 * Normalize a schedule request.
 *
 * @param {unknown} raw
 * @returns {{ taskId: string, name: string, intervalMs: number, initialDelayMs: number, keepAwake: boolean }}
 */
export function normalizeScheduleOptions(raw) {
    const params = raw && typeof raw === 'object' ? raw : {}
    if (typeof params.taskId !== 'string' || !TASK_ID_RE.test(params.taskId.trim())) {
        throw new BackgroundParamError(
            'background.schedule: "taskId" must be 1..128 chars of letters, digits, ".", "_", ":" or "-"',
        )
    }
    const taskId = params.taskId.trim()
    const interval = Number(params.intervalMs)
    if (!Number.isFinite(interval)) {
        throw new BackgroundParamError('background.schedule: "intervalMs" is required')
    }
    const intervalMs = Math.min(Math.max(Math.trunc(interval), BACKGROUND_MIN_INTERVAL_MS), BACKGROUND_MAX_INTERVAL_MS)
    const requestedDelay = Number(params.initialDelayMs)
    const initialDelayMs = Number.isFinite(requestedDelay)
        ? Math.min(Math.max(Math.trunc(requestedDelay), 0), intervalMs)
        : intervalMs
    return {
        taskId,
        name: typeof params.name === 'string' ? params.name.slice(0, 120) : '',
        intervalMs,
        initialDelayMs,
        keepAwake: params.keepAwake === true,
    }
}

/**
 * Create the scheduler for one renderer (one window).
 *
 * @param {{
 *   now?: () => number,
 *   onTick: (event: { taskId: string, scheduledAt: number, firedAt: number, missed: number, run: number }) => void,
 *   setKeepAwake?: (taskId: string, wants: boolean) => boolean,
 *   log?: (message: string) => void,
 * }} options
 */
export function createTaskScheduler(options) {
    const now = options.now ?? (() => Date.now())
    const setKeepAwake = options.setKeepAwake ?? (() => false)

    /** @type {Map<string, { id: string, name: string, intervalMs: number, nextAt: number, createdAt: number, runs: number, missed: number, keepAwake: boolean }>} */
    const tasks = new Map()
    /** One timer for the whole table: wake at the earliest deadline, not per task. */
    let timer = null

    const publicTask = (task) => ({
        taskId: task.id,
        ...(task.name ? { name: task.name } : {}),
        intervalMs: task.intervalMs,
        initialDelayMs: task.initialDelayMs,
        nextAt: task.nextAt,
        createdAt: task.createdAt,
        runs: task.runs,
        missed: task.missed,
        keepAwake: task.keepAwake,
    })

    const disarm = () => {
        if (timer) {
            clearTimeout(timer)
            timer = null
        }
    }

    const arm = () => {
        disarm()
        let next = Infinity
        for (const task of tasks.values()) next = Math.min(next, task.nextAt)
        if (!Number.isFinite(next)) return
        // Timers beyond 24.8 days overflow; intervalMs is capped well below that.
        const delay = Math.max(0, next - now())
        timer = setTimeout(fire, delay)
        timer.unref?.()
    }

    const fire = () => {
        timer = null
        const firedAt = now()
        /** Tasks whose dead-side work may reschedule the table mid-loop. */
        const due = [...tasks.values()].filter((task) => task.nextAt <= firedAt)
        for (const task of due) {
            if (!tasks.has(task.id)) continue
            const scheduledAt = task.nextAt
            // How many occurrences went by without a tick (machine asleep, host
            // busy). Counted, not replayed: one wake-up per task per fire.
            const behind = Math.max(0, Math.floor((firedAt - scheduledAt) / task.intervalMs))
            const missed = Math.min(behind, MAX_MISSED_REPORT)
            task.runs += 1
            task.missed += missed
            // Advance to the first occurrence strictly after `firedAt`, so a
            // slow tick cannot make the next one fire immediately in a loop.
            const steps = behind + 1
            task.nextAt = scheduledAt + steps * task.intervalMs
            try {
                options.onTick({
                    taskId: task.id,
                    scheduledAt,
                    firedAt,
                    missed,
                    run: task.runs,
                })
            } catch (error) {
                options.log?.(`[background] tick handler failed: ${String(error)}`)
            }
        }
        arm()
    }

    return {
        /**
         * Register or replace a task. Replacing keeps the run counters, so a
         * plugin that re-schedules on every mount does not look like it just
         * started.
         */
        schedule(raw) {
            const params = normalizeScheduleOptions(raw)
            if (!tasks.has(params.taskId) && tasks.size >= BACKGROUND_MAX_TASKS) {
                throw new BackgroundParamError(
                    `background.schedule: this window already has ${BACKGROUND_MAX_TASKS} tasks`,
                )
            }
            const existing = tasks.get(params.taskId)
            // `keepAwake` is a request: the OS (or the user) may refuse it, so
            // the stored value is whatever the blocker hook reports back.
            const keepAwake = params.keepAwake && setKeepAwake(params.taskId, true)
            if (existing?.keepAwake && !keepAwake) setKeepAwake(params.taskId, false)
            const task = {
                id: params.taskId,
                name: params.name,
                intervalMs: params.intervalMs,
                initialDelayMs: params.initialDelayMs,
                nextAt: now() + params.initialDelayMs,
                createdAt: existing?.createdAt ?? now(),
                runs: existing?.runs ?? 0,
                missed: existing?.missed ?? 0,
                keepAwake,
            }
            tasks.set(task.id, task)
            arm()
            return publicTask(task)
        },

        list() {
            return [...tasks.values()]
                .sort((a, b) => a.nextAt - b.nextAt || a.id.localeCompare(b.id))
                .map(publicTask)
        },

        cancel(taskId) {
            const task = tasks.get(taskId)
            if (!task) return false
            if (task.keepAwake) setKeepAwake(taskId, false)
            tasks.delete(taskId)
            arm()
            return true
        },

        cancelAll() {
            const count = tasks.size
            for (const task of tasks.values()) if (task.keepAwake) setKeepAwake(task.id, false)
            tasks.clear()
            disarm()
            return count
        },

        /** Stop timing without forgetting the tasks (window reload/close). */
        dispose() {
            disarm()
        },
    }
}
