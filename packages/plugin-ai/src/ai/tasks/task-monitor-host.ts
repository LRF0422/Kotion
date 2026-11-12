/**
 * Host wiring for task-output monitoring.
 *
 * The engine itself lives in `@kn/common` (`ai/tasks/task-monitor`) and is
 * deliberately host-agnostic: it takes a log reader, a persistence seam and a
 * clock by injection. This module is the one place that knows how to plug the
 * desktop host into it, and it is called lazily (first panel open) so nothing
 * polls when no chat surface ever shows the board.
 *
 * Three deliberate choices:
 *
 *  - **The feature works with EITHER source.** `dev.logsSince` backs a project's
 *    dev-session log, `task.logsSince` backs a plugin-declared long task. A
 *    desktop build that ships only one of them still gets monitoring for it; only
 *    when neither exists does `ensureTaskMonitorConfigured()` report
 *    `host-unsupported` and do no timer, IPC call or storage write.
 *  - **Kill switch, not opt-in.** The surface is additive (a log section under a
 *    task the user already opened) and never starts a model turn, so the default
 *    is ON where the capability exists. `localStorage['kn:task-monitor'] = 'off'`
 *    disables it for that browser without a build (same escape hatch shape as
 *    `kn:route-cache`); any other value leaves it on.
 *  - **Monitors are keyed by source, not by task id.** `monitorSourceKey()`
 *    encodes a dev root or a plugin task into the engine's id, so the same
 *    project watched from two surfaces shares one cursor, and a task monitor
 *    survives a task board that lost its entries (page refresh).
 */

import {
    createMonitorReader,
    monitorSourceKey,
    pluginStorageNamespace,
    resolveOptionalService,
    resolveStorageScope,
    storageKey,
    taskMonitor,
    type DesktopBridge,
    type MonitorSource,
    type TaskMonitorStorage,
} from '@kn/common'

/** `localStorage` escape hatch: `'off'` disables monitoring for this browser. */
export const TASK_MONITOR_FLAG_KEY = 'kn:task-monitor'

/** Per-task monitors auto-started by this host, at most. */
export const MAX_LONG_TASK_MONITORS = 8

/** How many already-running plugin tasks the first configure attaches. */
const INITIAL_TASK_LIST_LIMIT = 50

/** Plugin-scoped storage: the only namespace a plugin may write. */
const STORAGE_NAMESPACE = pluginStorageNamespace('plugin-ai')
const STATE_KEY = storageKey('task-monitor', 'state')

export type TaskMonitorAvailability = 'available' | 'disabled-by-flag' | 'host-unsupported'

let configured: TaskMonitorAvailability | null = null
/** Detach for the plugin-task event subscription (null until configured). */
let detachLongTasks: (() => void) | null = null

export const isTaskMonitorDisabledByFlag = (): boolean => {
    if (typeof window === 'undefined') return false
    try {
        return window.localStorage.getItem(TASK_MONITOR_FLAG_KEY) === 'off'
    } catch {
        // Private mode / blocked storage: keep the feature (the default).
        return false
    }
}

/** Write the escape hatch without a reload (the caller decides whether to reset). */
export const setTaskMonitorDisabled = (disabled: boolean): void => {
    if (typeof window === 'undefined') return
    try {
        if (disabled) window.localStorage.setItem(TASK_MONITOR_FLAG_KEY, 'off')
        else window.localStorage.removeItem(TASK_MONITOR_FLAG_KEY)
    } catch {
        /* storage unavailable: the in-memory surface keeps working */
    }
}

/**
 * Auto-attach monitors to plugin-declared long tasks on the host.
 *
 * A plugin task carries its own incremental log, so the engine watches it
 * exactly like a dev root — one monitor per task, labelled with the task title so
 * the board can show what is being watched. This is deliberately bounded: a
 * plugin that starts hundreds of tasks must not turn the engine into a poller
 * farm, so at most {@link MAX_LONG_TASK_MONITORS} task monitors run at once and
 * the rest are silently skipped (the task board still lists them).
 *
 * Returns the detach function; calling it only unsubscribes from host events —
 * already-started monitors keep their retained lines until the engine resets.
 */
