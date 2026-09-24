/**
 * Agent stream budget — bounds how many long-lived run event streams one client
 * may hold open at once, with priority for the root conversation.
 *
 * Why this exists: every live run costs one permanently-open HTTP connection
 * (the SSE tail of \`/runs/{id}/events\`). Browsers cap concurrent connections
 * per origin for HTTP/1.1 (~6), so N parallel agents starve every ordinary API
 * call (save / list / upload) until it times out — the "resource contention"
 * shows up as unrelated interfaces hanging. The backend is event-sourced and
 * {@link file://./client.ts} replays from \`afterSeq\`, so a run whose stream is
 * queued here loses nothing: it attaches later and catches up from its log.
 *
 * Priority: \`root\` streams carry the user-visible conversation; \`child\`
 * streams carry delegated sub-runs. Children may only use
 * \`maxConcurrentStreams - reservedForRootStreams\` slots, so a root stream
 * never queues behind a sweep of children. FIFO within a priority.
 */

/** Who a stream belongs to: the conversation (root) or a delegated sub-run. */
export type AgentStreamPriority = 'root' | 'child'

/** Optional per-call stream settings (accepted by the client's stream methods). */
export interface AgentStreamOptions {
    /** Defaults to \`root\`; SubRunWorker passes \`child\` for delegated runs. */
    priority?: AgentStreamPriority
}

export interface AgentStreamBudgetConfig {
    /** Max long-lived run streams held open at once by this client. */
    maxConcurrentStreams: number
    /** Slots children may never take, kept for the root conversation. */
    reservedForRootStreams: number
}

export interface AgentStreamBudgetSnapshot {
    active: number
    activeRoot: number
    activeChild: number
    queued: number
    queuedRoot: number
    queuedChild: number
    maxConcurrentStreams: number
    reservedForRootStreams: number
    /** Effective child cap (\`maxConcurrentStreams - reservedForRootStreams\`). */
    childLimit: number
}

/**
 * Four streams leave two connection slots for ordinary API calls on an
 * HTTP/1.1 origin (browsers cap at ~6), and one reserved slot keeps the
 * conversation responsive while children run. With HTTP/2 enabled the budget is
 * still useful: it bounds backend stream threads and provider fan-out too.
 */
const DEFAULT_CONFIG: AgentStreamBudgetConfig = {
    maxConcurrentStreams: 4,
    reservedForRootStreams: 1,
}

let config: AgentStreamBudgetConfig = { ...DEFAULT_CONFIG }
let activeRoot = 0
let activeChild = 0

interface Waiter {
    priority: AgentStreamPriority
    grant: () => void
    fail: (error: Error) => void
    signal?: AbortSignal
    onAbort?: () => void
    settled: boolean
}

const rootWaiters: Waiter[] = []
const childWaiters: Waiter[] = []

function abortError(): Error {
    const error = new Error('Agent stream wait aborted')
    error.name = 'AbortError'
    return error
}

/** Effective child cap; at least 1 so a misconfiguration cannot starve children. */
function childLimit(): number {
    return Math.max(0, config.maxConcurrentStreams - config.reservedForRootStreams)
}

function normalize(patch: Partial<AgentStreamBudgetConfig>): AgentStreamBudgetConfig {
    const max = Math.max(1, Math.floor(patch.maxConcurrentStreams ?? config.maxConcurrentStreams))
    const reservedRaw = Math.max(0, Math.floor(patch.reservedForRootStreams ?? config.reservedForRootStreams))
    // Clamp below max: a child must always be able to make progress.
    const reserved = Math.min(reservedRaw, Math.max(0, max - 1))
    return { maxConcurrentStreams: max, reservedForRootStreams: reserved }
}

/** Adjust the budget (host configuration / tests). */
export function configureAgentStreamBudget(patch: Partial<AgentStreamBudgetConfig>): void {
    config = normalize(patch)
    pumpWaiters()
}

/** Current occupancy, for diagnostics and tests. */
export function agentStreamBudgetSnapshot(): AgentStreamBudgetSnapshot {
    return {
        active: activeRoot + activeChild,
        activeRoot,
        activeChild,
        queued: rootWaiters.length + childWaiters.length,
        queuedRoot: rootWaiters.length,
        queuedChild: childWaiters.length,
        maxConcurrentStreams: config.maxConcurrentStreams,
        reservedForRootStreams: config.reservedForRootStreams,
        childLimit: childLimit(),
    }
}

function canAdmit(priority: AgentStreamPriority): boolean {
    if (activeRoot + activeChild >= config.maxConcurrentStreams) return false
    if (priority === 'child') return activeChild < childLimit()
    return true
}

function occupy(priority: AgentStreamPriority): void {
    if (priority === 'root') activeRoot += 1
    else activeChild += 1
}

/** Idempotent: a generator's finally may run more than once in odd hosts. */
function createRelease(priority: AgentStreamPriority): () => void {
    let released = false
    return () => {
        if (released) return
        released = true
        if (priority === 'root') activeRoot = Math.max(0, activeRoot - 1)
        else activeChild = Math.max(0, activeChild - 1)
        pumpWaiters()
    }
}

function claim(waiter: Waiter): boolean {
    if (waiter.settled) return false
    waiter.settled = true
    if (waiter.signal && waiter.onAbort) {
        waiter.signal.removeEventListener('abort', waiter.onAbort)
    }
    return true
}

function pumpWaiters(): void {
    // Roots first: theirs is the user-visible conversation. A root arriving
    // while children queue is served before them.
    while (rootWaiters.length > 0 && canAdmit('root')) {
        const waiter = rootWaiters.shift()!
        if (!claim(waiter)) continue
        occupy('root')
        waiter.grant()
    }
    while (childWaiters.length > 0 && canAdmit('child')) {
        const waiter = childWaiters.shift()!
        if (!claim(waiter)) continue
        occupy('child')
        waiter.grant()
    }
}

/**
 * Take a stream slot, waiting until one is free. Resolves with an idempotent
 * release function; rejects with an \`AbortError\` when \`signal\` aborts first.
 */
export function acquireAgentStreamSlot(
    priority: AgentStreamPriority = 'root',
    signal?: AbortSignal,
): Promise<() => void> {
    if (signal?.aborted) return Promise.reject(abortError())
    if (canAdmit(priority)) {
        occupy(priority)
        return Promise.resolve(createRelease(priority))
    }
    return new Promise<() => void>((resolve, reject) => {
        const queue = priority === 'root' ? rootWaiters : childWaiters
        const waiter: Waiter = {
            priority,
            grant: () => resolve(createRelease(priority)),
            fail: reject,
            signal,
            settled: false,
        }
        waiter.onAbort = () => {
            if (waiter.settled) return
            waiter.settled = true
            const index = queue.indexOf(waiter)
            if (index >= 0) queue.splice(index, 1)
            reject(abortError())
        }
        signal?.addEventListener('abort', waiter.onAbort, { once: true })
        queue.push(waiter)
    })
}

/** Restore defaults and drop waiters (tests only). */
export function resetAgentStreamBudget(): void {
    config = { ...DEFAULT_CONFIG }
    activeRoot = 0
    activeChild = 0
    const pending = [...rootWaiters, ...childWaiters]
    rootWaiters.length = 0
    childWaiters.length = 0
    for (const waiter of pending) {
        if (waiter.settled) continue
        waiter.settled = true
        if (waiter.signal && waiter.onAbort) {
            waiter.signal.removeEventListener('abort', waiter.onAbort)
        }
        waiter.fail(abortError())
    }
}
