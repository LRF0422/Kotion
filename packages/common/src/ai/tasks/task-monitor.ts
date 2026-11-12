/**
 * Task output monitor — watch one log source's incremental log and turn it
 * into a *small number of events* a surface can show.
 *
 * ## Why this exists
 *
 * A long task (a dev server, a build, a watch process) keeps writing log lines
 * after its tool call returned. The agent must not be woken by every line, and
 * the UI must not re-render on every line either — but "the dev server just
 * threw 12 times in a row" IS worth an interruption. So this engine:
 *
 *   1. pulls only the NEW lines of a {@link MonitorSource} (`TaskMonitorReader`,
 *      host-injected — the desktop host backs `dev` with `dev.logsSince` and
 *      `task` with `task.logsSince`; `monitor-readers.ts` is that adapter),
 *   2. keeps a bounded ring of them (`cadence.maxLines`) for context,
 *   3. matches them against explicit triggers (level / pattern) plus the
 *      externally signalled `settled`,
 *   4. merges hits inside a quiet window (`cadence.minGapMs`) into ONE event,
 *   5. and stops itself on a budget (`maxEvents` / `maxDurationMs`).
 *
 * ## One engine, two log families
 *
 * `{ kind: 'dev', root }` is a project's build/watch log and `{ kind: 'task',
 * taskId }` is a plugin-declared long task's log. Everything downstream —
 * cursor, line ring, rules, event ids, budgets, persistence, React bindings — is
 * source-agnostic: the ONLY thing a host has to provide is a reader that knows
 * how to ask its own API for "lines after seq N".
 *
 * ## What this module deliberately does NOT do
 *
 * - it does not start runs, write transcripts or drive the agent loop: it only
 *   consumes an incremental log and produces events;
 * - it does not know what a "root" or a "task" is beyond the source tag. `start`
 *   is idempotent per {@link monitorSourceKey}, so two surfaces watching the same
 *   log share one cursor instead of double-reading it;
 * - it never throws at the host. Reader failures and corrupt persisted state are
 *   absorbed (worst case: no events, not a broken window).
 *
 * ## React
 *
 * `list` / `events` / `lines` are the `getSnapshot` half of
 * `useSyncExternalStore`: they return the SAME array identity while
 * `getVersion()` is unchanged, so a component renders only when something
 * actually changed. `use-task-monitor.ts` is the thin React wrapper.
 */

import { backgroundTasks } from '../agent/background-tasks'

/** Log severity as the host reports it. */
export type MonitorLogLevel = 'info' | 'warn' | 'error'

/** One line of a monitored log. */
export interface MonitorLogLine {
    /** Monotonic per-source log sequence number; the polling cursor. */
    seq: number
    level: MonitorLogLevel
    message: string
    /** Host timestamp (ms). */
    at: number
}

/** One page of a monitored log. */
export interface MonitorLogPage {
    entries: MonitorLogLine[]
    /** Seq to ask for next time (exclusive cursor). */
    nextSeq: number
    /** How many lines the host dropped before this page, if it had to. */
    dropped: number
}

/**
 * Where monitored log lines come from.
 *
 * - `dev`: a project root's dev-server log (`dev.logsSince({ root, sinceSeq })`
 *   on the desktop host) — the build/watch story;
 * - `task`: one generic long task's log (`task.logsSince({ taskId, sinceSeq })`,
 *   see `core/desktop/tasks.ts`) — the plugin-declared long-task story.
 *
 * The engine treats both identically: pull, ring, rules, events, persistence.
 */
export type MonitorSource =
    | { kind: 'dev'; root: string }
    | { kind: 'task'; taskId: string }

/**
 * The subscription / cursor key for a source: `dev:<root>` or `task:<taskId>`.
 *
 * `start` is idempotent by this key, so two surfaces watching the same log share
 * one cursor (and one line ring) instead of double-reading it.
 */
export const monitorSourceKey = (source: MonitorSource): string =>
    // Trimmed, so the key a host computes by hand is the same one `start` uses
    // (a padded root is the same log, not a second monitor).
    source.kind === 'dev' ? `dev:${source.root.trim()}` : `task:${source.taskId.trim()}`

/** Readable fallback label when the caller passes none. */
const sourceLabel = (source: MonitorSource): string =>
    source.kind === 'dev' ? source.root : source.taskId

const cloneSource = (source: MonitorSource): MonitorSource =>
    source.kind === 'dev' ? { kind: 'dev', root: source.root } : { kind: 'task', taskId: source.taskId }

/**
 * Host-injected reader for one source's incremental log.
 *
 * The host maps `source` onto its own API; `monitor-readers.ts` ships that
 * mapping (`createMonitorReader`) so a host only has to pass the bridges.
 */
export interface TaskMonitorReader {
    read(input: { source: MonitorSource; sinceSeq: number; limit?: number }): Promise<MonitorLogPage>
}

/** Host-injected persistence (a StorageService wrapper); `load` shape is unknown on purpose. */
export interface TaskMonitorStorage {
    load(): Promise<unknown | null>
    save(value: unknown): Promise<void>
}

/**
 * What makes a line worth an event.
 *
 * - `level`: a line at or above this severity (so `warn` also matches `error`);
 * - `pattern`: a regexp tested against the message;
 * - `settled`: not a line at all — fired by {@link TaskMonitorEngine.notifySettled}
 *   when the task itself finishes.
 */
