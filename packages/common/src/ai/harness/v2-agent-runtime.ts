/**
 * V2 Agent Runtime — async task model.
 *
 * The backend now exposes a long-running TASK API instead of a single
 * request-scoped SSE stream:
 *
 *   1. POST /api/v2/agent/tasks             → create + start, returns { taskId }
 *   2. GET  /api/v2/agent/tasks/{id}/events → replay + live SSE event stream
 *   3. POST /api/v2/agent/tasks/{id}/resume → submit frontend tool results /
 *                                             budget "continue", returns live stream
 *   4. POST /api/v2/agent/tasks/{id}/cancel → cancel
 *
 * The frontend only executes FRONTEND-dispatched tools (editor operations):
 * after the engine pauses (SUSPENDED/WAITING_TOOLS), we run them locally and
 * resume the task with their results. This yields the same HarnessEvent union
 * so the UI layer works unchanged.
 */

import type { ToolResultPayload } from '../chat-client/v2-client'
import type { HarnessEvent, HarnessRunInput } from './types'
import type { OnToolExecution, ToolDefinition } from '../types'
import { parseToolArgs } from './tool-loop'
import { authorizedFetch } from '../../utils/session'

const DEFAULT_V2_API_BASE = '/api/knowledge-agent/api/v3/agent'

/** Max automatic reconnects when a stream drops without a terminal event. */
const MAX_RECONNECTS = 5
/** Backoff base delay between reconnects (ms). */
const RECONNECT_BASE_DELAY_MS = 500
/** Hard cap on a single frontend tool execution — prevents a hung tool from stalling the agent loop. */
const TOOL_EXEC_TIMEOUT_MS = 120_000

export interface V2RuntimeOptions {
    /** V2 API base URL */
    apiBase?: string
}

/** Input for {@link V2AgentRuntime.continueSession} — budget-exhaustion resume. */
export interface ContinueSessionInput {
    /** The suspended task to grant a fresh iteration budget to. */
    taskId: string
    /** The suspended session (informational; the task is authoritative). */
    sessionId?: string
    /** Resolve a tool executor by name for frontend tool calls. */
    resolveTool: (name: string) => ToolDefinition | undefined
    /** Abort signal. */
    signal: AbortSignal
    /** Notification callback for the "tool not available" path. */
    onToolExecution?: OnToolExecution
}

/**
 * V2 Agent Runtime — server-driven, async task execution model.
 */
export class V2AgentRuntime {
    private apiBase: string
    /** The most recent task handle — used to cancel on stop / new turn. */
    private currentTaskId: string | null = null

    constructor(options?: V2RuntimeOptions) {
        this.apiBase = options?.apiBase || DEFAULT_V2_API_BASE
    }

    /** Cancel the currently-attached task (best-effort, never throws). */
    async cancelCurrent(signal?: AbortSignal): Promise<void> {
        const taskId = this.currentTaskId
        if (!taskId) return
        this.currentTaskId = null
        try {
            await this.cancelTask(taskId, signal)
        } catch {
            // best-effort — a finished/evicted task just reports "not found"
        }
    }

    /**
     * Run the V2 agent as an async task — yields HarnessEvents until the task
     * completes (or pauses for frontend tools, which the drive loop resolves).
     */
    async *run(input: HarnessRunInput): AsyncGenerator<HarnessEvent> {
        const {
            messages,
            model,
            catalog,
            resolveTool,
            signal,
            sessionId,
            conversationId,
            mode,
            onToolExecution,
        } = input

        const body: Record<string, any> = {
            model,
            messages,
            stream: true,
            temperature: input.temperature ?? 0.7,
        }

        if (input.maxTokens != null) body.maxTokens = input.maxTokens
        if (input.toolChoice) body.toolChoice = input.toolChoice
        if (sessionId) body.sessionId = sessionId
        if (conversationId) {
            body.conversationId = conversationId
        } else {
            // V3 requires a stable conversation key for single-active-task
            // enforcement. Fall back to the session id, then an instance UUID.
            body.conversationId = sessionId || `conv-${crypto.randomUUID()}`
        }
        if (mode) body.mode = mode
        if (input.agentId != null) body.agentId = input.agentId
        if (catalog.skills?.length > 0) body.skills = catalog.skills
        if (catalog.tools?.length > 0) body.tools = catalog.tools
        if (catalog.version) body.capabilitiesVersion = catalog.version

        // 1. Abandon any previous task this runtime owns and WAIT for the
        //    cancel to persist before creating the new one. Fire-and-forget
        //    cancellation raced the backend concurrent-task quota.
        if (this.currentTaskId) {
            const previous = this.currentTaskId
            this.currentTaskId = null
            await this.cancelTask(previous).catch(() => { /* best-effort */ })
        }
        const taskId = await this.createTask(body, signal)
        this.currentTaskId = taskId

        // 2. Stream the task's events (replay + live). If opening the stream
        //    fails after the task was created, cancel it so it does not keep
        //    running server-side without a client.
        try {
            const stream = await this.openTaskEvents(taskId, 0, signal)
            yield* this.driveLoop(taskId, stream, resolveTool, onToolExecution, signal)
        } catch (err) {
            if (this.currentTaskId === taskId) {
                this.cancelTask(taskId).catch(() => { /* best-effort */ })
            }
            throw err
        }
    }

