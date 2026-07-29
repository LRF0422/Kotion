/**
 * V2 Agent Runtime
 *
 * A fundamentally different execution model from V1:
 *
 * V1: Frontend drives the loop (request → response → execute tools → re-request)
 * V2: Backend drives the loop (one request → full execution stream including all iterations)
 *
 * The V2 runtime:
 * 1. Sends ONE POST to /api/v2/agent/chat
 * 2. Consumes the entire execution as a long-lived SSE stream
 * 3. The backend runs think→act→observe cycles internally
 * 4. Frontend only executes FRONTEND-dispatched tools (editor operations)
 * 5. After executing frontend tools, POSTs results to /resume to continue
 *
 * This yields the same HarnessEvent types so the UI layer works unchanged.
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
    /** The suspended session to grant a fresh iteration budget to. */
    sessionId: string
    /** Resolve a tool executor by name for frontend tool calls. */
    resolveTool: (name: string) => ToolDefinition | undefined
    /** Abort signal. */
    signal: AbortSignal
    /** Notification callback for the "tool not available" path. */
    onToolExecution?: OnToolExecution
}

/**
 * V2 Agent Runtime — server-driven execution model.
 *
 * Unlike the V1 harness which loops on the frontend side, this runtime
 * sends a single request and consumes the full execution stream. The
 * backend's AgentEngine handles all iterations internally.
 *
 * For FRONTEND tools (editor operations the backend can't execute):
 * - The engine enters SUSPENDED state and the stream pauses
 * - This runtime executes the tools locally
 * - POSTs results to /resume to continue the execution
 * - Consumes the resumed stream
 */
export class V2AgentRuntime {
    private apiBase: string

    constructor(options?: V2RuntimeOptions) {
        this.apiBase = options?.apiBase || DEFAULT_V2_API_BASE
    }

    /**
     * Run the V2 agent — yields HarnessEvents until execution completes.
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

        // Build request body
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

        // Initial request — starts the full execution stream
        const stream = await this.openStream(body, signal)
        yield* this.driveLoop(stream, resolveTool, onToolExecution, sessionId, signal)
    }

    /**
     * Continue a session suspended on budget exhaustion: the backend resets
     * the iteration counter and resumes the same session (compacting context
     * first if needed). Yields HarnessEvents exactly like {@link run}.
     */
    async *continueSession(input: ContinueSessionInput): AsyncGenerator<HarnessEvent> {
        const stream = await this.postResume(
            { sessionId: input.sessionId, action: 'continue' }, input.signal)
        yield* this.driveLoop(
            stream, input.resolveTool, input.onToolExecution, input.sessionId, input.signal)
    }

