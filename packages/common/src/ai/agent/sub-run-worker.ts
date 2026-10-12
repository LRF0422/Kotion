/**
 * SubRunWorker — the client side of truly parallel delegation.
 *
 * A delegated child run owns its frontend tools: the backend does not relay
 * them through the parent any more, so the parent never pauses for a child and
 * children are not serialized behind each other. Each live child gets a driver
 * here, which
 *
 *  1. streams the child's own event log (`GET /runs/{childRunId}/events`),
 *  2. executes that child's frontend tool calls with the child's editor
 *     binding (`owner = childRunId`) — one call at a time per child, while
 *     children run concurrently, bounded by {@link DEFAULT_MAX_PARALLEL_CALLS},
 *  3. resumes the child run directly (`POST /runs/{childRunId}/resume`) and
 *     keeps streaming from the same cursor, and
 *  4. detaches when the child reaches a terminal state.
 *
 * Crash/reconnect recovery mirrors the parent path: tool results are journalled
 * per (runId, callId), a call whose journal says "started but unfinished" is
 * never re-executed, and a re-attached child exposes its outstanding calls
 * through `getRun().pendingTools`.
 */

import type { ToolExecutionResult } from './tool-executor'
import type { AgentRunStore } from './persistence'
import type { AgentEvent, ResumePayload, RunView } from './types'
import type { AgentStreamOptions } from './stream-budget'

/**
 * The slice of `AgentClient` this worker needs. Declared structurally so the
 * module stays free of the HTTP/session layer (the run-observer check compiles
 * and runs it in isolation).
 */
export interface SubRunClient {
    streamEvents(
        runId: string,
        afterSeq?: number,
        signal?: AbortSignal,
        options?: AgentStreamOptions
    ): AsyncGenerator<AgentEvent>
    resume(
        runId: string,
        payload: ResumePayload,
        afterSeq?: number,
        signal?: AbortSignal,
        options?: AgentStreamOptions
    ): Promise<AsyncGenerator<AgentEvent>>
    getRun(runId: string): Promise<RunView>
}

/** Simultaneous frontend tool executions across all children. */
export const DEFAULT_MAX_PARALLEL_CALLS = 4

/** Reconnect backoff for a child stream cut without a terminal event. */
const STREAM_RETRY_BASE_MS = 500
const STREAM_RETRY_MAX_MS = 8_000

/**
 * Backoff for re-submitting a child's own `tool_results` after the resume
 * request failed in flight. The payload stays queued until the server accepts
 * it, so the retry rate only needs bounding — never a give-up path, because
 * dropping the results strands the child (see {@link SubRunWorker.consumeOnce}).
 */
const RESUME_RETRY_BASE_MS = 500
const RESUME_RETRY_MAX_MS = 8_000

/**
 * Watchdog cadence for a child the server reports as parked on its frontend
 * calls. The backend emits nothing while it waits, so a batch whose pending
 * list was not yet visible when the client asked (the run's own pause is
 * published before its state is) would otherwise strand the child until its
 * `tool_timeout`. Polling the run view re-derives the work instead.
 */
const PARK_RECHECK_BASE_MS = 3_000
const PARK_RECHECK_MAX_MS = 30_000

export type SubRunSettlement = 'completed' | 'failed' | 'cancelled' | 'detached'

export interface SubRunWorkerOptions {
    client: SubRunClient
    /**
     * Execute one frontend tool call for a delegated owner. Implementations pass
     * the owner through to the tool executor so the child's tools act on the
     * child's own editor/document.
     */
    executeTool: (
        callId: string,
        tool: string,
        args: Record<string, any>,
        owner: string
    ) => Promise<ToolExecutionResult>
    /** Tool-result journalling (crash safety), shared with the parent run. */
    store?: AgentRunStore
    /** Every child event, for the UI projection (sub-agent tree). */
    onEvent?: (runId: string, event: AgentEvent) => void
    /** Child reached a terminal state (or the worker stopped driving it). */
    onSettled?: (runId: string, settlement: SubRunSettlement) => void
    maxParallelCalls?: number
}

interface ChildCall {
    tool: string
    args: Record<string, any>
}

