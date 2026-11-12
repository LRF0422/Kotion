/**
 * Adapters from the host's incremental-log bridges to the monitor engine.
 *
 * The engine only knows `{ source, sinceSeq } → page` (see `TaskMonitorReader`).
 * A host has one API per log family — `dev.logsSince({ root })` for a project's
 * build log and `task.logsSince({ taskId })` for a plugin-declared long task
 * (see `core/desktop/tasks.ts`) — and both already share the same page shape
 * (`entries` / `nextSeq` / `dropped`). This module is the single place that maps
 * a {@link MonitorSource} onto the right one, and it does the normalisation the
 * engine needs:
 *
 *   - `seq` is OPTIONAL on the dev bridge for compatibility with older hosts, so
 *     a missing one is rebuilt from the requested cursor (`sinceSeq + index + 1`).
 *     The engine's cursor arithmetic needs a dense sequence, and dropping these
 *     lines would silently lose the very output being monitored;
 *   - an unknown level degrades to `info` (a rule must never fire on a typo);
 *   - a missing timestamp is `0` (ordering comes from `seq`, not from clocks);
 *   - a page that is `null`/`undefined` (no such session/task yet) is an EMPTY
 *     page that keeps the cursor — "nothing there yet" is not an error;
 *   - a bridge that is not available throws a clear error. The engine already
 *     warns once per failure streak and keeps the monitor alive, so the UI sees
 *     "no logs" instead of a broken window.
 *
 * A bridge is deliberately structural ({@link MonitorBridgeLike}): the host passes
 * its existing bridge object directly, without this package importing any
 * desktop module.
 */

import type {
    MonitorLogLevel,
    MonitorLogLine,
    MonitorLogPage,
    MonitorSource,
    TaskMonitorReader,
} from './task-monitor'

/** The shape every host log bridge shares (`dev.logsSince`, `task.logsSince`). */
export interface MonitorBridgeLike<Options> {
    logsSince(options: Options): Promise<{ entries: unknown[]; nextSeq: number; dropped: number } | null | undefined>
}

/** The bridges a renderer host can offer; either may be absent on older builds. */
export interface MonitorReaderBridges {
    dev?: MonitorBridgeLike<{ root: string; sinceSeq: number; limit?: number }> | null
    tasks?: MonitorBridgeLike<{ taskId: string; sinceSeq: number; limit?: number }> | null
}

/** One page as a bridge returns it; `null`/`undefined` means "no session/task". */
type HostLogPage = { entries: unknown[]; nextSeq: number; dropped: number } | null | undefined

const toLevel = (value: unknown): MonitorLogLevel =>
    value === 'warn' || value === 'error' ? value : 'info'

const toCursor = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback

/**
 * Normalise one host entry into a line.
 *
 * A non-record entry still becomes a line (its text is the message): a bridge
 * that returns `['compile failed']` is a log, not garbage to discard.
 */
const toLine = (raw: unknown, fallbackSeq: number): MonitorLogLine => {
    const record: Record<string, unknown> =
        typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : { message: raw }
    return {
        seq: toCursor(record.seq, fallbackSeq),
        level: toLevel(record.level),
        message: typeof record.message === 'string' ? record.message : String(record.message ?? ''),
        at: toCursor(record.at, 0),
    }
}

/** Turn a bridge page into the engine's page (never throws on a odd shape). */
const toPage = (page: HostLogPage, sinceSeq: number): MonitorLogPage => {
    if (!page) return { entries: [], nextSeq: sinceSeq, dropped: 0 }
    const rawEntries = Array.isArray(page.entries) ? page.entries : []
    return {
        entries: rawEntries.map((entry, index) => toLine(entry, sinceSeq + index + 1)),
        nextSeq: toCursor(page.nextSeq, sinceSeq),
        dropped: toCursor(page.dropped, 0),
    }
}

const readPage = async (
    bridges: MonitorReaderBridges,
    source: MonitorSource,
    sinceSeq: number,
    limit: number | undefined,
): Promise<HostLogPage> => {
    if (source.kind === 'dev') {
        const bridge = bridges.dev
        if (!bridge || typeof bridge.logsSince !== 'function') {
            throw new Error('monitor: no dev log bridge available')
        }
        const root = typeof source.root === 'string' ? source.root.trim() : ''
        if (!root) throw new Error('monitor: dev source requires a root')
        return limit === undefined
            ? bridge.logsSince({ root, sinceSeq })
            : bridge.logsSince({ root, sinceSeq, limit })
    }

    const bridge = bridges.tasks
    if (!bridge || typeof bridge.logsSince !== 'function') {
        throw new Error('monitor: no task log bridge available')
    }
    const taskId = typeof source.taskId === 'string' ? source.taskId.trim() : ''
    if (!taskId) throw new Error('monitor: task source requires a taskId')
    return limit === undefined
        ? bridge.logsSince({ taskId, sinceSeq })
        : bridge.logsSince({ taskId, sinceSeq, limit })
}

/**
 * Build the engine's reader from the bridges this host actually has.
 *
 * Both bridges are optional: a host that only ships `dev.logsSince` still
 * monitors project logs, and a source whose bridge is missing fails per read
 * (warned once by the engine) instead of breaking the monitor setup.
 */
export const createMonitorReader = (bridges: MonitorReaderBridges): TaskMonitorReader => {
    const available: MonitorReaderBridges = bridges ?? {}
    return {
        read: async ({ source, sinceSeq, limit }) => {
            const cursor = toCursor(sinceSeq, 0)
            const page = await readPage(available, source, cursor, limit)
            return toPage(page, cursor)
        },
    }
}