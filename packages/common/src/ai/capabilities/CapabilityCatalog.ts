/**
 * CapabilityCatalog - Collects the full frontend capability catalog
 *
 * The frontend performs no capability discovery of any kind: it collects the
 * complete catalog (skills + tools) from every source and ships it inline with
 * every chat request, and every tool it ships carries its full JSON Schema.
 *
 * That is deliberate. The previous policy split the catalog by cost — a tool a
 * skill claimed was pulled out of `tools[]` and registered as *deferred*, with
 * the model given only a name + parameter signature in an injected directory and
 * the schema returned after its first call. In practice the model cannot reliably
 * call a function it has never seen declared: the directory has no descriptions
 * (by design), the skill fragments describe steps in prose without spelling tool
 * names, and the base prompt used to advertise a `editor.*` namespace that does
 * not exist. The observed result was invented names (`editor_insertBlocks`),
 * `TOOL_NOT_FOUND`, and retries with a different invented prefix.
 *
 * So: no deferral, no discovery. A tool the run cannot execute is simply not
 * advertised; a tool it can execute is advertised with its schema. The single
 * exception is capacity, not policy: a tool the provider's `tools` ceiling cannot
 * fit is moved to the overflow channel by `buildAgentRunInputs`, and core editor
 * tools are never the ones dropped.
 */

import type { SkillPayload, ToolPayload } from './payload-types'
import type { SkillProvider } from '../providers/SkillProvider'
import type { ToolProvider } from '../providers/ToolProvider'
import { resolveInputSchema } from '../utils/tool-wrapper'
import { BUILTIN_TOOL_METADATA } from '../discovery/tool-metadata'

/** Tool categories that never mutate the document and are safe in PLAN mode. */
const READ_ONLY_CATEGORIES = new Set(['document-read', 'discovery', 'interaction'])

/**
 * Every tool the built-in metadata registry owns.
 *
 * Membership by NAME, not by `ToolMetadata.source`: plugin-main re-declares some
 * core tools through `agent.include` (same bare names, workspace-scoped copies),
 * and that re-registration rewrites their metadata to `source: 'plugin'`. The
 * name is what identifies the capability, so the budget in
 * `buildAgentRunInputs` must classify by name or it would treat `createPage` and
 * `searchPages` as droppable plugin tools.
 */
const CORE_TOOL_NAMES = new Set(BUILTIN_TOOL_METADATA.map(meta => meta.name))

/**
 * Read-only classification shared by the run catalog (plan-mode gating) and the
 * client executor (write-lease decision). A tool is read-only when it says so
 * explicitly, or when its category is inherently non-mutating.
 */
export function isReadOnlyTool(meta: { category: string } | undefined, executable: any): boolean {
    if (executable?.readOnly === true) return true
    return !!meta && READ_ONLY_CATEGORIES.has(meta.category)
}

export interface CapabilityCatalog {
    skills: SkillPayload[]
    tools: ToolPayload[]
    /**
     * Max client tools to advertise to the model, when the host configured one
     * (0 = unlimited). Applied later, on the scope-filtered catalog — see
     * {@link buildAgentRunInputs}.
     */
    toolBudget?: number
    /** Stable hash of (skills, tools). Sent as `capabilitiesVersion` so the backend can cache. */
    version: string
}

export interface CollectCapabilityCatalogOptions {
    /**
     * Provider tools[] ceiling for client tools. Undefined = the default applied
     * when the run input is built. 0 disables the budget (advertise everything).
     */
    toolBudget?: number
}

