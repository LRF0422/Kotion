/**
 * Types for tasks.mjs (plain JS so `tasks.test.mjs` and the Electron smoke test
 * can import it directly).
 *
 * Shapes mirror `packages/common/src/core/desktop/tasks.ts`; they are declared
 * structurally here for the same reason the other capability modules do it
 * (Electron-free main-process modules keep their contract next to them).
 */

export interface TaskProgress {
    percent?: number
    current?: number
    total?: number
    message?: string
}

export interface TaskLogEntry {
    seq: number
    level: 'info' | 'warn' | 'error'
    message: string
    at: number
}

export interface TaskSnapshot {
    id: string
    sessionId: string
    kind: string
    title: string
    root?: string
    state: 'running' | 'cancelling' | 'succeeded' | 'failed' | 'cancelled'
    progress: TaskProgress
    createdAt: number
    updatedAt: number
    finishedAt?: number
    error?: string
    /** Structured JSON result, only on a finished task (≤ 16KB serialized). */
    result?: unknown
    /** Liveness contract declared at `start` (1000–600000 ms), when any. */
    heartbeatMs?: number
    /** Last liveness timestamp (`start`, `report`, `touch` or a state change). */
    lastHeartbeatAt?: number
    seq: number
    total: number
}

export interface TaskEvent {
    type: 'started' | 'progress' | 'log' | 'finished' | 'cancel-request'
    task: TaskSnapshot
    lines?: TaskLogEntry[]
}

export interface TaskStartOptions {
    id?: string
    kind?: string
    title: string
    root?: string
    progress?: TaskProgress
    /** Optional liveness contract (1000–600000 ms). */
    heartbeatMs?: number
    /** webContents id that owns the work; the handler injects it. */
    owner?: number
}

export interface TaskLogsSincePage {
    taskId: string
    sessionId: string | null
    entries: TaskLogEntry[]
    nextSeq: number
    dropped: number
    total: number
}

export interface TaskLookupOptions {
    taskId?: string
}

export interface TaskRemoveResult {
    taskId: string
    removed: boolean
}

export interface TaskReportResult {
    task: TaskSnapshot
    added: number
}

export interface TaskCancelResult {
    taskId: string
    sessionId: string
    state: TaskSnapshot['state']
    cancelRequested: boolean
}

export interface TaskRegistry {
    start(options: TaskStartOptions): TaskSnapshot
    report(options: { taskId?: string; progress?: TaskProgress; logs?: Array<string | { level?: string; message: string }> }): TaskReportResult
    logsSince(options: { taskId?: string; sinceSeq?: number; limit?: number }): TaskLogsSincePage
    list(options?: { state?: string; kind?: string; root?: string; limit?: number }): TaskSnapshot[]
    get(options: TaskLookupOptions): TaskSnapshot | null
    touch(options: TaskLookupOptions): TaskSnapshot
    remove(options: TaskLookupOptions): TaskRemoveResult
    finish(options: {
        taskId?: string
        state?: string
        message?: string
        error?: string
        result?: unknown
    }): TaskSnapshot
    cancel(options: { taskId?: string }): TaskCancelResult
    failOwner(owner: number, reason?: string): TaskSnapshot[]
    /** Fail heartbeat tasks silent for > 3 intervals; returns how many. */
    sweep(at?: number): number
    dispose(): void
    readonly size: number
}

export const MAX_TASKS: number
export const MAX_TASK_LOG_ENTRIES: number
export const TASK_LOG_DEDUPE_WINDOW_MS: number
export const MAX_TASK_LOGS_PER_REPORT: number
export const DEFAULT_TASK_LIST_LIMIT: number
export const MAX_TASK_LIST_LIMIT: number
export const DEFAULT_TASK_LOGS_LIMIT: number
export const MAX_TASK_LOGS_LIMIT: number
export const MAX_TASK_RESULT_BYTES: number
export const MIN_TASK_HEARTBEAT_MS: number
export const MAX_TASK_HEARTBEAT_MS: number
export const STALE_HEARTBEAT_MULTIPLIER: number

export function createTaskRegistry(options?: {
    now?: () => number
    onEvent?: (event: TaskEvent) => void
}): TaskRegistry