    /**
     * Continue a task suspended on budget exhaustion: the backend resets the
     * iteration counter and resumes the same task.
     */
    async *continueSession(input: ContinueSessionInput): AsyncGenerator<HarnessEvent> {
        this.currentTaskId = input.taskId
        const stream = await this.postResume(
            { taskId: input.taskId, action: 'continue' }, input.signal)
        yield* this.driveLoop(
            input.taskId, stream, input.resolveTool, input.onToolExecution, input.signal)
    }

    /**
     * Respond to a proposed plan (plan-approval gate): approved flips the
     * backend session to EXECUTE and injects the (possibly edited) plan;
     * rejected stays in PLAN and hands the feedback back for re-planning.
     */
    async *resolvePlan(input: {
        taskId: string
        planId: string
        decision: 'approved' | 'rejected'
        planJson?: string
        feedback?: string
        resolveTool: (name: string) => ToolDefinition | undefined
        signal: AbortSignal
        onToolExecution?: OnToolExecution
    }): AsyncGenerator<HarnessEvent> {
        this.currentTaskId = input.taskId
        const stream = await this.postResume({
            taskId: input.taskId,
            planId: input.planId,
            decision: input.decision,
            planJson: input.planJson,
            feedback: input.feedback,
        }, input.signal)
        yield* this.driveLoop(
            input.taskId, stream, input.resolveTool, input.onToolExecution, input.signal)
    }

