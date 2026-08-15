/**
 * V2 SSE Stream Parser
 *
 * Parses the V2 Agent SSE protocol which uses named events:
 *
 *   event: think.delta
 *   data: {"sessionId":"...", "type":"text", "content":"..."}
 *
 * Maps V2 semantic events to the same ChatStreamEvent union so the
 * existing AgentHarness works unchanged with either V1 or V2 backends.
 *
 * V2 Event Types:
 *   - session.created  → SessionInfoEvent
 *   - think.start      → AnnotationEvent (agent_status: thinking)
 *   - think.delta      → TextDeltaEvent / ReasoningDeltaEvent
 *   - think.end        → (internal state update)
 *   - tool.dispatched  → ToolCallStreamEvent (FRONTEND) / AnnotationEvent (BACKEND)
 *   - tool.completed   → AnnotationEvent (agent_status with tool result)
 *   - tool.failed      → AnnotationEvent (tool failure info)
 *   - session.completed → FinishEvent
 *   - session.failed   → ErrorEvent
 *   - agent.spawned    → AnnotationEvent (SubagentSpawnedAnnotation)
 *   - agent.progress   → AnnotationEvent (SubagentProgressAnnotation)
 *   - agent.completed  → AnnotationEvent (SubagentFinishAnnotation)
 *   - state.transition → (internal, ignored)
 */

import type {
    ChatStreamEvent,
    TextDeltaEvent,
    ReasoningDeltaEvent,
    ToolCallStreamEvent,
    AnnotationStreamEvent,
    SessionInfoEvent,
    FinishEvent,
    ErrorEvent,
    ToolCallDelta,
    Annotation,
} from './types'

/**
 * Parse a V2 SSE stream (ReadableStream<Uint8Array>) into ChatStreamEvent objects.
 *
 * The V2 format uses standard SSE with named `event:` fields:
 * ```
 * event: think.delta
 * id: 42
 * data: {"type":"text","content":"Hello"}
 *
 * ```
 *
 * @param body - The response body from fetch
 * @yields ChatStreamEvent for each V2 SSE event
 */
export async function* parseV2SSEStream(body: ReadableStream<Uint8Array>): AsyncGenerator<ChatStreamEvent> {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    // SSE state: accumulate event name + data lines until blank line
    let currentEvent = ''
    let currentData = ''

    // Track pending FRONTEND tool calls for batching into a single finish event
    const pendingFrontendToolCalls: ToolCallDelta[] = []
    let toolCallIndex = 0

    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop()! // Keep incomplete line in buffer

            for (const line of lines) {
                if (line === '' || line === '\r') {
                    // Blank line = event dispatch boundary
                    if (currentData) {
                        const events = mapV2Event(currentEvent, currentData, pendingFrontendToolCalls, toolCallIndex)
                        toolCallIndex += countNewToolCalls(events)
                        for (const ev of events) {
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
                        // Explicit stream termination
                        // If we have pending frontend tool calls, flush them
                        if (pendingFrontendToolCalls.length > 0) {
                            yield {
                                type: 'finish',
                                finishReason: 'tool-calls',
                            } as FinishEvent
                        }
                        return
                    }
                    currentData += data
                } else if (line.startsWith('id:')) {
                    // SSE id field - ignored for now
                }
            }
        }

        // Process any remaining buffered event
        if (currentData) {
            const events = mapV2Event(currentEvent, currentData, pendingFrontendToolCalls, toolCallIndex)
            for (const ev of events) {
                yield ev
            }
        }
    } finally {
        reader.releaseLock()
    }
}

/**
 * Map a V2 named event to ChatStreamEvent(s).
 */