    /**
     * Drive a stream to completion: consume SSE events, execute any frontend
     * tools dispatched by the backend, resume with their results, repeat.
     */
    private async *driveLoop(
        initialStream: Response,
        resolveTool: (name: string) => ToolDefinition | undefined,
        onToolExecution: OnToolExecution | undefined,
        sessionId: string | undefined,
        signal?: AbortSignal,
    ): AsyncGenerator<HarnessEvent> {
        let currentSessionId = sessionId
        let stream = initialStream

        while (true) {
            const result = yield* this.consumeStream(
                stream, resolveTool, onToolExecution, currentSessionId, signal
            )

            // If the stream ended normally (no pending frontend tools), we're done
            if (!result.hasPendingFrontendTools) {
                return
            }

            // Execute frontend tools locally
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
                    // Tool not available on frontend
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

            // Resume the session with tool results
            currentSessionId = result.sessionId || currentSessionId
            stream = await this.postResume(
                { sessionId: currentSessionId!, toolResults }, signal)
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
        sessionId: string | undefined,
        signal?: AbortSignal,
    ): AsyncGenerator<HarnessEvent, StreamResult> {
        if (!response.body) {
            yield { type: 'error', error: 'Response body is null' }
            return { hasPendingFrontendTools: false, pendingFrontendTools: [], sessionId }
        }

        const pendingFrontendTools: PendingFrontendTool[] = []
        let currentSessionId = sessionId
        let suspended = false

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let currentEvent = ''
        let currentData = ''

        try {
            while (true) {
                if (signal?.aborted) {
                    reader.cancel()
                    return { hasPendingFrontendTools: false, pendingFrontendTools: [], sessionId: currentSessionId }
                }

                const { done, value } = await reader.read()
                if (done) break

                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n')
                buffer = lines.pop()!

                for (const line of lines) {
                    if (line === '' || line === '\r') {
                        // Event boundary
                        if (currentData) {
                            const events = this.processV2Event(
                                currentEvent, currentData,
                                pendingFrontendTools, currentSessionId
                            )
                            for (const ev of events) {
                                if (ev.type === 'session') {
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
                            // Stream terminated
                            break
                        }
                        currentData += data
                    }
                }
            }

            // Process remaining buffer
            if (currentData) {
                const events = this.processV2Event(
                    currentEvent, currentData,
                    pendingFrontendTools, currentSessionId
                )
                for (const ev of events) {
                    yield ev
                }
            }
        } finally {
            reader.releaseLock()
        }

        return {
            hasPendingFrontendTools: pendingFrontendTools.length > 0,
            pendingFrontendTools,
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
        sessionId: string | undefined,
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
                // Internal; no UI event needed
                return []

            case 'tool.dispatched':
                if (data.location === 'FRONTEND') {
                    // Collect for local execution after stream ends (SUSPENDED)
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
                // Backend tool — informational
                return [{
                    type: 'annotation',
                    annotations: [{
                        type: 'agent_status',
                        phase: 'tool_calling',
                        tool: data.toolName,
                    }],
                }]

            case 'tool.completed':
                return [{
                    type: 'annotation',
                    annotations: [{
                        type: 'agent_status',
                        phase: 'thinking',
                    }],
                }]

            case 'tool.failed':
                return [{
                    type: 'annotation',
                    annotations: [{
                        type: 'agent_status',
                        phase: 'thinking',
                    }],
                }]

            case 'session.completed': {
                const finishReason: string = data.finishReason || 'stop'
                if (finishReason.startsWith('suspended')) {
                    // Frontend tool dispatch — the drive loop resumes
                    // automatically, so no terminal event is surfaced.
                    if (pendingFrontendTools.length > 0) {
                        return []
                    }
                    // Budget exhaustion (iteration_budget_exhausted) or other
                    // suspension without pending tools: surface it so the UI
                    // can offer a "continue" action for this session.
                    return [
                        {
                            type: 'annotation',
                            annotations: [{
                                type: 'agent_suspended',
                                reason: finishReason,
                                sessionId,
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
                        parentAgentId: data.parentAgentId || sessionId,
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
                        parentAgentId: data.parentAgentId || sessionId,
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
                        parentAgentId: data.parentAgentId || sessionId,
                        depth: data.depth ?? 1,
                        status: data.success ? 'completed' : 'error',
                        finishReason: data.success ? 'stop' : 'error',
                    }],
                }]

            case 'state.transition':
                // Internal engine state — not surfaced
                return []

            default:
                return []
        }
    }

    /**
     * Open the initial SSE stream.
     */
    private async openStream(body: Record<string, any>, signal?: AbortSignal): Promise<Response> {
        const response = await authorizedFetch(`${this.apiBase}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            signal,
        })

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error')
            throw new Error(`V2 Agent API error (${response.status}): ${errorText}`)
        }

        return response
    }

    /**
     * POST to /chat/resume — either frontend tool results or a budget
     * "continue" action. Returns a new SSE stream for the continued execution.
     */
    private async postResume(
        body: { sessionId: string; toolResults?: ToolResultPayload[]; action?: string },
        signal?: AbortSignal
    ): Promise<Response> {
        const response = await authorizedFetch(`${this.apiBase}/chat/resume`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
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
    sessionId: string | undefined
}
