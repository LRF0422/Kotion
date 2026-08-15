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

/** Feature flag: when true, tools[] is omitted from the catalog (skills-only mode).
 *  All tool schemas travel exclusively inside each SkillPayload.tools field. */
const SKILLS_ONLY_DEFAULT = (import.meta as any).env?.KN_SKILLS_ONLY_CATALOG === 'true'

export interface CapabilityCatalog {
    skills: SkillPayload[]
    tools: ToolPayload[]
    /** Stable hash of (skills, tools). Sent as `capabilitiesVersion` so the backend can cache. */
    version: string
}

/**
 * Build a {@link CapabilityCatalog} from the live providers.
 *
 * Tool catalog: only built-in tools are shipped in the top-level `tools[]`.
 * Plugin tools stay registered in {@link ToolProvider} for frontend execution
 * and are transmitted to the backend **only** inside each `SkillPayload.tools`
 * — every skill carries the full OpenAI-shaped definitions of the tools it
 * references. This keeps the top-level catalog small and scopes plugin tool
 * schemas to the skills that actually use them.
 *
 * Skill catalog includes all registered skills (built-in, plugin,
 * user-installed). User-installed skills arrive via `skillRegistry.toSkillFormat()`
 * tagged as `plugin` with a `user:` pluginName prefix; this collector remaps
 * them to `source: 'user'` so the backend can tell them apart.
 */
export function collectCapabilityCatalog(
    skillProvider: SkillProvider,
    toolProvider: ToolProvider,
    /** When true, skip populating the top-level tools[] array — all tool
     *  schemas travel inside SkillPayload.tools. Defaults to the
     *  KN_SKILLS_ONLY_CATALOG env var. */
    skillsOnly: boolean = SKILLS_ONLY_DEFAULT
): CapabilityCatalog {
    const executableTools = toolProvider.getAllTools()

    // Only built-in tools are sent to the backend, in the standard OpenAI
    // function-call shape. Plugin tools are executed on the frontend and
    // reached via skill `requiredTools` references.
    //
    // When skillsOnly is enabled, tools[] is left empty — every tool schema
    // is embedded in the skills that reference it (SkillPayload.tools).
    const tools: ToolPayload[] = skillsOnly ? [] : toolProvider.getAllMetadata()
        .filter(meta => meta.source === 'builtin')
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        .map(meta => {
            const executable = executableTools[meta.name]
            const parameters = executable
                ? resolveInputSchema(executable.inputSchema)
                : { type: 'object', properties: {} }

            return {
                type: 'function' as const,
                function: {
                    name: meta.name,
                    description: meta.description,
                    parameters,
                },
            }
        })

    // Deterministic ordering: the catalog becomes part of every request's
    // prompt prefix, and provider context caches (DeepSeek etc.) only hit when
    // the prefix is byte-identical across turns. Sort skills/tools by name so
    // registration order can never reorder (and thus evict) the cached prefix.
    const sortedSkills = skillProvider.getAllSkills()
        .slice()
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    const skills: SkillPayload[] = sortedSkills.map(skill => {
        // User-installed skills are stored as `source: 'plugin'` with a `user:` pluginName
        // prefix; surface them to the backend as a distinct `user` source.
        const isUserInstalled = skill.source === 'plugin' &&
            typeof skill.pluginName === 'string' &&
            skill.pluginName.startsWith('user:')

        // Embed the full OpenAI-shaped definitions for every tool the skill
        // references. This is the only path by which plugin tool schemas reach
        // the backend — they are not present in the top-level `tools[]` array.
        const referencedNames = [
            ...(skill.requiredTools ?? []),
            ...(skill.optionalTools ?? []),
        ].sort((a, b) => a.localeCompare(b))
        const seen = new Set<string>()
        const skillTools: ToolPayload[] = []
        for (const name of referencedNames) {
            if (seen.has(name)) continue
            seen.add(name)
            const executable = executableTools[name]
            if (!executable) continue // tool not registered in this session; skip
            const meta = toolProvider.getToolMetadata(name)
            skillTools.push({
                type: 'function' as const,
                function: {
                    name,
                    description: meta?.description ?? executable.description ?? '',
                    parameters: resolveInputSchema(executable.inputSchema),
                },
            })
        }

        const payload: SkillPayload = {
            name: skill.name,
            description: skill.description,
            requiredTools: skill.requiredTools,
            source: isUserInstalled ? 'user' : skill.source,
        }
        if (skill.optionalTools) payload.optionalTools = skill.optionalTools
        if (skillTools.length > 0) payload.tools = skillTools
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
