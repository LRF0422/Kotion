/**
 * Agent Harness — tool-loop helpers
 *
 * Reusable building blocks extracted from the original `use-agent-optimized`
 * hook. These are the canonical implementations of the SSE inactivity guard,
 * OpenAI streaming tool-call accumulation, malformed-args recovery, and the
 * per-tool execution dispatch.
 */

import type { ChatMessage, ToolCall, ToolCallDelta } from '../chat-client/types'
import type { OnToolExecution, ToolDefinition } from '../types'
import type { HarnessEvent } from './types'

/**
 * Wrap an async generator with a per-yield inactivity timeout. If no value is
 * yielded within `timeoutMs` the iteration ends gracefully and the optional
 * `onTimeout` callback fires so callers can fall back to executing any
 * accumulated tool calls.
 */
export async function* withInactivityTimeout<T>(
    gen: AsyncGenerator<T>,
    timeoutMs: number,
    onTimeout?: () => void
): AsyncGenerator<T> {
    while (true) {
        let timer: ReturnType<typeof setTimeout> | undefined
        let timedOut = false

        const nextPromise = gen.next()
        const timeoutPromise = new Promise<IteratorResult<T>>((resolve) => {
            timer = setTimeout(() => {
                timedOut = true
                resolve({ done: true, value: undefined as any })
            }, timeoutMs)
        })

        const result = await Promise.race([nextPromise, timeoutPromise])
        clearTimeout(timer)

        if (timedOut) {
            // Suppress unhandled rejection from the still-pending gen.next()
            nextPromise.catch(() => { })
            onTimeout?.()
            break
        }

        if (result.done) break
        yield result.value
    }
}

/**
 * Accumulate streamed tool-call deltas into complete tool calls in-place.
 * Uses index-based matching per the OpenAI streaming spec: the first delta
 * carries id+name, subsequent deltas only carry index+arguments.
 */
export function accumulateToolCallDeltas(
    roundToolCalls: ToolCall[],
    deltas: ToolCallDelta[]
): void {
    for (const tc of deltas) {
        const existing = roundToolCalls[tc.index]
        if (existing) {
            if (tc.function?.name) existing.function.name = tc.function.name
            if (tc.function?.arguments) existing.function.arguments += tc.function.arguments
        } else if (tc.id) {
            roundToolCalls[tc.index] = {
                id: tc.id,
                type: 'function',
                function: {
                    name: tc.function?.name || '',
                    arguments: tc.function?.arguments || '',
                },
            }
        } else {
            console.warn(`[Harness] Tool call delta at index ${tc.index} has no id and no existing entry. Creating placeholder.`)
            roundToolCalls[tc.index] = {
                id: `placeholder-${tc.index}-${Date.now()}`,
                type: 'function',
                function: {
                    name: tc.function?.name || `unknown-tool-${tc.index}`,
                    arguments: tc.function?.arguments || '',
                },
            }
        }
    }
}

/**
 * Parse tool-call argument JSON, recovering from malformed output the LLM
 * sometimes emits by extracting the first balanced-looking JSON object.
 */
export function parseToolArgs(argsStr: string, toolName: string): Record<string, unknown> {
    const raw = argsStr || '{}'
    try {
        return JSON.parse(raw)
    } catch {
        const match = raw.match(/\{[\s\S]*\}/)
        if (match) {
            try {
                console.warn(`[Harness] Recovered malformed tool arguments for ${toolName}`, raw)
                return JSON.parse(match[0])
            } catch {
                return {}
            }
        }
        console.warn(`[Harness] Unparseable tool arguments for ${toolName}`, raw)
        return {}
    }
}

/** Parsed start info + the awaited end result of a single tool execution. */
export interface ToolCallOutcome {
    /** The `tool` role message to feed back into the loop. */
    message: ChatMessage
    /** The `tool-call-end` event to yield once execution settles. */
    endEvent: Extract<HarnessEvent, { type: 'tool-call-end' }>
}

/**
 * Execute a single backend-dispatched tool call locally and produce both the
 * `tool` role message to feed back into the loop and the `tool-call-end` event.
 *
 * The caller is responsible for yielding `tool-call-start` BEFORE awaiting
 * this, so the UI can show a running state during execution.
 *
 * Frontend execution tracking (onToolExecution start/success/error) is handled
 * by tools wrapped with `wrapToolsWithCallback` before they reach
 * `resolveTool`; `onToolExecution` here only covers the "not available on
 * frontend" branch so the UI still sees a start+error pair.
 */
export async function executeToolCall(
    tc: ToolCall,
    args: Record<string, unknown>,
    resolveTool: (name: string) => ToolDefinition | undefined,
    onToolExecution?: OnToolExecution
): Promise<ToolCallOutcome> {
    const toolName = tc.function.name
    const startTime = Date.now()

    const toolDef = resolveTool(toolName)
    let toolResult: string
    let endEvent: Extract<HarnessEvent, { type: 'tool-call-end' }>

    if (toolDef?.execute) {
        try {
            const result = await toolDef.execute(args)
            toolResult = typeof result === 'string' ? result : JSON.stringify(result)
            endEvent = {
                type: 'tool-call-end',
                id: tc.id,
                toolName,
                result,
                durationMs: Date.now() - startTime,
            }
        } catch (err: any) {
            toolResult = `Error executing tool ${toolName}: ${err?.message || err}`
            console.error(`[Harness] Tool execution failed: ${toolName}`, err)
            endEvent = {
                type: 'tool-call-end',
                id: tc.id,
                toolName,
                error: err?.message || String(err),
                durationMs: Date.now() - startTime,
            }
        }
    } else {
        // Tool not available on frontend — notify UI via callback + end event.
        const reason = `Tool "${toolName}" is not available on frontend`
        onToolExecution?.({ toolName, args, status: 'start', timestamp: startTime })
        onToolExecution?.({
            toolName,
            args,
            status: 'error',
            error: reason,
            timestamp: startTime,
            duration: 0,
        })
        toolResult = `Tool ${toolName} not available on frontend`
        console.warn(`[Harness] Tool not available on frontend: ${toolName}`)
        endEvent = { type: 'tool-call-end', id: tc.id, toolName, error: reason, durationMs: 0 }
    }

    return {
        endEvent,
        message: {
            role: 'tool',
            tool_call_id: tc.id,
            name: toolName,
            content: toolResult,
        },
    }
}
