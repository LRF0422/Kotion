/**
 * Plugin-side long-task toolkit.
 *
 * `task.*` alone is a set of IPC calls; this module is the ergonomic layer a
 * plugin actually uses. Two entry points:
 *
 *   - {@link startLongTask} — for work that outlives one function call (a
 *     stream, a subscription, a state machine): returns a handle with
 *     `progress` / `log` / `finish` and a cancellation `AbortSignal`.
 *   - {@link runLongTask} — for the common "do the work, then finish" shape:
 *     registers the task, runs your function, and finishes it as
 *     succeeded / failed / cancelled automatically.
 *
 * Both degrade to a **local no-op handle** when the host has no `task.*`
 * capabilities (web build, older desktop). A plugin therefore does not need to
 * feature-detect anything to adopt long-task reporting: the work still runs,
 * only the host-side task list/log/abort wiring is absent.
 *
 * Log lines are batched (default 100ms) because one IPC call per line would be
 * wasteful; `progress` is sent immediately because it is low-volume and is what
 * a task list renders.
 */
import type { DesktopBridge } from '../desktop/bridge'
import type {
    DesktopTaskCancelResult,
    DesktopTaskEvent,
    DesktopTaskListOptions,
    DesktopTaskLogsPage,
    DesktopTaskProgress,
    DesktopTaskSnapshot,
    TaskBridge,
} from '../desktop/tasks'

export type LongTaskLevel = 'info' | 'warn' | 'error'

export interface LongTaskOptions {
    /**
     * Stable caller key, normally prefixed with the plugin key
     * (`my-plugin:sync:space42`). Omit for a random id. Re-running with the
     * same id after the previous run finished starts a new run.
     */
    id?: string
    /** Task category; defaults to `plugin`. */
    kind?: string
    /** One-line title shown in task lists. */
    title: string
    /** Optional project root, for callers that correlate tasks with a project. */
    root?: string
    /** Initial progress; usually omitted. */
    progress?: DesktopTaskProgress
    /**
     * How long log lines are batched before one `task.report` call. Defaults to
     * 100ms. `0` sends every line immediately (useful for tests).
     */
    flushIntervalMs?: number
    /**
     * Liveness heartbeat (ms): the host fails a task after three missed beats, so
     * a crashed plugin cannot leave it "running" forever. The SDK pings
     * `desktop.tasks.touch` on this interval. Defaults to
     * {@link DEFAULT_LONG_TASK_HEARTBEAT_MS}; `0` disables the heartbeat (and the
     * host-side stale detection, because the task then declares no liveness).
     * Hosts that predate `task.touch` are detected and silently skipped.
     */
    heartbeatMs?: number
}

export interface LongTaskLogOptions {
    level?: LongTaskLevel
    message: string
}

/**
 * Final detail of a task.
 *
 * A plain string is the `message` shorthand (kept for older callers). The object
 * form adds the failure text and a structured `result`: the JSON the host keeps
 * on the snapshot so a late reader (task board, agent tool, monitor) can consume
 * what the work produced without re-running it.
 */
export interface LongTaskFinishDetail {
    /** Final progress message (kept in `progress.message`). */
    message?: string
    /** Failure text for `state: 'failed'`. */
    error?: string
    /** Structured JSON result; must be JSON-serializable (host caps at 16KB). */
    result?: unknown
}

/** Default heartbeat interval for {@link startLongTask} (30s). */
export const DEFAULT_LONG_TASK_HEARTBEAT_MS = 30_000

/** A registered task. `available` is false on the local no-op fallback. */
export interface LongTaskHandle {
    readonly id: string
    readonly sessionId: string
    /** True when the host stores this task (false = local fallback). */
    readonly available: boolean
    /** Latest snapshot seen by the SDK (null on the local fallback). */
    readonly snapshot: DesktopTaskSnapshot | null
    /** Aborted when the host reports a `cancel-request` for this run. */
    readonly signal: AbortSignal
    /** Merge progress (immediate). Never throws after registration. */
    progress(progress: DesktopTaskProgress): void
    /** Append one log line (batched). Never throws. */
    log(level: LongTaskLevel, message: string): void
    /** Plain-string log shorthand (`info` level). */
    info(message: string): void
    warn(message: string): void
    error(message: string): void
    /** Flush queued log lines now (also called by `finish`). */
    flush(): Promise<void>
    /** Incremental log read; an empty page on the local fallback. */
    logsSince(options?: { sinceSeq?: number; limit?: number }): Promise<DesktopTaskLogsPage>
    /** Finish as `succeeded` by default. Never throws. */
    finish(
        state?: 'succeeded' | 'failed' | 'cancelled',
        detail?: string | LongTaskFinishDetail,
    ): Promise<DesktopTaskSnapshot | null>
}