interface ChildState {
    runId: string
    lastSeq: number
    /** callId → call, for calls seen on the stream but not yet answered. */
    knownCalls: Map<string, ChildCall>
    /** Ordered call ids awaiting execution for this child. */
    queue: string[]
    /** Paused for this child's own tools / budget: serve, then resume. */
    paused: boolean
    /** Payload to POST before reopening the stream. */
    resumePayload: ResumePayload | null
    /** Failed resume attempts for the queued payload (backoff; reset on accept). */
    resumeAttempts: number
    /** Seq of the newest `waiting_tools` suspend consumed (run-view staleness). */
    suspendSeq: number
    /** The server said it is parked on this child's frontend calls. */
    parked: boolean
    /** Watchdog passes since the current park began (backoff). */
    parkChecks: number
    abort: AbortController
    settled: boolean
    streamRetry: number
}

export class SubRunWorker {
    private readonly client: SubRunClient
    private readonly executeTool: SubRunWorkerOptions['executeTool']
    private readonly store?: AgentRunStore
    private readonly onEvent?: SubRunWorkerOptions['onEvent']
    private readonly onSettled?: SubRunWorkerOptions['onSettled']
    private readonly maxParallelCalls: number

    private readonly children = new Map<string, ChildState>()
    /** Runs this worker already drove to a terminal state. */
    private readonly finished = new Set<string>()
    private stopped = false
    /** Counting semaphore: frontend tool executions in flight. */
    private runningCalls = 0
    private readonly callWaiters: Array<() => void> = []

    constructor(options: SubRunWorkerOptions) {
        this.client = options.client
        this.executeTool = options.executeTool
        this.store = options.store
        this.onEvent = options.onEvent
        this.onSettled = options.onSettled
        this.maxParallelCalls = Math.max(1, options.maxParallelCalls ?? DEFAULT_MAX_PARALLEL_CALLS)
    }

    /** Child run ids currently driven by this worker. */
    get activeRunIds(): string[] {
        return [...this.children.keys()]
    }

    isDriving(runId: string): boolean {
        return this.children.has(runId)
    }

    /**
     * Start driving a child run (idempotent).
     *
     * A run this worker already saw reach a terminal state is never driven
     * again: re-attaching replays its whole log from seq 0, and the parent's
     * `sub.completed` is withheld while it is parked on other children — so a
     * settled child would otherwise be replayed (and re-settled) on every event
     * of every other child, burning the child stream slots the live runs need.
     */
    attach(runId: string): void {
        if (this.stopped || this.finished.has(runId) || this.children.has(runId)) return
        const state: ChildState = {
            runId,
            lastSeq: 0,
            knownCalls: new Map(),
            queue: [],
            paused: false,
            resumePayload: null,
            resumeAttempts: 0,
            suspendSeq: 0,
            parked: false,
            parkChecks: 0,
            abort: new AbortController(),
            settled: false,
            streamRetry: 0,
        }
        this.children.set(runId, state)
        void this.drive(state)
    }

    /** Stop driving a child (its run keeps running server-side). */
    detach(runId: string, settlement: SubRunSettlement = 'detached'): void {
        const state = this.children.get(runId)
        if (!state) return
        state.settled = true
        state.abort.abort()
        this.children.delete(runId)
        this.onSettled?.(runId, settlement)
    }

    /** Stop driving every child, but stay usable for a later run. */
    stopAll(): void {
        for (const runId of [...this.children.keys()]) {
            this.detach(runId, 'detached')
        }
        this.callWaiters.splice(0).forEach(resolve => resolve())
    }

    /** Permanent teardown (hook unmount): no further attaches are honoured. */
    dispose(): void {
        this.stopped = true
        this.stopAll()
    }

    // ==================== driving one child ====================

