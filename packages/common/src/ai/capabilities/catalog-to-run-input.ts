/**
 * Maps a {@link CapabilityCatalog} onto the run-creation contract
 * (`CreateRunRequest.tools` / `.skills`).
 *
 * Both consumers of the catalog (the chat panel and the system assistant panel)
 * must agree on this mapping: a tool that reaches neither `tools` nor
 * `skills[].tools` is described by its skill prompt but rejected with
 * `TOOL_NOT_FOUND` when the model calls it.
 */

import type { AgentSkillInput, AgentToolSpec } from '../agent/types'
import type { CapabilityCatalog } from './CapabilityCatalog'
import type { ToolPayload } from './payload-types'

export interface AgentRunInputs {
    /** Always offered to the model, schemas included. */
    tools: AgentToolSpec[]
    /** Prompt fragments plus each skill's deferred tools. */
    skills: AgentSkillInput[]
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
export function buildAgentRunInputs(catalog: CapabilityCatalog): AgentRunInputs {
    return {
        tools: catalog.tools.map(toToolSpec),
        skills: catalog.skills.map(skill => {
            const input: AgentSkillInput = {
                name: skill.name,
                systemPromptFragment: skill.systemPromptFragment,
            }
            if (skill.tools && skill.tools.length > 0) {
                input.tools = skill.tools.map(toToolSpec)
            }
            return input
        }),
    }
}
