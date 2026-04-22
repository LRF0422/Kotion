// Core-specific AI UI components (these use @kn/ui, @kn/icon)
// Note: AI logic (types, hooks, providers, tools, foundation, etc.) is in @kn/common
// and is already re-exported by core's index.ts via `export * from "@kn/common"`

export { AiInlineTrigger, AiInlinePanel } from "./AiInlineMenu"
export * from "./system-agent"
