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
import type { RunStore } from './run-store'
import type { AgentEvent, ResumePayload, RunView } from './types'

/**
 * The slice of `AgentClient` this worker needs. Declared structurally so the
 * module stays free of the HTTP/session layer (the run-observer check compiles
 * and runs it in isolation).
 */
export interface SubRunClient {
    streamEvents(runId: string, afterSeq?: number, signal?: AbortSignal): AsyncGenerator<AgentEvent>
    resume(
        runId: string,
        payload: ResumePayload,
        afterSeq?: number,
        signal?: AbortSignal
    ): Promise<AsyncGenerator<AgentEvent>>
    getRun(runId: string): Promise<RunView>
}

/** Simultaneous frontend tool executions across all children. */
export const DEFAULT_MAX_PARALLEL_CALLS = 4

/** Reconnect backoff for a child stream cut without a terminal event. */
const STREAM_RETRY_BASE_MS = 500
const STREAM_RETRY_MAX_MS = 8_000

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
    store?: RunStore
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
    abort: AbortController
    settled: boolean
    streamRetry: number
}

export class SubRunWorker {
    private readonly client: SubRunClient
    private readonly executeTool: SubRunWorkerOptions['executeTool']
    private readonly store?: RunStore
    private readonly onEvent?: SubRunWorkerOptions['onEvent']
    private readonly onSettled?: SubRunWorkerOptions['onSettled']
    private readonly maxParallelCalls: number

    private readonly children = new Map<string, ChildState>()
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

    /** Start driving a child run (idempotent). */
    attach(runId: string): void {
        if (this.stopped || this.children.has(runId)) return
        const state: ChildState = {
            runId,
            lastSeq: 0,
            knownCalls: new Map(),
            queue: [],
            paused: false,
            resumePayload: null,
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
            let cut = false
            try {
                await this.consumeOnce(state)
                state.streamRetry = 0
            } catch {
                if (state.settled || this.stopped) return
                cut = true
            }
            if (state.settled || this.stopped) return

            if (state.paused) {
                state.paused = false
                await this.servePending(state)
                if (state.settled || this.stopped) return
                continue
            }
            // Stream ended without a terminal event (proxy cut, dead socket).
            state.streamRetry = cut ? state.streamRetry + 1 : 1
            const delay = Math.min(STREAM_RETRY_MAX_MS, STREAM_RETRY_BASE_MS * 2 ** (state.streamRetry - 1))
            await new Promise(resolve => setTimeout(resolve, delay))
        }
    }

    /**
     * One stream round-trip: resume when a payload is queued, otherwise tail the
     * child's log. Returns on terminal, on pause, or when the stream ends.
     */
    private async consumeOnce(state: ChildState): Promise<void> {
        const payload = state.resumePayload
        state.resumePayload = null
        const events = payload
            ? await this.client.resume(state.runId, payload, state.lastSeq, state.abort.signal)
            : this.client.streamEvents(state.runId, state.lastSeq, state.abort.signal)

        for await (const event of events) {
            if (state.settled || this.stopped) return
            this.handleEvent(state, event)
            if (state.settled || state.paused || state.resumePayload) return
        }
    }

    private handleEvent(state: ChildState, event: AgentEvent): void {
        if (event.seq > state.lastSeq) state.lastSeq = event.seq
        this.onEvent?.(state.runId, event)

        switch (event.type) {
            case 'tool.requested':
                state.knownCalls.set(event.callId, { tool: event.tool, args: safeParse(event.args) })
                if (!state.queue.includes(event.callId)) state.queue.push(event.callId)
                break
            case 'run.suspended': {
                if (event.reason === 'waiting_tools') {
                    const ids = event.pendingCallIds ?? [...state.knownCalls.keys()]
                    for (const callId of ids) {
                        if (!state.queue.includes(callId)) state.queue.push(callId)
                    }
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
        this.onSettled?.(state.runId, settlement)
    }

    /** Execute this child's outstanding calls, then queue its resume payload. */
    private async servePending(state: ChildState): Promise<void> {
        if (state.settled || this.stopped || state.resumePayload) return
        const ids = [...state.queue]
        state.queue = []
        await this.ensureCallsKnown(state, ids)

        const toolResults: Array<{ callId: string; ok: boolean; result?: unknown; error?: string }> = []
        for (const callId of ids) {
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

    /** Re-attached children: fetch outstanding calls from the run view. */
    private async ensureCallsKnown(state: ChildState, ids: string[]): Promise<void> {
        if (ids.every(callId => state.knownCalls.has(callId))) return
        try {
            const view = await this.client.getRun(state.runId)
            for (const pending of view.pendingTools ?? []) {
                if (!state.knownCalls.has(pending.callId)) {
                    state.knownCalls.set(pending.callId, {
                        tool: pending.tool,
                        args: safeParse(pending.argsJson),
                    })
                }
            }
        } catch {
            // Unknown calls are answered with an explicit error in servePending.
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
