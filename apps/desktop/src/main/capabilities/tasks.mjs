/**
 * Generic long-task registry (main process, no Electron).
 *
 * This is the host side of `task.*`: a plugin registers a task, reports progress
 * and log lines, and the UI/monitor reads the log incrementally with a `seq`
 * cursor. It is deliberately independent of Electron and of any particular
 * plugin, so it can be exercised directly by `tasks.test.mjs`.
 *
 * Why the main process owns it: the renderer module that started the work is
 * destroyed by a page refresh, but the user still expects the task list and its
 * log to be there afterwards. State therefore lives in the app run's main
 * process; a window that goes away only fails the tasks *it* owned (see
 * {@link createTaskRegistry} → `failOwner`).
 *
 * Limits are part of the contract, not a suggestion: at most
 * {@link MAX_TASKS} retained tasks and {@link MAX_TASK_LOG_ENTRIES} log lines
 * per task. The ring evicts oldest lines first, and `logsSince` reports the gap
 * as `dropped`, exactly like `DevSession.logsSince`.
 *
 * Two host-maintained extras keep that list honest after the plugin is gone:
 * a finished task may carry a small structured `result` (≤ 16KB serialized) for
 * late readers, and a task that declared `heartbeatMs` is marked `failed` by
 * `sweep` after three missed beats, so a crashed plugin cannot leave a task
 * "running" forever.
 */
import { randomUUID } from 'node:crypto'

/** Tasks retained for the whole app run (running + finished). */
export const MAX_TASKS = 200
/** Log lines retained per task. */
export const MAX_TASK_LOG_ENTRIES = 1000
/** Repeat window for the previous `(level, message)` pair, same rule as dev logs. */
export const TASK_LOG_DEDUPE_WINDOW_MS = 1000
/** Matching back-to-back duplicates inside one report batch are compared too. */
export const MAX_TASK_LOGS_PER_REPORT = 200
export const DEFAULT_TASK_LIST_LIMIT = 100
export const MAX_TASK_LIST_LIMIT = 500
export const DEFAULT_TASK_LOGS_LIMIT = 200
export const MAX_TASK_LOGS_LIMIT = 1000
/** Serialized cap for `finish({ result })` — a result is a receipt, not a payload. */
export const MAX_TASK_RESULT_BYTES = 16 * 1024
/** Accepted `heartbeatMs` range at `start` (ms). */
export const MIN_TASK_HEARTBEAT_MS = 1000
export const MAX_TASK_HEARTBEAT_MS = 600000
/** A task whose heartbeat is this many intervals late is considered stale. */
export const STALE_HEARTBEAT_MULTIPLIER = 3

const TERMINAL_STATES = new Set(['succeeded', 'failed', 'cancelled'])
const ALL_STATES = new Set(['running', 'cancelling', ...TERMINAL_STATES])
const TASK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/
const MAX_TITLE_LENGTH = 200
const MAX_KIND_LENGTH = 80
const MAX_ROOT_LENGTH = 1024
const MAX_PROGRESS_MESSAGE_LENGTH = 500
const MAX_LOG_MESSAGE_LENGTH = 2000
const MAX_ERROR_LENGTH = 4000

const shortId = (prefix) => `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 16)}`

const asRecord = (value) => (value && typeof value === 'object' ? value : {})

const requireText = (value, maxLength, message) => {
    if (typeof value !== 'string' || !value.trim()) throw new Error(message)
    return value.trim().slice(0, maxLength)
}

const optionalText = (value, maxLength) =>
    typeof value === 'string' ? value.trim().slice(0, maxLength) : undefined

/** A caller-supplied id: stable keys are allowed, random ones are the default. */
const normalizeNewTaskId = (value) => {
    const id = requireText(value, 120, 'task.start: "id" must be a non-empty string')
    if (!TASK_ID_PATTERN.test(id)) {
        throw new Error(
            'task.start: "id" may only contain letters, digits and . _ : - (and must not contain spaces)',
        )
    }
    return id
}

/** An id used for a lookup: missing/blank is a valid "not found" query. */
const normalizeLookupId = (value) => (typeof value === 'string' ? value.trim() : String(value ?? '').trim())

