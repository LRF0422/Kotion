/**
 * Maps a capability catalog onto the run-creation contract
 * (`CreateRunRequest.tools` / `.skills` / `.deferredTools`).
 *
 * Two policies are applied here, in this order, on the catalogue the run's scope
 * can actually execute:
 *
 *  1. **Progressive discovery** — a NON-CORE tool a skill's fragment names is
 *     withheld and delivered on demand through `load_skill`. The page-editing
 *     baseline is exempt: every core (built-in editor) tool ships with its full
 *     schema on every request, so reading, writing, formatting and structuring a
 *     page never costs a discovery round trip. Discovery is for capabilities the
 *     run may not need — a plugin's tools, an installed skill's tools — never for
 *     the editor itself (see also {@link ESSENTIAL_TOOL_NAMES}).
 *     A skill this CONVERSATION already loaded is the exception to the exception:
 *     it was discovered once, so its tools ship as *deferred* (callable from the
 *     first step, listed by name + signature in the backend's directory) instead of
 *     being withheld again — see {@link BuildAgentRunInputsOptions.loadedSkills}.
 *  2. **The provider ceiling** — only if a host set one; whatever does not fit goes
 *     to the deferred directory (name + signature, schema on first call).
 *
 * Doing step 1 anywhere upstream is a bug with a proven failure mode: withholding
 * before scope filtering left a workspace run with no client tools at all, because
 * the filter then removed every built-in — including the discovery tool that was
 * supposed to bring them back.
 *
 * The accepted type is the structural one from ./payload-types, not the
 * collector's `CapabilityCatalog`: that keeps this module free of the collector's
 * provider wiring, so the pure-logic check harness can compile it.
 */

import type { AgentSkillInput, AgentToolSpec } from '../agent/types'
import type { AgentCapabilityCatalog, ToolPayload } from './payload-types'

/**
 * Non-core tools advertised with full schemas even when progressive discovery is on.
 *
 * Core (built-in editor) tools never take part in discovery at all — the filter in
 * {@link buildAgentRunInputs} keeps every `core: true` tool, which is the whole
 * page-editing baseline (read → address by blockId → write → format → structure →
 * table → layout → page management). This set is the belt-and-braces companion: it
 * forces the names below to ship even if `core` is not set on them — a host that
 * registers a tool without the built-in registry, or the agent-protocol tools a
 * surface adds itself. A name here is advertised regardless of which skill claims
 * it.
 *
 * Everything else a skill owns is learned on demand through `load_skill`.
 */
const ESSENTIAL_TOOL_NAMES = new Set([
    // Page/space entry points (plugin-main). `createPage` and `editPage` have to
    // be callable on the first step of a workbench run: they are what GIVE the run
    // a document (create a new one / retarget to an existing one), and a discovery
    // round trip before either would stall the main flow.
    'createPage',
    // Retargeting the off-screen edit target. Editing any page that is not the
    // current target requires it, so it belongs to the baseline, not to discovery.
    'editPage',
    'listSpaces',
    'getSpacePageTree',
    'searchPages',
    'openPage',
    'getDocumentStructure',
    'readChunk',
    'searchInDocument',
    // Reading includes looking: an image in the document is read with the model's
    // own vision, mid-read, not after a discovery round trip.
    'readImage',
    'replaceBlockById',
    'insertAtBlockId',
    'applyEdits',
    'deleteBlocks',
    'updateTitle',
    'askUserChoice',
    'referenceBlocks',
    'load_skill',
])

