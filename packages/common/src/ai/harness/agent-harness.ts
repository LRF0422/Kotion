/**
 * Agent Harness — unified backend-driven agent runtime
 *
 * Thin facade over the server-driven {@link V2AgentRuntime}: one POST to
 * `/api/v2/agent/chat` starts the full execution stream; the backend runs
 * think→act→observe cycles internally and only asks the frontend to execute
 * FRONTEND-dispatched tools (editor operations) via the resume protocol.
 *
 * This is the single canonical loop — the editor hook and the system-agent
 * provider are thin adapters over it.
 */

import type { AgentHarness, HarnessEvent, HarnessRunInput } from './types'
import { V2AgentRuntime } from './v2-agent-runtime'
import type { ContinueSessionInput } from './v2-agent-runtime'

export class AgentHarnessImpl implements AgentHarness {
    private v2Runtime: V2AgentRuntime

    constructor() {
        this.v2Runtime = new V2AgentRuntime()
    }

    async *run(input: HarnessRunInput): AsyncGenerator<HarnessEvent> {
        yield* this.v2Runtime.run(input)
    }

    /**
     * Continue a session that was suspended because its iteration budget ran
     * out (finishReason `suspended:iteration_budget_exhausted`). The backend
     * grants a fresh budget and resumes the same session.
     */
    async *continueSession(input: ContinueSessionInput): AsyncGenerator<HarnessEvent> {
        yield* this.v2Runtime.continueSession(input)
    }

    /**
     * Re-attach to an in-flight task after a refresh/dropped connection.
     * Reconstructs the in-progress text and continues from the task checkpoint.
     */
    async *attach(
        taskId: string,
        resolveTool: (name: string) => import('../types').ToolDefinition | undefined,
        onToolExecution: import('../types').OnToolExecution | undefined,
        signal: AbortSignal,
    ): AsyncGenerator<HarnessEvent> {
        yield* this.v2Runtime.attach(taskId, resolveTool, onToolExecution, signal)
    }

    /** Cancel the currently-attached backend task (best-effort). */
    cancelCurrent(signal?: AbortSignal): Promise<void> {
        return this.v2Runtime.cancelCurrent(signal)
    }
}
