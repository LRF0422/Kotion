/**
 * Pure chat/agent helpers extracted from Chat.tsx — no React, no component
 * state. Keeping them here makes the panel component about orchestration only
 * and lets the mapping logic be unit-tested in isolation.
 */

import type { Editor } from "@kn/editor"
import type { ChangeTrackerStorage } from "@kn/editor"
import type { AgentStepRecord, ChatModelParams, ToolCallRecord } from "@kn/common"
import { sanitizeToolPayload } from "./chat-types"
import type { ExecutionStep } from "./chat-types"

/** localStorage key for persisted sampling params. */
export const MODEL_PARAMS_STORAGE_KEY = 'kn_chat_model_params'

/** Parse persisted model-param JSON, ignoring malformed or out-of-range values. */
export const readModelParams = (): ChatModelParams => {
    try {
        const raw = localStorage.getItem(MODEL_PARAMS_STORAGE_KEY)
        if (!raw) return {}
        const parsed = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object') return {}
        const out: ChatModelParams = {}
        if (typeof parsed.temperature === 'number' && Number.isFinite(parsed.temperature)) {
            out.temperature = parsed.temperature
        }
        if (typeof parsed.maxTokens === 'number' && Number.isFinite(parsed.maxTokens) && parsed.maxTokens > 0) {
            out.maxTokens = Math.floor(parsed.maxTokens)
        }
        return out
    } catch {
        return {}
    }
}

/** The editor's change-tracker storage, when the extension is mounted. */
export const getChangeTracker = (editor: Editor | null | undefined): ChangeTrackerStorage | undefined =>
    (editor?.storage as any)?.changeTracker as ChangeTrackerStorage | undefined

/** Map AgentCore tool-call records onto the chat UI's execution-step tape. */
export const toolCallsToSteps = (calls: ToolCallRecord[]): ExecutionStep[] =>
    calls.map(tc => ({
        id: tc.callId,
        callId: tc.callId,
        toolName: tc.tool,
        args: sanitizeToolPayload(tc.args),
        result: sanitizeToolPayload(tc.result),
        error: sanitizeToolPayload(tc.error) as string | undefined,
        status: tc.status,
        timestamp: 0,
        step: tc.step,
        stepId: tc.stepId,
        sequence: tc.startedSeq ?? tc.completedSeq,
        duration: tc.durationMs,
        subRunId: tc.subRunId,
    }))

/** Read the canonical user-facing answer chosen by the shared Agent state. */
export const selectFinalAnswer = (
    activitySteps: AgentStepRecord[],
    answerStepId: string | null | undefined,
    fallback: string,
): string => {
    if (activitySteps.length === 0) return fallback
    const answer = answerStepId
        ? activitySteps.find(step => step.id === answerStepId)
        : undefined
    return answer?.text ?? ''
}
