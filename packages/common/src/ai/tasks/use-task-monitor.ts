/**
 * React bindings for the task output monitor.
 *
 * Same pattern as `use-background-tasks`: the engine is a module-level store, so
 * components read it through `useSyncExternalStore`, and the engine's snapshot
 * methods return the SAME array identity while its version is unchanged (see
 * `TaskMonitorEngine.list` / `events` / `lines`). That is what keeps a log line
 * arriving every 200ms from re-rendering a panel that shows events only.
 *
 * Not `'use client'` on purpose: this package is consumed by hosts that mark
 * their own client boundary, like every other hook in `@kn/common`.
 */

import { useSyncExternalStore } from 'react'
import { taskMonitor } from './task-monitor'
import type {
    MonitorLogLine,
    TaskMonitorEvent,
    TaskMonitorSubscription,
} from './task-monitor'

/** Stable across renders: React resubscribes whenever this identity changes. */
const subscribe = (listener: () => void): (() => void) => taskMonitor.subscribe(listener)

/** Module-level constants so a missing id never produces a new array per render. */
const NO_LINES: MonitorLogLine[] = []
const NO_EVENTS: TaskMonitorEvent[] = []

/** Every monitor of this window (running and ended), in start order. */
export function useTaskMonitorSubscriptions(): TaskMonitorSubscription[] {
    return useSyncExternalStore(
        subscribe,
        () => taskMonitor.list(),
        () => taskMonitor.list(),
    )
}

/** The lines one monitor retained (at most its `cadence.maxLines`), oldest first. */
export function useTaskMonitorLines(id: string | null | undefined): MonitorLogLine[] {
    return useSyncExternalStore(
        subscribe,
        () => (id ? taskMonitor.lines(id) : NO_LINES),
        () => (id ? taskMonitor.lines(id) : NO_LINES),
    )
}

/** One monitor's events, or every monitor's when no id is passed, oldest first. */
export function useTaskMonitorEvents(id?: string | null): TaskMonitorEvent[] {
    return useSyncExternalStore(
        subscribe,
        () => (id ? taskMonitor.events(id) : taskMonitor.events()),
        () => (id ? taskMonitor.events(id) : taskMonitor.events()),
    )
}