export type MonitorTrigger =
    | { kind: 'level'; level: 'error' | 'warn' }
    | { kind: 'pattern'; pattern: string; ignoreCase?: boolean }
    | { kind: 'settled' }

export interface TaskMonitorCadence {
    /** Pull interval. Default 1000ms, floor 500ms. */
    pollMs: number
    /** Quiet window: hits closer together than this merge into one event. Default 10s. */
    minGapMs: number
    /** Event budget; reaching it expires the monitor. Default 50. */
    maxEvents: number
    /** Lifetime budget from `createdAt`; reaching it expires the monitor. Default 30min. */
    maxDurationMs: number
    /** Log lines kept in memory per monitor (the context window). Default 500. */
    maxLines: number
}

export type TaskMonitorStatus = 'running' | 'stopped' | 'expired'

export interface TaskMonitorSubscription {
    /** `monitorSourceKey(source)` — one subscription per source (idempotent start). */
    id: string
    source: MonitorSource
    label: string
    taskIds: string[]
    triggers: MonitorTrigger[]
    cadence: TaskMonitorCadence
    status: TaskMonitorStatus
    createdAt: number
    /** Why it stopped / expired. */
    note?: string
}

export interface TaskMonitorEvent {
    /**
     * Idempotency key.
     *
     * Line-triggered events use `${monitorId}:${seqFrom}-${seqTo}:${ruleIndex}`;
     * events that have no line range (settled / status / ended) append a
     * per-monitor sequence, so a monitor that is stopped and started again on
     * the same source cannot reuse an id.
     */
    id: string
    monitorId: string
    kind: 'trigger' | 'note' | 'status' | 'ended'
    at: number
    seqFrom: number
    seqTo: number
    /** Context lines for the event (≤ {@link MAX_EVENT_LINES}). */
    lines: MonitorLogLine[]
    /** Set on `trigger` events: the rule that fired and the line that did it. */
    matched?: { trigger: MonitorTrigger; message: string }
    note?: string
    dropped?: number
}

/* ------------------------------------------------------------------ *
 * Defaults and limits
 * ------------------------------------------------------------------ */

export const DEFAULT_TASK_MONITOR_CADENCE: Readonly<TaskMonitorCadence> = Object.freeze({
    pollMs: 1_000,
    minGapMs: 10_000,
    maxEvents: 50,
    maxDurationMs: 30 * 60_000,
    maxLines: 500,
})

/** The timer floor: polling faster than this buys nothing and costs a battery. */
export const MIN_TASK_MONITOR_POLL_MS = 500

/** A single event never carries more context lines than this. */
export const MAX_EVENT_LINES = 20

/** Lines of context kept BEFORE the first matching line of an event. */
const CONTEXT_BEFORE = 3

/** Persistence debounce (see {@link TaskMonitorEngine} docs). */
const SAVE_DEBOUNCE_MS = 1_000

/** Version tag of the persisted payload: v2 carries `source`, v1 only `root`. */
const STORAGE_VERSION = 2
/** A v1 payload is migrated on read (its `root` is a `dev` source). */
const LEGACY_STORAGE_VERSION = 1

/** Hard cap on the per-monitor event history (the budget is much smaller). */
const MAX_EVENT_HISTORY = 500

const LEVEL_RANK: Record<MonitorLogLevel, number> = { info: 0, warn: 1, error: 2 }

const DEFAULT_TRIGGERS = (): MonitorTrigger[] => [{ kind: 'level', level: 'error' }]

/* ------------------------------------------------------------------ *
 * Pure helpers (validation / matching / cloning)
 * ------------------------------------------------------------------ */

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

const finiteInt = (value: unknown, fallback: number, min: number): number =>
    typeof value === 'number' && Number.isFinite(value)
        ? Math.max(min, Math.floor(value))
        : fallback

const cloneTrigger = (trigger: MonitorTrigger): MonitorTrigger => {
    if (trigger.kind === 'level') return { kind: 'level', level: trigger.level }
    if (trigger.kind === 'pattern') {
        return {
            kind: 'pattern',
            pattern: trigger.pattern,
            ...(trigger.ignoreCase === undefined ? {} : { ignoreCase: trigger.ignoreCase }),
        }
    }
    return { kind: 'settled' }
}

const cloneCadence = (cadence: TaskMonitorCadence): TaskMonitorCadence => ({ ...cadence })

/** Copy so a caller can never mutate engine state through a subscription view. */
const cloneSubscription = (subscription: TaskMonitorSubscription): TaskMonitorSubscription => ({
    ...subscription,
    source: cloneSource(subscription.source),
    taskIds: [...subscription.taskIds],
    triggers: subscription.triggers.map(cloneTrigger),
    cadence: cloneCadence(subscription.cadence),
})

const cloneLine = (line: MonitorLogLine): MonitorLogLine => ({ ...line })

/** Fresh copy so an event's context can never be mutated by a consumer. */
const cloneEvent = (event: TaskMonitorEvent): TaskMonitorEvent => ({
    ...event,
    lines: event.lines.map(cloneLine),
    ...(event.matched
        ? { matched: { trigger: cloneTrigger(event.matched.trigger), message: event.matched.message } }
        : {}),
})