    private async drive(state: ChildState): Promise<void> {
        while (!state.settled && !this.stopped) {
            // Serve first: a pause (or a watchdog re-check) must not wait behind
            // another stream round-trip — the parked run's stream stays open, so
            // consuming it first would block the check forever.
            if (state.paused) {
                state.paused = false
                await this.servePending(state)
                if (state.settled || this.stopped) return
                continue
            }
            if (state.parked && !state.resumePayload) {
                // The server says it is waiting for this child's frontend calls
                // but we have nothing to send: re-derive the work from its run
                // view instead of tailing a silent stream. This is what makes a
                // race in the pause window self-healing rather than a
                // `tool_timeout` ten minutes later.
                await this.parkWait(state)
                if (state.settled || this.stopped) return
                state.paused = true
                continue
            }

            let cut = false
            try {
                await this.consumeOnce(state)
                state.streamRetry = 0
            } catch {
                if (state.settled || this.stopped) return
                cut = true
            }
            if (state.settled || this.stopped) return
            if (state.paused || state.resumePayload) continue

            // Stream ended without a terminal event (proxy cut, dead socket).
            state.streamRetry = cut ? state.streamRetry + 1 : 1
            const delay = Math.min(STREAM_RETRY_MAX_MS, STREAM_RETRY_BASE_MS * 2 ** (state.streamRetry - 1))
            await new Promise(resolve => setTimeout(resolve, delay))
        }
    }

    /**
     * Backoff between parked-children run-view re-checks. Never gives up: the
     * only alternatives are a spinner until the server's tool timeout, and the
     * server emits no further request for a batch it is still waiting on.
     */
    private async parkWait(state: ChildState): Promise<void> {
        state.parkChecks += 1
        const delay = Math.min(
            PARK_RECHECK_MAX_MS,
            PARK_RECHECK_BASE_MS * 2 ** Math.min(state.parkChecks - 1, 5)
        )
        if (state.parkChecks === 1 || state.parkChecks % 10 === 0) {
            console.warn(
                `[agent] 子 agent ${state.runId} 仍在前端工具等待中，重新检查运行状态`
                + `（第 ${state.parkChecks} 次，${Math.round(delay / 1000)}s 后）`
            )
        }
        await new Promise(resolve => setTimeout(resolve, delay))
    }

    /**
     * One stream round-trip: resume when a payload is queued, otherwise tail the
     * child's log. Returns on terminal, on pause, or when the stream ends.
     *
     * The queued payload is consumed ONLY once the server has accepted the
     * resume (response headers arrived). A resume that fails in flight used to
     * clear the payload first and then silently degrade to a tail-only stream:
     * the child stayed parked in WAITING_TOOLS server-side forever, its tool
     * calls kept spinning in the UI, and a parent parked in `wait_for_children`
     * never returned. Children run in parallel, so a burst of simultaneous
     * resumes (each an SSE connection on top of the live tails) is exactly when
     * such a failure happens.
     */
    private async consumeOnce(state: ChildState): Promise<void> {
        const payload = state.resumePayload
        // Delegated runs are 'child' streams: the stream budget lets the
        // conversation through even when many sub-runs are live.
        const streamOptions: AgentStreamOptions = { priority: 'child' }
        let events: AsyncGenerator<AgentEvent>
        if (payload) {
            try {
                events = await this.client.resume(
                    state.runId, payload, state.lastSeq, state.abort.signal, streamOptions
                )
            } catch (error) {
                // Keep the results queued and retry: the run cannot move on
                // without them and nobody else can deliver them.
                await this.retryResume(state, error)
                return
            }
            state.resumePayload = null
            state.resumeAttempts = 0
            // Accepted: the server is no longer waiting on our queued batch (it
            // re-parks, with a fresh suspend event, for the next one).
            state.parked = false
            state.parkChecks = 0
        } else {
            events = this.client.streamEvents(state.runId, state.lastSeq, state.abort.signal, streamOptions)
        }

        for await (const event of events) {
            if (state.settled || this.stopped) return
            this.handleEvent(state, event)
            if (state.settled || state.paused || state.resumePayload) return
        }
    }