/**
 * Default ceiling for CLIENT tools advertised in one request. **0 = no ceiling:
 * advertise every callable tool**, which is the default and the intent.
 *
 * The catalog exists to make capabilities usable, so hiding one is a last resort
 * with a specific cause: a provider that hard-caps its `tools` array. OpenAI's
 * compatible endpoints cap it at 128 functions; DeepSeek's own API documents no
 * count limit (only unique, ≤128-char names), and this repo's deployments talk to
 * a DeepSeek-compatible gateway — so the ceiling stays OFF unless a host sets it.
 *
 * Measured cost of leaving it off: a page run offers ~166 client tools (77
 * built-in + ~89 from the 11 default-loaded plugins), ~178 including the
 * backend's own. `estimateTokens` charges 64 tokens per tool, i.e. ~11k of the
 * 60k context budget, and the array rides in the provider's cached prefix.
 *
 * With progressive discovery ON (the default) that number is far lower, and the
 * split is deliberate: the core built-in editing set ships in full (~78 tools,
 * ≈5k tokens — the `core: true` half of the filter in
 * {@link buildAgentRunInputs}), while a plugin/installed skill's tools travel as
 * names and cost nothing until the model actually needs them. Paying a few hundred
 * tokens per editing tool is the price of never making the agent learn how to
 * write to a page it can already see.
 *
 * History: an earlier default of 112 sliced that catalog to 35 plugin slots, which
 * pushed whole capabilities into the deferred directory —
 * `addBitableRecord`/`getBitableList`/`updateBitableRecord` and
 * `updateChart`/`listCharts` disappeared while `insertBitable`/`insertChart`
 * stayed, so a multi-step plugin capability (insert, then read, then write) could
 * not be completed at all. A tool list that hides half of a workflow is worse
 * than a long one.
 *
 * A host that does hit a provider cap sets `VITE_KN_MAX_ADVERTISED_TOOLS` (or
 * passes `toolBudget`); see {@link selectAdvertisedTools} for what is dropped
 * first.
 */
export const DEFAULT_TOOL_BUDGET = 0

export interface AgentRunInputs {
    /** Tools offered to the model with their full schemas. */
    tools: AgentToolSpec[]
    /** Prompt fragments plus the tool names each skill owns. */
    skills: AgentSkillInput[]
    /**
     * Tools that could not fit the provider's tool ceiling: CALLABLE and routable,
     * but not offered to the model with a schema until its first call (the
     * backend advertises name + signature in the injected directory and returns
     * the schema with that first result).
     */
    deferredTools: AgentToolSpec[]
}

export interface BuildAgentRunInputsOptions {
    /**
     * Skills THIS CONVERSATION already loaded through `load_skill` (see
     * skills/loaded-skill-cache for why the client owns that memory).
     *
     * Their tools stop being "learn it on demand" and become callable now: they
     * travel as {@link AgentRunInputs.deferredTools} — routable from the first
     * step, listed in the backend's 【按需工具】 directory — while staying OUT of the
     * `tools` array. That last part is the point: `tools` renders before the
     * messages, so advertising a newly loaded skill there would re-bill the whole
     * cached prefix for one turn. The schema is already in the transcript from the
     * `load_skill` result, so nothing is lost.
     *
     * Names are matched against the filtered catalogue, and only tools that
     * progressive discovery would otherwise withhold are affected — a tool that
     * already ships (core, `scope: 'any'`, essential, or fragment-less skill) is
     * never demoted to deferred, and a skill the scope cannot run contributes
     * nothing.
     */
    loadedSkills?: Iterable<string>
}

function toToolSpec(tool: ToolPayload): AgentToolSpec {
    return {
        name: tool.function.name,
        description: tool.function.description,
        inputSchema: tool.function.parameters,
        kind: 'frontend',
        readOnly: tool.readOnly === true,
        source: 'client',
    }
}

/**
 * Split the catalog into what the model is offered and what the provider's tool
 * ceiling pushed into the deferred channel.
 *
 * With no budget (the default) nothing is deferred. When a host sets one — only
 * because its provider hard-caps `tools` — the rules are, in order:
 *  - A core (built-in editor) tool is NEVER deferred. It is the tool family the
 *    agent cannot work without, and hiding one is the regression this whole path
 *    exists to prevent.
 *  - Plugin tools fill whatever room remains, ranked by: tools a skill's prompt
 *    fragment talks about first (the model is most likely to call them; see
 *    `ContextManager#renderSkillFragment`), then metadata priority, then name. A
 *    plugin's insertion tools declare priority 9 precisely so a capability keeps
 *    its entry point.
 *  - The surplus goes to `deferredTools` WITH its schema, so the backend can both
 *    route it and hand the schema back on first use. Note that a partially
 *    advertised multi-tool capability is barely usable — the directory lists names
 *    and signatures but no descriptions.
 *
 * Sorting of the advertised list is preserved from the catalog (by name) so the
 * request payload stays byte-stable across turns and the provider's prefix cache
 * keeps hitting.
 */
