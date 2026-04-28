export * from "./ai-utils"
export * from "./use-agent-optimized"
export * from "./types"
export { Output } from "ai"

// Constants
export * from "./constants"

// Tools (backend-only; editor-specific tools are in @kn/core)
export * from "./tools"

// Providers
export * from "./providers"

// Chat Client - Backend-driven SSE communication
// Explicitly export to avoid conflicts with types.ts re-exports
export {
    KnowledgeChatClient,
    createChatRequest,
    fetchModels,
    parseSSEStream,
    collectSSEEvents,
} from "./chat-client/index"
export type {
    ChatStreamEvent,
    TextDeltaEvent,
    ReasoningDeltaEvent,
    ToolCallStreamEvent,
    ToolResultEvent,
    AnnotationStreamEvent,
    SessionInfoEvent,
    FinishEvent,
    ErrorEvent,
    ChatRequest,
    ChatResponse,
    ChatClientOptions,
    ChatMessage,
    ToolCall,
    ToolCallDelta,
    ModelInfo,
    ModelsResponse,
} from "./chat-client/types"

// Model Providers
export { createKnowledgeModel, type KnowledgeModelOptions } from "./model-provider/knowledge-provider"

// Discovery
export * from "./discovery"

// Skills
export * from "./skills"

// Utils
export * from "./utils"

// Foundation - Global AI Architecture
export * from "./foundation"

// System Agent - Logic (context + hooks, no UI)
export * from "./system-agent"