    /** Cancel a running/paused task. */
    async cancelTask(taskId: string, signal?: AbortSignal): Promise<void> {
        const response = await authorizedFetch(`${this.apiBase}/tasks/${taskId}/cancel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
            signal,
        })
        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error')
            throw new Error(`V2 cancel error (${response.status}): ${errorText}`)
        }
    }

    /**
     * Execute one frontend tool with a bounded timeout. The timer is always
     * cleared after the race; tools that ignore cancellation may still finish
     * in the background, but their late result can no longer leak into this
     * run and the agent is explicitly told the call timed out.
     */
    private async executeFrontendTool(
        toolDef: ToolDefinition,
        args: Record<string, unknown>,
        callId: string,
        toolName: string,
    ): Promise<{
        result: string
        rawResult?: unknown
        error?: string
        durationMs: number
    }> {
        const startTime = Date.now()
        let timeoutId: ReturnType<typeof setTimeout> | undefined
        try {
            const rawResult = await Promise.race([
                toolDef.execute(args, callId),
                new Promise<never>((_, reject) => {
                    timeoutId = setTimeout(
                        () => reject(new Error(`Tool "${toolName}" timed out after ${TOOL_EXEC_TIMEOUT_MS}ms`)),
                        TOOL_EXEC_TIMEOUT_MS,
                    )
                }),
            ])
            return {
                result: typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult),
                rawResult,
                durationMs: Date.now() - startTime,
            }
        } catch (err: any) {
            return {
                result: `Error: ${err?.message || err}`,
                error: err?.message || String(err),
                durationMs: Date.now() - startTime,
            }
        } finally {
            if (timeoutId !== undefined) clearTimeout(timeoutId)
        }
    }


    /**
     * Re-attach to an in-flight task after a page refresh / dropped connection.
     *
     * Fetches the task's reconnect state (status + accumulated text + last seq
     * + pending frontend tools), reconstructs the in-progress text, then either
     * resumes (WAITING_TOOLS), continues streaming from the checkpoint
     * (RUNNING), surfaces a budget "continue" (SUSPENDED), or finishes
     * (terminal).
     */
    async *attach(
        taskId: string,
        resolveTool: (name: string) => ToolDefinition | undefined,
        onToolExecution: OnToolExecution | undefined,
        signal?: AbortSignal,
    ): AsyncGenerator<HarnessEvent> {
        this.currentTaskId = taskId
        const state = await this.fetchState(taskId, signal)
        if (!state) {
            yield { type: 'error', error: 'Task not found' }
            return
        }

        yield {
            type: 'session',
            taskId,
            sessionId: state.sessionId,
            conversationId: state.conversationId,
        }

        // Reconstruct the already-streamed text from the server checkpoint.
        if (state.assistantText) {
            yield { type: 'text-delta', content: state.assistantText }
        }

        // Rebuild the sub-agent tree from the server-side summary. Without
        // this, refresh/attach would only see delegation events emitted after
        // the checkpoint and lose every earlier node/task/tool step.
        if (state.subAgents?.length) {
            yield {
                type: 'annotation',
                annotations: state.subAgents.flatMap(sa => this.subAgentStateAnnotations(sa)),
            }
        }

        const status = state.status

        if (status === 'COMPLETED') {
            yield { type: 'finish', finishReason: state.finishReason || 'stop' }
            return
        }
        if (status === 'FAILED') {
            yield { type: 'error', error: state.errorMessage || 'Task failed' }
            return
        }
        if (status === 'CANCELLED') {
            yield { type: 'finish', finishReason: 'cancelled' }
            return
        }
        if (status === 'SUSPENDED') {
            yield {
                type: 'annotation',
                annotations: [{
                    type: 'agent_suspended',
                    reason: state.finishReason || 'suspended:iteration_budget_exhausted',
                    sessionId: state.sessionId,
                    taskId,
                }],
            }
            yield { type: 'finish', finishReason: 'suspended' }
            return
        }
        if (status === 'WAITING_TOOLS' && state.pendingTools?.length) {
            // Execute the pending frontend tools, then resume the task.
            // Dedup by toolCallId (backend now dedups too; belt and braces).
            const toolResults: ToolResultPayload[] = []
            const seen = new Set<string>()
            for (const pt of state.pendingTools) {
                if (seen.has(pt.toolCallId)) continue
                seen.add(pt.toolCallId)
                const toolName = pt.toolName
                const args = parseToolArgs(pt.arguments || '{}', toolName)
                yield { type: 'tool-call-start', id: pt.toolCallId, toolName, args }

                const startTime = Date.now()
                const toolDef = resolveTool(toolName)
                let toolResult: string
                let endEvent: HarnessEvent
                if (toolDef?.execute) {
                    const outcome = await this.executeFrontendTool(toolDef, args, pt.toolCallId, toolName)
                    toolResult = outcome.result
                    endEvent = outcome.error
                        ? {
                            type: 'tool-call-end',
                            id: pt.toolCallId,
                            toolName,
                            error: outcome.error,
                            durationMs: outcome.durationMs,
                        }
                        : {
                            type: 'tool-call-end',
                            id: pt.toolCallId,
                            toolName,
                            result: outcome.rawResult,
                            durationMs: outcome.durationMs,
                        }
                } else {
                    const reason = `Tool "${toolName}" not available on frontend`
                    onToolExecution?.({ toolName, args, status: 'start', timestamp: startTime })
                    onToolExecution?.({ toolName, args, status: 'error', error: reason, timestamp: startTime, duration: 0 })
                    toolResult = reason
                    endEvent = {
                        type: 'tool-call-end',
                        id: pt.toolCallId,
                        toolName,
                        error: reason,
                        durationMs: 0,
                    }
                }
                yield endEvent
                toolResults.push({
                    toolCallId: pt.toolCallId,
                    toolName,
                    result: toolResult,
                    success: !('error' in endEvent && endEvent.error != null),
                })
            }

            const stream = await this.postResume({ taskId, toolResults }, signal)
            yield* this.driveLoop(taskId, stream, resolveTool, onToolExecution, signal)
            return
        }

        // RUNNING / QUEUED — stream only new events past the checkpoint.
        const stream = await this.openTaskEvents(taskId, state.lastSeq ?? 0, signal)
        yield* this.driveLoop(taskId, stream, resolveTool, onToolExecution, signal)
    }

    /**
     * Drive a task to completion: consume SSE events, execute any frontend
     * tools dispatched by the backend, resume with their results, and — when
     * the stream drops WITHOUT a terminal event — automatically re-attach from
     * the last seen seq (the backend task keeps running server-side).
     */
    private async *driveLoop(
        taskId: string,
        initialStream: Response,
        resolveTool: (name: string) => ToolDefinition | undefined,
        onToolExecution: OnToolExecution | undefined,
        signal?: AbortSignal,
    ): AsyncGenerator<HarnessEvent> {
        let stream = initialStream
        let reconnectAttempts = 0
        // Tool-call ids already executed in THIS drive session — a duplicated
        // dispatch event (or a re-delivered history) must never re-execute a
        // side-effecting tool (this loop used to re-run inserts forever).
        // Keep the prior RESULT as well: if a replay delivers the same
        // tool.dispatched event again, resume still needs a non-empty
        // toolResults payload or the backend rejects it with
        // "Task is waiting for frontend tool results".
        const executedToolResults = new Map<string, ToolResultPayload>()

        while (true) {
            const result = yield* this.consumeStream(
                stream, resolveTool, onToolExecution, signal
            )

            if (result.hasPendingFrontendTools) {
                reconnectAttempts = 0

                const toolResults: ToolResultPayload[] = []
                for (const pendingTool of result.pendingFrontendTools) {
                    const previous = executedToolResults.get(pendingTool.id)
                    if (previous) {
                        toolResults.push(previous)
                        continue // duplicate dispatch — reuse the prior result
                    }
                    const toolName = pendingTool.name
                    const args = parseToolArgs(pendingTool.arguments, toolName)

                    yield { type: 'tool-call-start', id: pendingTool.id, toolName, args }

                    const startTime = Date.now()
                    const toolDef = resolveTool(toolName)
                    let toolResult: string
                    let endEvent: HarnessEvent

                    if (toolDef?.execute) {
                        const outcome = await this.executeFrontendTool(toolDef, args, pendingTool.id, toolName)
                        toolResult = outcome.result
                        endEvent = outcome.error
                            ? {
                                type: 'tool-call-end',
                                id: pendingTool.id,
                                toolName,
                                error: outcome.error,
                                durationMs: outcome.durationMs,
                            }
                            : {
                                type: 'tool-call-end',
                                id: pendingTool.id,
                                toolName,
                                result: outcome.rawResult,
                                durationMs: outcome.durationMs,
                            }
                    } else {
                        const reason = `Tool "${toolName}" not available on frontend`
                        onToolExecution?.({ toolName, args, status: 'start', timestamp: startTime })
                        onToolExecution?.({ toolName, args, status: 'error', error: reason, timestamp: startTime, duration: 0 })
                        toolResult = reason
                        endEvent = {
                            type: 'tool-call-end',
                            id: pendingTool.id,
                            toolName,
                            error: reason,
                            durationMs: 0,
                        }
                    }

                    yield endEvent
                    const payload: ToolResultPayload = {
                        toolCallId: pendingTool.id,
                        toolName,
                        result: toolResult,
                        success: !('error' in endEvent && endEvent.error != null),
                    }
                    executedToolResults.set(pendingTool.id, payload)
                    toolResults.push(payload)
                }

                stream = await this.postResume({ taskId, toolResults }, signal)
                continue
            }

            // Terminal event seen (session.completed / session.failed) — done.
            if (result.sawCompletion) {
                return
            }

            // Stream dropped without a terminal event: the backend task keeps
            // running — re-attach from the last seen seq (no text duplication,
            // seq strictly greater). Bounded retries with backoff.
            if (signal?.aborted) {
                throw new DOMException('The agent stream was aborted', 'AbortError')
            }
            if (reconnectAttempts >= MAX_RECONNECTS) {
                throw new Error('Agent stream reconnect attempts exhausted')
            }
            reconnectAttempts++
            await new Promise(r => setTimeout(r, RECONNECT_BASE_DELAY_MS * reconnectAttempts))
            stream = await this.openTaskEvents(taskId, result.lastSeq, signal)
        }
    }

    /**
     * Consume a V2 SSE stream, yielding HarnessEvents.
     * Returns metadata about how the stream ended (normal finish vs frontend tool dispatch).
     */
    private async *consumeStream(
        response: Response,
        resolveTool: (name: string) => ToolDefinition | undefined,
        onToolExecution: OnToolExecution | undefined,
        signal?: AbortSignal,
    ): AsyncGenerator<HarnessEvent, StreamResult> {
        if (!response.body) {
            yield { type: 'error', error: 'Response body is null' }
            return { hasPendingFrontendTools: false, pendingFrontendTools: [], sawCompletion: false, lastSeq: 0 }
        }

        const pendingFrontendTools: PendingFrontendTool[] = []
        let currentTaskId: string | undefined
        let currentSessionId: string | undefined
        let sawCompletion = false
        let lastSeq = 0

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let currentEvent = ''
        let currentData = ''

        try {
            while (true) {
                if (signal?.aborted) {
                    reader.cancel()
                    return {
                        hasPendingFrontendTools: false,
                        pendingFrontendTools: [],
                        sawCompletion,
                        lastSeq,
                    }
                }

                const { done, value } = await reader.read()
                if (done) break

                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n')
                buffer = lines.pop()!

                for (const line of lines) {
                    if (line === '' || line === '\r') {
                        if (currentData) {
                            let data: any = null
                            try {
                                data = JSON.parse(currentData)
                            } catch {
                                data = null
                            }
                            if (data != null) {
                                if (typeof data.seq === 'number') {
                                    // Overlap guard: replay and live can share a
                                    // boundary event; never process a seq twice.
                                    if (data.seq <= lastSeq) {
                                        currentEvent = ''
                                        currentData = ''
                                        continue
                                    }
                                    lastSeq = data.seq
                                }
                                if (currentEvent === 'session.completed'
                                        || currentEvent === 'session.failed') {
                                    sawCompletion = true
                                }
                                const events = this.processV2EventData(
                                    currentEvent, data, pendingFrontendTools)
                                for (const ev of events) {
                                    if (ev.type === 'session') {
                                        currentTaskId = ev.taskId || currentTaskId
                                        currentSessionId = ev.sessionId || currentSessionId
                                    }
                                    yield ev
                                }
                            }
                        }
                        currentEvent = ''
                        currentData = ''
                        continue
                    }

                    if (line.startsWith('event:')) {
                        currentEvent = line.slice(6).trim()
                    } else if (line.startsWith('data:')) {
                        const data = line.slice(5).trim()
                        if (data === '[DONE]') {
                            break
                        }
                        currentData += data
                    }
                }
            }

            if (currentData) {
                let data: any = null
                try {
                    data = JSON.parse(currentData)
                } catch {
                    data = null
                }
                if (data != null) {
                    if (typeof data.seq === 'number') lastSeq = data.seq
                    if (currentEvent === 'session.completed'
                            || currentEvent === 'session.failed') {
                        sawCompletion = true
                    }
                    const events = this.processV2EventData(currentEvent, data, pendingFrontendTools)
                    for (const ev of events) {
                        if (ev.type === 'session') {
                            currentTaskId = ev.taskId || currentTaskId
                            currentSessionId = ev.sessionId || currentSessionId
                        }
                        yield ev
                    }
                }
            }
        } finally {
            reader.releaseLock()
        }

        return {
            hasPendingFrontendTools: pendingFrontendTools.length > 0,
            pendingFrontendTools,
            taskId: currentTaskId,
            sessionId: currentSessionId,
            sawCompletion,
            lastSeq,
        }
    }

    /** Convert one server-side sub-agent summary row into UI annotations. */
    private subAgentStateAnnotations(sa: SubAgentStateData): any[] {
        const annotations: any[] = [{
            type: 'subagent_spawned',
            agentId: sa.agentId,
            parentAgentId: sa.parentAgentId,
            depth: sa.depth,
            agentName: sa.agentName,
            task: sa.task,
            description: sa.task,
        }]
        if (sa.reasoningContent) {
            annotations.push({
                type: 'subagent_reasoning',
                agentId: sa.agentId,
                parentAgentId: sa.parentAgentId,
                depth: sa.depth,
                content: sa.reasoningContent,
            })
        }
        if (sa.streamingContent) {
            annotations.push({
                type: 'subagent_output',
                agentId: sa.agentId,
                parentAgentId: sa.parentAgentId,
                depth: sa.depth,
                content: sa.streamingContent,
            })
        }
        for (const step of sa.steps || []) {
            annotations.push({
                type: 'subagent_tool_call',
                agentId: sa.agentId,
                parentAgentId: sa.parentAgentId,
                depth: sa.depth,
                toolCallId: step.id,
                toolName: step.toolName,
                args: step.args,
            })
            if (step.status && step.status !== 'running') {
                annotations.push({
                    type: 'subagent_tool_result',
                    agentId: sa.agentId,
                    parentAgentId: sa.parentAgentId,
                    depth: sa.depth,
                    toolCallId: step.id,
                    result: step.result,
                    error: step.error,
                })
            }
        }
        if (sa.status === 'completed' || sa.status === 'error') {
            annotations.push({
                type: 'subagent_finish',
                agentId: sa.agentId,
                parentAgentId: sa.parentAgentId,
                depth: sa.depth,
                status: sa.status,
                finishReason: sa.status === 'error' ? 'error' : 'stop',
                error: sa.error,
                usage: sa.promptTokens != null || sa.completionTokens != null
                    ? { promptTokens: sa.promptTokens || 0, completionTokens: sa.completionTokens || 0 }
                    : undefined,
            })
        } else if (sa.status === 'running') {
            annotations.push({
                type: 'subagent_status',
                agentId: sa.agentId,
                parentAgentId: sa.parentAgentId,
                depth: sa.depth,
                status: 'running',
            })
        }
        return annotations
    }

    /**
     * Process a single parsed V2 named event and produce HarnessEvents.
     */
    private processV2EventData(
        eventName: string,
        data: any,
        pendingFrontendTools: PendingFrontendTool[],
    ): HarnessEvent[] {
        switch (eventName) {
            case 'session.created':
                return [{
                    type: 'session',
                    taskId: data.taskId,
                    sessionId: data.sessionId,
                    conversationId: data.conversationId,
                }]

            case 'think.start':
                return [{
                    type: 'annotation',
                    annotations: [{
                        type: 'agent_status',
                        phase: 'thinking',
                        iteration: data.iteration,
                    }],
                }]

            case 'think.delta':
                if (data.type === 'reasoning') {
                    return [{ type: 'reasoning-delta', content: data.content || '' }]
                }
                return [{ type: 'text-delta', content: data.content || '' }]

            case 'think.end':
                return []

            case 'tool.dispatched':
                if (data.location === 'FRONTEND') {
                    // Dedup by toolCallId: a duplicated dispatch event must not
                    // queue the same side-effecting tool twice.
                    if (!pendingFrontendTools.some(pt => pt.id === data.toolCallId)) {
                        pendingFrontendTools.push({
                            id: data.toolCallId,
                            name: data.toolName,
                            arguments: typeof data.arguments === 'string'
                                ? data.arguments
                                : JSON.stringify(data.arguments || {}),
                        })
                    }
                    return [{
                        type: 'annotation',
                        annotations: [{
                            type: 'agent_status',
                            phase: 'tool_calling',
                            tool: data.toolName,
                        }],
                    }]
                }
                return [{
                    type: 'annotation',
                    annotations: [{
                        type: 'agent_status',
                        phase: 'tool_calling',
                        tool: data.toolName,
                    }],
                }]

            case 'tool.completed':
            case 'tool.failed':
                return [{
                    type: 'annotation',
                    annotations: [{ type: 'agent_status', phase: 'thinking' }],
                }]

            case 'session.completed': {
                const finishReason: string = data.finishReason || 'stop'
                if (finishReason.startsWith('suspended')) {
                    if (pendingFrontendTools.length > 0) {
                        return []
                    }
                    return [
                        {
                            type: 'annotation',
                            annotations: [{
                                type: 'agent_suspended',
                                reason: finishReason,
                                sessionId: data.sessionId,
                                taskId: data.taskId,
                            }],
                        },
                        {
                            type: 'finish',
                            finishReason: 'suspended',
                            usage: mapUsage(data.usage),
                        },
                    ]
                }
                return [{
                    type: 'finish',
                    finishReason,
                    usage: mapUsage(data.usage),
                }]
            }

            case 'session.failed':
                return [{
                    type: 'error',
                    error: data.errorMessage || 'Agent session failed',
                    code: data.errorCode as string | undefined,
                    retriable: data.retriable as boolean | undefined,
                }]

            case 'agent.spawned':
                return [{
                    type: 'annotation',
                    annotations: [{
                        type: 'subagent_spawned',
                        agentId: data.agentId || data.taskId,
                        parentAgentId: data.parentAgentId || data.sessionId,
                        depth: data.depth ?? 1,
                        agentName: data.agentName,
                        task: data.taskDescription,
                        description: data.taskDescription,
                    }],
                }]

            case 'agent.progress':
                return [{
                    type: 'annotation',
                    annotations: [{
                        type: 'subagent_status',
                        agentId: data.agentId || data.taskId,
                        parentAgentId: data.parentAgentId || data.sessionId,
                        depth: data.depth ?? 1,
                        status: 'running',
                        detail: data.status || `iteration ${data.iteration}`,
                    }],
                }]

            case 'agent.output':
                return [{
                    type: 'annotation',
                    annotations: [{
                        type: 'subagent_output',
                        agentId: data.agentId || data.taskId,
                        parentAgentId: data.parentAgentId || data.sessionId,
                        depth: data.depth ?? 1,
                        content: data.content || '',
                    }],
                }]

            case 'agent.reasoning':
                return [{
                    type: 'annotation',
                    annotations: [{
                        type: 'subagent_reasoning',
                        agentId: data.agentId || data.taskId,
                        parentAgentId: data.parentAgentId || data.sessionId,
                        depth: data.depth ?? 1,
                        content: data.content || '',
                    }],
                }]

            case 'agent.tool_call':
                return [{
                    type: 'annotation',
                    annotations: [{
                        type: 'subagent_tool_call',
                        agentId: data.agentId || data.taskId,
                        parentAgentId: data.parentAgentId || data.sessionId,
                        depth: data.depth ?? 1,
                        toolCallId: data.toolCallId,
                        toolName: data.toolName,
                        args: data.arguments,
                    }],
                }]

            case 'agent.tool_result':
                return [{
                    type: 'annotation',
                    annotations: [{
                        type: 'subagent_tool_result',
                        agentId: data.agentId || data.taskId,
                        parentAgentId: data.parentAgentId || data.sessionId,
                        depth: data.depth ?? 1,
                        toolCallId: data.toolCallId,
                        result: data.result,
                        error: data.error,
                    }],
                }]

            case 'agent.completed':
                return [{
                    type: 'annotation',
                    annotations: [{
                        type: 'subagent_finish',
                        agentId: data.agentId || data.taskId,
                        parentAgentId: data.parentAgentId || data.sessionId,
                        depth: data.depth ?? 1,
                        status: data.success ? 'completed' : 'error',
                        finishReason: data.success ? 'stop' : 'error',
                        result: data.result,
                        error: data.error || (data.success ? undefined : data.result),
                        durationMs: data.durationMs,
                        usage: data.usage ? {
                            promptTokens: data.usage.prompt || 0,
                            completionTokens: data.usage.completion || 0,
                        } : undefined,
                    }],
                }]

            case 'tool.progress':
                return [{
                    type: 'annotation',
                    annotations: [{
                        type: 'tool_progress',
                        toolCallId: data.toolCallId,
                        toolName: data.toolName,
                        progress: data.progress,
                        message: data.message,
                    }],
                }]

            case 'plan.proposed':
                return [{
                    type: 'annotation',
                    annotations: [{
                        type: 'plan_proposed',
                        plan: data.plan,
                        planId: data.planId,
                        sessionId: data.sessionId,
                    }],
                }]

            case 'plan.resolved':
                return [{
                    type: 'annotation',
                    annotations: [{
                        type: 'plan_resolved',
                        planId: data.planId,
                        decision: data.decision,
                        feedback: data.feedback,
                    }],
                }]

            case 'state.transition':
                return []

            default:
                return []
        }
    }

    /** POST /tasks → { taskId }. */
    private async createTask(body: Record<string, any>, signal?: AbortSignal): Promise<string> {
        const response = await authorizedFetch(`${this.apiBase}/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal,
        })

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error')
            throw new Error(`V2 task creation error (${response.status}): ${errorText}`)
        }

        const json = await response.json().catch(() => ({} as any))
        const taskId = json?.data?.taskId as string | undefined
        if (!taskId) {
            throw new Error('V2 task creation returned no taskId')
        }
        return taskId
    }

    /** GET /tasks/{id}/events?afterSeq=N → SSE stream (replay + live, from checkpoint). */
    private async openTaskEvents(taskId: string, afterSeq: number = 0, signal?: AbortSignal): Promise<Response> {
        const query = afterSeq > 0 ? `?afterSeq=${afterSeq}` : ''
        const response = await authorizedFetch(`${this.apiBase}/tasks/${taskId}/events${query}`, {
            method: 'GET',
            headers: {},
            signal,
        })

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error')
            throw new Error(`V2 task events error (${response.status}): ${errorText}`)
        }
        return response
    }

    /** GET /tasks/{id}/state → reconnect state (status + text + lastSeq + pending tools). */
    private async fetchState(taskId: string, signal?: AbortSignal): Promise<TaskStateData | null> {
        const response = await authorizedFetch(`${this.apiBase}/tasks/${taskId}/state`, {
            method: 'GET',
            headers: {},
            signal,
        })
        if (!response.ok) {
            return null
        }
        const json = await response.json().catch(() => ({} as any))
        return (json?.data as TaskStateData) || null
    }

    /** POST /tasks/{id}/resume → SSE continuation stream. */
    private async postResume(
        body: {
            taskId: string
            toolResults?: ToolResultPayload[]
            action?: string
            planId?: string
            decision?: string
            planJson?: string
            feedback?: string
        },
        signal?: AbortSignal
    ): Promise<Response> {
        const response = await authorizedFetch(`${this.apiBase}/tasks/${body.taskId}/resume`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                toolResults: body.toolResults,
                action: body.action,
                planId: body.planId,
                decision: body.decision,
                planJson: body.planJson,
                feedback: body.feedback,
            }),
            signal,
        })

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error')
            throw new Error(`V2 resume error (${response.status}): ${errorText}`)
        }
        return response
    }
}

