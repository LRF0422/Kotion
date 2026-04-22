// Core-specific AI components (these use @kn/ui, @kn/icon, @kn/editor runtime)
// Note: AI logic (types, hooks, providers, foundation, etc.) is in @kn/common
// and is already re-exported by core's index.ts via `export * from "@kn/common"`

export { AiInlineTrigger, AiInlinePanel } from "./AiInlineMenu"
export * from "./system-agent"

// Editor-specific AI tools (runtime @kn/editor deps)
export * from "./tools"
