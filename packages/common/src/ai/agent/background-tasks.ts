/**
 * Background tasks — long tool calls that outlive the tool call itself.
 *
 * ## Why this exists
 *
 * A frontend tool call is a *synchronous* contract with the backend: the run
 * parks in WAITING_TOOLS until the client posts a result, and the server's tool
 * timeout is 600s. That is the right shape for an editor edit (which is
 * immediate) and the wrong shape for `pnpm install`、一次完整构建、一次发布。
 * Holding the run — and the document write lease — for minutes is how one slow
 * tool turns a whole conversation into a spinner.
 *
 * So a long tool may declare `background: true`. It then returns *immediately*
 * with a handle (`{ background: true, taskId }`) while the work keeps running
 * here. The agent decides what happens next:
 *
 *   - `getBackgroundTask({ taskId, wait: true })` parks on it and gets the real
 *     result — an ordinary blocking call, but one the model chose to make;
 *   - do something else first and poll later;
 *   - never look at it again (it still settles, and a settled task the agent has
 *     not seen is *delivered to it once*, see below).
 *
 * ## Lifecycle and the two delivery paths
 *
 * A task is `running` → `succeeded` | `failed` | `cancelled`. When it reaches a
 * terminal state it becomes "undelivered": nobody has shown the agent the
 * result yet. Exactly one of these consumes it:
 *
 *   1. the agent waits/polls and reads a terminal task (`wait`, `get`) — it has
 *      the answer, so nothing needs to interrupt it;
 *   2. the host injects a completion note into the conversation and calls
 *      {@link BackgroundTaskRegistry.takeUndelivered} — used when the run that
 *      started the task went idle without waiting.
 *
 * `deliveredAt` is what makes that "exactly once": a peek at a *running* task
 * does not consume it, and a consumed one is never announced twice.
 *
 * ## What is deliberately NOT promised
 *
 * - **Cancellation is a detach, not a kill.** The underlying host work
 *   (`dev.build`, an npm install) exposes no abort handle, and a promise cannot
 *   be un-run. `cancel` marks the entry cancelled (waiters unblock, a late
 *   resolution is discarded) and calls the tool's `onCancel` if it has one.
 * - **The registry is per JS context and in-memory.** A page reload drops the
 *   entries; the host's own session state (e.g. `dev.status` / build logs) is
 *   what recovers the truth after a reload.
 */

/** Terminal states are `succeeded` / `failed` / `cancelled`. */
export type BackgroundTaskStatus = 'running' | 'succeeded' | 'failed' | 'cancelled'

/**
 * Type-only: the artifact contract the kernel already owns. A background task
 * carries an artifact the same way a tool result does (see
 * {@link StartBackgroundTaskOptions.artifact}).
 */
import type { AgentArtifact } from '../plugin-agent/types'

/** Same identity the artifacts shelf uses: one slot per (kind, id). */
const artifactKey = (artifact: AgentArtifact): string => `${artifact.kind}:${artifact.id}`

/** A task as seen from outside (UI, tools, notifications). */
export interface BackgroundTaskView {
    id: string
    /** Tool that started it, e.g. `buildPluginProject`. */
    tool: string
    /** Short human label, e.g. `构建 my-plugin`. */
    title: string
    status: BackgroundTaskStatus
    startedAt: number
    finishedAt?: number
    /** Last progress note the tool reported, if any. */
    progress?: string
    result?: unknown
    error?: string
    /** Conversation that owns the task: notifications never cross sessions. */
    conversationId?: string | null
    /** Delegated sub-run id, or null for the main agent. */
    owner?: string | null
    /** Set when the agent has been shown the terminal result (see module docs). */
    deliveredAt?: number
    /** The caller stopped waiting. The host work itself is not interruptible. */
    cancelRequested?: boolean
    /**
     * What this task produces, as the kernel's artifact (产物) — the working
     * target the artifacts shelf / side pane / conversation card bind to.
     *
     * Present from `start` (usually a placeholder: "this project is being
     * built") and recomputed when the task settles, so a background build is a
     * first-class artifact for its whole lifetime rather than existing only from
     * the moment its tool result came back.
     */
    artifact?: AgentArtifact
    meta?: Record<string, unknown>
}

