/**
 * CapabilityCatalog - Collects the full frontend capability catalog
 *
 * The frontend no longer performs progressive discovery. Instead, it collects
 * the complete catalog (skills + tools) from every source and ships it inline
 * with every chat request. The backend is responsible for progressive
 * activation based on the catalog it receives.
 */

import type { SkillPayload, ToolPayload } from '../chat-client/types'
import type { SkillProvider } from '../providers/SkillProvider'
import type { ToolProvider } from '../providers/ToolProvider'
import { resolveInputSchema } from '../utils/tool-wrapper'

export interface CapabilityCatalog {
    skills: SkillPayload[]
    tools: ToolPayload[]
    /** Stable hash of (skills, tools). Sent as `capabilitiesVersion` so the backend can cache. */
    version: string
}

/**
 * Build a {@link CapabilityCatalog} from the live providers.
 *
 * Tool catalog includes every entry in {@link ToolProvider.getAllMetadata} —
 * each is guaranteed to have an executable counterpart in {@link ToolProvider.getAllTools}
 * because tools are instantiated eagerly.
 *
 * Skill catalog includes all registered skills (built-in, plugin,
 * user-installed). User-installed skills arrive via `skillRegistry.toSkillFormat()`
 * tagged as `plugin` with a `user:` pluginName prefix; this collector remaps
 * them to `source: 'user'` so the backend can tell them apart.
 */
export function collectCapabilityCatalog(
    skillProvider: SkillProvider,
    toolProvider: ToolProvider
): CapabilityCatalog {
    const executableTools = toolProvider.getAllTools()

    const tools: ToolPayload[] = toolProvider.getAllMetadata().map(meta => {
        const executable = executableTools[meta.name]
        const parameters = executable
            ? resolveInputSchema(executable.inputSchema)
            : { type: 'object', properties: {} }

        const payload: ToolPayload = {
            name: meta.name,
            description: meta.description,
            parameters,
            category: meta.category,
            priority: meta.priority,
            tags: meta.tags ?? [],
            source: meta.source,
        }
        if (meta.pluginName) payload.pluginName = meta.pluginName
        return payload
    })

    const skills: SkillPayload[] = skillProvider.getAllSkills().map(skill => {
        // User-installed skills are stored as `source: 'plugin'` with a `user:` pluginName
        // prefix; surface them to the backend as a distinct `user` source.
        const isUserInstalled = skill.source === 'plugin' &&
            typeof skill.pluginName === 'string' &&
            skill.pluginName.startsWith('user:')

        const payload: SkillPayload = {
            name: skill.name,
            description: skill.description,
            requiredTools: skill.requiredTools,
            source: isUserInstalled ? 'user' : skill.source,
        }
        if (skill.optionalTools) payload.optionalTools = skill.optionalTools
        if (skill.systemPromptFragment) payload.systemPromptFragment = skill.systemPromptFragment
        if (skill.tags) payload.tags = skill.tags
        if (skill.pluginName) payload.pluginName = skill.pluginName
        return payload
    })

    const version = hashCatalog(skills, tools)
    return { skills, tools, version }
}

/**
 * FNV-1a 32-bit hash over the stringified catalog. Stable for identical
 * catalogs across turns so the backend can cheaply detect no-op updates.
 */
function hashCatalog(skills: SkillPayload[], tools: ToolPayload[]): string {
    const serialized = JSON.stringify({ skills, tools })
    let hash = 0x811c9dc5 >>> 0
    for (let i = 0; i < serialized.length; i++) {
        hash ^= serialized.charCodeAt(i)
        hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0
    }
    return hash.toString(16)
}
