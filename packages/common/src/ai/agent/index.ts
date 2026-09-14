/**
 * AgentCore frontend SDK — the editor-serving agent client (from-0 redesign).
 *
 * Replaces the old harness/chat-client/v3/system-agent stack. UI code touches
 * only this package: AgentClient for the backend contract, useEditorAgent for
 * the run lifecycle, RunStore/RunLock for 断点恢复 persistence.
 */

export { AgentClient } from './client'
export type { AgentClientOptions } from './client'
export { parseAgentEventFrame, readSseDataLines } from './events'
export { RunStore, RunLock } from './run-store'
export type { SavedRun } from './run-store'
export { EditorToolExecutor } from './tool-executor'
export type { EditorToolExecutorOptions, ToolExecutionResult } from './tool-executor'
export { SubRunWorker, DEFAULT_MAX_PARALLEL_CALLS } from './sub-run-worker'
export type { SubRunClient, SubRunSettlement, SubRunWorkerOptions } from './sub-run-worker'
export { mergeAgentDocument, blockKey } from './document-merge'
export type {
    DocJson,
    MergeConflict,
    MergeConflictReason,
    MergeOp,
    MergeResult,
} from './document-merge'
export { useEditorAgent } from './use-editor-agent'
export type {
    AgentStepRecord,
    EditorAgentApi,
    EditorAgentPhase,
    EditorAgentState,
    StartTurnOptions,
    SubRunRecord,
    ToolCallRecord,
    UseEditorAgentOptions,
} from './use-editor-agent'
export { TERMINAL_EVENT_TYPES, parseToolArgs, cacheHitRate } from './types'
export type {
    AgentChatMessage,
    AgentChatSession,
    AgentEvent,
    AgentSkillInput,
    AgentToolCallInfo,
    AgentToolSpec,
    CreateRunInput,
    ImportAgentChatSessionInput,
    MemoryItem,
    PendingToolCall,
    ResumePayload,
    ResumeToolResult,
    RunStatus,
    RunUsage,
    RunView,
    SaveAgentChatSessionInput,
    ThreadView,
} from './types'