const DEFAULT_FLUSH_INTERVAL_MS = 100
const MAX_BATCH_LINES = 200

const randomId = (prefix: string): string =>
    `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`

const ignore = (): void => {}

const abortError = (): Error => {
    const error = new Error('long task cancelled')
    error.name = 'AbortError'
    return error
}

const emptyPage = (taskId: string, sinceSeq = 0): DesktopTaskLogsPage => ({
    taskId,
    sessionId: null,
    entries: [],
    nextSeq: sinceSeq,
    dropped: 0,
    total: 0,
})

/**
 * A handle that does nothing on the host side but keeps the SDK's contract:
 * the plugin's code path (including `signal` and `finish`) is identical whether
 * or not the desktop build supports `task.*`.
 */
const createLocalTask = (options: LongTaskOptions): LongTaskHandle => {
    const controller = new AbortController()
    const id = options.id ?? randomId('local')
    return {
        id,
        sessionId: randomId('run'),
        available: false,
        snapshot: null,
        signal: controller.signal,
        progress: ignore,
        log: ignore,
        info: ignore,
        warn: ignore,
        error: ignore,
        flush: async (): Promise<void> => {},
        logsSince: async ({ sinceSeq = 0 } = {}): Promise<DesktopTaskLogsPage> =>
            emptyPage(id, sinceSeq),
        finish: async (): Promise<DesktopTaskSnapshot | null> => null,
    }
}

/** Resolve the typed task bridge from the host bridge, if present. */
const taskBridgeOf = (bridge: DesktopBridge | null | undefined): TaskBridge | undefined => bridge?.tasks

/**
 * Register a long task and return a handle for it.
 *
 * Throws only when the host refuses the registration itself (invalid title/id,
 * duplicate running id, capacity); failures after that are swallowed because
 * monitoring must never be able to break the actual work.
 */
