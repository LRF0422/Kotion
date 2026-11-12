/**
 * In-memory `TaskBridge` for plugin unit tests.
 *
 * This is the public testing surface of `desktop.tasks`: plugin authors should
 * not have to spin up Electron (or re-implement the registry) to test their long
 * task. `createInMemoryTaskBridge()` returns a bridge with the same semantics as
 * the host — monotonic `seq`, a 1000-line ring, "same id after a finished run
 * opens a new run", idempotent `finish`, retained `result`, heartbeat fields and
 * `started/progress/log/finished/cancel-request` events — plus the two test-only
 * helpers `tasks()` (all snapshots) and `dispose()`.
 *
 * ```ts
 * const host = createInMemoryTaskBridge()
 * const handle = await startLongTask(bridgeWith(host.bridge), { title: '同步' })
 * handle.info('hello')
 * await handle.finish('succeeded', { result: { count: 3 } })
 * assert.equal(host.tasks()[0].result?.count, 3)
 * host.dispose()
 * ```
 *
 * Deliberate difference from the host: there is no background timer, so a
 * heartbeat task is never marked stale here (tests drive `touch` explicitly), and
 * capacity/eviction is enforced only when `start` is called.
 */

import type {
    DesktopTaskCancelOptions,
    DesktopTaskCancelResult,
    DesktopTaskEvent,
    DesktopTaskFinishOptions,
    DesktopTaskGetOptions,
    DesktopTaskListOptions,
    DesktopTaskLogEntry,
    DesktopTaskLogLevel,
    DesktopTaskLogInput,
    DesktopTaskLogsPage,
    DesktopTaskLogsSinceOptions,
    DesktopTaskProgress,
    DesktopTaskRemoveOptions,
    DesktopTaskRemoveResult,
    DesktopTaskReportOptions,
    DesktopTaskReportResult,
    DesktopTaskSnapshot,
    DesktopTaskStartOptions,
    DesktopTaskState,
    DesktopTaskTouchOptions,
    TaskBridge,
} from '../desktop/tasks'

/** Tasks retained at once (same limit as the host). */
export const MEMORY_MAX_TASKS = 200
/** Log lines retained per task (same ring size as the host). */
export const MEMORY_MAX_LOG_ENTRIES = 1000
/** Lines the host accepts in one `report` call. */
export const MEMORY_MAX_LOGS_PER_REPORT = 200
export const MEMORY_DEFAULT_LIST_LIMIT = 100
export const MEMORY_MAX_LIST_LIMIT = 500
export const MEMORY_DEFAULT_LOGS_LIMIT = 200
export const MEMORY_MAX_LOGS_LIMIT = 1000
/** Repeat window for the previous `(level, message)` pair. */
export const MEMORY_LOG_DEDUPE_WINDOW_MS = 1000
/** Host cap for the serialized `result` (16KB, measured as UTF-8 bytes). */
export const MEMORY_MAX_RESULT_BYTES = 16 * 1024
export const MEMORY_MIN_HEARTBEAT_MS = 1000
export const MEMORY_MAX_HEARTBEAT_MS = 600_000

const MAX_TITLE_LENGTH = 200
const MAX_KIND_LENGTH = 80
const MAX_ROOT_LENGTH = 1024
const MAX_PROGRESS_MESSAGE_LENGTH = 500
const MAX_LOG_MESSAGE_LENGTH = 2000
const MAX_ERROR_LENGTH = 4000
const TASK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/

const TERMINAL_STATES: ReadonlySet<DesktopTaskState> = new Set<DesktopTaskState>([
    'succeeded',
    'failed',
    'cancelled',
])

const isTerminal = (state: DesktopTaskState): boolean => TERMINAL_STATES.has(state)

const shortId = (prefix: string): string =>
    `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`

const requireText = (value: unknown, maxLength: number, message: string): string => {
    if (typeof value !== 'string' || !value.trim()) throw new Error(message)
    return value.trim().slice(0, maxLength)
}

const optionalText = (value: unknown, maxLength: number): string | undefined =>
    typeof value === 'string' ? value.trim().slice(0, maxLength) : undefined

const normalizeLookupId = (value: unknown): string =>
    typeof value === 'string' ? value.trim() : String(value ?? '').trim()

const normalizeNewTaskId = (value: unknown): string => {
    const id = requireText(value, 120, 'task.start: "id" must be a non-empty string')
    if (!TASK_ID_PATTERN.test(id)) {
        throw new Error(
            'task.start: "id" may only contain letters, digits and . _ : - (and must not contain spaces)',
        )
    }
    return id
}

