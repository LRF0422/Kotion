/* ------------------------------------------------------------------ *
 * task — generic long-task state for plugins
 *
 * A plugin that runs something slow (a sync, a transcode, a batch job, an
 * install) needs three things the renderer cannot give it on its own:
 *
 *   1. a state that survives a page refresh (the plugin module is gone after a
 *      reload, but the user still wants to see what happened);
 *   2. an incremental log the UI can tail without re-reading the whole tail
 *      (the `seq` / `cursor` shape — same contract as `dev.logsSince`);
 *   3. a cancellation channel the host can carry to the plugin's `AbortSignal`.
 *
 * `task.*` is that generic primitive. It is deliberately protocol-agnostic: the
 * host stores `{ title, kind, progress, logs }` and never interprets them. The
 * plugin still owns the work; `dev.logs` keeps owning build logs.
 *
 * Non-goals: durability across app restarts (a task dies with the app run),
 * scheduling (that is `background.*`), and network/fs policy (the task itself
 * does the work, so it needs its own capabilities for that).
 * ------------------------------------------------------------------ */

/** Where a long task is in its lifecycle. */
export type DesktopTaskState = 'running' | 'cancelling' | 'succeeded' | 'failed' | 'cancelled'

/** Log severity, same vocabulary as the dev-server logs. */
export type DesktopTaskLogLevel = 'info' | 'warn' | 'error'

/**
 * Progress of a long task.
 *
 * Every field is optional and merges into the previous value, so a plugin can
 * report `{ percent }` in one call and `{ message }` in the next. `percent` is
 * clamped to 0–100; `current`/`total` are for step counters (the host does not
 * derive a percentage from them — the plugin decides what progress means).
 */
export interface DesktopTaskProgress {
    percent?: number
    current?: number
    total?: number
    /** Short human-readable status ("fetching page 3/12"). Host never parses it. */
    message?: string
}

/** One retained log line of a task. */
export interface DesktopTaskLogEntry {
    /** Monotonic per-task sequence (starts at 1); the polling cursor. */
    seq: number
    level: DesktopTaskLogLevel
    message: string
    /** Host timestamp (ms) — supplied by the host so ordering is trustworthy. */
    at: number
}

/**
 * Public snapshot of a task. `logs` are NOT included: read them incrementally
 * with {@link TaskBridge.logsSince}. `snapshot` is what list/report/finish return
 * and what events carry.
 */
export interface DesktopTaskSnapshot {
    id: string
    /**
     * Random id of this run. Re-using a caller `id` (e.g. one task per project)
     * creates a new `sessionId`, which is how a consumer tells "same task,
     * new run" from "same run, more progress".
     */
    sessionId: string
    /** Plugin-defined category ("sync", "transcode", "install", …). */
    kind: string
    title: string
    /** Project root this task belongs to, when it has one (monitor association). */
    root?: string
    state: DesktopTaskState
    progress: DesktopTaskProgress
    createdAt: number
    updatedAt: number
    /** Set once the task reached a terminal state. */
    finishedAt?: number
    /** Failure text for `state: 'failed'`. */
    error?: string
    /** Seq of the last retained log line (0 when none). */
    seq: number
    /** Lines currently retained in the ring (≤ 1000). */
    total: number
    /**
     * Structured JSON result a finished task produced (e.g. the created artifact
     * id, imported row count). Absent for running tasks and for plugins that
     * only report a message. Serialized size is capped by the host (16KB).
     */
    result?: unknown
    /**
     * Heartbeat interval the caller declared at `start` (ms), when any. A task
     * with a heartbeat is marked `failed` by the host after 3 missed beats, so a
     * crashed plugin cannot leave a task "running" forever.
     */
    heartbeatMs?: number
    /** Host timestamp (ms) of the last heartbeat, `report` or state change. */
    lastHeartbeatAt?: number
}

export interface DesktopTaskStartOptions {
    /**
     * Stable caller key (letters, digits, `. _ : -`; ≤ 120 chars). Omit for a
     * random id. Re-using an id whose task already finished starts a new run
     * (new `sessionId`); re-using a running one is refused.
     */
    id?: string
    /** Category shown by task lists; defaults to `plugin`. */
    kind?: string
    /** Human-readable one-line title (≤ 200 chars). */
    title: string
    /** Optional project root, for callers that correlate tasks with a project. */
    root?: string
    /** Initial progress (usually omitted; report it as work starts). */
    progress?: DesktopTaskProgress
    /**
     * Optional liveness contract (1000–600000 ms). The SDK sets 30s for
     * `startLongTask`; the host fails the task after 3 missed beats
     * (`error: 'stale: …'`) so a crashed plugin cannot leave it running forever.
     */
    heartbeatMs?: number
}

/** One batch of log lines to submit with {@link TaskBridge.report}. */
export type DesktopTaskLogInput = string | { level?: DesktopTaskLogLevel; message: string }

export interface DesktopTaskReportOptions {
    taskId: string
    /** Merged into the snapshot's progress (never replaces absent fields). */
    progress?: DesktopTaskProgress
    /** Up to 200 lines per call; consecutive duplicates within 1s are dropped. */
    logs?: DesktopTaskLogInput[]
}

