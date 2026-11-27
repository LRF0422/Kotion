/**
 * Pure decision table for a pending frontend tool call.
 *
 * The durable `agent_tool_call` row (V48) is the server truth; the local
 * journal is a fast cache. On attach we must decide, without executing:
 *
 *   - the result is already known (local or server `completed`) -> resubmit it;
 *   - execution never started (`pending`/`approved`) -> execute;
 *   - execution started but its outcome is unknown (`started`/`uncertain`) ->
 *     only retry when the tool is safe to replay; otherwise surface the
 *     uncertainty and let the user decide.
 *
 * Keeping this pure makes the dangerous branch testable without React.
 */

import type { SavedToolResult } from './persistence'
import type { AgentToolCallView } from './runtime-state'
import type { ToolExecutionResult } from './tool-executor'

export type ToolLedgerDecision =
    | { action: 'execute' }
    | { action: 'resume'; outcome: ToolExecutionResult }
    | { action: 'uncertain' }

export interface ToolLedgerDecisionInput {
    ledger?: AgentToolCallView | null
    saved?: SavedToolResult | null
    /** True for read-only / explicitly idempotent tools. */
    safeToRetry: boolean
}

export function decideToolExecution(input: ToolLedgerDecisionInput): ToolLedgerDecision {
    const { ledger, saved, safeToRetry } = input

    // A locally completed result is the most precise copy (the server may have
    // truncated an oversized payload).
    if (saved && saved.status === 'completed') {
        return {
            action: 'resume',
            outcome: { ok: saved.ok, result: saved.result, error: saved.error },
        }
    }

    if (ledger) {
        switch (ledger.status) {
            case 'completed':
                if (ledger.resultTruncated) {
                    // The ledger only kept a marker; submitting it would corrupt
                    // the run. Treat it like an unknown outcome.
                    return { action: 'uncertain' }
                }
                return {
                    action: 'resume',
                    outcome: { ok: true, result: ledger.result },
                }
            case 'failed':
            case 'cancelled':
            case 'rejected':
                return {
                    action: 'resume',
                    outcome: {
                        ok: false,
                        error: ledger.error || '工具执行已结束（服务端记录为 ' + ledger.status + '）',
                    },
                }
            case 'started':
            case 'uncertain':
                return safeToRetry ? { action: 'execute' } : { action: 'uncertain' }
            case 'awaiting_approval':
                // The approval card must be restored before executing. Until the
                // host wires that path, do not silently run a side effect.
                return { action: 'uncertain' }
            case 'approved':
            case 'pending':
            default:
                return { action: 'execute' }
        }
    }

    // No server ledger (old backend / offline). Preserve the old fail-closed
    // journal semantics: a started marker means "do not replay blindly".
    if (saved && saved.status === 'started') {
        return safeToRetry ? { action: 'execute' } : { action: 'uncertain' }
    }
    return { action: 'execute' }
}