const normalizeHeartbeat = (value: unknown): number | undefined => {
    if (value === undefined) return undefined
    const ms = Number(value)
    if (
        !Number.isInteger(ms) ||
        ms < MEMORY_MIN_HEARTBEAT_MS ||
        ms > MEMORY_MAX_HEARTBEAT_MS
    ) {
        throw new Error(
            `task.start: "heartbeatMs" must be an integer between ${MEMORY_MIN_HEARTBEAT_MS} and ${MEMORY_MAX_HEARTBEAT_MS}`,
        )
    }
    return ms
}

const normalizeProgress = (value: unknown): DesktopTaskProgress => {
    if (value === undefined || value === null) return {}
    if (typeof value !== 'object') throw new Error('task: "progress" must be an object')
    const input = value as Record<string, unknown>
    const next: DesktopTaskProgress = {}
    if (input.percent !== undefined) {
        const percent = Number(input.percent)
        if (!Number.isFinite(percent)) throw new Error('task: "progress.percent" must be a finite number')
        next.percent = Math.max(0, Math.min(100, percent))
    }
    for (const key of ['current', 'total'] as const) {
        if (input[key] === undefined) continue
        const amount = Number(input[key])
        if (!Number.isFinite(amount) || amount < 0) {
            throw new Error(`task: "progress.${key}" must be a non-negative number`)
        }
        next[key] = Math.floor(amount)
    }
    if (input.message !== undefined) {
        if (typeof input.message !== 'string') throw new Error('task: "progress.message" must be a string')
        next.message = input.message.trim().slice(0, MAX_PROGRESS_MESSAGE_LENGTH)
    }
    return next
}

const normalizeLogs = (value: unknown): Array<{ level: DesktopTaskLogLevel; message: string }> => {
    if (value === undefined) return []
    if (!Array.isArray(value)) throw new Error('task.report: "logs" must be an array')
    const result: Array<{ level: DesktopTaskLogLevel; message: string }> = []
    for (const raw of (value as DesktopTaskLogInput[]).slice(0, MEMORY_MAX_LOGS_PER_REPORT)) {
        const entry =
            typeof raw === 'string' ? { message: raw } : (raw as { level?: unknown; message?: unknown } | null)
        const message = typeof entry?.message === 'string' ? entry.message.trim() : ''
        if (!message) continue
        const level =
            entry?.level === 'warn' || entry?.level === 'error' ? entry.level : 'info'
        result.push({ level, message: message.slice(0, MAX_LOG_MESSAGE_LENGTH) })
    }
    return result
}

const normalizeSinceSeq = (value: unknown): number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0

const normalizeLimit = (value: unknown, fallback: number, max: number): number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0
        ? Math.min(Math.floor(value), max)
        : fallback

const serializedBytes = (text: string): number => new TextEncoder().encode(text).length

/** Deep-copy a result the way IPC would; also rejects what the host rejects. */
const normalizeResult = (value: unknown): unknown => {
    if (value === undefined) return undefined
    let text: string | undefined
    try {
        text = JSON.stringify(value)
    } catch {
        text = undefined
    }
    if (text === undefined) {
        throw new Error('task.finish: TASK_RESULT_INVALID: "result" must be a JSON-serializable value')
    }
    const bytes = serializedBytes(text)
    if (bytes > MEMORY_MAX_RESULT_BYTES) {
        throw new Error(
            `task.finish: TASK_RESULT_TOO_LARGE: "result" serializes to ${bytes} bytes (max ${MEMORY_MAX_RESULT_BYTES})`,
        )
    }
    return JSON.parse(text)
}

const copyResult = (value: unknown): unknown => {
    try {
        const text = JSON.stringify(value)
        return text === undefined ? value : JSON.parse(text)
    } catch {
        return value
    }
}

interface TaskRecord {
    id: string
    sessionId: string
    kind: string
    title: string
    root?: string
    state: DesktopTaskState
    progress: DesktopTaskProgress
    logs: DesktopTaskLogEntry[]
    /** Seq of the last retained (or evicted) line; monotonic from 0. */
    seq: number
    createdAt: number
    updatedAt: number
    finishedAt?: number
    error?: string
    result?: unknown
    heartbeatMs?: number
    lastHeartbeatAt?: number
}

export interface InMemoryTaskBridgeOptions {
    /** Injected clock so assertions never depend on wall time. Defaults to `Date.now`. */
    now?: () => number
}