/**
 * Accept only well-formed triggers. Unknown shapes are dropped rather than
 * trusted: this function also runs over persisted state (see `restore`), which
 * may be anything at all.
 */
function normalizeTriggers(raw: unknown): MonitorTrigger[] {
    if (!Array.isArray(raw)) return DEFAULT_TRIGGERS()
    const triggers: MonitorTrigger[] = []
    for (const entry of raw) {
        if (!isRecord(entry)) continue
        if (entry.kind === 'level') {
            if (entry.level === 'error' || entry.level === 'warn') {
                triggers.push({ kind: 'level', level: entry.level })
            }
            continue
        }
        if (entry.kind === 'pattern') {
            const pattern = typeof entry.pattern === 'string' ? entry.pattern : ''
            if (!pattern) continue
            triggers.push({
                kind: 'pattern',
                pattern,
                ...(typeof entry.ignoreCase === 'boolean' ? { ignoreCase: entry.ignoreCase } : {}),
            })
            continue
        }
        if (entry.kind === 'settled') triggers.push({ kind: 'settled' })
    }
    // An explicit empty list would silently watch nothing; the documented default
    // (and what `autoMonitorTasks` relies on) is "tell me about errors".
    return triggers.length > 0 ? triggers : DEFAULT_TRIGGERS()
}

/** Fill in defaults and apply the documented floors (notably `pollMs >= 500`). */
function normalizeCadence(raw: unknown): TaskMonitorCadence {
    const input = isRecord(raw) ? raw : {}
    return {
        pollMs: finiteInt(input.pollMs, DEFAULT_TASK_MONITOR_CADENCE.pollMs, MIN_TASK_MONITOR_POLL_MS),
        minGapMs: finiteInt(input.minGapMs, DEFAULT_TASK_MONITOR_CADENCE.minGapMs, 0),
        maxEvents: finiteInt(input.maxEvents, DEFAULT_TASK_MONITOR_CADENCE.maxEvents, 1),
        maxDurationMs: finiteInt(input.maxDurationMs, DEFAULT_TASK_MONITOR_CADENCE.maxDurationMs, 1),
        maxLines: finiteInt(input.maxLines, DEFAULT_TASK_MONITOR_CADENCE.maxLines, 1),
    }
}

/** Drop anything that is not a log line the engine can reason about. */
function normalizeLine(raw: unknown): MonitorLogLine | null {
    if (!isRecord(raw)) return null
    if (typeof raw.seq !== 'number' || !Number.isFinite(raw.seq)) return null
    const level: MonitorLogLevel = raw.level === 'warn' || raw.level === 'error' ? raw.level : 'info'
    const message = typeof raw.message === 'string' ? raw.message : String(raw.message ?? '')
    const at = typeof raw.at === 'number' && Number.isFinite(raw.at) ? Math.floor(raw.at) : 0
    return { seq: Math.floor(raw.seq), level, message, at }
}

function matchesTrigger(line: MonitorLogLine, trigger: MonitorTrigger): boolean {
    if (trigger.kind === 'level') return LEVEL_RANK[line.level] >= LEVEL_RANK[trigger.level]
    if (trigger.kind === 'pattern') {
        try {
            return new RegExp(trigger.pattern, trigger.ignoreCase ? 'i' : '').test(line.message)
        } catch {
            // An invalid pattern matches nothing — it must not break the monitor.
            return false
        }
    }
    // `settled` is driven by notifySettled(), never by a log line.
    return false
}

/** Accept only a well-formed source (also used to validate persisted state). */
function parseSource(raw: unknown): MonitorSource | null {
    if (!isRecord(raw)) return null
    if (raw.kind === 'dev') {
        const root = typeof raw.root === 'string' ? raw.root.trim() : ''
        return root ? { kind: 'dev', root } : null
    }
    if (raw.kind === 'task') {
        const taskId = typeof raw.taskId === 'string' ? raw.taskId.trim() : ''
        return taskId ? { kind: 'task', taskId } : null
    }
    return null
}

/** Read a persisted subscription, or null when it is not trustworthy. */
function parseSubscription(raw: unknown, now: number): TaskMonitorSubscription | null {
    if (!isRecord(raw)) return null
    // v2 carries `source`. A v1 payload only had `root`, which is exactly a `dev`
    // source — that is the migration, and it is also what a hand-written payload
    // from an older host looks like.
    const legacyRoot = typeof raw.root === 'string' ? raw.root.trim() : ''
    const source: MonitorSource | null =
        parseSource(raw.source) ?? (legacyRoot ? { kind: 'dev', root: legacyRoot } : null)
    if (!source) return null
    const label = typeof raw.label === 'string' && raw.label ? raw.label : sourceLabel(source)
    const taskIds = Array.isArray(raw.taskIds)
        ? raw.taskIds.filter((id): id is string => typeof id === 'string')
        : []
    const createdAt = typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt)
        ? Math.floor(raw.createdAt)
        : now
    const status: TaskMonitorStatus =
        raw.status === 'stopped' || raw.status === 'expired' ? raw.status : 'running'
    const note = typeof raw.note === 'string' && raw.note ? raw.note : undefined
    return {
        id: monitorSourceKey(source),
        source,
        label,
        taskIds,
        triggers: normalizeTriggers(raw.triggers),
        cadence: normalizeCadence(raw.cadence),
        status,
        createdAt,
        ...(note ? { note } : {}),
    }
}