const normalizeProgress = (value) => {
    if (value === undefined || value === null) return {}
    if (typeof value !== 'object') throw new Error('task: "progress" must be an object')
    const next = {}
    if (value.percent !== undefined) {
        const percent = Number(value.percent)
        if (!Number.isFinite(percent)) throw new Error('task: "progress.percent" must be a finite number')
        next.percent = Math.max(0, Math.min(100, percent))
    }
    for (const key of ['current', 'total']) {
        if (value[key] === undefined) continue
        const amount = Number(value[key])
        if (!Number.isFinite(amount) || amount < 0) {
            throw new Error(`task: "progress.${key}" must be a non-negative number`)
        }
        next[key] = Math.floor(amount)
    }
    if (value.message !== undefined) {
        if (typeof value.message !== 'string') throw new Error('task: "progress.message" must be a string')
        next.message = value.message.trim().slice(0, MAX_PROGRESS_MESSAGE_LENGTH)
    }
    return next
}

/** Log input accepts bare strings (level `info`) or `{ level, message }`. */
const normalizeLogs = (value) => {
    if (value === undefined) return []
    if (!Array.isArray(value)) throw new Error('task.report: "logs" must be an array')
    const result = []
    for (const raw of value.slice(0, MAX_TASK_LOGS_PER_REPORT)) {
        const entry = typeof raw === 'string' ? { message: raw } : asRecord(raw)
        const message = typeof entry.message === 'string' ? entry.message.trim() : ''
        if (!message) continue
        const level = entry.level === 'warn' || entry.level === 'error' ? entry.level : 'info'
        result.push({ level, message: message.slice(0, MAX_LOG_MESSAGE_LENGTH) })
    }
    return result
}

const normalizeSinceSeq = (value) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0

/** Optional liveness contract: an integer interval inside the accepted range. */
const normalizeHeartbeatMs = (value) => {
    if (value === undefined || value === null) return undefined
    const heartbeatMs = Number(value)
    if (
        !Number.isInteger(heartbeatMs) ||
        heartbeatMs < MIN_TASK_HEARTBEAT_MS ||
        heartbeatMs > MAX_TASK_HEARTBEAT_MS
    ) {
        throw new Error(
            `task.start: "heartbeatMs" must be an integer between ${MIN_TASK_HEARTBEAT_MS} and ${MAX_TASK_HEARTBEAT_MS}`,
        )
    }
    return heartbeatMs
}

/**
 * Validate the structured result of `finish`.
 *
 * The value is round-tripped through JSON, so what the snapshot keeps is exactly
 * what a later IPC reader would receive (no `Date`/`Map`/function/cycle), and
 * the 16KB cap is measured on the serialized form a consumer actually reads.
 */
const normalizeResult = (value) => {
    if (value === undefined) return undefined
    let json
    try {
        json = JSON.stringify(value)
    } catch {
        json = undefined
    }
    if (json === undefined) {
        throw new Error(
            'task.finish: TASK_RESULT_INVALID: "result" must be a JSON-serializable value',
        )
    }
    const bytes = Buffer.byteLength(json, 'utf8')
    if (bytes > MAX_TASK_RESULT_BYTES) {
        throw new Error(
            `task.finish: TASK_RESULT_TOO_LARGE: "result" serializes to ${bytes} bytes (max ${MAX_TASK_RESULT_BYTES})`,
        )
    }
    return JSON.parse(json)
}

const normalizeLimit = (value, fallback, max) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0
        ? Math.min(Math.floor(value), max)
        : fallback

/**
 * Create one registry.
 *
 * `onEvent` receives `{ type, task, lines? }` for every observable change; the
 * Electron wiring broadcasts it on `desktop:event:task`. Injected `now` keeps
 * the tests deterministic.
 */
