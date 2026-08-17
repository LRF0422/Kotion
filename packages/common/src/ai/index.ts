// AgentCore SDK — 全新 agent 前端（从 0 重设计）。
export * from "./agent"

// AI text helpers (streamKnowledgeText/streamKnowledgeChat — AgentCore-backed)
export * from "./ai-utils"

// Shared types (block/tool/skill/provider + ChatMode/ChatModelParams)
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

// Page edit window — floating page editor (implementation registered by core)
export * from "./page-edit-window-bridge"

// Providers
export * from "./providers"

// Capability providers wiring (tools/skills 供应商层，供面板与插件复用)
export * from "./use-capability-providers"

// Capability catalog collector (replaces progressive discovery on the frontend)
export * from "./capabilities"

// Model discovery — kept /api/v1/models endpoint
export * from "./models"

// Discovery (built-in tool metadata; still used by ToolProvider)
export * from "./discovery"

// Skills
export * from "./skills"

// Utils
export * from "./utils"