export function buildAgentRunInputs(
    catalog: AgentCapabilityCatalog,
    options: BuildAgentRunInputsOptions = {},
): AgentRunInputs {
    // Discovery is decided HERE, on the catalogue this scope can actually run.
    // `described` is also the ceiling's ranking signal (a tool the prompt talks
    // about is the one the model is most likely to call), so it stays available
    // even when discovery is switched off.
    const described = describedNames(catalog.skills)
    const discoverable = catalog.skillDiscovery === false ? new Set<string>() : described

    // What progressive discovery withholds on this catalogue: a discoverable
    // non-core tool that is not part of the editor baseline.
    const withheld = new Set(
        catalog.tools
            .filter(tool => discoverable.has(tool.function.name)
                && !isBaselineTool(tool))
            .map(tool => tool.function.name),
    )
    // …minus what this CONVERSATION already discovered. Those tools were learned
    // once (`load_skill` handed their schemas over, and the transcript still
    // carries them); withholding them again is what forced a second discovery round
    // trip on every new turn. They move to the callable channel below instead.
    const cachedAndWithheld = new Set(
        ownedToolNames(catalog.skills, options.loadedSkills).filter(name => withheld.has(name)),
    )
    const stillWithheld = new Set([...withheld].filter(name => !cachedAndWithheld.has(name)))

    // A NON-CORE tool a skill names ships as a NAME only: the fragment advertises
    // it and `load_skill` delivers its schema when the model asks for it.
    //
    // The editor baseline never rides discovery: every core (built-in editor) tool
    // ships with its full schema, so a page run can read, write, format, table and
    // restructure content on its FIRST step. Withholding a core tool is the exact
    // regression this split exists to prevent — a model cannot reliably call a
    // function it was never shown declared, whatever the prompt says about it.
    // Protocol tools (`scope: 'any'`) and the pinned host names ship the same way.
    const candidates = catalog.tools.filter(tool => !stillWithheld.has(tool.function.name))

    // Already-loaded tools never take part in the ceiling contest either: they were
    // discovered under a previous request's budget, and dropping one now would put
    // the model back to a discovery round trip mid-conversation.
    const advertised = selectAdvertisedTools(
        candidates.filter(tool => !cachedAndWithheld.has(tool.function.name)),
        described,
        catalog.toolBudget,
    )
    const advertisedNames = new Set(advertised.map(tool => tool.function.name))

    return {
        tools: advertised.map(toToolSpec),
        // Two reasons a tool ends up here: it did not fit the provider's ceiling
        // (name + signature in the directory, schema on first call), or this
        // conversation already loaded it — callable from the first step, with the
        // schema already in the transcript. A withheld-but-undiscovered tool is
        // NEITHER: `load_skill` still hands it over whole.
        deferredTools: candidates
            .filter(tool => !advertisedNames.has(tool.function.name))
            .map(toToolSpec),
        skills: catalog.skills.map(skill => {
            const requiredTools = uniqueNames(skill.requiredTools)
            const optionalTools = uniqueNames(skill.optionalTools)
            const input: AgentSkillInput = {
                name: skill.name,
                systemPromptFragment: labelledFragment(skill.name, skill.systemPromptFragment),
            }
            // The declared names travel with the skill so the backend can render
            // them under its prompt fragment — the join between "find-and-replace
            // content" and `replaceContent` has to be explicit, not guessed.
            if (requiredTools.length > 0) input.requiredTools = requiredTools
            if (optionalTools.length > 0) input.optionalTools = optionalTools
            return input
        }),
    }
}

/**
 * Prefix a skill's fragment with its name.
 *
 * The model reaches a skill's tools by calling the discovery tool with the skill's
 * NAME, but the prompt only ever carried the fragment's prose — so the name was
 * unguessable and the model invented one ("插件开发台"), wasting a step per attempt.
 * The label is the client's own wire convention (see the `capability-discovery`
 * skill, which explains it), so the backend keeps rendering fragments verbatim
 * without knowing anything about skills or discovery.
 *
 * A fragment-less skill is left alone: its tools are advertised directly, so there
 * is nothing to discover by name.
 */