/** Progress/cancel handle handed to the work function. */
export interface BackgroundTaskHandle {
    readonly id: string
    /** Record a one-line progress note (shown in listings and the UI). */
    progress(text: string): void
    /** True once someone asked to stop waiting for this task. */
    readonly cancelled: boolean
}

export interface StartBackgroundTaskOptions {
    tool: string
    title: string
    conversationId?: string | null
    owner?: string | null
    meta?: Record<string, unknown>
    /**
     * Best-effort stop for tools that CAN stop (e.g. stop a watcher). Called on
     * `cancel`; the run function itself keeps its own promise either way.
     */
    onCancel?: () => void
    /**
     * Map the task's lifecycle to the artifact it produces (see
     * {@link BackgroundTaskView.artifact}). Called once at start with
     * `status: 'running'` so the target exists while the work is still going, and
     * again on settle.
     *
     * `null` contributes nothing for that state. A tool whose artifact IS the
     * point of the task should return a placeholder for `running` and something
     * for EVERY terminal outcome (failure and cancel included): an artifact that
     * just disappears leaves the placeholder from the call itself behind, saying
     * "still building" forever.
     */
    artifact?: (state: BackgroundTaskArtifactState) => AgentArtifact | null
    run: (handle: BackgroundTaskHandle) => Promise<unknown>
}

export type BackgroundTaskEvent =
    | { type: 'started'; task: BackgroundTaskView }
    | { type: 'progress'; task: BackgroundTaskView }
    | { type: 'settled'; task: BackgroundTaskView }

export type BackgroundTaskListener = (event: BackgroundTaskEvent) => void

/**
 * Lifecycle snapshot a tool's artifact mapper is called with — once at start
 * (`running`) and once when the task reaches a terminal state.
 */
export interface BackgroundTaskArtifactState {
    status: BackgroundTaskStatus
    /** The work's return value, once it succeeded. */
    result?: unknown
    error?: string
    startedAt: number
    finishedAt?: number
}

/** Default/maximum wait for `getBackgroundTask({ wait: true })`, in ms. */
export const DEFAULT_BACKGROUND_WAIT_MS = 60_000
export const MAX_BACKGROUND_WAIT_MS = 300_000

/** Terminal task entries kept in memory (oldest terminal entries are dropped). */
const MAX_TASKS = 100

/** What a `background: true` call hands back to the model immediately. */
export interface BackgroundTaskAck {
    background: true
    taskId: string
    tool: string
    title: string
    status: 'running'
    startedAt: number
    hint: string
}

const clampWait = (timeoutMs?: number): number => {
    const raw = typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_BACKGROUND_WAIT_MS
    return Math.max(0, Math.min(MAX_BACKGROUND_WAIT_MS, Math.floor(raw)))
}

const isTerminal = (status: BackgroundTaskStatus): boolean => status !== 'running'

/** Deep-ish copy so callers cannot mutate registry state through a view. */
const snapshot = (task: BackgroundTaskView): BackgroundTaskView => ({ ...task })

/**
 * Clip a value for a *text* channel (the notification note). The full result
 * stays available through `getBackgroundTask`, which is why a completion note
 * may say "已截断" without losing anything.
 */
export const clipForNote = (value: unknown, maxChars = 2_000): string => {
    let text: string
    if (typeof value === 'string') {
        text = value
    } else {
        try {
            text = JSON.stringify(value)
        } catch {
            text = String(value)
        }
    }
    text = text ?? ''
    return text.length > maxChars ? text.slice(0, maxChars) + `…（已截断，完整内容用 getBackgroundTask 取）` : text
}

