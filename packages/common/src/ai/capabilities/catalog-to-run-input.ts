/**
 * Maps a capability catalog onto the run-creation contract
 * (`CreateRunRequest.tools` / `.skills` / `.deferredTools`).
 *
 * Every tool the catalog advertises travels in `tools[]` with its schema; each
 * skill travels with the names it owns so the backend can render them under its
 * prompt fragment. The only thing that ever moves out of `tools[]` is a tool the
 * provider's tool ceiling cannot fit (see {@link DEFAULT_TOOL_BUDGET}).
 *
 * The accepted type is the structural one from ./payload-types, not the
 * collector's `CapabilityCatalog`: that keeps this module free of the collector's
 * provider wiring, so the pure-logic check harness can compile it.
 */

import type { AgentSkillInput, AgentToolSpec } from '../agent/types'
import type { AgentCapabilityCatalog, ToolPayload } from './payload-types'

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
export function buildAgentRunInputs(catalog: AgentCapabilityCatalog): AgentRunInputs {
    const advertised = selectAdvertisedTools(catalog.tools, describedNames(catalog.skills), catalog.toolBudget)
    const advertisedNames = new Set(advertised.map(tool => tool.function.name))

    return {
        tools: advertised.map(toToolSpec),
        deferredTools: catalog.tools
            .filter(tool => !advertisedNames.has(tool.function.name))
            .map(toToolSpec),
        skills: catalog.skills.map(skill => {
            const requiredTools = uniqueNames(skill.requiredTools)
            const optionalTools = uniqueNames(skill.optionalTools)
            const input: AgentSkillInput = {
                name: skill.name,
                systemPromptFragment: skill.systemPromptFragment,
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

/** Tool names a skill's prompt fragment describes, i.e. the ones it advertises. */
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
