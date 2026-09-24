/**
 * Scope filtering for the kernel capability catalog.
 *
 * The frontend catalog is assembled from the editor ToolProvider, which eagerly
 * instantiates every built-in editor tool (they are document-bound and need a
 * live editor). A workspace-scoped run has no editor, so those tools must not be
 * advertised — otherwise the model calls them and gets a runtime failure.
 *
 * Plugin-contributed tools are the ones a scope-filtered surface runs on; their
 * availability is decided by the caller (see useWorkspaceAgent, which accepts
 * `source === 'plugin'`). When plugin-main later declares core-implemented
 * workspace tools through `agent.include`, those register as plugin tools too,
 * so they flow through here unchanged.
 *
 * Types come from ./payload-types rather than ../capabilities on purpose: the
 * collector module reads `import.meta`, which the pure-logic check scripts
 * compile under CommonJS.
 */

import type { SkillPayload, ToolPayload } from '../capabilities/payload-types'

/** Structural view of a capability catalog (matches CapabilityCatalog). */
export interface AgentCapabilityCatalog {
    skills: SkillPayload[]
    tools: ToolPayload[]
    version: string
}

/**
 * Drop every tool the scope cannot run, and reconcile the skills that
 * referenced them: a skill whose required tools all vanished (and that has no
 * tool payload left) is dropped, so it never advertises an unusable workflow.
 *
 * Generic over the catalog type so the caller keeps its concrete type.
 */
export function filterAgentCatalog<T extends AgentCapabilityCatalog>(
    catalog: T,
    isAvailable: (name: string) => boolean,
): T {
    const tools: ToolPayload[] = catalog.tools.filter(tool => isAvailable(tool.function.name))
    const skills: SkillPayload[] = []

    for (const skill of catalog.skills) {
        const originalRequired = skill.requiredTools ?? []
        const requiredTools = originalRequired.filter(isAvailable)
        const optionalTools = skill.optionalTools?.filter(isAvailable)
        const skillTools = skill.tools?.filter(tool => isAvailable(tool.function.name))

        const lostAllRequired = originalRequired.length > 0 && requiredTools.length === 0
        if (lostAllRequired && (skillTools?.length ?? 0) === 0) continue

        skills.push({ ...skill, requiredTools, optionalTools, tools: skillTools })
    }

    return {
        ...catalog,
        tools,
        skills,
        // The filtered catalog is a distinct capability set. Keep a stable but
        // distinct version so the backend's capabilitiesVersion cache can never
        // answer with schemas from the unfiltered catalog.
        version: `${catalog.version}:f`,
    }
}
