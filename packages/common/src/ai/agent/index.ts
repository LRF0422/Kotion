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
export { useEditorAgent } from './use-editor-agent'
export type {
    EditorAgentApi,
    EditorAgentPhase,
    EditorAgentState,
    StartTurnOptions,
    SubRunRecord,
    ToolCallRecord,
    UseEditorAgentOptions,
} from './use-editor-agent'
export { TERMINAL_EVENT_TYPES, parseToolArgs } from './types'
export type {
    AgentChatMessage,
    AgentEvent,
    AgentSkillInput,
    AgentToolCallInfo,
    AgentToolSpec,
    CreateRunInput,
    MemoryItem,
    PendingToolCall,
    ResumePayload,
    ResumeToolResult,
    RunStatus,
    RunUsage,
    RunView,
    ThreadView,
} from './types'