/* ------------------------------------------------------------------ *
 * Engine state
 * ------------------------------------------------------------------ */

/** A line that matched, waiting for the quiet window to close. */
interface PendingHit {
    triggerIndex: number
    trigger: MonitorTrigger
    line: MonitorLogLine
}

/** Everything the engine knows about one subscription. */
interface MonitorState {
    sub: TaskMonitorSubscription
    /** Next seq to ask the reader for. */
    cursor: number
    /** Bounded ring of the lines we kept (oldest first). */
    lines: MonitorLogLine[]
    /** Hits collected but not yet emitted (merged into the next event). */
    pending: PendingHit[]
    /** When the last event was emitted, or null before the first one. */
    lastEventAt: number | null
    /** Event-idempotency keys (see {@link TaskMonitorEvent.id}). */
    eventIds: Set<string>
    /** Trigger events emitted in this run — the `maxEvents` budget. */
    triggerCount: number
    /** Warn about a failing reader once per failure streak, not per tick. */
    warned: boolean
    /**
     * Monotonic counter for events that have no line range (ended / status /
     * settled). Line-based trigger events use the documented seq-range key, but
     * a reactivated monitor can settle or expire again at the same cursor — these
     * ids have to stay unique across runs.
     */
    eventSeq: number
}

export interface TaskMonitorDeps {
    reader?: TaskMonitorReader
    storage?: TaskMonitorStorage
    now?: () => number
    autoMonitorTasks?: boolean
}

const EMPTY_LINES: MonitorLogLine[] = Object.freeze([]) as unknown as MonitorLogLine[]

/**
 * The monitor engine. One process-wide instance is exported as
 * {@link taskMonitor}; use the class directly in tests.
 *
 * All state is in memory and per JS context. Persistence (when the host injects
 * a storage) exists so a reload does not lose "I was watching this project" —
 * the host's own log store is what makes the lines themselves survive.
 */
export class TaskMonitorEngine {
    private readonly monitors = new Map<string, MonitorState>()
    private readonly eventsByMonitor = new Map<string, TaskMonitorEvent[]>()
    private readonly listeners = new Set<() => void>()

    private reader: TaskMonitorReader | undefined
    private storage: TaskMonitorStorage | undefined
    private clock: () => number = Date.now
    private autoMonitorTasks = false
    /** Restored state must land before the first pump (see configure/pump). */
    private ready: Promise<void> = Promise.resolve()
    /** Guard so a superseded restore cannot apply to the current configuration. */
    private epoch = 0

    private timer: any = null
    private timerPollMs = 0
    private pumping = false

    private saveTimer: any = null
    private saveDirty = false
    private saveWarned = false

    private autoUnsubscribe: (() => void) | null = null

    /** Bumped on every state change; the stable snapshot for useSyncExternalStore. */
    private version = 0

    private listCache: { version: number; value: TaskMonitorSubscription[] } | null = null
    private readonly linesCache = new Map<string, { version: number; value: MonitorLogLine[] }>()
    private readonly eventsCache = new Map<string, { version: number; value: TaskMonitorEvent[] }>()

    /* -------------------------------------------------------------- *
     * Configuration
     * -------------------------------------------------------------- */

    /**
     * Inject the host seams. Only the keys that are present are replaced, so a
     * host can call `configure({ reader })` and later `configure({ storage })`
     * without losing the reader.
     *
     * `autoMonitorTasks: true` also subscribes to the background-task registry
     * (READ ONLY: it never starts, cancels or otherwise touches a task).
     */
    configure(deps: TaskMonitorDeps): void {
        if (deps.reader !== undefined) this.reader = deps.reader
        if (deps.storage !== undefined) this.storage = deps.storage
        if (typeof deps.now === 'function') this.clock = deps.now
        if (typeof deps.autoMonitorTasks === 'boolean') this.autoMonitorTasks = deps.autoMonitorTasks

        this.epoch += 1
        // A pending save from the previous configuration must not write into the
        // new one; the new storage gets its own debounce.
        this.cancelSave()

        if (deps.autoMonitorTasks !== undefined) {
            this.detachAuto()
            if (this.autoMonitorTasks) this.attachAuto()
        }

        // Restoring is asynchronous by contract (storage.load is async); pump()
        // and the timer await `ready`, so nothing can read before state is back.
        this.ready = this.restore()
    }

    /* -------------------------------------------------------------- *
     * Public engine API
     * -------------------------------------------------------------- */