// ---- Internal types ----

/** Normalize the backend usage payload (incl. context-cache accounting). */
function mapUsage(data: any): {
    promptTokens: number
    completionTokens: number
    cacheHitTokens?: number
    cacheMissTokens?: number
} | undefined {
    if (!data) return undefined
    const usage = {
        promptTokens: data.prompt ?? 0,
        completionTokens: data.completion ?? 0,
    } as {
        promptTokens: number
        completionTokens: number
        cacheHitTokens?: number
        cacheMissTokens?: number
    }
    if (typeof data.cacheHit === 'number') usage.cacheHitTokens = data.cacheHit
    if (typeof data.cacheMiss === 'number') usage.cacheMissTokens = data.cacheMiss
    return usage
}

interface PendingFrontendTool {
    id: string
    name: string
    arguments: string
}

interface StreamResult {
    hasPendingFrontendTools: boolean
    pendingFrontendTools: PendingFrontendTool[]
    taskId?: string
    sessionId?: string
    /** A session.completed / session.failed event was seen (stream ended properly). */
    sawCompletion: boolean
    /** Highest event seq seen — the reconnect checkpoint. */
    lastSeq: number
}

/** Reconnect state returned by GET /tasks/{id}/state. */
interface TaskStateData {
    taskId: string
    sessionId?: string
    conversationId?: string
    status: string
    finishReason?: string
    errorMessage?: string
    assistantText?: string
    lastSeq?: number
    pendingTools?: { toolCallId: string; toolName: string; arguments?: string }[]
    subAgents?: SubAgentStateData[]
}

/** Server-side sub-agent summary row returned by GET /tasks/{id}/state. */
interface SubAgentStateData {
    agentId: string
    parentAgentId?: string | null
    depth?: number
    agentName?: string
    task?: string
    status?: string
    error?: string
    streamingContent?: string
    reasoningContent?: string
    promptTokens?: number
    completionTokens?: number
    durationMs?: number
    steps?: {
        id: string
        toolName?: string
        args?: string
        status?: string
        result?: string
        error?: string
    }[]
}
