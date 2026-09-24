// Compatibility facade for published plugins and window.__KN__.core.
// New application code should import concrete core APIs from their defining modules.
export * from "@kn/common"
export { MessageBox } from "./components/MessageBox"
// The side dock is a core shell feature: the app shell renders it, and plugins
// contribute panels through PluginConfig.dockPanels.
export { DockHost, type DockHostProps, useDockState } from "./components/Dock"
export * from "./ai"
export * from "./domain/space-page"