    /**
     * Start (or refresh) the monitor for a source.
     *
     * Idempotent by {@link monitorSourceKey}: an existing subscription keeps its
     * cursor, its retained lines and its `createdAt`; only the described fields
     * are updated. A subscription that already ended (stopped/expired) is
     * REACTIVATED with the same cursor but a fresh budget window and `createdAt` —
     * otherwise a task that restarts on the same source (a dev server coming back
     * up, a plugin task re-run under the same id) would never be watched again.
     */
    start(input: {
        source: MonitorSource
        label: string
        taskIds?: string[]
        triggers?: MonitorTrigger[]
        cadence?: Partial<TaskMonitorCadence>
    }): TaskMonitorSubscription {
        const source = parseSource(input.source)
        if (!source) throw new Error('taskMonitor.start: a valid source is required')
        const id = monitorSourceKey(source)
        const label = typeof input.label === 'string' && input.label ? input.label : sourceLabel(source)
        const triggers = normalizeTriggers(input.triggers)
        const cadence = normalizeCadence(input.cadence)
        const now = this.clock()
        const existing = this.monitors.get(id)

        if (existing) {
            const sub = existing.sub
            sub.label = label
            sub.triggers = triggers
            if (Array.isArray(input.taskIds)) {
                sub.taskIds = input.taskIds.filter((taskId): taskId is string => typeof taskId === 'string')
            }
            if (input.cadence !== undefined) sub.cadence = cadence
            if (sub.status !== 'running') {
                sub.status = 'running'
                delete sub.note
                sub.createdAt = now
                existing.pending = []
                existing.lastEventAt = null
                existing.triggerCount = 0
            }
            this.syncTimer()
            this.emit()
            return cloneSubscription(sub)
        }

        const sub: TaskMonitorSubscription = {
            id,
            source,
            label,
            taskIds: Array.isArray(input.taskIds)
                ? input.taskIds.filter((taskId): taskId is string => typeof taskId === 'string')
                : [],
            triggers,
            cadence,
            status: 'running',
            createdAt: now,
        }
        this.monitors.set(id, {
            sub,
            cursor: 0,
            lines: [],
            pending: [],
            lastEventAt: null,
            eventIds: new Set(),
            triggerCount: 0,
            warned: false,
            eventSeq: 0,
        })
        this.syncTimer()
        this.emit()
        return cloneSubscription(sub)
    }

    /** Stop a running monitor. Returns false when it is unknown or already ended. */
    stop(id: string): boolean {
        const state = this.monitors.get(id)
        if (!state || state.sub.status !== 'running') return false
        state.sub.status = 'stopped'
        state.sub.note = '监控已停止'
        state.pending = []
        this.syncTimer()
        this.emit()
        return true
    }

    /**
     * Every subscription, in start order.
     *
     * Referentially stable while {@link getVersion} is unchanged — this is the
     * `getSnapshot` half of `useSyncExternalStore`, so do not mutate the result.
     */
    list(): TaskMonitorSubscription[] {
        if (this.listCache && this.listCache.version === this.version) return this.listCache.value
        const value = Array.from(this.monitors.values()).map(state => cloneSubscription(state.sub))
        this.listCache = { version: this.version, value }
        return value
    }

    /**
     * Events of one monitor, or of every monitor when no id is passed (chronological).
     * Referentially stable per version, like {@link list}.
     */
    events(id?: string): TaskMonitorEvent[] {
        const key = id ?? '*'
        const cached = this.eventsCache.get(key)
        if (cached && cached.version === this.version) return cached.value
        let value: TaskMonitorEvent[]
        if (id !== undefined) {
            value = (this.eventsByMonitor.get(id) ?? []).map(cloneEvent)
        } else {
            // Merge by timestamp; equal clocks keep insertion order so the list
            // does not reshuffle between renders.
            value = Array.from(this.eventsByMonitor.values())
                .flat()
                .map((event, index) => ({ event, index }))
                .sort((a, b) => a.event.at - b.event.at || a.index - b.index)
                .map(entry => cloneEvent(entry.event))
        }
        this.eventsCache.set(key, { version: this.version, value })
        return value
    }

    /** The lines this monitor retained (at most `cadence.maxLines`), oldest first. */
    lines(id: string): MonitorLogLine[] {
        const state = this.monitors.get(id)
        if (!state) return EMPTY_LINES
        const cached = this.linesCache.get(id)
        if (cached && cached.version === this.version) return cached.value
        const value = state.lines.map(cloneLine)
        this.linesCache.set(id, { version: this.version, value })
        return value
    }

    /** `useSyncExternalStore`-shaped change notification (pair with {@link getVersion}). */
    subscribe(listener: () => void): () => void {
        this.listeners.add(listener)
        return () => { this.listeners.delete(listener) }
    }

    /** Monotonic state version; stable between changes. */
    getVersion(): number {
        return this.version
    }

