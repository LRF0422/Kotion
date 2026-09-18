/**
 * AgentCore frontend SDK — the editor-serving agent client (from-0 redesign).
 *
 * Replaces the old harness/chat-client/v3/system-agent stack. UI code touches
 * only this package: AgentClient for the backend contract, useEditorAgent for
 * the run lifecycle, and the AgentTransport/AgentRunStore/AgentTabLock contracts
 * whose concrete implementations are registered by the host (@kn/core).
 */

export { AgentClient } from './client'
export type { AgentClientOptions } from './client'
export {
    configureAgentTransport,
    getAgentTransport,
    AgentTransportNotConfiguredError,
} from './transport'
export type { AgentFetch, AgentTransport } from './transport'
export { parseAgentEventFrame, readSseDataLines } from './events'
export type { SavedRun, SavedToolResult } from './persistence'
export {
    configureAgentPersistence,
    createAgentPersistence,
    createInMemoryPersistence,
} from './persistence'
export type { AgentPersistence, AgentRunStore, AgentTabLock } from './persistence'
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
export { useSubRuns } from './use-sub-runs'
export type { UseSubRunsApi, UseSubRunsOptions } from './use-sub-runs'
export { useAgentStream } from './use-agent-stream'
export type { UseAgentStreamApi, UseAgentStreamOptions } from './use-agent-stream'
export { usePendingToolExecution } from './use-pending-tools'
export type {
    UsePendingToolExecutionApi,
    UsePendingToolExecutionOptions,
} from './use-pending-tools'
export { MAX_TOOL_RESUME_RETRIES, isPermanentTransportError } from './retry-policy'
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
export {
    CUSTOM_AGENTS_PLUGIN_KEY,
    MAX_CUSTOM_AGENTS,
    MAX_AGENT_NAME_LENGTH,
    MAX_AGENT_DESCRIPTION_LENGTH,
    MAX_AGENT_INSTRUCTIONS_LENGTH,
    createCustomAgentId,
    normalizeCustomAgents,
    normalizeSelectedAgentId,
    findCustomAgent,
    composeAgentSystemPrompt,
    useSelectedCustomAgentId,
    useCustomAgents,
} from './custom-agents'
export type {
    CustomAgent,
    CustomAgentsConfig,
    UseCustomAgentsResult,
} from './custom-agents'
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