    /**
     * Pace the retry of a failed resume. The payload stays queued, so `drive()`
     * re-attempts it after this backoff; a permanent failure therefore keeps
     * retrying (loudly) rather than dropping the child's results on the floor.
     */
    private async retryResume(state: ChildState, error: unknown): Promise<void> {
        state.resumeAttempts += 1
        const message = error instanceof Error ? error.message : String(error)
        const delay = Math.min(RESUME_RETRY_MAX_MS, RESUME_RETRY_BASE_MS * 2 ** (state.resumeAttempts - 1))
        console.warn(
            `[agent] 子 agent 工具结果提交失败（run ${state.runId}，第 ${state.resumeAttempts} 次，`
            + `${Math.round(delay / 1000)}s 后重试）: ${message}`
        )
        await new Promise(resolve => setTimeout(resolve, delay))
    }

    private handleEvent(state: ChildState, event: AgentEvent): void {
        if (event.seq > state.lastSeq) state.lastSeq = event.seq
        this.onEvent?.(state.runId, event)

        switch (event.type) {
            case 'tool.requested':
                state.knownCalls.set(event.callId, { tool: event.tool, args: safeParse(event.args) })
                if (!state.queue.includes(event.callId)) state.queue.push(event.callId)
                // The request itself is an announcement: an older run view cannot
                // prune this call (the backend publishes the request before the
                // run state it belongs to), and if the following suspend frame is
                // lost the watchdog still drives the call from the run view.
                state.suspendSeq = Math.max(state.suspendSeq, event.seq)
                state.parked = true
                state.parkChecks = 0
                break
            case 'sub.spawned':
                // Nested delegation: grandchildren are ordinary child runs on
                // the backend, but the client must drive them too or their
                // frontend tools never execute (they would stall until timeout).
                this.attach(event.subRunId)
                break
            case 'run.suspended': {
                if (event.reason === 'waiting_tools') {
                    const ids = event.pendingCallIds ?? [...state.knownCalls.keys()]
                    for (const callId of ids) {
                        if (!state.queue.includes(callId)) state.queue.push(callId)
                    }
                    // Remember how new the pause is: a run view older than this
                    // seq may legitimately not list these calls yet (the backend
                    // publishes the pause before its state does), so it must not
                    // be used to prune them.
                    state.suspendSeq = Math.max(state.suspendSeq, event.seq)
                    state.parked = true
                    state.parkChecks = 0
                    if (ids.length > 0 || state.queue.length > 0) state.paused = true
                } else if (event.reason === 'budget') {
                    // Children have their own budget; nobody else will grant it.
                    state.resumePayload = { action: 'continue' }
                }
                break
            }
            case 'run.completed':
                this.settle(state, 'completed')
                break
            case 'run.failed':
                this.settle(state, 'failed')
                break
            case 'run.cancelled':
                this.settle(state, 'cancelled')
                break
            default:
                break
        }
    }

    private settle(state: ChildState, settlement: SubRunSettlement): void {
        if (state.settled) return
        state.settled = true
        state.abort.abort()
        this.children.delete(state.runId)
        this.finished.add(state.runId)
        this.onSettled?.(state.runId, settlement)
    }

