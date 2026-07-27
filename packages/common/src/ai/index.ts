export * from "./ai-utils"
export * from "./use-agent-optimized"
export * from "./types"
export { Output } from "ai"

// Constants
export * from "./constants"

// Tools (backend-only; editor-specific tools are in @kn/core)
export * from "./tools"

// Page bridge — page-level operations (search/create/open) for AI tools
export * from "./page-bridge"

// Offscreen editor bridge — off-screen page editing sessions (engine in core)
export * from "./offscreen-editor-bridge"

// Providers
export * from "./providers"

// Capability catalog collector (replaces progressive discovery on the frontend)
export * from "./capabilities"

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

// Discovery
export * from "./discovery"

// Skills
export * from "./skills"

// Utils
export * from "./utils"

// System Agent - Logic (context + hooks, no UI)
export * from "./system-agent"