function labelledFragment(name: string, fragment: string | undefined): string | undefined {
    const text = fragment?.trim()
    if (!text) return fragment
    return `【技能名】${name}\n\n${text}`
}

/**
 * Tools that never ride discovery: core editor tools, protocol tools registered
 * for every scope, and the pinned host names.
 */
function isBaselineTool(tool: ToolPayload): boolean {
    return tool.core === true
        || tool.scope === 'any'
        || ESSENTIAL_TOOL_NAMES.has(tool.function.name)
}

/**
 * Tool names owned by the skills this conversation already loaded.
 *
 * Matched by the skill's own name — `loadedSkills` carries what `load_skill`
 * resolved and echoed (`bundle.skill`), which is this same catalogue's name for the
 * skill. A skill the current scope dropped (its document is gone, the plugin was
 * uninstalled, the user deactivated it) simply contributes nothing: the live
 * catalogue stays the only source of what can run.
 */
function ownedToolNames(
    skills: AgentCapabilityCatalog['skills'],
    loadedSkills?: Iterable<string>,
): string[] {
    const loaded = new Set<string>()
    for (const name of loadedSkills ?? []) {
        const trimmed = typeof name === 'string' ? name.trim() : ''
        if (trimmed) loaded.add(trimmed)
    }
    if (loaded.size === 0) return []
    const names: string[] = []
    for (const skill of skills) {
        if (!loaded.has(skill.name)) continue
        names.push(...(skill.requiredTools ?? []), ...(skill.optionalTools ?? []))
    }
    return names
}

/**
 * Tool names a skill's prompt fragment advertises — the ones the model is told
 * exist and `load_skill` can deliver. A fragment-less skill (the auto-generated
 * `<plugin>-default`) advertises nothing, so its tools keep their schemas.
 */
function describedNames(skills: AgentCapabilityCatalog['skills']): Set<string> {
    const described = new Set<string>()
    for (const skill of skills) {
        if (!skill.systemPromptFragment || !skill.systemPromptFragment.trim()) continue
        for (const name of [...(skill.requiredTools ?? []), ...(skill.optionalTools ?? [])]) {
            if (typeof name === 'string' && name.trim()) described.add(name.trim())
        }
    }
    return described
}

/** The tools offered to the model: all core tools, then the best plugin tools that fit. */
function selectAdvertisedTools(
    tools: ToolPayload[],
    described: Set<string>,
    budget?: number,
): ToolPayload[] {
    const limit = budget ?? DEFAULT_TOOL_BUDGET
    // 0 = no ceiling (the default): advertise everything, defer nothing.
    if (!limit || limit <= 0 || tools.length <= limit) {
        return tools
    }

    const isCore = (tool: ToolPayload) => tool.core === true
    const core = tools.filter(isCore)
    // Even if core tools alone exceed the budget they are all kept: a request
    // that breaks the provider's ceiling fails loudly, while a missing editor
    // tool fails silently in the worst possible way (the agent guesses a name).
    const room = Math.max(0, limit - core.length)

    const pluginRanked = tools
        .filter(tool => !isCore(tool))
        .sort((a, b) => {
            const describedDelta = rank(described, a) - rank(described, b)
            if (describedDelta !== 0) return describedDelta
            const priorityDelta = (b.priority ?? 0) - (a.priority ?? 0)
            if (priorityDelta !== 0) return priorityDelta
            return a.function.name.localeCompare(b.function.name)
        })

    const keep = new Set([...core, ...pluginRanked.slice(0, room)].map(tool => tool.function.name))
    return tools.filter(tool => keep.has(tool.function.name))
}

/** 0 = the prompt talks about this tool, 1 = it does not. */
function rank(described: Set<string>, tool: ToolPayload): number {
    return described.has(tool.function.name) ? 0 : 1
}

/** De-duplicated, blank-free, declaration-ordered names (stable across turns). */
function uniqueNames(names?: string[]): string[] {
    const seen = new Set<string>()
    const result: string[] = []
    for (const name of names ?? []) {
        const trimmed = typeof name === 'string' ? name.trim() : ''
        if (!trimmed || seen.has(trimmed)) continue
        seen.add(trimmed)
        result.push(trimmed)
    }
    return result
}
