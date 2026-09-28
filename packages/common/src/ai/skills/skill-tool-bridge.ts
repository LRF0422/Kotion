/**
 * Skill tool bridge — how the client hands a skill's tool schemas to the agent.
 *
 * <p>Progressive discovery, cache-safely: the client advertises only a small
 * essential tool set plus the skill fragments (which name each skill's tools).
 * When the model needs one of those tools it calls the always-available
 * `load_skill` tool; that executor asks this bridge for the skill's schemas and
 * returns them <em>inside its tool result</em>.
 *
 * <p>Why a tool result: the provider caches the request prefix, and `tools` renders
 * before the messages. Adding a schema to the tool array mid-conversation
 * invalidates the cached prefix for everything after it, whereas a tool result is
 * appended at the tail — the prefix stays byte-identical and only the new tail is
 * billed at full price. The backend then marks the returned tools routable, so the
 * model's next call reaches the executor.
 *
 * <p>The catalog layer (which knows the live skill → tool mapping) registers the
 * source; the tool factory (in core) consumes it. Neither imports the other.
 */

import type { AgentToolSpec } from '../agent/types'
import type { SkillProvider } from '../providers/SkillProvider'
import type { ToolProvider } from '../providers/ToolProvider'
import { resolveInputSchema } from '../utils/tool-wrapper'

export interface SkillToolBundle {
    /** The skill the schemas belong to, echoed back for the model's benefit. */
    skill: string
    /** Full OpenAI-shaped specs for the skill's callable tools. */
    tools: AgentToolSpec[]
}

/** The live skill → tool-spec mapping of this client. */
export interface SkillToolSource {
    /** Skill names whose tools can be delivered on demand. */
    skillNames: () => string[]
    /** Resolve one skill; null when this client has no such skill. */
    resolve: (skill: string) => SkillToolBundle | null
}

let source: SkillToolSource | null = null

/** Registered by the capability hook once the live providers exist. */
export function registerSkillToolSource(next: SkillToolSource | null): void {
    source = next
}

export function getSkillToolSource(): SkillToolSource | null {
    return source
}

/**
 * Build the discovery source from the live providers.
 *
 * Shared by the capability hook (the running app) and the check harness, so what
 * is tested is the code that actually serves `load_skill`.
 */
export function createSkillToolSource(
    skillProvider: SkillProvider,
    toolProvider: ToolProvider,
): SkillToolSource {
    const callableNames = (skill: { requiredTools?: string[]; optionalTools?: string[] }) => [
        ...(skill.requiredTools ?? []),
        ...(skill.optionalTools ?? []),
    ]

    return {
        skillNames: () => skillProvider.getAllSkills()
            .filter(skill => callableNames(skill).some(name => !!toolProvider.getAllTools()[name]))
            .map(skill => skill.name)
            .sort(),
        resolve: (skillName: string) => {
            const skill = skillProvider.getSkill((skillName || '').trim())
            if (!skill) return null
            const executable = toolProvider.getAllTools()
            const seen = new Set<string>()
            const tools: AgentToolSpec[] = []
            for (const name of callableNames(skill)) {
                if (seen.has(name)) continue
                seen.add(name)
                const tool = executable[name]
                if (!tool || typeof tool.execute !== 'function') continue
                const meta = toolProvider.getToolMetadata(name)
                tools.push({
                    name,
                    description: meta?.description ?? tool.description ?? '',
                    inputSchema: resolveInputSchema(tool.inputSchema),
                    kind: 'frontend',
                    readOnly: tool.readOnly === true || isReadOnlyMetadata(meta, tool),
                    source: 'client',
                })
            }
            return tools.length > 0 ? { skill: skill.name, tools } : null
        },
    }
}

/** Same rule the run catalog uses: an explicit flag wins, otherwise the category. */
function isReadOnlyMetadata(meta: { category?: string } | undefined, tool: any): boolean {
    if (tool?.readOnly === true) return true
    return !!meta && NON_MUTATING_CATEGORIES.has(meta.category ?? '')
}

const NON_MUTATING_CATEGORIES = new Set(['document-read', 'discovery', 'interaction'])