    /**
     * The task/session behind a source settled: this is the external `settled` trigger.
     *
     * Always stops THAT source's running monitor (there is nothing left to watch),
     * and emits a `trigger` event when the subscription asked for `settled` —
     * otherwise a `status` event says why it stopped. Other sources are not
     * touched. Returns true when a monitor was stopped.
     */
    notifySettled(source: MonitorSource): boolean {
        const parsed = parseSource(source)
        if (!parsed) return false
        const match = this.monitors.get(monitorSourceKey(parsed))
        if (!match || match.sub.status !== 'running') return false
        const now = this.clock()
        // A queued hit whose quiet window already closed is its own event; it must
        // not be swallowed by the settle.
        this.flushPendingIfDue(match, now)

        const settledIndex = match.sub.triggers.findIndex(trigger => trigger.kind === 'settled')
        if (settledIndex >= 0) {
            const trigger = match.sub.triggers[settledIndex]
            this.pushEvent(match, {
                id: `${match.sub.id}:${match.cursor}-${match.cursor}:${settledIndex}:${(match.eventSeq += 1)}`,
                monitorId: match.sub.id,
                kind: 'trigger',
                at: now,
                seqFrom: match.cursor,
                seqTo: match.cursor,
                lines: match.lines.slice(-MAX_EVENT_LINES).map(cloneLine),
                matched: { trigger: cloneTrigger(trigger), message: '任务已结束' },
            })
        } else {
            const note = '任务已结束，停止监控'
            this.pushEvent(match, {
                id: `${match.sub.id}:${match.cursor}-${match.cursor}:status:${(match.eventSeq += 1)}`,
                monitorId: match.sub.id,
                kind: 'status',
                at: now,
                seqFrom: match.cursor,
                seqTo: match.cursor,
                lines: match.lines.slice(-MAX_EVENT_LINES).map(cloneLine),
                note,
            })
        }
        match.sub.status = 'stopped'
        match.sub.note = '任务已结束'
        match.pending = []
        this.syncTimer()
        this.emit()
        return true
    }

    /**
     * Run one pull cycle (test/host use — does not wait for the timer).
     *
     * Waits for a pending restore first, so "configure, pump" is deterministic.
     * A failing reader is absorbed per monitor: the other monitors of this cycle
     * still run, and the failing one keeps its cursor (its lines are re-read next
     * time, not lost).
     */
    async pump(): Promise<void> {
        await this.ready
        if (this.pumping) return
        this.pumping = true
        try {
            for (const state of Array.from(this.monitors.values())) {
                if (state.sub.status !== 'running') continue
                if (this.expiredByDuration(state)) continue

                const reader = this.reader
                if (reader) {
                    try {
                        // No `limit`: the host decides its own page size. A reader
                        // that pages at fewer lines than the ring holds is fine —
                        // the next pump continues from the cursor — and a reader
                        // that returns more is trimmed by the ring.
                        const page = await reader.read({ source: state.sub.source, sinceSeq: state.cursor })
                        // The monitor may have been stopped while the read was in
                        // flight; do not resurrect it with a late page.
                        if (state.sub.status !== 'running') continue
                        state.warned = false
                        this.ingest(state, page)
                    } catch (error: any) {
                        if (!state.warned) {
                            state.warned = true
                            console.warn('[task-monitor] read failed:', error?.message ?? error)
                        }
                    }
                }
                if (state.sub.status !== 'running') continue
                this.flushPendingIfDue(state, this.clock())
                this.expiredByDuration(state)
            }
        } finally {
            this.pumping = false
        }
    }

    /** Test/reset hook: drops every subscription, event, timer and injected seam. */
    reset(): void {
        this.detachAuto()
        this.clearTimer()
        this.cancelSave()
        this.epoch += 1
        this.monitors.clear()
        this.eventsByMonitor.clear()
        this.listeners.clear()
        this.linesCache.clear()
        this.eventsCache.clear()
        this.listCache = null
        this.reader = undefined
        this.storage = undefined
        this.clock = Date.now
        this.autoMonitorTasks = false
        this.ready = Promise.resolve()
        this.saveWarned = false
        this.version += 1
    }

    /* -------------------------------------------------------------- *
     * Pulling and matching
     * -------------------------------------------------------------- */

    private ingest(state: MonitorState, page: MonitorLogPage): void {
        const cadence = state.sub.cadence
        const entries = Array.isArray(page?.entries) ? page.entries : []
        const accepted: MonitorLogLine[] = []
        for (const raw of entries) {
            const line = normalizeLine(raw)
            if (!line) continue
            // A reader that replays already-seen lines must not duplicate them.
            if (line.seq < state.cursor) continue
            accepted.push(line)
        }

        const nextSeq = page && typeof page.nextSeq === 'number' && Number.isFinite(page.nextSeq)
            ? Math.floor(page.nextSeq)
            : state.cursor
        const lastAccepted = accepted.length > 0 ? accepted[accepted.length - 1].seq + 1 : state.cursor
        state.cursor = Math.max(state.cursor, nextSeq, lastAccepted)
        if (accepted.length === 0) return

        state.lines = state.lines.concat(accepted)
        if (state.lines.length > cadence.maxLines) {
            state.lines = state.lines.slice(state.lines.length - cadence.maxLines)
        }

        for (const line of accepted) {
            for (let index = 0; index < state.sub.triggers.length; index += 1) {
                const trigger = state.sub.triggers[index]
                if (!trigger || trigger.kind === 'settled') continue
                if (!matchesTrigger(line, trigger)) continue
                this.recordHit(state, index, trigger, line)
                // The event budget may have expired the monitor mid-page.
                if (state.sub.status !== 'running') break
            }
            if (state.sub.status !== 'running') break
        }
        this.emit()
    }

    /**
     * A line matched: emit now when the quiet window is open, otherwise queue it.
     * Queued hits become ONE event when the window closes (see flushPending).
     */
    private recordHit(state: MonitorState, triggerIndex: number, trigger: MonitorTrigger, line: MonitorLogLine): void {
        state.pending.push({ triggerIndex, trigger, line })
        const now = this.clock()
        const last = state.lastEventAt
        if (last === null || now - last >= state.sub.cadence.minGapMs) this.flushPending(state, now)
    }