/**
 * Build a {@link CapabilityCatalog} from the live providers.
 *
 * Every executable tool is advertised in `tools[]` with its full schema, in the
 * standard OpenAI function-call shape. Metadata entries without an instantiated
 * executable (no registered factory, or a plugin tool skipped in this scope) are
 * dropped: advertising a tool the frontend cannot run is worse than hiding it.
 *
 * `skills[]` carries prompt fragments and the names each skill owns — nothing
 * else. Those names are what the backend renders under the fragment so the model
 * can map a prose step ("find-and-replace content") onto the exact function
 * (`replaceContent`); the schemas themselves are already in `tools[]`.
 *
 * Nothing is withheld here. The provider's tools-ceiling is enforced when the
 * run input is built, against the already scope-filtered catalog, so a page run
 * and a workspace run each get their own budget.
 *
 * Skill catalog includes all registered skills (built-in, plugin,
 * user-installed). User-installed skills arrive via `skillRegistry.toSkillFormat()`
 * tagged as `plugin` with a `user:` pluginName prefix; this collector remaps
 * them to `source: 'user'` so the backend can tell them apart.
 */
export function collectCapabilityCatalog(
    skillProvider: SkillProvider,
    toolProvider: ToolProvider,
    options: CollectCapabilityCatalogOptions = {},
): CapabilityCatalog {
    const executableTools = toolProvider.getAllTools()
    const allSkills = skillProvider.getAllSkills()

    // A skill survives only if it is runnable in THIS session: a prompt-only
    // skill (no requirements), or one with at least one executable required
    // tool. Otherwise it would describe tools the run cannot resolve
    // (TOOL_NOT_FOUND) — e.g. editor-plugin skills in a run with no editor.
    const skillSurvives = (skill: { requiredTools?: string[] }): boolean => {
        const required = skill.requiredTools ?? []
        return required.length === 0 || required.some(name => !!executableTools[name])
    }

    const allMetadata = toolProvider.getAllMetadata()

    const toPayload = (meta: (typeof allMetadata)[number]): ToolPayload => {
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
            readOnly: isReadOnlyTool(meta, executable),
            // Never the ones to drop when the budget bites: hiding a built-in
            // editor tool is exactly what made the agent unable to edit.
            core: CORE_TOOL_NAMES.has(meta.name),
            priority: meta.priority,
        }
    }

    const byName = (a: { name: string }, b: { name: string }) =>
        (a.name || '').localeCompare(b.name || '')

    const tools: ToolPayload[] = allMetadata
        .filter(meta => !!executableTools[meta.name])
        .sort(byName)
        .map(toPayload)

    // Deterministic ordering: the catalog becomes part of every request's
    // prompt prefix, and provider context caches (DeepSeek etc.) only hit when
    // the prefix is byte-identical across turns. Sort skills/tools by name so
    // registration order can never reorder (and thus evict) the cached prefix.
    const sortedSkills = allSkills
        .slice()
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    const skills: SkillPayload[] = []
    for (const skill of sortedSkills) {
        // Dropped above: its required tools are not runnable here.
        if (!skillSurvives(skill)) continue

        // User-installed skills are stored as `source: 'plugin'` with a `user:` pluginName
        // prefix; surface them to the backend as a distinct `user` source.
        const isUserInstalled = skill.source === 'plugin' &&
            typeof skill.pluginName === 'string' &&
            skill.pluginName.startsWith('user:')

        // Names only, and only the ones this run can actually execute: a name the
        // model cannot call must never appear under a skill's fragment.
        const requiredTools = (skill.requiredTools ?? []).filter(name => !!executableTools[name])
        const optionalTools = (skill.optionalTools ?? []).filter(name => !!executableTools[name])

        const payload: SkillPayload = {
            name: skill.name,
            description: skill.description,
            requiredTools,
            source: isUserInstalled ? 'user' : skill.source,
        }
        if (optionalTools.length > 0) payload.optionalTools = optionalTools
        if (skill.systemPromptFragment) payload.systemPromptFragment = skill.systemPromptFragment
        if (skill.tags) payload.tags = skill.tags
        if (skill.domain) payload.domain = skill.domain
        if (skill.pluginName) payload.pluginName = skill.pluginName
        skills.push(payload)
    }

    const version = hashCatalog(skills, tools)
    const catalog: CapabilityCatalog = { skills, tools, version }
    if (typeof options.toolBudget === 'number') catalog.toolBudget = options.toolBudget
    return catalog
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
