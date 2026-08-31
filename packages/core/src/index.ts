
// Re-export everything from @kn/common (shared utilities moved from core to common)
export * from "@kn/common"

// Core-specific exports (UI components that only core uses)
export * from "./App"
export * from "./components/Skills"
export { MessageBox } from "./components/MessageBox"
export * from "./ai"
export * from "./domain/space-page"

