/**
 * Kernel — the surface-facing layer over the plugin capability registry.
 *
 * A kernel surface (home hero, command palette, space AI, later the dock and
 * editor panels) never talks to AgentClient or PluginManager directly. It asks
 * for capabilities at a scope and runs a workspace-scoped agent.
 */
export * from './filter-catalog'
export { workspaceHomeSkill } from './surface-skills'
export * from './use-agent-capabilities'
export * from './use-agent-renderers'
export * from './agent-pane'
export * from './agent-artifact-collect'
export * from './agent-artifacts'
export * from './agent-target'
export * from './agent-tool-result-card'
export * from './use-workspace-agent'
export * from './use-workspace-document'
