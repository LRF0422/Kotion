/**
 * EditorToolExecutor — executes frontend-dispatched editor tools with:
 *  - callId idempotency (event replay never re-executes an editor operation)
 *  - per-tool timeout guard
 *  - execution callbacks for the UI (start/success/error)
 */

import type { OnToolExecution, ToolDefinition, ToolsRecord } from '../types'

export interface ToolExecutionResult {
    ok: boolean
    result?: unknown
    error?: string
}

export interface EditorToolExecutorOptions {
    /** Resolve the live editor-bound tool definitions (factory output). */
    resolveTools: () => ToolsRecord | Promise<ToolsRecord>
    /** Execution notifications for the UI. */
    onExecution?: OnToolExecution
    /** Per-tool execution timeout (ms). */
    timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 120_000

export class EditorToolExecutor {
    private readonly resolveTools: EditorToolExecutorOptions['resolveTools']
    private readonly onExecution?: OnToolExecution
    private readonly timeoutMs: number
    /** Idempotency cache: callId → result (replays/reconnects reuse it). */
    private readonly cache = new Map<string, ToolExecutionResult>()

    constructor(options: EditorToolExecutorOptions) {
        this.resolveTools = options.resolveTools
        this.onExecution = options.onExecution
        this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    }

    /** Execute a frontend tool call; cached results return immediately. */
    async execute(callId: string, toolName: string, args: Record<string, any>): Promise<ToolExecutionResult> {
        const cached = this.cache.get(callId)
        if (cached) {
            return cached
        }
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
                const result = await this.withTimeout(
                    definition.execute(args, callId),
                    this.timeoutMs,
                    toolName
                )
                outcome = { ok: true, result }
            }
        } catch (error: any) {
            outcome = { ok: false, error: error?.message ?? String(error) }
        }

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

    private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, toolName: string): Promise<T> {
        let timer: ReturnType<typeof setTimeout> | undefined
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('工具执行超时: ' + toolName)), timeoutMs)
        })
        try {
            return await Promise.race([promise, timeout])
        } finally {
            if (timer) clearTimeout(timer)
        }
    }
}