function mapV2Event(
    eventName: string,
    dataStr: string,
    pendingFrontendToolCalls: ToolCallDelta[],
    toolCallIndex: number
): ChatStreamEvent[] {
    let data: any
    try {
        data = JSON.parse(dataStr)
    } catch {
        console.warn('[V2 SSE] Failed to parse event data:', dataStr.substring(0, 100))
        return []
    }

    switch (eventName) {
        case 'session.created':
            return [{
                type: 'session-info',
                sessionId: data.sessionId,
                conversationId: data.conversationId,
            } as SessionInfoEvent]

        case 'think.start':
            return [{
                type: 'annotation',
                annotations: [{
                    type: 'agent_status',
                    phase: 'thinking',
                    iteration: data.iteration,
                } as Annotation],
            } as AnnotationStreamEvent]

        case 'think.delta':
            if (data.type === 'reasoning') {
                return [{
                    type: 'reasoning-delta',
                    content: data.content || '',
                } as ReasoningDeltaEvent]
            }
            // Default: text content
            return [{
                type: 'text-delta',
                content: data.content || '',
            } as TextDeltaEvent]

        case 'think.end':
            // Internal state update — no direct UI event needed.
            // Could track latency/usage here for metrics.
            return []

        case 'tool.dispatched':
            if (data.location === 'FRONTEND') {
                // Frontend tool: accumulate as a tool-call delta for the harness
                // to execute locally. Parse the arguments string.
                const delta: ToolCallDelta = {
                    index: toolCallIndex + pendingFrontendToolCalls.length,
                    id: data.toolCallId,
                    type: 'function',
                    function: {
                        name: data.toolName,
                        arguments: typeof data.arguments === 'string'
                            ? data.arguments
                            : JSON.stringify(data.arguments || {}),
                    },
                }
                pendingFrontendToolCalls.push(delta)
                return [{
                    type: 'tool-call',
                    toolCalls: [delta],
                } as ToolCallStreamEvent]
            }
            // Backend tool: informational — show as annotation
            return [{
                type: 'annotation',
                annotations: [{
                    type: 'agent_status',
                    phase: 'tool_calling',
                    tool: data.toolName,
                } as Annotation],
            } as AnnotationStreamEvent]

        case 'tool.completed':
            // Backend tool completed — informational annotation
            return [{
                type: 'annotation',
                annotations: [{
                    type: 'agent_status',
                    phase: 'thinking',
                    tool: data.toolName,
                } as Annotation],
            } as AnnotationStreamEvent]

        case 'tool.failed':
            return [{
                type: 'annotation',
                annotations: [{
                    type: 'agent_status',
                    phase: 'thinking',
                    tool: data.toolName,
                } as Annotation],
            } as AnnotationStreamEvent]

        case 'session.completed':
            return [{
                type: 'finish',
                finishReason: normalizeV2FinishReason(data.finishReason),
                usage: data.usage ? {
                    promptTokens: data.usage.prompt ?? 0,
                    completionTokens: data.usage.completion ?? 0,
                } : undefined,
            } as FinishEvent]

        case 'session.failed':
            return [{
                type: 'error',
                error: data.errorMessage || 'Agent session failed',
                code: data.errorCode,
                retriable: data.retriable,
            } as ErrorEvent]

        case 'agent.spawned':
            return [{
                type: 'annotation',
                annotations: [{
                    type: 'subagent_spawned',
                    agentId: data.agentId || data.taskId,
                    parentAgentId: data.parentAgentId || data.sessionId,
                    depth: data.depth ?? 1,
                    agentName: data.agentName,
                    task: data.taskDescription || data.description,
                    description: data.taskDescription || data.description,
                } as Annotation],
            } as AnnotationStreamEvent]

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
                } as Annotation],
            } as AnnotationStreamEvent]

        case 'agent.output':
            return [{
                type: 'annotation',
                annotations: [{
                    type: 'subagent_output',
                    agentId: data.agentId || data.taskId,
                    parentAgentId: data.parentAgentId || data.sessionId,
                    depth: data.depth ?? 1,
                    content: data.content || '',
                } as Annotation],
            } as AnnotationStreamEvent]

        case 'agent.reasoning':
            return [{
                type: 'annotation',
                annotations: [{
                    type: 'subagent_reasoning',
                    agentId: data.agentId || data.taskId,
                    parentAgentId: data.parentAgentId || data.sessionId,
                    depth: data.depth ?? 1,
                    content: data.content || '',
                } as Annotation],
            } as AnnotationStreamEvent]

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
                    durationMs: data.durationMs,
                } as Annotation],
            } as AnnotationStreamEvent]

        case 'tool.progress':
            return [{
                type: 'annotation',
                annotations: [{
                    type: 'tool_progress',
                    toolCallId: data.toolCallId,
                    toolName: data.toolName,
                    progress: data.progress,
                    message: data.message,
                } as Annotation],
            } as AnnotationStreamEvent]

        case 'plan.proposed':
            return [{
                type: 'annotation',
                annotations: [{
                    type: 'plan_proposed',
                    plan: data.plan,
                    planId: data.planId,
                    sessionId: data.sessionId,
                } as Annotation],
            } as AnnotationStreamEvent]

        case 'plan.resolved':
            return [{
                type: 'annotation',
                annotations: [{
                    type: 'plan_resolved',
                    planId: data.planId,
                    decision: data.decision,
                    feedback: data.feedback,
                } as Annotation],
            } as AnnotationStreamEvent]

        case 'state.transition':
            // Internal engine state change — not surfaced to UI
            return []

        default:
            // Unknown event type — log and skip
            if (eventName) {
                console.debug('[V2 SSE] Unhandled event type:', eventName)
            }
            return []
    }
}

/**
 * Normalize V2 finish reasons to the frontend FinishEvent format.
 * The backend emits compound reasons like {@code suspended:frontend_tool_calls}
 * and {@code suspended:iteration_budget_exhausted} — both normalize to
 * {@code tool-calls} (waiting for frontend execution) or {@code suspended}
 * (budget / plan approval), never a literal {@code suspended:…} string.
 */
function normalizeV2FinishReason(reason?: string): FinishEvent['finishReason'] {
    if (!reason) return 'stop'
    const mapping: Record<string, FinishEvent['finishReason']> = {
        'stop': 'stop',
        'max_iterations': 'max_iterations',
        'error': 'error',
        'length': 'length',
        'tool_calls': 'tool-calls',
        'suspended': 'tool-calls', // SUSPENDED = waiting for frontend tool execution
    }
    if (reason.startsWith('suspended:frontend_tool_calls')) {
        return 'tool-calls'
    }
    if (reason.startsWith('suspended')) {
        return 'suspended' as FinishEvent['finishReason']
    }
    return mapping[reason] || (reason as FinishEvent['finishReason'])
}

/**
 * Count how many new tool call entries were produced by a set of events.
 */
function countNewToolCalls(events: ChatStreamEvent[]): number {
    let count = 0
    for (const ev of events) {
        if (ev.type === 'tool-call') {
            count += ev.toolCalls.length
        }
    }
    return count
}