export const attachLongTaskMonitors = (
    desktop: DesktopBridge | null | undefined,
): (() => void) => {
    const tasks = desktop?.tasks
    if (
        !tasks
        || typeof tasks.list !== 'function'
        || typeof tasks.logsSince !== 'function'
        || typeof tasks.onEvent !== 'function'
    ) {
        return () => {}
    }

    let alive = true

    const runningTaskMonitorCount = (): number =>
        taskMonitor
            .list()
            .filter(monitor => monitor.source.kind === 'task' && monitor.status === 'running')
            .length

    const startMonitor = (task: { id: string; title: string }): void => {
        if (!alive) return
        const source: MonitorSource = { kind: 'task', taskId: task.id }
        const id = monitorSourceKey(source)
        // `start` is idempotent, but checking first keeps the cap honest: an
        // already-running monitor must not consume a second slot.
        const existing = taskMonitor
            .list()
            .some(monitor => monitor.id === id && monitor.status === 'running')
        if (!existing && runningTaskMonitorCount() >= MAX_LONG_TASK_MONITORS) return
        try {
            taskMonitor.start({
                source,
                label: task.title || task.id,
                taskIds: [task.id],
            })
        } catch {
            // A monitor that cannot start must never break the task board.
        }
    }

    let unsubscribe: () => void = () => {}
    try {
        unsubscribe = tasks.onEvent((event) => {
            if (!alive) return
            if (event.type === 'started') {
                startMonitor(event.task)
                return
            }
            if (event.type === 'finished') {
                taskMonitor.notifySettled({ kind: 'task', taskId: event.task.id })
            }
        })
    } catch {
        // No event channel: the initial list below still covers running work.
    }

    /**
     * Drop monitors that were RESTORED from storage for tasks the host no longer
     * has running (finished/cancelled while the page was closed). Without this a
     * stale watch would sit in the board for `maxDurationMs` reading a task that
     * cannot produce another line.
     */
    const reconcile = (running: ReadonlyArray<{ id: string }>): void => {
        if (!alive) return
        const runningIds = new Set(running.map(task => task.id))
        for (const monitor of taskMonitor.list()) {
            if (monitor.status !== 'running' || monitor.source.kind !== 'task') continue
            if (!runningIds.has(monitor.source.taskId)) taskMonitor.notifySettled(monitor.source)
        }
    }

    // Subscribe FIRST, then enumerate: a task that starts between the two is
    // seen by the event handler, and `start` is idempotent if both see it.
    void tasks
        .list({ state: 'running', limit: INITIAL_TASK_LIST_LIMIT })
        .then(running => {
            if (!alive) return
            for (const task of running) startMonitor(task)
            reconcile(running)
        })
        .catch(() => {
            // A host whose list is unreadable keeps monitoring lazy (panel-driven).
        })

    // The engine restores persisted subscriptions asynchronously; a second pass
    // after the load settles is what actually prunes stale task watches.
    const reconcileTimer = setTimeout(() => {
        void tasks
            .list({ state: 'running', limit: INITIAL_TASK_LIST_LIMIT })
            .then(running => reconcile(running))
            .catch(() => undefined)
    }, 3_000)

    return () => {
        clearTimeout(reconcileTimer)
        alive = false
        unsubscribe()
    }
}

/**
 * Wire the engine to this host once. Idempotent: afterwards only the cached
 * verdict is returned, so no duplicate polling loop can ever be created.
 */
export const ensureTaskMonitorConfigured = (): TaskMonitorAvailability => {
    if (configured) return configured
    if (isTaskMonitorDisabledByFlag()) {
        configured = 'disabled-by-flag'
        return configured
    }

    const desktop = resolveOptionalService('desktop')
    const dev = desktop?.dev
    const tasks = desktop?.tasks
    const readDev = Boolean(dev && typeof dev.logsSince === 'function')
    const readTasks = Boolean(tasks && typeof tasks.logsSince === 'function')
    // At least one source must be readable; a build with only plugin tasks still
    // gets monitoring for them (that is the whole point of the generalization).
    if (!readDev && !readTasks) {
        configured = 'host-unsupported'
        return configured
    }

    // Persistence is best-effort: a host without a registered storage service
    // still gets a working live log, it just forgets what it was watching.
    const scope = resolveStorageScope(STORAGE_NAMESPACE)
    const storage: TaskMonitorStorage | undefined = scope
        ? {
            load: async () => {
                const entry = await scope.get<unknown>(STATE_KEY)
                return entry ? entry.value : null
            },
            save: async value => {
                await scope.set(STATE_KEY, value)
            },
        }
        : undefined

    taskMonitor.configure({
        // One reader, two possible sources; the engine itself never knows which
        // host API backs a monitor.
        reader: createMonitorReader({
            dev: readDev ? dev : null,
            tasks: readTasks ? tasks : null,
        }),
        ...(storage ? { storage } : {}),
        // A `background: true` build carries `meta.root`; watching it is the
        // whole point, and it saves every tool from having to opt in.
        autoMonitorTasks: true,
    })
    configured = 'available'
    if (detachLongTasks) {
        detachLongTasks()
        detachLongTasks = null
    }
    detachLongTasks = attachLongTaskMonitors(desktop)
    return configured
}

/** Test/reset hook (also useful when a host swaps its desktop bridge). */
export const resetTaskMonitorHost = (): void => {
    if (detachLongTasks) {
        detachLongTasks()
        detachLongTasks = null
    }
    configured = null
}