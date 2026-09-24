/**
 * Core agent-tool implementation registry (see plan §3.4).
 *
 * The bridge that lets `plugin-main` (which depends only on `@kn/common`)
 * *declare* a capability whose implementation lives in `@kn/core`:
 *
 *   core/App.tsx  registerAgentToolImplementations([...])   # implementation
 *        ↓  (global registry, this file)
 *   plugin-main   agent.tools: { include: ['searchPages', ...] }  # declaration
 *        ↓
 *   PluginManager.resolveAgentCapabilities()                # wiring
 *
 * Registration alone grants nothing: an implementation only reaches the run
 * catalog when a plugin declares it. That is what makes "install plugin-main →
 * the agent gains workspace powers" literally true.
 *
 * This registry is intentionally separate from the legacy editor-bound
 * `tool-factory-registry`, which keeps working unchanged during migration.
 */

import type { AgentArtifact, AgentScope, AgentToolContext, AgentToolExecutor } from './types'

export interface AgentToolImplementation {
    /** Local name, as referenced by a plugin's `include` list. */
    name: string
    description: string
    inputSchema: any
    readOnly?: boolean
    scope?: AgentScope | AgentScope[]
    /** Optional result → artifact mapping (drives plugin-registered cards). */
    artifactFromResult?: (result: unknown, args: unknown) => AgentArtifact | null
    create: (ctx: AgentToolContext) => AgentToolExecutor
}

const implementations = new Map<string, AgentToolImplementation>()

/** Register core implementations. Later registrations of a name win. */
export function registerAgentToolImplementations(defs: AgentToolImplementation[]): void {
    for (const def of defs) {
        if (!def || !def.name) continue
        implementations.set(def.name, def)
    }
}

/** Look up one implementation by local name. */
export function getAgentToolImplementation(name: string): AgentToolImplementation | undefined {
    return implementations.get(name)
}

/** All registered implementations. */
export function getAgentToolImplementations(): AgentToolImplementation[] {
    return Array.from(implementations.values())
}

/** Clear the registry (tests only). */
export function clearAgentToolImplementations(): void {
    implementations.clear()
}
