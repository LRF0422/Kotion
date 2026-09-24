/**
 * Plugin Agent Contribution contract + registries.
 */
export * from './types'
export * from './namespace'
export * from './registry'
export * from './adapter'

import type { ComponentType } from 'react'
import type {
    AgentActionDefinition,
    AgentArtifactProps,
    AgentContribution,
    AgentContextProviderDefinition,
    PluginAgentDefinition,
    AgentScope,
    AgentSkillDefinition,
    AgentToolDefinition,
    AgentToolRendererContribution,
    AgentArtifactRendererContribution,
    AgentToolResultProps,
    ResolvedAgentScope,
} from './types'
import { agentScopeMatches } from './types'

/** One contribution resolved from a specific plugin, with provenance. */
export interface ResolvedAgentContribution {
    pluginName: string
    pluginKey: string
    desktopOnly: boolean
    contribution: AgentContribution
}

// ---- Resolved shapes (what PluginManager hands to the kernel) ----

export interface ResolvedAgentTool extends AgentToolDefinition {
    /** Model-facing name (namespaced unless \`namespace: false\`). */
    wireName: string
    pluginName: string
    pluginKey: string
    desktopOnly: boolean
}

export interface ResolvedAgentSkill extends AgentSkillDefinition {
    source: 'plugin'
    pluginName: string
    pluginKey: string
}

export interface ResolvedAgentContextProvider extends AgentContextProviderDefinition {
    pluginName: string
    pluginKey: string
}

export interface ResolvedAgentAction extends AgentActionDefinition {
    pluginName: string
    pluginKey: string
}

export interface ResolvedPluginAgent extends Omit<PluginAgentDefinition, 'tools'> {
    /**
     * The agent's own tools, resolved to their wire names — this is the child
     * run's tool subset (the kernel never advertises them on its own).
     */
    toolNames: string[]
    pluginName: string
    pluginKey: string
}

export interface ResolvedAgentToolRenderer extends AgentToolRendererContribution {
    render: ComponentType<AgentToolResultProps>
    pluginName: string
    pluginKey: string
}

export interface ResolvedAgentArtifactRenderer extends AgentArtifactRendererContribution {
    render: ComponentType<AgentArtifactProps>
    pluginName: string
    pluginKey: string
}

export interface ResolvedAgentCapabilities {
    tools: ResolvedAgentTool[]
    skills: ResolvedAgentSkill[]
    context: ResolvedAgentContextProvider[]
    actions: ResolvedAgentAction[]
    agents: ResolvedPluginAgent[]
    /** Conversation cards by tool name (last registration wins). */
    toolRenderers: ResolvedAgentToolRenderer[]
    /** Side-sheet previews by artifact kind. */
    artifactRenderers: ResolvedAgentArtifactRenderer[]
}

/** Filter a contribution down to the declarations that cover `runScope`. */
export function filterContributionByScope(
    contribution: AgentContribution,
    runScope: ResolvedAgentScope,
): AgentContribution {
    const keep = <T extends { scope?: AgentScope | AgentScope[] }>(items?: T[]): T[] | undefined =>
        items ? items.filter(item => agentScopeMatches(item.scope, runScope)) : undefined
    return {
        tools: keep(contribution.tools),
        skills: contribution.skills,
        context: keep(contribution.context),
        actions: keep(contribution.actions),
        agents: keep(contribution.agents),
        // Renderers are not scope-specific: whatever tool/artifact a run can
        // produce, its card is available in every scope.
        include: contribution.include,
        toolRenderers: contribution.toolRenderers,
        artifactRenderers: contribution.artifactRenderers,
    }
}