export interface DesktopTaskReportResult {
    task: DesktopTaskSnapshot
    /** How many lines were actually retained (duplicates/overflow excluded). */
    added: number
}

export interface DesktopTaskLogsSinceOptions {
    taskId: string
    /** Return entries with `seq > sinceSeq`. Omit (or 0) for "from the oldest retained". */
    sinceSeq?: number
    /** Max entries to return; the newest win. Defaults to 200, host caps at 1000. */
    limit?: number
}

/** One page of a task's incremental log; same shape as `dev.logsSince`. */
export interface DesktopTaskLogsPage {
    taskId: string
    /** Null when no task with that id exists (an empty page, not an error). */
    sessionId: string | null
    /** Entries with `seq > sinceSeq`, ascending, at most `limit`. */
    entries: DesktopTaskLogEntry[]
    /** Cursor for the next call. */
    nextSeq: number
    /** Lines the caller can no longer see (ring eviction + `limit` truncation). */
    dropped: number
    /** Lines currently retained in the ring. */
    total: number
}

export interface DesktopTaskFinishOptions {
    taskId: string
    /** Terminal state; defaults to `succeeded`. Other states are refused. */
    state?: 'succeeded' | 'failed' | 'cancelled'
    /** Final progress message (kept in `progress.message`). */
    message?: string
    /** Failure text; `state: 'failed'` falls back to the message. */
    error?: string
    /**
     * Structured JSON result, kept on the snapshot so a late reader (task board,
     * agent tool, monitor) can consume it without re-running the work. Must be
     * JSON-serializable; the host rejects results over 16KB serialized.
     */
    result?: unknown
}

export interface DesktopTaskCancelOptions {
    taskId: string
}

/** Read one task by id (null when unknown or already evicted). */
export interface DesktopTaskGetOptions {
    taskId: string
}

/** Refresh a task's liveness clock (used by heartbeat-enabled tasks). */
export interface DesktopTaskTouchOptions {
    taskId: string
}

/** Forget one finished task (running tasks must be cancelled/finished first). */
export interface DesktopTaskRemoveOptions {
    taskId: string
}

export interface DesktopTaskRemoveResult {
    taskId: string
    removed: boolean
}

export interface DesktopTaskCancelResult {
    taskId: string
    sessionId: string
    state: DesktopTaskState
    /** True when the task is (or was already) asked to stop. */
    cancelRequested: boolean
}

export interface DesktopTaskListOptions {
    /** Filter by state (e.g. only `running`). */
    state?: DesktopTaskState
    /** Filter by exact `kind`. */
    kind?: string
    /** Filter by exact `root`. */
    root?: string
    /** Max rows (newest updated first). Defaults to 100, host caps at 500. */
    limit?: number
}

/** Event broadcast by the host on `desktop:event:task`. */
export interface DesktopTaskEvent {
    type: 'started' | 'progress' | 'log' | 'finished' | 'cancel-request'
    task: DesktopTaskSnapshot
    /** Set on `log` events: the lines that were just retained. */
    lines?: DesktopTaskLogEntry[]
}

/**
 * Typed bridge for the `task.*` capability group (`desktop.tasks`).
 *
 * Present only on desktop builds that expose the capabilities; feature-detect
 * with `desktop?.tasks`. Plugins should prefer the `runLongTask` /
 * `startLongTask` helpers from `@kn/common` (they keep working when the bridge
 * is absent), and reach for this interface only for advanced wiring.
 */
export interface TaskBridge {
    /** Register a running task. Returns its snapshot (with `sessionId`). */
    start(options: DesktopTaskStartOptions): Promise<DesktopTaskSnapshot>
    /** Merge progress and/or append log lines. */
    report(options: DesktopTaskReportOptions): Promise<DesktopTaskReportResult>
    /** Incremental log read by `seq`. */
    logsSince(options: DesktopTaskLogsSinceOptions): Promise<DesktopTaskLogsPage>
    /** Enumerate tasks, newest `updatedAt` first. */
    list(options?: DesktopTaskListOptions): Promise<DesktopTaskSnapshot[]>
    /** Read one task by id; null when unknown/evicted (a poll, not an error). */
    get(options: DesktopTaskGetOptions): Promise<DesktopTaskSnapshot | null>
    /** Refresh the liveness clock (heartbeat-enabled tasks). */
    touch(options: DesktopTaskTouchOptions): Promise<DesktopTaskSnapshot>
    /** Forget a finished task (running tasks are refused). */
    remove(options: DesktopTaskRemoveOptions): Promise<DesktopTaskRemoveResult>
    /** Move the task to a terminal state (idempotent once terminal). */
    finish(options: DesktopTaskFinishOptions): Promise<DesktopTaskSnapshot>
    /** Ask the owner to stop: state → `cancelling` and a `cancel-request` event. */
    cancel(options: DesktopTaskCancelOptions): Promise<DesktopTaskCancelResult>
    /** Subscribe to `desktop:event:task`; returns an unsubscribe function. */
    onEvent(listener: (event: DesktopTaskEvent) => void): () => void
}