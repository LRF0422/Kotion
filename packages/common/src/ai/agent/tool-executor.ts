/**
 * EditorToolExecutor — executes frontend-dispatched editor tools with:
 *  - per-owner tool resolution (a delegated child gets tools bound to *its*
 *    editor, never the parent's document)
 *  - a per-document write lease so mutating calls from different agents on the
 *    same document cannot interleave (see document-write-lock.ts)
 *  - callId idempotency (event replay never re-executes an editor operation)
 *  - completion tracking without unsafe non-cancelling timeouts
 *  - execution callbacks for the UI (start/success/error)
 */

import type { OnToolExecution, ToolDefinition, ToolsRecord } from '../types'
import type { SessionPageBinding } from '../session-page-binding'
import { AGENT_IMAGES_KEY } from '../image/agent-image-contract'
import { withDocumentWrite } from './document-write-lock'
import { resolveToolName, unknownToolError } from './tool-name-recovery'

/**
 * The wire result is what the backend needs (base64 included so the model can
 * see the image); the UI tape must never hold megabytes of base64, so image
 * payloads are replaced with a small descriptor before the execution callback.
 */
function redactAgentImagesForDisplay(value: unknown): unknown {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value
    const record = value as Record<string, unknown>
    const images = record[AGENT_IMAGES_KEY]
    if (!Array.isArray(images)) return value
    return {
        ...record,
        [AGENT_IMAGES_KEY]: images.map(image => {
            if (!image || typeof image !== 'object') return image
            const { data: _data, ...rest } = image as Record<string, unknown>
            return { ...rest, dataOmitted: true }
        }),
    }
}

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
        // Keep the wire representation, not the live object: the backend only
        // ever receives JSON, and holding the original reference in React state
        // let cyclic graphs (parent pointers, or a `toJSON` that hides a
        // back-reference from `JSON.stringify`) leak into the tool tape and
        // overflow the display-time sanitizer.
        return { ...outcome, result: JSON.parse(JSON.stringify(outcome.result)) }
    } catch (error: any) {
        return {
            ok: false,
            error: 'Tool result is not JSON serializable: ' + (error?.message ?? String(error)),
        }
    }
}

export interface EditorToolExecutorOptions {
    /**
     * Resolve the live editor-bound tool definitions (factory output). The
     * optional owner is the delegated sub-run id: hosts that can bind a child to
     * its own editor must return tools for that editor.
     */
    resolveTools: (
        owner?: string | null,
        options?: { mutating?: boolean }
    ) => ToolsRecord | Promise<ToolsRecord>
    /**
     * Read-only classification for the write lease. Omitted → every tool is
     * treated as mutating (conservative: extra serialization, never skipped).
     */
    isReadOnlyTool?: (toolName: string) => boolean
    /** Document a call acts on, or null when nothing has to be serialized. */
    resolveDocumentId?: (owner: string | null) => string | null
    /** Execution notifications for the UI. */
    onExecution?: OnToolExecution
    /**
     * Host edit-target binding resolver. Injected into every tool execution
     * context so tools do not read the global registry themselves.
     */
    getSessionBinding?: () => SessionPageBinding | null
    /**
     * Whether this run can execute a tool right now (surface scope + live state).
     * Tools that discover capabilities on the model's behalf need it to answer for
     * the asking run rather than for the whole client.
     */
    isToolAvailable?: (name: string) => boolean
    /**
     * Conversation this executor's calls belong to. Discovery tools remember what
     * they loaded per conversation, so a skill loaded on one turn stays callable on
     * the next (a new run) instead of having to be loaded again.
     */
    conversationId?: string | null
}

export class EditorToolExecutor {
    private readonly resolveTools: EditorToolExecutorOptions['resolveTools']
    private readonly isReadOnlyTool?: EditorToolExecutorOptions['isReadOnlyTool']
    private readonly resolveDocumentId?: EditorToolExecutorOptions['resolveDocumentId']
    private readonly onExecution?: OnToolExecution
    private readonly getSessionBinding?: EditorToolExecutorOptions['getSessionBinding']
    private readonly isToolAvailable?: EditorToolExecutorOptions['isToolAvailable']
    private readonly conversationId?: string | null
    /** Idempotency cache: callId → result (replays/reconnects reuse it). */
    private readonly cache = new Map<string, ToolExecutionResult>()
    /** In-flight calls share one promise so rerenders cannot repeat side effects. */
    private readonly inFlight = new Map<string, Promise<ToolExecutionResult>>()

    constructor(options: EditorToolExecutorOptions) {
        this.resolveTools = options.resolveTools
        this.isReadOnlyTool = options.isReadOnlyTool
        this.resolveDocumentId = options.resolveDocumentId
        this.onExecution = options.onExecution
        this.getSessionBinding = options.getSessionBinding
        this.isToolAvailable = options.isToolAvailable
        this.conversationId = options.conversationId
    }

    /** Execute a frontend tool call; cached/in-flight results are shared by callId. */
    async execute(
        callId: string,
        toolName: string,
        args: Record<string, any>,
        owner?: string | null
    ): Promise<ToolExecutionResult> {
        const cached = this.cache.get(callId)
        if (cached) {
            return cached
        }
        const running = this.inFlight.get(callId)
        if (running) {
            return running
        }
        const execution = this.executeOnce(callId, toolName, args, owner ?? null)
            .finally(() => this.inFlight.delete(callId))
        this.inFlight.set(callId, execution)
        return execution
    }

    private async executeOnce(
        callId: string,
        toolName: string,
        args: Record<string, any>,
        owner: string | null
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
            // Read-only classification is decided before resolving tools: the host
            // needs it to know whether the owner is about to *write* (and must
            // therefore fork a private document) or only read the live page.
            const mutating = this.isReadOnlyTool ? !this.isReadOnlyTool(toolName) : true
            const tools = await this.resolveTools(owner, { mutating })
            // The backend routes names loosely (a namespaced plugin tool may
            // arrive by its bare local name, or with an invented namespace), so
            // resolve the same way before declaring the tool unavailable.
            const name = resolveToolName(toolName, tools) ?? toolName
            const definition: ToolDefinition | undefined = tools[name]
            if (!definition || typeof definition.execute !== 'function') {
                // The model invented a name (usually a made-up namespace prefix
                // plus a semantic suffix). Name the closest real tools so the
                // next call lands, instead of letting it guess another prefix.
                outcome = { ok: false, error: unknownToolError(toolName, tools) }
            } else {
                // Do not race mutating editor operations against a timeout: the
                // underlying promise cannot be cancelled and may commit later,
                // after the backend has already retried under a new callId.
                //
                // Mutating calls take the document's write lease so two agents
                // bound to the same document cannot interleave (lost updates).
                const run = () => definition.execute(args, callId, {
                    owner,
                    conversationId: this.conversationId ?? null,
                    sessionBinding: this.getSessionBinding?.() ?? null,
                    isToolAvailable: this.isToolAvailable,
                })
                const documentId = mutating ? (this.resolveDocumentId?.(owner) ?? null) : null
                const result = documentId
                    ? await withDocumentWrite(documentId, run, { label: name })
                    : await run()
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
            // Redacted for the UI tape; the full result rides the resume payload.
            result: redactAgentImagesForDisplay(outcome.result),
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