export const startLongTask = async (
    bridge: DesktopBridge | null | undefined,
    options: LongTaskOptions,
): Promise<LongTaskHandle> => {
    const tasks = taskBridgeOf(bridge)
    if (!tasks) return createLocalTask(options)

    // `0` turns the heartbeat off (and, with it, host-side stale detection).
    const heartbeatMs = options.heartbeatMs ?? DEFAULT_LONG_TASK_HEARTBEAT_MS

    const initial = await tasks.start({
        ...(options.id === undefined ? {} : { id: options.id }),
        ...(options.kind === undefined ? {} : { kind: options.kind }),
        title: options.title,
        ...(options.root === undefined ? {} : { root: options.root }),
        ...(options.progress === undefined ? {} : { progress: options.progress }),
        ...(heartbeatMs > 0 ? { heartbeatMs } : {}),
    })

    const controller = new AbortController()
    let snapshot: DesktopTaskSnapshot | null = initial
    let unsubscribe: () => void = () => {}
    let timer: ReturnType<typeof setTimeout> | undefined
    let heartbeatTimer: ReturnType<typeof setInterval> | undefined
    let queue: Array<{ level: LongTaskLevel; message: string }> = []
    let finished = false

    const stopHeartbeat = (): void => {
        if (heartbeatTimer === undefined) return
        clearInterval(heartbeatTimer)
        heartbeatTimer = undefined
    }

    const matches = (event: DesktopTaskEvent): boolean =>
        event.task.id === initial.id && event.task.sessionId === initial.sessionId

    try {
        unsubscribe = tasks.onEvent((event) => {
            if (!matches(event)) return
            snapshot = event.task
            // A host-side terminal state (stale detection, another installer of
            // the same id) ends this run: stop pinging a task that is over.
            if (event.type === 'finished') stopHeartbeat()
            if (event.type === 'cancel-request' && !controller.signal.aborted) controller.abort(abortError())
        })
    } catch {
        // An event channel that cannot be subscribed to only costs push updates.
    }

    // Liveness: the host fails a task after 3 missed beats. Older hosts have no
    // `task.touch`; feature-detect instead of breaking the task there.
    if (heartbeatMs > 0 && typeof tasks.touch === 'function') {
        heartbeatTimer = setInterval(() => {
            if (finished) return
            try {
                void tasks
                    .touch({ taskId: initial.id })
                    .then((next) => {
                        if (!finished) snapshot = next
                    })
                    .catch(ignore)
            } catch {
                // A synchronous host failure must not break the plugin's work.
            }
        }, heartbeatMs)
        // Node keeps the process alive for a pending interval; a plugin's test
        // process should not hang because a task was never finished.
        const unref = (heartbeatTimer as unknown as { unref?: () => void }).unref
        if (typeof unref === 'function') unref.call(heartbeatTimer)
    }

    const flush = async (): Promise<void> => {
        if (timer !== undefined) {
            clearTimeout(timer)
            timer = undefined
        }
        if (!queue.length) return
        const batch = queue.slice(0, MAX_BATCH_LINES)
        queue = queue.slice(MAX_BATCH_LINES)
        try {
            const result = await tasks.report({ taskId: initial.id, logs: batch })
            if (!finished) snapshot = result.task
        } catch {
            // The task may have been evicted/finished by someone else; logging
            // must not throw into the plugin's work loop.
        }
        if (queue.length && !finished) schedule()
    }

    const schedule = (): void => {
        if (timer !== undefined || finished) return
        const interval = options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS
        if (interval <= 0) {
            void flush()
            return
        }
        timer = setTimeout(() => {
            timer = undefined
            void flush()
        }, interval)
    }

    const handle: LongTaskHandle = {
        id: initial.id,
        sessionId: initial.sessionId,
        available: true,
        get snapshot() {
            return snapshot
        },
        signal: controller.signal,
        progress: (progress: DesktopTaskProgress): void => {
            if (finished) return
            void tasks
                .report({ taskId: initial.id, progress })
                .then((result) => {
                    if (!finished) snapshot = result.task
                })
                .catch(ignore)
        },
        log: (level: LongTaskLevel, message: string): void => {
            if (finished || !message) return
            queue.push({ level, message })
            schedule()
        },
        info: (message: string): void => handle.log('info', message),
        warn: (message: string): void => handle.log('warn', message),
        error: (message: string): void => handle.log('error', message),
        flush,
        logsSince: async ({ sinceSeq = 0, limit } = {}): Promise<DesktopTaskLogsPage> => {
            try {
                return await tasks.logsSince({
                    taskId: initial.id,
                    sinceSeq,
                    ...(limit === undefined ? {} : { limit }),
                })
            } catch {
                return emptyPage(initial.id, sinceSeq)
            }
        },
        finish: async (state, detail): Promise<DesktopTaskSnapshot | null> => {
            if (finished) return snapshot
            finished = true
            // Stop the liveness clock BEFORE the final call: a heartbeat landing
            // after `task.finish` would only report into a terminal task.
            stopHeartbeat()
            // Drain every queued batch, not just the first one: a task that
            // logged more than 200 lines right before finishing must not lose
            // its tail. `flush` stops rescheduling once `finished` is set, so
            // the loop is what drains the remainder.
            while (queue.length) await flush()
            unsubscribe()
            if (timer !== undefined) {
                clearTimeout(timer)
                timer = undefined
            }
            const objectDetail = detail !== undefined && typeof detail !== 'string' ? detail : undefined
            try {
                const result = await tasks.finish({
                    taskId: initial.id,
                    state: state ?? 'succeeded',
                    ...(typeof detail === 'string'
                        ? { message: detail }
                        : objectDetail && objectDetail.message !== undefined
                          ? { message: objectDetail.message }
                          : {}),
                    ...(objectDetail?.error !== undefined ? { error: objectDetail.error } : {}),
                    // Pass the structured result through untouched; the host owns
                    // validation (JSON-serializable, 16KB cap).
                    ...(objectDetail && objectDetail.result !== undefined
                        ? { result: objectDetail.result }
                        : {}),
                })
                snapshot = result
                return result
            } catch {
                return null
            }
        },
    }
    return handle
}

