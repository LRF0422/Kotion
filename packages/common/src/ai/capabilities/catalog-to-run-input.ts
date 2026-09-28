/**
 * Maps a capability catalog onto the run-creation contract
 * (`CreateRunRequest.tools` / `.skills`).
 *
 * Both consumers of the catalog (the chat panel and the system assistant panel)
 * must agree on this mapping: a tool that reaches neither `tools` nor
 * `skills[].tools` is described by its skill prompt but rejected with
 * `TOOL_NOT_FOUND` when the model calls it.
 *
 * The accepted type is the structural one from ./payload-types, not the
 * collector's `CapabilityCatalog`: this module is compiled by the pure-logic
 * check harness under CommonJS, and the collector reads `import.meta`.
 */

import type { AgentSkillInput, AgentToolSpec } from '../agent/types'
import type { AgentCapabilityCatalog, ToolPayload } from './payload-types'

export interface AgentRunInputs {
    /** Always offered to the model, schemas included. */
    tools: AgentToolSpec[]
    /** Prompt fragments plus each skill's deferred tools. */
    skills: AgentSkillInput[]
    /**
     * Callable but NOT offered to the model: plugin-agent tools. They reach the
     * backend's deferred catalog so a delegated child run can call them.
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
 * Split the catalog into the two halves the backend expects. Skill-owned tools
 * are registered as *deferred*: callable from the first turn, but advertised by
 * signature only until the model uses one, which keeps plugin JSON Schemas out
 * of every prompt. The backend dedupes `skills[].tools` against `tools`.
 */
export function buildAgentRunInputs(catalog: AgentCapabilityCatalog): AgentRunInputs {
    return {
        tools: catalog.tools.map(toToolSpec),
        deferredTools: (catalog.deferredTools ?? []).map(toToolSpec),
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
            if (skill.tools && skill.tools.length > 0) {
                input.tools = skill.tools.map(toToolSpec)
            }
            return input
        }),
    }
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