    /** Emit the queued hits as one merged event (idempotent by event id). */
    private flushPending(state: MonitorState, now: number): void {
        const hits = state.pending
        if (hits.length === 0) return
        state.pending = []
        const first = hits[0]
        const seqFrom = hits.reduce((min, hit) => Math.min(min, hit.line.seq), first.line.seq)
        const seqTo = hits.reduce((max, hit) => Math.max(max, hit.line.seq), first.line.seq)
        state.lastEventAt = now
        const id = `${state.sub.id}:${seqFrom}-${seqTo}:${first.triggerIndex}`
        // The same batch (same seq range, same rule) never produces a second event.
        if (state.eventIds.has(id)) return
        state.eventIds.add(id)
        this.pushEvent(state, {
            id,
            monitorId: state.sub.id,
            kind: 'trigger',
            at: now,
            seqFrom,
            seqTo,
            lines: this.eventWindow(state, seqFrom),
            matched: { trigger: cloneTrigger(first.trigger), message: first.line.message },
        })
        state.triggerCount += 1
        if (state.sub.status === 'running' && state.triggerCount >= state.sub.cadence.maxEvents) {
            // expire() emits (and persists) on its own.
            this.expire(state, `已达到事件上限（${state.sub.cadence.maxEvents} 条），停止监控`)
        } else {
            // A merge can happen with no new line (the quiet window simply closed),
            // so the event itself is the change the snapshots must see.
            this.emit()
        }
    }

    private flushPendingIfDue(state: MonitorState, now: number): void {
        if (state.pending.length === 0) return
        const last = state.lastEventAt
        if (last !== null && now - last < state.sub.cadence.minGapMs) return
        this.flushPending(state, now)
    }

    /** Context for an event: a few lines before the first hit, at most MAX_EVENT_LINES. */
    private eventWindow(state: MonitorState, firstSeq: number): MonitorLogLine[] {
        const lines = state.lines
        const firstIndex = lines.findIndex(line => line.seq === firstSeq)
        if (firstIndex < 0) return lines.slice(-MAX_EVENT_LINES).map(cloneLine)
        const start = Math.max(0, firstIndex - CONTEXT_BEFORE)
        return lines.slice(start, start + MAX_EVENT_LINES).map(cloneLine)
    }

    /** Over the lifetime budget: expire (and record why) before reading anything. */
    private expiredByDuration(state: MonitorState): boolean {
        if (state.sub.status !== 'running') return true
        const limit = state.sub.cadence.maxDurationMs
        if (this.clock() - state.sub.createdAt < limit) return false
        this.expire(state, `已超过最长监控时长（${limit}ms），停止监控`)
        return true
    }

    /** Terminal state for both budgets: status `expired` + one `ended` event. */
    private expire(state: MonitorState, note: string): void {
        if (state.sub.status !== 'running') return
        state.sub.status = 'expired'
        state.sub.note = note
        state.pending = []
        this.pushEvent(state, {
            id: `${state.sub.id}:${state.cursor}:ended:${(state.eventSeq += 1)}`,
            monitorId: state.sub.id,
            kind: 'ended',
            at: this.clock(),
            seqFrom: 0,
            seqTo: state.cursor,
            lines: state.lines.slice(-MAX_EVENT_LINES).map(cloneLine),
            note,
        })
        this.syncTimer()
        this.emit()
    }

    private pushEvent(state: MonitorState, event: TaskMonitorEvent): void {
        const history = this.eventsByMonitor.get(state.sub.id) ?? []
        history.push(event)
        if (history.length > MAX_EVENT_HISTORY) history.splice(0, history.length - MAX_EVENT_HISTORY)
        this.eventsByMonitor.set(state.sub.id, history)
    }

    /* -------------------------------------------------------------- *
     * Timer (lazy: exists only while something is running)
     * -------------------------------------------------------------- */

    private syncTimer(): void {
        const running = Array.from(this.monitors.values()).filter(state => state.sub.status === 'running')
        if (running.length === 0) {
            this.clearTimer()
            return
        }
        // One timer for everything, at the fastest cadence asked for.
        const pollMs = running.reduce(
            (min, state) => Math.min(min, state.sub.cadence.pollMs),
            Number.POSITIVE_INFINITY,
        )
        const interval = Math.max(MIN_TASK_MONITOR_POLL_MS, pollMs)
        if (this.timer !== null && this.timerPollMs === interval) return
        this.clearTimer()
        this.timerPollMs = interval
        this.timer = setInterval(() => { void this.pump() }, interval)
        // A monitor must not be the reason a Node process stays alive (the check
        // script runs on Node; browsers have no `unref`).
        const maybeUnref = this.timer as { unref?: () => void }
        if (typeof maybeUnref?.unref === 'function') maybeUnref.unref()
    }

    private clearTimer(): void {
        if (this.timer !== null) clearInterval(this.timer)
        this.timer = null
        this.timerPollMs = 0
    }

    /* -------------------------------------------------------------- *
     * Persistence (debounced; every failure is swallowed)
     * -------------------------------------------------------------- */