const formatDuration = (task: BackgroundTaskView): string => {
    if (!task.finishedAt) return ''
    const ms = task.finishedAt - task.startedAt
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

export class BackgroundTaskRegistry {
    private readonly tasks = new Map<string, BackgroundTaskView>()
    /** Best-effort stop hooks, kept out of the view the UI sees. */
    private readonly cancelHooks = new Map<string, () => void>()
    /** Per-task artifact mappers (see StartBackgroundTaskOptions.artifact). */
    private readonly artifactMappers =
        new Map<string, (state: BackgroundTaskArtifactState) => AgentArtifact | null>()
    private readonly listeners = new Set<BackgroundTaskListener>()
    private counter = 0
    /** Bumped on every state change: the stable snapshot for useSyncExternalStore. */
    private version = 0
    /** `list` results cached per filter until the version moves (see listSnapshot). */
    private readonly listCache = new Map<string, { version: number; views: BackgroundTaskView[] }>()

    /** Start a task and return its view immediately. Never throws. */
    start(options: StartBackgroundTaskOptions): BackgroundTaskView {
        const id = `bg-${++this.counter}`
        const startedAt = Date.now()
        const task: BackgroundTaskView = {
            id,
            tool: options.tool,
            title: options.title,
            status: 'running',
            startedAt,
            conversationId: options.conversationId ?? null,
            owner: options.owner ?? null,
            ...(options.meta ? { meta: options.meta } : {}),
        }
        if (typeof options.artifact === 'function') {
            this.artifactMappers.set(id, options.artifact)
            // The placeholder exists before any work happens: the shelf/pane can
            // point at "the thing being built" from the moment it was asked for.
            const artifact = this.safeArtifact(options.artifact, { status: 'running', startedAt })
            if (artifact) task.artifact = artifact
        }
        this.tasks.set(id, task)
        if (typeof options.onCancel === 'function') this.cancelHooks.set(id, options.onCancel)
        this.trim()
        this.emit({ type: 'started', task: snapshot(task) })

        // Captured through an arrow so the getter reads the REGISTRY's state, not
        // the handle literal's own (empty) shape.
        const wasCancelled = () => this.tasks.get(id)?.cancelRequested === true
        const handle: BackgroundTaskHandle = {
            id,
            progress: (text: string) => {
                const current = this.tasks.get(id)
                if (!current || isTerminal(current.status) || typeof text !== 'string') return
                current.progress = text
                this.emit({ type: 'progress', task: snapshot(current) })
            },
            get cancelled() {
                return wasCancelled()
            },
        }

        // Detached on purpose: the tool call is already answered. A rejection has
        // to be absorbed here or it becomes an unhandled rejection.
        void (async () => {
            try {
                const result = await options.run(handle)
                this.settle(id, { status: 'succeeded', result })
            } catch (error: any) {
                this.settle(id, { status: 'failed', error: error?.message ?? String(error) })
            }
        })()

        return snapshot(task)
    }

    get(id: string): BackgroundTaskView | undefined {
        const task = this.tasks.get(id)
        return task ? snapshot(task) : undefined
    }

    list(filter?: { conversationId?: string | null; owner?: string | null; activeOnly?: boolean }): BackgroundTaskView[] {
        const all = Array.from(this.tasks.values())
        return all
            .filter(task => {
                if (filter?.activeOnly && task.status !== 'running') return false
                // `undefined` means "any conversation"; `null` matches unowned ones.
                if (filter?.conversationId !== undefined && (task.conversationId ?? null) !== filter.conversationId) {
                    return false
                }
                if (filter?.owner !== undefined && (task.owner ?? null) !== filter.owner) return false
                return true
            })
            .map(snapshot)
    }

    /**
     * {@link list} with a stable identity until the registry changes.
     *
     * This is the `getSnapshot` half of `useSyncExternalStore`: React compares
     * snapshots by reference, so a fresh array on every call would re-render
     * forever.
     */
    listSnapshot(filter?: {
        conversationId?: string | null
        owner?: string | null
        activeOnly?: boolean
    }): BackgroundTaskView[] {
        const key = [
            filter?.conversationId === undefined ? '*' : String(filter.conversationId),
            filter?.owner === undefined ? '*' : String(filter.owner),
            filter?.activeOnly ? 'active' : 'all',
        ].join('|')
        const cached = this.listCache.get(key)
        if (cached && cached.version === this.version) return cached.views
        const views = this.list(filter)
        this.listCache.set(key, { version: this.version, views })
        return views
    }

    /**
     * Park until the task is terminal or the timeout expires.
     *
     * A terminal answer marks the task delivered: the caller now HAS the result,
     * so the completion note must not also interrupt the conversation. A timed-out
     * wait leaves the task undelivered (the agent still has not seen it).
     */
    async wait(
        id: string,
        timeoutMs?: number
    ): Promise<{ task: BackgroundTaskView | undefined; timedOut: boolean }> {
        const current = this.tasks.get(id)
        if (!current) return { task: undefined, timedOut: false }
        if (isTerminal(current.status)) {
            this.markDelivered(current)
            return { task: snapshot(current), timedOut: false }
        }

        const budget = clampWait(timeoutMs)
        const settled = await new Promise<boolean>(resolve => {
            let done = false
            const finish = (value: boolean) => {
                if (done) return
                done = true
                this.off(listener)
                if (timer) clearTimeout(timer)
                resolve(value)
            }
            const listener: BackgroundTaskListener = event => {
                if (event.task.id !== id) return
                if (isTerminal(event.task.status)) finish(true)
            }
            const timer = budget > 0
                ? setTimeout(() => finish(false), budget)
                : null
            this.on(listener)
            // Re-check: the task may have settled between the read above and the
            // subscription (single-threaded, but the await boundary is real).
            const latest = this.tasks.get(id)
            if (!latest || isTerminal(latest.status)) finish(true)
            if (budget === 0) finish(false)
        })

        const task = this.tasks.get(id)
        if (!task) return { task: undefined, timedOut: false }
        if (isTerminal(task.status)) {
            this.markDelivered(task)
            return { task: snapshot(task), timedOut: false }
        }
        return { task: snapshot(task), timedOut: !settled }
    }

    /**
     * Stop waiting. Returns false for unknown/terminal tasks. The work itself is
     * not interruptible (see module docs); a late result is discarded.
     */
    cancel(id: string, onCancel?: () => void): boolean {
        const task = this.tasks.get(id)
        if (!task || isTerminal(task.status)) return false
        task.cancelRequested = true
        // The caller's per-call hook wins; otherwise the one the task was started
        // with (the studio passes none: a build cannot be interrupted).
        const hook = onCancel ?? this.cancelHooks.get(id)
        let rejected = false
        try {
            hook?.()
        } catch {
            rejected = true
        }
        this.settle(id, {
            status: 'cancelled',
            error: rejected ? '任务已取消（停止时宿主返回了错误）' : '任务已取消：不再等待它，后台动作可能仍在进行',
        })
        return true
    }

    /**
     * Artifacts the background tasks of this conversation represent, newest
     * first and deduped by `kind:id` (the same identity the shelf uses, so a
     * build that is re-run updates one slot).
     *
     * This is what makes a background build a real artifact: the transcript only
     * ever holds the tool call's *acknowledgement*, while the build result —
     * bytes, modules, whether the dev version is installed — lands on the task.
     * The shelf merges these over the transcript-derived ones.
     */
    artifacts(conversationId?: string | null): AgentArtifact[] {
        const byKey = new Map<string, AgentArtifact>()
        for (const task of this.tasks.values()) {
            if (!task.artifact) continue
            if (conversationId !== undefined && (task.conversationId ?? null) !== conversationId) continue
            // Later tasks win: the map is in start order, so this keeps the
            // newest state for a project that was built more than once.
            byKey.set(artifactKey(task.artifact), task.artifact)
        }
        return Array.from(byKey.values()).reverse()
    }

    /**
     * Subscribe to any task change. `useSyncExternalStore`-shaped: pair
     * {@link getVersion} with it and the component re-renders only when
     * something actually changed.
     */
    subscribe(listener: () => void): () => void {
        return this.on(() => listener())
    }

    /** Monotonic state version; stable between changes (see {@link subscribe}). */
    getVersion(): number {
        return this.version
    }

    /** Terminal tasks whose result the agent has not been shown yet. */
    undelivered(conversationId?: string | null): BackgroundTaskView[] {
        return Array.from(this.tasks.values())
            .filter(task => {
                if (task.status === 'running' || task.deliveredAt !== undefined) return false
                if (conversationId !== undefined && (task.conversationId ?? null) !== conversationId) return false
                return true
            })
            .map(snapshot)
    }

    /**
     * Claim the undelivered terminal tasks of a conversation. The caller commits
     * to showing them to the agent; they will not be offered again.
     */
    takeUndelivered(conversationId?: string | null): BackgroundTaskView[] {
        const claimed = this.undelivered(conversationId)
        claimed.forEach(task => {
            const live = this.tasks.get(task.id)
            if (live && live.deliveredAt === undefined) live.deliveredAt = Date.now()
        })
        return claimed
    }

    on(listener: BackgroundTaskListener): () => void {
        this.listeners.add(listener)
        return () => this.off(listener)
    }

    off(listener: BackgroundTaskListener): void {
        this.listeners.delete(listener)
    }

    /** The immediate answer a `background: true` tool returns to the model. */
    ack(task: BackgroundTaskView | string): BackgroundTaskAck {
        const view = typeof task === 'string' ? this.get(task) : task
        const id = typeof task === 'string' ? task : task.id
        const tool = view?.tool ?? 'unknown'
        const title = view?.title ?? ''
        return {
            background: true,
            taskId: id,
            tool,
            title,
            status: 'running',
            startedAt: view?.startedAt ?? Date.now(),
            hint:
                `已在后台执行（taskId ${id}）。要继续等它跑完，调用 `
                + `getBackgroundTask({ taskId: "${id}", wait: true })（可带 timeoutMs，默认 60s）；`
                + `也可以先做别的事，稍后用 listBackgroundTasks / getBackgroundTask 查。`
                + `任务完成时若你没有在等它，系统会把结果作为一条通知推进对话。`,
        }
    }

    /** The completion note injected into the conversation (one or many tasks). */
    describe(tasks: BackgroundTaskView[]): string {
        return tasks.map(task => {
            const head = `【后台任务${task.status === 'succeeded' ? '完成' : task.status === 'cancelled' ? '已取消' : '失败'}】`
                + `${task.tool}「${task.title}」(taskId ${task.id})`
                + (task.finishedAt ? `，耗时 ${formatDuration(task)}` : '')
            if (task.status === 'succeeded') {
                return `${head}\n结果：${clipForNote(task.result)}`
            }
            return `${head}\n原因：${task.error ?? '未说明'}`
        }).join('\n\n')
    }

    /** Test/reset hook. */
    reset(): void {
        this.tasks.clear()
        this.cancelHooks.clear()
        this.artifactMappers.clear()
        this.listeners.clear()
        this.listCache.clear()
        this.counter = 0
        // A new version, so a mounted subscriber re-reads the (now empty) board.
        this.version += 1
    }

    private markDelivered(task: BackgroundTaskView): void {
        const live = this.tasks.get(task.id)
        if (live && live.deliveredAt === undefined) live.deliveredAt = Date.now()
    }

    private settle(
        id: string,
        outcome: { status: BackgroundTaskStatus; result?: unknown; error?: string }
    ): void {
        const task = this.tasks.get(id)
        if (!task || isTerminal(task.status)) return
        task.status = outcome.status
        task.finishedAt = Date.now()
        if (outcome.result !== undefined) task.result = outcome.result
        if (outcome.error !== undefined) task.error = outcome.error
        if (task.cancelRequested && outcome.status === 'succeeded') {
            // The work finished after the caller detached: keep the result for the
            // record, but do not resurrect the task as a fresh success.
            task.status = 'cancelled'
            task.error = '任务已取消：后台动作在取消后仍完成了，结果不入队'
        }
        this.cancelHooks.delete(id)
        // The artifact moves from "being built" to its real outcome here: bytes,
        // modules, whether the dev version got installed — everything the shelf
        // and the pane show for THIS build.
        const mapper = this.artifactMappers.get(id)
        if (mapper) {
            const artifact = this.safeArtifact(mapper, {
                status: task.status,
                result: task.result,
                error: task.error,
                startedAt: task.startedAt,
                finishedAt: task.finishedAt,
            })
            if (artifact) task.artifact = artifact
        }
        this.artifactMappers.delete(id)
        this.emit({ type: 'settled', task: snapshot(task) })
        // Terminal entries are what the map budget is about: a burst of starts all
        // in flight at once cannot be trimmed at start time (nothing has settled
        // yet), so the sweep also runs as each one lands.
        this.trim()
    }

    /**
     * A tool's artifact mapper must never be able to break the task board: a
     * throwing mapper is a missing artifact, not a failed build.
     */
    private safeArtifact(
        mapper: (state: BackgroundTaskArtifactState) => AgentArtifact | null,
        state: BackgroundTaskArtifactState,
    ): AgentArtifact | null {
        try {
            const artifact = mapper(state)
            return artifact && typeof artifact.kind === 'string' && typeof artifact.id === 'string'
                ? artifact
                : null
        } catch (error: any) {
            console.warn('[background-tasks] artifact mapper failed:', error?.message ?? error)
            return null
        }
    }

    private emit(event: BackgroundTaskEvent): void {
        this.version += 1
        for (const listener of Array.from(this.listeners)) {
            try {
                listener(event)
            } catch (error: any) {
                console.warn('[background-tasks] listener failed:', error?.message ?? error)
            }
        }
    }

    /**
     * Drop the oldest terminal entries once the map is over budget.
     *
     * Undelivered terminal entries are evicted LAST: they are the pending
     * completion notes, and losing one means the agent is never told its build
     * finished. Under real pressure (more than {@link MAX_TASKS} unsettled
     * completions) they do go — a bounded board beats an unbounded one.
     */
    private trim(): void {
        if (this.tasks.size <= MAX_TASKS) return
        const terminal = Array.from(this.tasks.values())
            .filter(task => isTerminal(task.status))
            .sort((a, b) => {
                const aPending = a.deliveredAt === undefined ? 1 : 0
                const bPending = b.deliveredAt === undefined ? 1 : 0
                if (aPending !== bPending) return aPending - bPending
                return (a.finishedAt ?? a.startedAt) - (b.finishedAt ?? b.startedAt)
            })
        for (const task of terminal) {
            if (this.tasks.size <= MAX_TASKS) break
            this.tasks.delete(task.id)
            this.cancelHooks.delete(task.id)
            this.artifactMappers.delete(task.id)
        }
        this.listCache.clear()
    }
}

/** Process-wide registry: one window, one task board. */
export const backgroundTasks = new BackgroundTaskRegistry()

/**
 * Hand this conversation its finished-but-unannounced tasks.
 *
 * The one rule that needs to live outside React (and therefore be testable): a
 * completion may only be delivered when the conversation is at rest — mid-turn
 * there is no channel to inject into, and a turn started from a terminal phase
 * would be aborted by the host's own reset in that same commit. If the run is
 * busy the note stays in the registry, still undelivered, for the next attempt.
 *
 * Returns true when it delivered something.
 */
export function flushBackgroundTaskNotes(options: {
    conversationId?: string | null
    /** Read live: a run may have started since the last render. */
    isBusy: () => boolean
    onNotify: (tasks: BackgroundTaskView[], note: string) => void
}): boolean {
    const conversationId = options.conversationId
    if (!conversationId) return false
    if (options.isBusy()) return false
    const settled = backgroundTasks.takeUndelivered(conversationId)
    if (settled.length === 0) return false
    options.onNotify(settled, backgroundTasks.describe(settled))
    return true
}

/**
 * The seam a plugin tool uses to background its work.
 *
 * Plugin tool modules are deliberately dependency-free at runtime (they take
 * their services by injection), so they cannot import this module — they take a
 * `BackgroundToolRunner` instead, and the plugin's entry point passes
 * {@link backgroundToolRunner}.
 */
export interface BackgroundToolStartRequest {
    tool: string
    title: string
    conversationId?: string | null
    owner?: string | null
    meta?: Record<string, unknown>
    onCancel?: () => void
    run: (handle: { progress(text: string): void; readonly cancelled: boolean }) => Promise<unknown>
}

export interface BackgroundToolRunner {
    /** Start and return the immediate ack payload for the tool result. */
    start(request: BackgroundToolStartRequest): BackgroundTaskAck
}

export const backgroundToolRunner: BackgroundToolRunner = {
    start: request => backgroundTasks.ack(backgroundTasks.start(request)),
}