export interface InMemoryTaskBridge {
    /** The `TaskBridge` to hand to `startLongTask` / `runLongTask` / tools. */
    bridge: TaskBridge
    /** Every retained snapshot, newest `updatedAt` first (the host `list` order). */
    tasks: () => DesktopTaskSnapshot[]
    /** Forget every task and listener (call it in the test's teardown). */
    dispose: () => void
}

/**
 * Create one in-memory host. Each call is isolated (fresh ids, listeners and
 * clock), so tests can run in parallel.
 */
export const createInMemoryTaskBridge = (
    options: InMemoryTaskBridgeOptions = {},
): InMemoryTaskBridge => {
    const now = options.now ?? Date.now
    const records = new Map<string, TaskRecord>()
    const listeners = new Set<(event: DesktopTaskEvent) => void>()

    const emit = (event: DesktopTaskEvent): void => {
        for (const listener of listeners) {
            try {
                listener(event)
            } catch {
                // A broken listener must not take the task down (host contract).
            }
        }
    }

    const snapshot = (task: TaskRecord): DesktopTaskSnapshot => ({
        id: task.id,
        sessionId: task.sessionId,
        kind: task.kind,
        title: task.title,
        ...(task.root === undefined ? {} : { root: task.root }),
        state: task.state,
        progress: { ...task.progress },
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        ...(task.finishedAt === undefined ? {} : { finishedAt: task.finishedAt }),
        ...(task.error === undefined ? {} : { error: task.error }),
        seq: task.seq,
        total: task.logs.length,
        ...(task.result === undefined ? {} : { result: copyResult(task.result) }),
        ...(task.heartbeatMs === undefined ? {} : { heartbeatMs: task.heartbeatMs }),
        ...(task.lastHeartbeatAt === undefined ? {} : { lastHeartbeatAt: task.lastHeartbeatAt }),
    })

    const requireTask = (value: unknown): TaskRecord => {
        const taskId = normalizeLookupId(value)
        if (!taskId) throw new Error('task: "taskId" is required')
        const task = records.get(taskId)
        if (!task) throw new Error(`task: no such task "${taskId}"`)
        return task
    }

    /**
     * The newer `task.*` calls (`get`/`touch`/`remove`) answer with the code the
     * docs name, while the older ones keep their bare message so plugins that
     * match on the text do not break (same split as the host).
     */
    const requireKnownTask = (value: unknown, method: string): TaskRecord => {
        const taskId = normalizeLookupId(value)
        if (!taskId) throw new Error(`${method}: TASK_NOT_FOUND: "taskId" is required`)
        const task = records.get(taskId)
        if (!task) throw new Error(`${method}: TASK_NOT_FOUND: no such task "${taskId}"`)
        return task
    }

    /** Evict the oldest finished tasks; running tasks are never dropped. */
    const makeRoom = (): void => {
        while (records.size >= MEMORY_MAX_TASKS) {
            let oldest: TaskRecord | undefined
            for (const task of records.values()) {
                if (!isTerminal(task.state)) continue
                if (!oldest || (task.finishedAt ?? task.updatedAt) < (oldest.finishedAt ?? oldest.updatedAt)) {
                    oldest = task
                }
            }
            if (!oldest) {
                throw new Error(
                    `task.start: too many retained tasks (max ${MEMORY_MAX_TASKS}); finish or cancel some first`,
                )
            }
            records.delete(oldest.id)
        }
    }

    /** Append one line; false when it is a duplicate inside the dedupe window. */
    const pushLog = (
        task: TaskRecord,
        level: DesktopTaskLogLevel,
        message: string,
        at: number,
    ): boolean => {
        const previous = task.logs[task.logs.length - 1]
        if (
            previous &&
            previous.level === level &&
            previous.message === message &&
            at - previous.at < MEMORY_LOG_DEDUPE_WINDOW_MS
        ) {
            return false
        }
        task.seq += 1
        task.logs.push({ seq: task.seq, level, message, at })
        if (task.logs.length > MEMORY_MAX_LOG_ENTRIES) {
            task.logs.splice(0, task.logs.length - MEMORY_MAX_LOG_ENTRIES)
        }
        return true
    }

    const start = async (startOptions: DesktopTaskStartOptions): Promise<DesktopTaskSnapshot> => {
        const title = requireText(
            startOptions?.title,
            MAX_TITLE_LENGTH,
            'task.start: "title" must be a non-empty string',
        )
        const kind =
            startOptions?.kind === undefined
                ? 'plugin'
                : requireText(startOptions.kind, MAX_KIND_LENGTH, 'task.start: "kind" must be a non-empty string')
        const root = optionalText(startOptions?.root, MAX_ROOT_LENGTH) || undefined
        const heartbeatMs = normalizeHeartbeat(startOptions?.heartbeatMs)
        const id =
            startOptions?.id === undefined ? shortId('task') : normalizeNewTaskId(startOptions.id)

        const existing = records.get(id)
        if (existing) {
            if (!isTerminal(existing.state)) {
                throw new Error(`task.start: task "${id}" is already ${existing.state}; finish it first`)
            }
            // A finished task with a caller-stable id is a previous run: replace
            // it (new sessionId, seq back to 0) instead of accumulating runs.
            records.delete(id)
        }
        makeRoom()

        const createdAt = now()
        const task: TaskRecord = {
            id,
            sessionId: shortId('run'),
            kind,
            title,
            ...(root === undefined ? {} : { root }),
            state: 'running',
            progress: normalizeProgress(startOptions?.progress),
            logs: [],
            seq: 0,
            createdAt,
            updatedAt: createdAt,
            lastHeartbeatAt: createdAt,
            ...(heartbeatMs === undefined ? {} : { heartbeatMs }),
        }
        records.set(id, task)
        emit({ type: 'started', task: snapshot(task) })
        return snapshot(task)
    }

    const report = async (reportOptions: DesktopTaskReportOptions): Promise<DesktopTaskReportResult> => {
        const task = requireTask(reportOptions?.taskId)
        if (isTerminal(task.state)) {
            throw new Error(`task.report: task "${task.id}" is already ${task.state}`)
        }
        const progress = normalizeProgress(reportOptions?.progress)
        const logs = normalizeLogs(reportOptions?.logs)
        const at = now()
        const progressChanged = Object.keys(progress).length > 0
        if (progressChanged) Object.assign(task.progress, progress)

        const lines: DesktopTaskLogEntry[] = []
        for (const entry of logs) {
            if (!pushLog(task, entry.level, entry.message, at)) continue
            lines.push({ ...task.logs[task.logs.length - 1] })
        }
        if (progressChanged || lines.length) {
            task.updatedAt = at
            task.lastHeartbeatAt = at
        }

        if (progressChanged) emit({ type: 'progress', task: snapshot(task) })
        if (lines.length) emit({ type: 'log', task: snapshot(task), lines })
        return { task: snapshot(task), added: lines.length }
    }

    const logsSince = async (pageOptions: DesktopTaskLogsSinceOptions): Promise<DesktopTaskLogsPage> => {
        const taskId = normalizeLookupId(pageOptions?.taskId)
        const cursor = normalizeSinceSeq(pageOptions?.sinceSeq)
        const task = records.get(taskId)
        if (!task) {
            return { taskId, sessionId: null, entries: [], nextSeq: cursor, dropped: 0, total: 0 }
        }
        const pageSize = normalizeLimit(
            pageOptions?.limit,
            MEMORY_DEFAULT_LOGS_LIMIT,
            MEMORY_MAX_LOGS_LIMIT,
        )
        const total = task.logs.length
        if (total === 0) {
            return { taskId, sessionId: task.sessionId, entries: [], nextSeq: cursor, dropped: 0, total: 0 }
        }

        const firstSeq = task.logs[0].seq
        const startIndex = task.logs.findIndex(entry => entry.seq > cursor)
        const candidates = startIndex === -1 ? [] : task.logs.slice(startIndex)
        const truncated = Math.max(0, candidates.length - pageSize)
        const entries = truncated > 0 ? candidates.slice(truncated) : candidates
        const evicted = Math.max(0, firstSeq - 1 - cursor)
        const dropped = evicted + truncated
        return {
            taskId,
            sessionId: task.sessionId,
            entries: entries.map(entry => ({ ...entry })),
            nextSeq: entries.length ? entries[entries.length - 1].seq : dropped > 0 ? firstSeq - 1 : cursor,
            dropped,
            total,
        }
    }

    const list = async (listOptions: DesktopTaskListOptions = {}): Promise<DesktopTaskSnapshot[]> => {
        const state = listOptions?.state === undefined ? undefined : String(listOptions.state)
        if (state !== undefined && !['running', 'cancelling', 'succeeded', 'failed', 'cancelled'].includes(state)) {
            throw new Error('task.list: "state" is not a task state')
        }
        const kind = optionalText(listOptions?.kind, MAX_KIND_LENGTH)
        const root = optionalText(listOptions?.root, MAX_ROOT_LENGTH)
        const limit = normalizeLimit(listOptions?.limit, MEMORY_DEFAULT_LIST_LIMIT, MEMORY_MAX_LIST_LIMIT)
        return [...records.values()]
            .filter(task => (state === undefined ? true : task.state === state))
            .filter(task => (kind === undefined ? true : task.kind === kind))
            .filter(task => (root === undefined ? true : task.root === root))
            .sort((left, right) => right.updatedAt - left.updatedAt)
            .slice(0, limit)
            .map(snapshot)
    }

    const get = async (getOptions: DesktopTaskGetOptions): Promise<DesktopTaskSnapshot | null> => {
        const task = records.get(normalizeLookupId(getOptions?.taskId))
        return task ? snapshot(task) : null
    }

    const touch = async (touchOptions: DesktopTaskTouchOptions): Promise<DesktopTaskSnapshot> => {
        const task = requireKnownTask(touchOptions?.taskId, 'task.touch')
        // A heartbeat is a liveness clock, not an observable change: refresh the
        // timestamps but stay silent (no event), exactly like the host.
        if (!isTerminal(task.state)) {
            const at = now()
            task.lastHeartbeatAt = at
            task.updatedAt = at
        }
        return snapshot(task)
    }

    const remove = async (removeOptions: DesktopTaskRemoveOptions): Promise<DesktopTaskRemoveResult> => {
        const taskId = normalizeLookupId(removeOptions?.taskId)
        if (!taskId) throw new Error('task.remove: TASK_NOT_FOUND: "taskId" is required')
        const task = records.get(taskId)
        if (!task) return { taskId, removed: false }
        if (!isTerminal(task.state)) {
            throw new Error(
                `task.remove: TASK_RUNNING: task "${taskId}" is ${task.state}; finish or cancel it first`,
            )
        }
        records.delete(taskId)
        return { taskId, removed: true }
    }

    const finish = async (finishOptions: DesktopTaskFinishOptions): Promise<DesktopTaskSnapshot> => {
        const task = requireTask(finishOptions?.taskId)
        const state = finishOptions?.state ?? 'succeeded'
        if (!TERMINAL_STATES.has(state)) {
            throw new Error('task.finish: "state" must be one of succeeded, failed, cancelled')
        }
        // Validate the result even when the call will be a no-op: an invalid
        // payload is a caller bug either way (host does the same).
        const result = normalizeResult(finishOptions?.result)
        // Finishing twice is a no-op: a plugin's finally-block must not throw
        // because a cancel path already completed the task.
        if (isTerminal(task.state)) return snapshot(task)

        const at = now()
        task.state = state
        task.updatedAt = at
        task.finishedAt = at
        task.lastHeartbeatAt = at
        if (typeof finishOptions?.message === 'string') {
            task.progress.message = finishOptions.message.trim().slice(0, MAX_PROGRESS_MESSAGE_LENGTH)
        }
        if (state === 'failed') {
            task.error =
                optionalText(finishOptions?.error, MAX_ERROR_LENGTH) ||
                task.progress.message ||
                'the task failed without an error message'
        }
        if (result !== undefined) task.result = result
        emit({ type: 'finished', task: snapshot(task) })
        return snapshot(task)
    }

    const cancel = async (cancelOptions: DesktopTaskCancelOptions): Promise<DesktopTaskCancelResult> => {
        const task = requireTask(cancelOptions?.taskId)
        if (isTerminal(task.state)) {
            return {
                taskId: task.id,
                sessionId: task.sessionId,
                state: task.state,
                cancelRequested: false,
            }
        }
        if (task.state === 'running') {
            task.state = 'cancelling'
            const at = now()
            task.updatedAt = at
            task.lastHeartbeatAt = at
            // Broadcast once: a repeated cancel has nothing new to say.
            emit({ type: 'cancel-request', task: snapshot(task) })
        }
        return {
            taskId: task.id,
            sessionId: task.sessionId,
            state: task.state,
            cancelRequested: true,
        }
    }

    const bridge: TaskBridge = {
        start,
        report,
        logsSince,
        list,
        get,
        touch,
        remove,
        finish,
        cancel,
        onEvent: (listener) => {
            listeners.add(listener)
            return () => {
                listeners.delete(listener)
            }
        },
    }

    return {
        bridge,
        tasks: () =>
            [...records.values()]
                .sort((left, right) => right.updatedAt - left.updatedAt)
                .map(snapshot),
        dispose: () => {
            records.clear()
            listeners.clear()
        },
    }
}