export const createTaskRegistry = ({ now = Date.now, onEvent = () => {} } = {}) => {
    /** @type {Map<string, any>} */
    const tasks = new Map()

    const emit = (event) => {
        try {
            onEvent(event)
        } catch {
            // A broken listener must not take the task down.
        }
    }

    const snapshot = (task) => ({
        id: task.id,
        sessionId: task.sessionId,
        kind: task.kind,
        title: task.title,
        ...(task.root === undefined ? {} : { root: task.root }),
        state: task.state,
        progress: { ...task.progress },
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        ...(task.finishedAt ? { finishedAt: task.finishedAt } : {}),
        ...(task.error === undefined ? {} : { error: task.error }),
        ...(task.result === undefined ? {} : { result: task.result }),
        ...(task.heartbeatMs === undefined ? {} : { heartbeatMs: task.heartbeatMs }),
        lastHeartbeatAt: task.lastHeartbeatAt,
        seq: task.logSeq,
        total: task.logs.length,
    })

    const requireTask = (value) => {
        const taskId = normalizeLookupId(value)
        if (!taskId) throw new Error('task: "taskId" is required')
        const task = tasks.get(taskId)
        if (!task) throw new Error(`task: no such task "${taskId}"`)
        return task
    }

    /**
     * A lookup that reports "unknown" with an explicit code.
     *
     * `report`/`finish`/`cancel` grew up around a bare message and plugins may
     * match on it, so they keep {@link requireTask}; the newer `task.*` calls
     * answer with the code the bridge/docs name.
     */
    const requireKnownTask = (value, method) => {
        const taskId = normalizeLookupId(value)
        if (!taskId) throw new Error(`${method}: TASK_NOT_FOUND: "taskId" is required`)
        const task = tasks.get(taskId)
        if (!task) throw new Error(`${method}: TASK_NOT_FOUND: no such task "${taskId}"`)
        return task
    }

    /**
     * Evict the oldest finished tasks until there is room for a new one.
     *
     * Running tasks are never evicted: losing one would mean silently losing
     * the only state the plugin can still report into.
     */
    const makeRoom = () => {
        while (tasks.size >= MAX_TASKS) {
            let oldest
            for (const task of tasks.values()) {
                if (!TERMINAL_STATES.has(task.state)) continue
                if (!oldest || task.finishedAt < oldest.finishedAt) oldest = task
            }
            if (!oldest) {
                throw new Error(
                    `task.start: too many retained tasks (max ${MAX_TASKS}); finish or cancel some first`,
                )
            }
            tasks.delete(oldest.id)
        }
    }

    /** Append one line; false when it was a duplicate inside the dedupe window. */
    const pushLog = (task, level, message, at) => {
        const previous = task.logs[task.logs.length - 1]
        if (
            previous &&
            previous.level === level &&
            previous.message === message &&
            at - previous.at < TASK_LOG_DEDUPE_WINDOW_MS
        ) {
            return false
        }
        task.logSeq += 1
        task.logs.push({ seq: task.logSeq, level, message, at })
        if (task.logs.length > MAX_TASK_LOG_ENTRIES) {
            task.logs.splice(0, task.logs.length - MAX_TASK_LOG_ENTRIES)
        }
        return true
    }

    const start = (options = {}) => {
        const title = requireText(options.title, MAX_TITLE_LENGTH, 'task.start: "title" must be a non-empty string')
        const kind =
            options.kind === undefined
                ? 'plugin'
                : requireText(options.kind, MAX_KIND_LENGTH, 'task.start: "kind" must be a non-empty string')
        const root = optionalText(options.root, MAX_ROOT_LENGTH) || undefined
        const id = options.id === undefined ? shortId('task') : normalizeNewTaskId(options.id)
        const heartbeatMs = normalizeHeartbeatMs(options.heartbeatMs)

        const existing = tasks.get(id)
        if (existing) {
            if (!TERMINAL_STATES.has(existing.state)) {
                throw new Error(`task.start: task "${id}" is already ${existing.state}; finish it first`)
            }
            // A finished task with a caller-stable id is a previous run: replace
            // it (new sessionId + seq from 1) instead of accumulating runs.
            tasks.delete(id)
        }
        makeRoom()

        const createdAt = now()
        const task = {
            id,
            sessionId: shortId('run'),
            kind,
            title,
            ...(root === undefined ? {} : { root }),
            state: 'running',
            progress: normalizeProgress(options.progress),
            logs: [],
            logSeq: 0,
            createdAt,
            updatedAt: createdAt,
            finishedAt: 0,
            error: undefined,
            result: undefined,
            heartbeatMs,
            lastHeartbeatAt: createdAt,
            owner: options.owner,
        }
        tasks.set(id, task)
        emit({ type: 'started', task: snapshot(task) })
        return snapshot(task)
    }

    const report = (options = {}) => {
        const task = requireTask(options.taskId)
        if (TERMINAL_STATES.has(task.state)) {
            throw new Error(`task.report: task "${task.id}" is already ${task.state}`)
        }
        const progress = normalizeProgress(options.progress)
        const logs = normalizeLogs(options.logs)
        const at = now()
        // Reporting is also a liveness signal: a task that keeps talking to the
        // host never goes stale, even when it has no explicit `touch`.
        task.lastHeartbeatAt = at
        const progressChanged = Object.keys(progress).length > 0
        if (progressChanged) Object.assign(task.progress, progress)

        const lines = []
        for (const entry of logs) {
            if (!pushLog(task, entry.level, entry.message, at)) continue
            lines.push({ ...task.logs[task.logs.length - 1] })
        }
        if (progressChanged || lines.length) task.updatedAt = at

        if (progressChanged) emit({ type: 'progress', task: snapshot(task) })
        if (lines.length) emit({ type: 'log', task: snapshot(task), lines })
        return { task: snapshot(task), added: lines.length }
    }

    const logsSince = (options = {}) => {
        const taskId = normalizeLookupId(options.taskId)
        const cursor = normalizeSinceSeq(options.sinceSeq)
        const task = tasks.get(taskId)
        if (!task) {
            return { taskId, sessionId: null, entries: [], nextSeq: cursor, dropped: 0, total: 0 }
        }
        const pageSize = normalizeLimit(options.limit, DEFAULT_TASK_LOGS_LIMIT, MAX_TASK_LOGS_LIMIT)
        const total = task.logs.length
        if (total === 0) {
            return { taskId, sessionId: task.sessionId, entries: [], nextSeq: cursor, dropped: 0, total: 0 }
        }

        const firstSeq = task.logs[0].seq
        const startIndex = task.logs.findIndex((entry) => entry.seq > cursor)
        const candidates = startIndex === -1 ? [] : task.logs.slice(startIndex)
        const truncated = Math.max(0, candidates.length - pageSize)
        const entries = truncated > 0 ? candidates.slice(truncated) : candidates
        const evicted = Math.max(0, firstSeq - 1 - cursor)
        const dropped = evicted + truncated
        return {
            taskId,
            sessionId: task.sessionId,
            entries,
            nextSeq: entries.length ? entries[entries.length - 1].seq : dropped > 0 ? firstSeq - 1 : cursor,
            dropped,
            total,
        }
    }

    const list = (options = {}) => {
        const state = options.state === undefined ? undefined : String(options.state)
        if (state !== undefined && !ALL_STATES.has(state)) {
            throw new Error('task.list: "state" is not a task state')
        }
        const kind = optionalText(options.kind, MAX_KIND_LENGTH)
        const root = optionalText(options.root, MAX_ROOT_LENGTH)
        const limit = normalizeLimit(options.limit, DEFAULT_TASK_LIST_LIMIT, MAX_TASK_LIST_LIMIT)
        return [...tasks.values()]
            .filter((task) => (state === undefined ? true : task.state === state))
            .filter((task) => (kind === undefined ? true : task.kind === kind))
            .filter((task) => (root === undefined ? true : task.root === root))
            .sort((left, right) => right.updatedAt - left.updatedAt)
            .slice(0, limit)
            .map(snapshot)
    }

    const finish = (options = {}) => {
        const task = requireTask(options.taskId)
        const state = options.state === undefined ? 'succeeded' : String(options.state)
        if (!TERMINAL_STATES.has(state)) {
            throw new Error('task.finish: "state" must be one of succeeded, failed, cancelled')
        }
        // Validate the result even when the call will be a no-op: an invalid
        // payload is a caller bug either way, and failing loudly early is what
        // keeps a 20MB object from being sent over IPC twice.
        const result = normalizeResult(options.result)
        // Finishing twice is a no-op: a plugin's finally-block must not throw
        // because a cancel path already completed the task. The stored result
        // deliberately stays the first one.
        if (TERMINAL_STATES.has(task.state)) return snapshot(task)

        const at = now()
        task.state = state
        task.updatedAt = at
        task.finishedAt = at
        task.lastHeartbeatAt = at
        if (result !== undefined) task.result = result
        if (options.message !== undefined) {
            task.progress.message =
                typeof options.message === 'string'
                    ? options.message.trim().slice(0, MAX_PROGRESS_MESSAGE_LENGTH)
                    : task.progress.message
        }
        if (state === 'failed') {
            const error =
                optionalText(options.error, MAX_ERROR_LENGTH) ||
                task.progress.message ||
                'the task failed without an error message'
            task.error = error
        }
        emit({ type: 'finished', task: snapshot(task) })
        return snapshot(task)
    }

    const cancel = (options = {}) => {
        const task = requireTask(options.taskId)
        if (TERMINAL_STATES.has(task.state)) {
            return {
                taskId: task.id,
                sessionId: task.sessionId,
                state: task.state,
                cancelRequested: false,
            }
        }
        if (task.state === 'running') {
            const at = now()
            task.state = 'cancelling'
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

    /**
     * Read one task, or `null` when it is unknown / was already evicted.
     *
     * Deliberately never throws: `get` is the poll a UI does after a refresh,
     * and "the task is gone" is a normal answer there, not an error.
     */
    const get = (options = {}) => {
        const taskId = normalizeLookupId(options.taskId)
        if (!taskId) return null
        const task = tasks.get(taskId)
        return task ? snapshot(task) : null
    }

    /**
     * Refresh the liveness clock without reporting progress.
     *
     * A terminal task answers with its snapshot (a heartbeat racing a finish is
     * expected); an unknown one is a caller bug and reports `TASK_NOT_FOUND`.
     */
    const touch = (options = {}) => {
        const task = requireKnownTask(options.taskId, 'task.touch')
        if (TERMINAL_STATES.has(task.state)) return snapshot(task)
        const at = now()
        task.lastHeartbeatAt = at
        task.updatedAt = at
        return snapshot(task)
    }

    /**
     * Forget one finished task.
     *
     * Running work is refused: deleting it would leave the plugin reporting into
     * an id that no longer exists. Unknown ids answer `removed: false` (removal
     * is idempotent, like `get`).
     */
    const remove = (options = {}) => {
        const taskId = normalizeLookupId(options.taskId)
        if (!taskId) throw new Error('task.remove: TASK_NOT_FOUND: "taskId" is required')
        const task = tasks.get(taskId)
        if (!task) return { taskId, removed: false }
        if (!TERMINAL_STATES.has(task.state)) {
            throw new Error(
                `task.remove: TASK_RUNNING: task "${taskId}" is ${task.state}; finish or cancel it first`,
            )
        }
        tasks.delete(taskId)
        return { taskId, removed: true }
    }

    /**
     * Fail heartbeat tasks that stopped beating (a crashed plugin must not leave
     * a task "running" forever).
     *
     * Only `running` tasks that declared a `heartbeatMs` are candidates; anything
     * else is left alone. Idempotent: a swept task is terminal, so the next call
     * has nothing to do. Returns how many tasks were swept.
     */
    const sweep = (at = now()) => {
        const timestamp = typeof at === 'number' && Number.isFinite(at) ? at : now()
        const stale = []
        for (const task of tasks.values()) {
            if (task.state !== 'running') continue
            if (!(task.heartbeatMs > 0)) continue
            const silentFor = timestamp - task.lastHeartbeatAt
            if (silentFor <= task.heartbeatMs * STALE_HEARTBEAT_MULTIPLIER) continue
            task.state = 'failed'
            task.error = `stale: no heartbeat for ${silentFor}ms`
            task.updatedAt = timestamp
            task.finishedAt = timestamp
            stale.push(task)
        }
        for (const task of stale) emit({ type: 'finished', task: snapshot(task) })
        return stale.length
    }

    /**
     * Fail every running task owned by one renderer.
     *
     * A reload destroys the webContents that ran the plugin, so the work is
     * gone; keeping the task "running" forever would be a lie. Finished tasks
     * are retained, which is the part that is still useful after a refresh.
     */
    const failOwner = (owner, reason = 'the window that owned this task was closed') => {
        if (owner === undefined || owner === null) return []
        const at = now()
        const failed = []
        for (const task of tasks.values()) {
            if (task.owner !== owner || TERMINAL_STATES.has(task.state)) continue
            task.state = 'failed'
            task.error = reason
            task.updatedAt = at
            task.finishedAt = at
            task.lastHeartbeatAt = at
            const value = snapshot(task)
            failed.push(value)
            emit({ type: 'finished', task: value })
        }
        return failed
    }

    const dispose = () => {
        tasks.clear()
    }

    return {
        start,
        report,
        logsSince,
        list,
        get,
        touch,
        remove,
        finish,
        cancel,
        failOwner,
        sweep,
        dispose,
        get size() {
            return tasks.size
        },
    }
}