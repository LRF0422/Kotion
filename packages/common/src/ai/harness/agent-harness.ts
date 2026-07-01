/**
 * Agent Harness — unified backend-driven agent runtime
 *
 * Owns the bidirectional tool loop against the Knowledge Agent backend
 * (`/chat/completions`) and exposes progress as a typed `AsyncGenerator`.
 *
 * Each iteration:
 *  1. Sends the message list + capability catalog via {@link KnowledgeChatClient}.
 *  2. Parses the SSE stream, yielding text/reasoning/annotation/session events
 *     and accumulating tool-call deltas.
 *  3. If the backend dispatched tool calls, executes them locally, feeds the
 *     results back as `tool` messages, and loops; otherwise finishes.
 *
 * This is the single canonical loop — the editor hook and the system-agent
 * provider are thin adapters over it.
 */

import { KnowledgeChatClient } from '../chat-client'
import type { ChatMessage, ChatRequest, ToolCall } from '../chat-client/types'
import { DEFAULT_MAX_STEPS } from '../constants'
import type { AgentHarness, HarnessEvent, HarnessRunInput } from './types'
import {
    accumulateToolCallDeltas,
    executeToolCall,
    parseToolArgs,
    withInactivityTimeout,
} from './tool-loop'

/** Per-yield SSE inactivity timeout — treat the stream as hung after this. */
const DEFAULT_INACTIVITY_TIMEOUT_MS = 60_000 * 10

export class AgentHarnessImpl implements AgentHarness {
    private client: KnowledgeChatClient

    constructor(client?: KnowledgeChatClient) {
        this.client = client ?? new KnowledgeChatClient()
    }

    async *run(input: HarnessRunInput): AsyncGenerator<HarnessEvent> {
        const {
            catalog,
            resolveTool,
            signal,
            model,
            conversationId,
            onToolExecution,
            mode,
        } = input
        const maxSteps = input.maxSteps ?? DEFAULT_MAX_STEPS
        const inactivityTimeoutMs = input.inactivityTimeoutMs ?? DEFAULT_INACTIVITY_TIMEOUT_MS

        const messages: ChatMessage[] = [...input.messages]
        let currentSessionId = input.sessionId

        for (let iteration = 0; iteration < maxSteps; iteration++) {
            const request: ChatRequest = {
                model,
                messages,
                sessionId: currentSessionId,
                conversationId,
                signal,
                stream: true,
                mode,
                skills: catalog.skills.length > 0 ? catalog.skills : undefined,
                // When skills-only mode is active, catalog.tools is empty
                // and tools[] is omitted from the wire payload entirely —
                // all tool schemas travel inside SkillPayload.tools.
                tools: catalog.tools.length > 0 ? catalog.tools : undefined,
                capabilitiesVersion: catalog.version,
            }

            const roundToolCalls: ToolCall[] = []
            let roundFinishReason: string | undefined
            let roundAssistantContent = ''
            let roundReasoningContent = ''
            let streamTimedOut = false

            const timedGen = withInactivityTimeout(
                this.client.chat(request),
                inactivityTimeoutMs,
                () => {
                    streamTimedOut = true
                    console.warn(`[Harness] SSE stream timed out after ${inactivityTimeoutMs / 1000}s of inactivity`)
                }
            )

            for await (const event of timedGen) {
                switch (event.type) {
                    case 'text-delta':
                        roundAssistantContent += event.content
                        yield { type: 'text-delta', content: event.content }
                        break

                    case 'reasoning-delta':
                        roundReasoningContent += event.content
                        yield { type: 'reasoning-delta', content: event.content }
                        break

                    case 'annotation':
                        yield { type: 'annotation', annotations: event.annotations }
                        break

                    case 'session-info':
                        currentSessionId = event.sessionId
                        yield {
                            type: 'session',
                            sessionId: event.sessionId,
                            conversationId: event.conversationId,
                        }
                        break

                    case 'tool-call':
                        accumulateToolCallDeltas(roundToolCalls, event.toolCalls)
                        break

                    case 'tool-result':
                        // Backend tool results are informational only.
                        break

                    case 'finish':
                        roundFinishReason = event.finishReason
                        break

                    case 'error':
                        yield { type: 'error', error: event.error }
                        return
                }
            }

            const validToolCalls = roundToolCalls.filter(Boolean)

            // Execute tools whenever we have valid tool calls, unless the finish
            // reason explicitly indicates an error. Handles the normal
            // 'tool-calls' case as well as undefined/stop/length finish reasons
            // some backends emit alongside tool calls or on early SSE close.
            const shouldExecuteTools = validToolCalls.length > 0 && roundFinishReason !== 'error'

            if (shouldExecuteTools) {
                if (roundFinishReason !== 'tool-calls') {
                    console.warn(`[Harness] Executing tool calls with non-standard finishReason: ${roundFinishReason ?? 'undefined'}${streamTimedOut ? ' (stream timed out)' : ''}`)
                }

                // DeepSeek requires reasoning_content when tool_calls is present.
                const assistantMsg: ChatMessage = { role: 'assistant', tool_calls: validToolCalls }
                if (roundAssistantContent) assistantMsg.content = roundAssistantContent
                if (roundReasoningContent) assistantMsg.reasoning_content = roundReasoningContent
                messages.push(assistantMsg)

                for (const tc of validToolCalls) {
                    const args = parseToolArgs(tc.function.arguments, tc.function.name)
                    yield { type: 'tool-call-start', id: tc.id, toolName: tc.function.name, args }

                    const outcome = await executeToolCall(tc, args, resolveTool, onToolExecution)
                    yield outcome.endEvent
                    messages.push(outcome.message)
                }

                // Loop to send tool results back to the backend.
                continue
            }

            if (roundFinishReason === 'error') {
                yield { type: 'error', error: roundAssistantContent || 'Agent processing error' }
                return
            }

            yield { type: 'finish', finishReason: roundFinishReason }
            return
        }

        // Exhausted maxSteps without a terminal finish.
        yield { type: 'finish', finishReason: 'max_iterations' }
    }
}
