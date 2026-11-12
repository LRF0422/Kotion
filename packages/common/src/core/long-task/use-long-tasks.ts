/**
 * React bindings for plugin long tasks (`desktop.tasks`).
 *
 * The tasks live in the HOST (main process), not in this renderer: a page
 * refresh destroys the plugin module but not the task, so the UI cannot own the
 * list. These hooks are therefore a thin read/subscribe layer over
 * `TaskBridge`: one fetch on mount, then event-driven refreshes.
 *
 * Two details are easy to get wrong and visible when wrong:
 *
 *   - `log` events are the high-frequency ones (a chatty plugin can emit batches
 *     every 100ms). Refreshing the whole list per event would hammer IPC, so the
 *     event path is debounced ({@link LONG_TASK_EVENT_REFRESH_MS}); the first
 *     mount fetch and an explicit `refresh()` are immediate.
 *   - `enabled` exists for the always-mounted boards (the chat header task panel
 *     is mounted even when closed). Disabled means NO fetch and NO subscription —
 *     zero polling — but the last snapshot is kept, so reopening paints the
 *     previous rows immediately instead of an empty list. Hooks must stay
 *     unconditional (rules of hooks): `enabled` is checked inside the effect.
 *
 * SSR: the initial state is an empty/idle snapshot and all work happens in an
 * effect, so server and first client render agree; there is no DOM access.
 */

import { useCallback, useEffect, useState } from 'react'
import type {
    DesktopTaskEvent,
    DesktopTaskListOptions,
    DesktopTaskSnapshot,
} from '../desktop/tasks'
import { resolveOptionalService } from '../../services/service-resolver'

/**
 * Debounce window for event-driven list refreshes. Long enough to merge a burst
 * of `log` events into one `task.list` call, short enough that a state change
 * (finished/cancelling) feels instant.
 */
export const LONG_TASK_EVENT_REFRESH_MS = 200

const EMPTY_TASKS: DesktopTaskSnapshot[] = []

const messageOf = (error: unknown): string =>
    error instanceof Error ? error.message : String(error)

const taskBridge = () => resolveOptionalService('desktop')?.tasks

export interface UseLongTasksOptions extends DesktopTaskListOptions {
    /**
     * When `false`, neither fetch nor subscribe (the last snapshot is kept).
     * Defaults to `true`. Use it to keep a closed/hidden board at zero polling.
     */
    enabled?: boolean
}

export interface UseLongTasksResult {
    tasks: DesktopTaskSnapshot[]
    loading: boolean
    error: string | null
    /** Force an immediate re-read (same as the next event refresh, but now). */
    refresh: () => void
}

/**
 * The host task list (optionally filtered), refreshed by host events.
 *
 * Degrades to an empty list on hosts without `task.*`, and keeps the previous
 * rows when a read fails (with `error` set) instead of blanking the board.
 */
export const useLongTasks = (options: UseLongTasksOptions = {}): UseLongTasksResult => {
    const { enabled = true, state, kind, root, limit } = options
    const [tasks, setTasks] = useState<DesktopTaskSnapshot[]>(EMPTY_TASKS)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [revision, setRevision] = useState(0)
    const refresh = useCallback(() => setRevision(value => value + 1), [])

    useEffect(() => {
        if (!enabled) {
            // Closed board: no fetch, no subscription, previous rows retained.
            setLoading(false)
            return
        }
        const bridge = taskBridge()
        if (!bridge) {
            // Web build / older desktop: an empty board, never an error.
            setTasks(EMPTY_TASKS)
            setLoading(false)
            setError(null)
            return
        }

        let alive = true
        let timer: ReturnType<typeof setTimeout> | undefined

        const load = async (showLoading: boolean): Promise<void> => {
            if (showLoading && alive) setLoading(true)
            try {
                const next = await bridge.list({ state, kind, root, limit })
                if (!alive) return
                setTasks(next)
                setError(null)
            } catch (cause) {
                if (!alive) return
                setError(messageOf(cause))
            } finally {
                if (alive) setLoading(false)
            }
        }

        // Collapse an event burst into one list read.
        const schedule = (): void => {
            if (timer !== undefined) return
            timer = setTimeout(() => {
                timer = undefined
                void load(false)
            }, LONG_TASK_EVENT_REFRESH_MS)
        }

        void load(true)

        let unsubscribe: () => void = () => {}
        try {
            if (typeof bridge.onEvent === 'function') unsubscribe = bridge.onEvent(schedule)
        } catch {
            // A host without a working event channel still gets the initial read.
        }

        return () => {
            alive = false
            if (timer !== undefined) clearTimeout(timer)
            unsubscribe()
        }
    }, [enabled, state, kind, root, limit, revision])

    return { tasks, loading, error, refresh }
}

export interface UseLongTaskOptions {
    /** Same contract as {@link UseLongTasksOptions.enabled}. Defaults to `true`. */
    enabled?: boolean
}

/**
 * One task by id, kept live by host events.
 *
 * Returns `null` while unknown / not yet read — and on a host without `task.*`.
 * Passing a `null | undefined` id disables the reads without violating the rules
 * of hooks, which is what a collapsed row needs.
 */
export const useLongTask = (
    taskId: string | null | undefined,
    options: UseLongTaskOptions = {},
): DesktopTaskSnapshot | null => {
    const { enabled = true } = options
    const id = taskId ?? null
    const [task, setTask] = useState<DesktopTaskSnapshot | null>(null)

    useEffect(() => {
        if (!enabled || !id) return
        const bridge = taskBridge()
        if (!bridge) {
            setTask(null)
            return
        }

        let alive = true
        // A new id must not paint the previous task while its read is in flight.
        setTask(previous => (previous && previous.id === id ? previous : null))

        const apply = (next: DesktopTaskSnapshot | null): void => {
            if (alive) setTask(next)
        }

        if (typeof bridge.get === 'function') {
            bridge.get({ taskId: id }).then(apply).catch(() => undefined)
        }

        let unsubscribe: () => void = () => {}
        try {
            if (typeof bridge.onEvent === 'function') {
                unsubscribe = bridge.onEvent((event: DesktopTaskEvent) => {
                    if (event.task.id === id) apply(event.task)
                })
            }
        } catch {
            // The one-shot read above is enough on a host without events.
        }

        return () => {
            alive = false
            unsubscribe()
        }
    }, [enabled, id])

    return task && task.id === id ? task : null
}