    private emit(): void {
        this.version += 1
        for (const listener of Array.from(this.listeners)) {
            try {
                listener()
            } catch (error: any) {
                console.warn('[task-monitor] listener failed:', error?.message ?? error)
            }
        }
        this.scheduleSave()
    }

    private scheduleSave(): void {
        if (!this.storage) return
        this.saveDirty = true
        if (this.saveTimer !== null) return
        this.saveTimer = setTimeout(() => {
            this.saveTimer = null
            void this.flushSave()
        }, SAVE_DEBOUNCE_MS)
        const maybeUnref = this.saveTimer as { unref?: () => void }
        if (typeof maybeUnref?.unref === 'function') maybeUnref.unref()
    }

    private cancelSave(): void {
        if (this.saveTimer !== null) clearTimeout(this.saveTimer)
        this.saveTimer = null
        this.saveDirty = false
    }

    private serialise(): unknown {
        const subscriptions: TaskMonitorSubscription[] = []
        const cursors: Record<string, number> = {}
        for (const state of this.monitors.values()) {
            // Only what can be resumed is worth persisting: an ended monitor has
            // no cursor left to continue from. Cursors are keyed by
            // `monitorSourceKey` (v2; v1 keyed them by `root:<root>`).
            if (state.sub.status !== 'running') continue
            subscriptions.push(cloneSubscription(state.sub))
            cursors[state.sub.id] = state.cursor
        }
        return { v: STORAGE_VERSION, subscriptions, cursors }
    }

    private async flushSave(): Promise<void> {
        const storage = this.storage
        if (!storage || !this.saveDirty) return
        this.saveDirty = false
        try {
            await storage.save(this.serialise())
            this.saveWarned = false
        } catch (error: any) {
            if (!this.saveWarned) {
                this.saveWarned = true
                console.warn('[task-monitor] save failed:', error?.message ?? error)
            }
        }
    }

    /** Load persisted subscriptions; anything unexpected is ignored (never thrown). */
    private async restore(): Promise<void> {
        const storage = this.storage
        if (!storage) return
        const epoch = this.epoch
        let raw: unknown = null
        try {
            raw = await storage.load()
        } catch (error: any) {
            console.warn('[task-monitor] load failed:', error?.message ?? error)
            return
        }
        // A newer configure() superseded this load; its storage owns the state now.
        if (epoch !== this.epoch) return
        if (!isRecord(raw) || !Array.isArray(raw.subscriptions)) return
        // v1 (root-keyed) is migrated through `parseSubscription`; anything else
        // (older, newer, hand-written garbage) is ignored and rebuilt.
        if (raw.v !== STORAGE_VERSION && raw.v !== LEGACY_STORAGE_VERSION) return
        const cursors = isRecord(raw.cursors) ? raw.cursors : {}
        let changed = false
        for (const entry of raw.subscriptions) {
            const sub = parseSubscription(entry, this.clock())
            if (!sub) continue
            // A live subscription (host started it before the restore finished)
            // wins over the persisted one.
            if (this.monitors.has(sub.id)) continue
            // v2 cursors are keyed by `monitorSourceKey`; a v1 payload keyed them
            // by `root:<root>` — look both up so a migrated subscription resumes
            // exactly where it was.
            const legacyRootKey = sub.source.kind === 'dev' ? `root:${sub.source.root}` : null
            const rawCursor = cursors[sub.id] ?? (legacyRootKey ? cursors[legacyRootKey] : undefined)
            const cursor = typeof rawCursor === 'number' && Number.isFinite(rawCursor)
                ? Math.max(0, Math.floor(rawCursor))
                : 0
            const expired = sub.status === 'running'
                && this.clock() - sub.createdAt >= sub.cadence.maxDurationMs
            const restored: TaskMonitorSubscription = expired
                ? { ...sub, status: 'expired', note: '恢复时已超过最长监控时长，停止监控' }
                : sub
            this.monitors.set(sub.id, {
                sub: restored,
                cursor,
                lines: [],
                pending: [],
                lastEventAt: null,
                eventIds: new Set(),
                triggerCount: 0,
                warned: false,
                eventSeq: 0,
            })
            changed = true
        }
        if (changed) {
            this.syncTimer()
            this.emit()
        }
    }

    /* -------------------------------------------------------------- *
     * Background-task auto wiring (read-only)
     * -------------------------------------------------------------- */

    private attachAuto(): void {
        this.detachAuto()
        this.autoUnsubscribe = backgroundTasks.on(event => {
            const root = event.task.meta?.root
            if (typeof root !== 'string' || !root) return
            if (event.type === 'started') {
                try {
                    this.start({
                        source: { kind: 'dev', root },
                        label: event.task.title,
                        taskIds: [event.task.id],
                    })
                } catch (error: any) {
                    console.warn('[task-monitor] auto start failed:', error?.message ?? error)
                }
                return
            }
            if (event.type === 'settled') this.notifySettled({ kind: 'dev', root })
        })
    }

    private detachAuto(): void {
        const unsubscribe = this.autoUnsubscribe
        this.autoUnsubscribe = null
        if (!unsubscribe) return
        try {
            unsubscribe()
        } catch {
            // Removing a listener cannot fail in practice; never let it throw.
        }
    }
}

/** Process-wide monitor: one window, one set of watched sources. */
export const taskMonitor = new TaskMonitorEngine()