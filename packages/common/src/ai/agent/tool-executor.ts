/**
 * EditorToolExecutor — executes frontend-dispatched editor tools with:
 *  - callId idempotency (event replay never re-executes an editor operation)
 *  - completion tracking without unsafe non-cancelling timeouts
 *  - execution callbacks for the UI (start/success/error)
 */

import type { OnToolExecution, ToolDefinition, ToolsRecord } from '../types'

export interface ToolExecutionResult {
    ok: boolean
    result?: unknown
    error?: string
}

export function ensureSerializableToolResult(outcome: ToolExecutionResult): ToolExecutionResult {
    if (!outcome.ok || outcome.result === undefined) {
        return outcome
    }
    try {
        JSON.stringify(outcome.result)
        return outcome
    } catch (error: any) {
        return {
            ok: false,
            error: 'Tool result is not JSON serializable: ' + (error?.message ?? String(error)),
        }
    }
}

export interface EditorToolExecutorOptions {
    /** Resolve the live editor-bound tool definitions (factory output). */
    resolveTools: () => ToolsRecord | Promise<ToolsRecord>
    /** Execution notifications for the UI. */
    onExecution?: OnToolExecution
}

export class EditorToolExecutor {
    private readonly resolveTools: EditorToolExecutorOptions['resolveTools']
    private readonly onExecution?: OnToolExecution
    /** Idempotency cache: callId → result (replays/reconnects reuse it). */
    private readonly cache = new Map<string, ToolExecutionResult>()
    /** In-flight calls share one promise so rerenders cannot repeat side effects. */
    private readonly inFlight = new Map<string, Promise<ToolExecutionResult>>()

    constructor(options: EditorToolExecutorOptions) {
        this.resolveTools = options.resolveTools
        this.onExecution = options.onExecution
    }

    /** Execute a frontend tool call; cached/in-flight results are shared by callId. */
    async execute(callId: string, toolName: string, args: Record<string, any>): Promise<ToolExecutionResult> {
        const cached = this.cache.get(callId)
        if (cached) {
            return cached
        }
        const running = this.inFlight.get(callId)
        if (running) {
            return running
        }
        const execution = this.executeOnce(callId, toolName, args)
            .finally(() => this.inFlight.delete(callId))
        this.inFlight.set(callId, execution)
        return execution
    }

    private async executeOnce(
        callId: string,
        toolName: string,
        args: Record<string, any>
    ): Promise<ToolExecutionResult> {
        const started = Date.now()
        this.onExecution?.({
            toolName,
            args,
            status: 'start',
            timestamp: started,
            callId,
        })

        let outcome: ToolExecutionResult
        try {
            const tools = await this.resolveTools()
            const definition: ToolDefinition | undefined = tools[toolName]
            if (!definition || typeof definition.execute !== 'function') {
                outcome = { ok: false, error: 'Tool not available on frontend: ' + toolName }
            } else {
                // Do not race mutating editor operations against a timeout: the
                // underlying promise cannot be cancelled and may commit later,
                // after the backend has already retried under a new callId.
                const result = await definition.execute(args, callId)
                outcome = { ok: true, result }
            }
        } catch (error: any) {
            outcome = { ok: false, error: error?.message ?? String(error) }
        }

        outcome = ensureSerializableToolResult(outcome)
        this.cache.set(callId, outcome)
        this.onExecution?.({
            toolName,
            args,
            status: outcome.ok ? 'success' : 'error',
            result: outcome.result,
            error: outcome.error,
            timestamp: Date.now(),
            duration: Date.now() - started,
            callId,
        })
        return outcome
    }

    /** Drop cached results (a new run with fresh call ids is safe to reset). */
    clearCache(): void {
        this.cache.clear()
    }
}
