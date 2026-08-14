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

const DEFAULT_V2_API_BASE = '/api/knowledge-agent/api/v2/agent'

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

    constructor(options?: V2RuntimeOptions) {
        this.apiBase = options?.apiBase || DEFAULT_V2_API_BASE
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
        if (sessionId) body.sessionId = sessionId
        if (conversationId) body.conversationId = conversationId
        if (mode) body.mode = mode
        if (input.agentId != null) body.agentId = input.agentId
        if (catalog.skills?.length > 0) body.skills = catalog.skills
        if (catalog.tools?.length > 0) body.tools = catalog.tools
        if (catalog.version) body.capabilitiesVersion = catalog.version

        // 1. Create the task (returns immediately).
        const taskId = await this.createTask(body, signal)

        // 2. Stream the task's events (replay + live).
        const stream = await this.openTaskEvents(taskId, 0, signal)
        yield* this.driveLoop(taskId, stream, resolveTool, onToolExecution, signal)
    }

    /**
     * Continue a task suspended on budget exhaustion: the backend resets the
     * iteration counter and resumes the same task.
     */
    async *continueSession(input: ContinueSessionInput): AsyncGenerator<HarnessEvent> {
        const stream = await this.postResume(
            { taskId: input.taskId, action: 'continue' }, input.signal)
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
            const toolResults: ToolResultPayload[] = []
            for (const pt of state.pendingTools) {
                const toolName = pt.toolName
                const args = parseToolArgs(pt.arguments || '{}', toolName)
                yield { type: 'tool-call-start', id: pt.toolCallId, toolName, args }

                const startTime = Date.now()
                const toolDef = resolveTool(toolName)
                let toolResult: string
                let endEvent: HarnessEvent
                if (toolDef?.execute) {
                    try {
                        const rawResult = await toolDef.execute(args)
                        toolResult = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult)
                        endEvent = {
                            type: 'tool-call-end',
                            id: pt.toolCallId,
                            toolName,
                            result: rawResult,
                            durationMs: Date.now() - startTime,
                        }
                    } catch (err: any) {
                        toolResult = `Error: ${err?.message || err}`
                        endEvent = {
                            type: 'tool-call-end',
                            id: pt.toolCallId,
                            toolName,
                            error: err?.message || String(err),
                            durationMs: Date.now() - startTime,
                        }
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
     * tools dispatched by the backend, resume with their results, repeat.
     */
    private async *driveLoop(
        taskId: string,
        initialStream: Response,
        resolveTool: (name: string) => ToolDefinition | undefined,
        onToolExecution: OnToolExecution | undefined,
        signal?: AbortSignal,
    ): AsyncGenerator<HarnessEvent> {
        let stream = initialStream

        while (true) {
            const result = yield* this.consumeStream(
                stream, resolveTool, onToolExecution, signal
            )

            if (!result.hasPendingFrontendTools) {
                return
            }

            const toolResults: ToolResultPayload[] = []
            for (const pendingTool of result.pendingFrontendTools) {
                const toolName = pendingTool.name
                const args = parseToolArgs(pendingTool.arguments, toolName)

                yield { type: 'tool-call-start', id: pendingTool.id, toolName, args }

                const startTime = Date.now()
                const toolDef = resolveTool(toolName)
                let toolResult: string
                let endEvent: HarnessEvent

                if (toolDef?.execute) {
                    try {
                        const rawResult = await toolDef.execute(args)
                        toolResult = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult)
                        endEvent = {
                            type: 'tool-call-end',
                            id: pendingTool.id,
                            toolName,
                            result: rawResult,
                            durationMs: Date.now() - startTime,
                        }
                    } catch (err: any) {
                        toolResult = `Error: ${err?.message || err}`
                        endEvent = {
                            type: 'tool-call-end',
                            id: pendingTool.id,
                            toolName,
                            error: err?.message || String(err),
                            durationMs: Date.now() - startTime,
                        }
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
                toolResults.push({
                    toolCallId: pendingTool.id,
                    toolName,
                    result: toolResult,
                    success: !('error' in endEvent && endEvent.error != null),
                })
            }

            stream = await this.postResume({ taskId, toolResults }, signal)
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
            return { hasPendingFrontendTools: false, pendingFrontendTools: [] }
        }

        const pendingFrontendTools: PendingFrontendTool[] = []
        let currentTaskId: string | undefined
        let currentSessionId: string | undefined

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let currentEvent = ''
        let currentData = ''

        try {
            while (true) {
                if (signal?.aborted) {
                    reader.cancel()
                    return { hasPendingFrontendTools: false, pendingFrontendTools: [] }
                }

                const { done, value } = await reader.read()
                if (done) break

                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n')
                buffer = lines.pop()!

                for (const line of lines) {
                    if (line === '' || line === '\r') {
                        if (currentData) {
                            const events = this.processV2Event(
                                currentEvent, currentData, pendingFrontendTools)
                            for (const ev of events) {
                                if (ev.type === 'session') {
                                    currentTaskId = ev.taskId || currentTaskId
                                    currentSessionId = ev.sessionId || currentSessionId
                                }
                                yield ev
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
                const events = this.processV2Event(currentEvent, currentData, pendingFrontendTools)
                for (const ev of events) {
                    if (ev.type === 'session') {
                        currentTaskId = ev.taskId || currentTaskId
                        currentSessionId = ev.sessionId || currentSessionId
                    }
                    yield ev
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
        }
    }

    /**
     * Process a single V2 named event and produce HarnessEvents.
     */
    private processV2Event(
        eventName: string,
        dataStr: string,
        pendingFrontendTools: PendingFrontendTool[],
    ): HarnessEvent[] {
        let data: any
        try {
            data = JSON.parse(dataStr)
        } catch {
            return []
        }

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
                    pendingFrontendTools.push({
                        id: data.toolCallId,
                        name: data.toolName,
                        arguments: typeof data.arguments === 'string'
                            ? data.arguments
                            : JSON.stringify(data.arguments || {}),
                    })
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
                            usage: data.usage ? {
                                promptTokens: data.usage.prompt ?? 0,
                                completionTokens: data.usage.completion ?? 0,
                            } : undefined,
                        },
                    ]
                }
                return [{
                    type: 'finish',
                    finishReason,
                    usage: data.usage ? {
                        promptTokens: data.usage.prompt ?? 0,
                        completionTokens: data.usage.completion ?? 0,
                    } : undefined,
                }]
            }

            case 'session.failed':
                return [{
                    type: 'error',
                    error: data.errorMessage || 'Agent session failed',
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
        body: { taskId: string; toolResults?: ToolResultPayload[]; action?: string },
        signal?: AbortSignal
    ): Promise<Response> {
        const response = await authorizedFetch(`${this.apiBase}/tasks/${body.taskId}/resume`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                toolResults: body.toolResults,
                action: body.action,
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
}