    /**
     * Execute this child's outstanding calls, then queue its resume payload.
     *
     * The run view is used to prune HISTORICAL calls (a re-attached child
     * replays its whole log, including suspends for calls that were answered
     * long ago), but it is only trusted while it is at least as new as the
     * suspend that queued them: the backend emits `run.suspended` BEFORE the new
     * pending list is durably visible, so a racing view legitimately misses the
     * very calls we were just asked to run. Dropping them (the old
     * `pendingIds.length === 0` early return, after `state.queue` had already
     * been cleared) stranded the child until its `tool_timeout`, while the UI
     * kept showing the call as running.
     */
    private async servePending(state: ChildState): Promise<void> {
        if (state.settled || this.stopped || state.resumePayload) return
        const queued = [...state.queue]
        const view = await this.fetchPendingView(state)
        if (view) {
            // A call we never saw on the stream (lost frame, compacted replay)
            // can only be executed if its tool + args come from the view.
            for (const [callId, call] of view.calls) {
                if (!state.knownCalls.has(callId)) state.knownCalls.set(callId, call)
            }
        }
        const trusted = view !== null
            && (view.terminal || state.suspendSeq === 0 || view.lastSeq >= state.suspendSeq)

        const targets: string[] = []
        for (const callId of queued) {
            // Untrusted view → the event is the only authority: run what we were
            // told to run. Trusted view → keep only calls it still waits for.
            if (!trusted || view!.callIds.has(callId)) targets.push(callId)
        }
        if (trusted) {
            for (const callId of view!.callIds) {
                if (!targets.includes(callId)) targets.push(callId)
            }
        }
        if (targets.length === 0) {
            // Everything queued was provably already answered: drop those ids.
            // Only stop watching when the view also says the run is no longer
            // parked on tools — a WAITING_TOOLS run with an empty list is a
            // contradiction we keep re-checking rather than trust.
            if (trusted) {
                state.queue = []
                state.parked = view!.status === 'WAITING_TOOLS' || view!.status === 'SUSPENDED'
                if (!state.parked) state.parkChecks = 0
            }
            return
        }
        state.queue = queued.filter(callId => !targets.includes(callId))

        const toolResults: Array<{ callId: string; ok: boolean; result?: unknown; error?: string }> = []
        for (const callId of targets) {
            if (state.settled || this.stopped) return
            const call = state.knownCalls.get(callId)
            if (!call || !call.tool) {
                toolResults.push({ callId, ok: false, error: '无法恢复该子 agent 的前端工具调用: ' + callId })
                continue
            }
            const outcome = await this.executeWithLimit(state.runId, callId, call)
            state.knownCalls.delete(callId)
            toolResults.push({ callId, ok: outcome.ok, result: outcome.result, error: outcome.error })
        }
        if (state.settled || this.stopped) return
        state.resumePayload = { action: 'tool_results', toolResults }
    }

    /**
     * The child's outstanding frontend calls plus the freshness of the view that
     * reports them (status/lastSeq decide whether it can be trusted to prune).
     */
    private async fetchPendingView(state: ChildState): Promise<{
        callIds: Set<string>
        calls: Map<string, ChildCall>
        lastSeq: number
        status: RunView['status']
        terminal: boolean
    } | null> {
        try {
            const view = await this.client.getRun(state.runId)
            const calls = new Map<string, ChildCall>()
            for (const pending of view.pendingTools ?? []) {
                calls.set(pending.callId, { tool: pending.tool, args: safeParse(pending.argsJson) })
            }
            const lastSeq = Number(view.lastSeq ?? 0)
            return {
                callIds: new Set(calls.keys()),
                calls,
                lastSeq: Number.isFinite(lastSeq) ? lastSeq : 0,
                status: view.status,
                terminal: view.status === 'COMPLETED'
                    || view.status === 'FAILED'
                    || view.status === 'CANCELLED',
            }
        } catch {
            return null
        }
    }

    private async executeWithLimit(runId: string, callId: string, call: ChildCall): Promise<ToolExecutionResult> {
        await this.acquireSlot()
        try {
            const saved = this.store?.loadToolResult(runId, callId)
            if (saved?.status === 'started') {
                return {
                    ok: false,
                    error: '上次工具执行在完成前中断，为避免重复修改已停止自动重试',
                }
            }
            if (saved) {
                return { ok: saved.ok === true, result: saved.result, error: saved.error }
            }
            this.store?.saveToolStarted(runId, callId)
            const outcome = await this.executeTool(callId, call.tool, call.args, runId)
            this.store?.saveToolResult(runId, callId, outcome)
            return outcome
        } catch (error: any) {
            return { ok: false, error: error?.message ?? String(error) }
        } finally {
            this.releaseSlot()
        }
    }

    private acquireSlot(): Promise<void> {
        if (this.runningCalls < this.maxParallelCalls) {
            this.runningCalls += 1
            return Promise.resolve()
        }
        return new Promise<void>(resolve => {
            this.callWaiters.push(() => {
                this.runningCalls += 1
                resolve()
            })
        })
    }

    private releaseSlot(): void {
        this.runningCalls = Math.max(0, this.runningCalls - 1)
        const next = this.callWaiters.shift()
        if (next) next()
    }
}

function safeParse(argsJson: string): Record<string, any> {
    if (!argsJson) return {}
    try {
        const parsed = JSON.parse(argsJson)
        return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
        return {}
    }
}