/**
 * Run one unit of work as a host-visible long task.
 *
 * The task is finished as `succeeded` when `body` resolves, `failed` when it
 * throws (with the error message), and `cancelled` when the host asked to stop
 * (the `AbortSignal` passed to the body is aborted). The body's result/throw is
 * passed through unchanged, so callers handle errors exactly as before.
 *
 * ```ts
 * await runLongTask(desktop, { id: `my-plugin:sync:${spaceId}`, title: '同步空间' }, async (task) => {
 *     task.progress({ percent: 10, message: '拉取列表' })
 *     await syncSpace(spaceId, { signal: task.signal, onPage: (n) => task.info(`第 ${n} 页`) })
 * })
 * ```
 */
export const runLongTask = async <T>(
    bridge: DesktopBridge | null | undefined,
    options: LongTaskOptions,
    body: (task: LongTaskHandle) => Promise<T>,
): Promise<T> => {
    const task = await startLongTask(bridge, options)
    try {
        const result = await body(task)
        if (task.signal.aborted) {
            await task.finish('cancelled')
        } else {
            // Keep the body's return value on the snapshot, so a task board or a
            // late reader can consume the outcome instead of re-running the work.
            // `undefined` means "nothing to report" — do not store a null-ish result.
            await task.finish('succeeded', result === undefined ? undefined : { result })
        }
        return result
    } catch (error) {
        if (task.signal.aborted) {
            await task.finish('cancelled', error instanceof Error ? error.message : String(error))
        } else {
            await task.finish('failed', {
                error: error instanceof Error ? error.message : String(error),
            })
        }
        throw error
    }
}

/* ------------------------------------------------------------------ *
 * Read-side helpers
 *
 * The write side (`startLongTask` / `runLongTask`) keeps work running when the
 * host is absent; the read side is the same idea for UI/monitors/agent tools:
 * a build without `desktop.tasks` gets empty results instead of an exception, so
 * a task board does not have to feature-detect the host it runs in.
 * ------------------------------------------------------------------ */

/**
 * Tasks registered on the host, newest `updatedAt` first.
 *
 * Returns `[]` when the host has no `task.*` (web build, older desktop) and also
 * when the host query itself fails: a broken read must not take a page down.
 * Use `useLongTasks` when the UI also needs an `error` to display.
 */
export const listLongTasks = async (
    bridge: DesktopBridge | null | undefined,
    options?: DesktopTaskListOptions,
): Promise<DesktopTaskSnapshot[]> => {
    const tasks = taskBridgeOf(bridge)
    if (!tasks) return []
    try {
        return await tasks.list(options)
    } catch {
        return []
    }
}

/** One task, or null when it is unknown/evicted or the host is absent. */
export const getLongTask = async (
    bridge: DesktopBridge | null | undefined,
    taskId: string,
): Promise<DesktopTaskSnapshot | null> => {
    const tasks = taskBridgeOf(bridge)
    if (!tasks || !taskId) return null
    try {
        return await tasks.get({ taskId })
    } catch {
        return null
    }
}

/** Ask the host to cancel one task; null when the host is absent or refused. */
export const cancelLongTask = async (
    bridge: DesktopBridge | null | undefined,
    taskId: string,
): Promise<DesktopTaskCancelResult | null> => {
    const tasks = taskBridgeOf(bridge)
    if (!tasks || !taskId) return null
    try {
        return await tasks.cancel({ taskId })
    } catch {
        return null
    }
}

/**
 * Subscribe to host task events. On a host without an event channel this is a
 * no-op unsubscribe, so callers never need to guard the registration.
 */
export const onLongTaskEvent = (
    bridge: DesktopBridge | null | undefined,
    listener: (event: DesktopTaskEvent) => void,
): (() => void) => {
    const tasks = taskBridgeOf(bridge)
    if (!tasks || typeof tasks.onEvent !== 'function') return ignore
    try {
        return tasks.onEvent(listener)
    } catch {
        return ignore
    }
}

/* ------------------------------------------------------------------ *
 * React bindings (hooks live in `./use-long-tasks`, re-exported here so
 * `import { useLongTasks } from '@kn/common'` keeps working) and the public
 * in-memory bridge plugins use to unit-test their tasks without Electron.
 * ------------------------------------------------------------------ */
export * from './use-long-tasks'
export * from './testing'