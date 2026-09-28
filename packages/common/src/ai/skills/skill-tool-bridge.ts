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
import type { SkillDefinition } from './types'
import type { ToolProvider } from '../providers/ToolProvider'
import { resolveInputSchema } from '../utils/tool-wrapper'

export interface SkillToolBundle {
    /** The skill the schemas belong to, echoed back for the model's benefit. */
    skill: string
    /** Full OpenAI-shaped specs for the skill's callable tools. */
    tools: AgentToolSpec[]
}

/**
 * Whether one run can execute a tool right now. Optional because most surfaces
 * can run everything they registered; a workbench run without a document cannot
 * run its page-scoped tools even though the client owns them.
 */
export type ToolAvailability = (name: string) => boolean

/** Why a skill could not serve a run. */
export interface SkillDiagnosis {
    /** The skill's real name, when the reference matched one. */
    name?: string
    /** Declared tools that this run cannot execute right now. */
    unavailable: string[]
}

/** The live skill → tool-spec mapping of this client. */
export interface SkillToolSource {
    /** Skill names whose tools this run can have delivered, on demand. */
    skillNames: (isAvailable?: ToolAvailability) => string[]
    /** Resolve one skill for one run; null when it cannot serve that run. */
    resolve: (skill: string, isAvailable?: ToolAvailability) => SkillToolBundle | null
    /**
     * Explain a failed resolve. "No such skill" and "this skill exists but its
     * tools cannot run here yet" need different answers: the first is a naming
     * mistake, the second is a capability the run has not unlocked (a workbench run
     * has no document until it creates or opens one).
     */
    diagnose: (skill: string, isAvailable?: ToolAvailability) => SkillDiagnosis
}

let source: SkillToolSource | null = null

/**
 * Fold a skill reference so spelling differences stop mattering.
 *
 * Skill names are human labels ("Document Reviewer", "bitable-skill",
 * "Plugin Studio Author"), and a model referring to one will vary case, spacing
 * and often the `-skill` suffix. Folding both sides is what makes
 * `load_skill('bitable')` and `load_skill('Bitable-Skill')` reach the same skill.
 */
export function normalizeSkillKey(value: string): string {
    return (value || '')
        .trim()
        .toLowerCase()
        .replace(/[\s_\-—–]+/g, '')
        .replace(/skill$/, '')
        .replace(/技能$/, '')
}

/**
 * Resolve a skill the way the model actually names it: exact, then folded, then by
 * the tags the skill declares (which carry the vocabulary a user would use —
 * "多维表格", "批注", "chart"). Each tier must be unambiguous: guessing between two
 * capabilities is worse than reporting the candidates.
 */
export function matchSkill(
    skillProvider: SkillProvider,
    reference: string,
): SkillDefinition | undefined {
    const wanted = (reference || '').trim()
    if (!wanted) return undefined
    const exact = skillProvider.getSkill(wanted)
    if (exact) return exact

    const skills = skillProvider.getAllSkills()
    const folded = normalizeSkillKey(wanted)
    // Each tier must be unambiguous: silently picking between two capabilities is
    // worse than reporting the candidates.
    const unique = (matches: SkillDefinition[]) => (matches.length === 1 ? matches[0] : undefined)

    const lowered = wanted.toLowerCase()
    return unique(skills.filter(skill => skill.name.trim().toLowerCase() === lowered))
        ?? unique(skills.filter(skill => normalizeSkillKey(skill.name) === folded))
        ?? unique(skills.filter(skill =>
            (skill.tags ?? []).some(tag => tag.trim().toLowerCase() === lowered)))
}

/** Closest skill names to a failed reference, for an actionable error. */
export function suggestSkills(names: readonly string[], reference: string): string[] {
    const folded = normalizeSkillKey(reference)
    if (!folded) return []
    return names
        .map(name => ({ name, key: normalizeSkillKey(name) }))
        .filter(candidate => candidate.key.length > 0
            && (candidate.key.includes(folded) || folded.includes(candidate.key)))
        .map(candidate => candidate.name)
        .slice(0, 5)
}

/** Registered by the capability hook once the live providers exist. */
export function registerSkillToolSource(next: SkillToolSource | null): void {
    source = next
}

/**
 * Drop a source on unmount — but only if it is still the registered one.
 *
 * Two surfaces can be mounted at once (the workbench and an editor panel), and an
 * unconditional `register(null)` on either unmount left the surviving surface with
 * a working catalogue but a dead discovery tool ("能力目录未就绪"). Identity-matched
 * release keeps last-writer-wins semantics without the collateral damage.
 */
export function releaseSkillToolSource(expected: SkillToolSource): void {
    if (source === expected) source = null
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
    // Resolved live, per call, with the ASKING run's availability: the workbench
    // gains its document mid-conversation (createPage acquires the hidden editor),
    // and that run must be able to reach the capabilities that just appeared
    // without waiting for its next turn.
    const runnable = (name: string, isAvailable?: ToolAvailability) =>
        !!toolProvider.getAllTools()[name] && (isAvailable ? isAvailable(name) : true)

    const findSkill = (name: string) => matchSkill(skillProvider, name)

    return {
        skillNames: (isAvailable?: ToolAvailability) => skillProvider.getAllSkills()
            .filter(skill => callableNames(skill).some(name => runnable(name, isAvailable)))
            .map(skill => skill.name)
            .sort(),
        resolve: (skillName: string, isAvailable?: ToolAvailability) => {
            const skill = findSkill(skillName)
            if (!skill) return null
            const executable = toolProvider.getAllTools()
            const seen = new Set<string>()
            const tools: AgentToolSpec[] = []
            for (const name of callableNames(skill)) {
                if (seen.has(name)) continue
                seen.add(name)
                const tool = executable[name]
                if (!tool || typeof tool.execute !== 'function' || !runnable(name, isAvailable)) continue
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
        diagnose: (reference: string, isAvailable?: ToolAvailability) => {
            const skill = findSkill(reference)
            if (!skill) return { unavailable: [] }
            return {
                name: skill.name,
                unavailable: callableNames(skill)
                    .filter((name, index, all) => all.indexOf(name) === index)
                    .filter(name => !runnable(name, isAvailable)),
            }
        },
    }
}

/** Same rule the run catalog uses: an explicit flag wins, otherwise the category. */
function isReadOnlyMetadata(meta: { category?: string } | undefined, tool: any): boolean {
    if (tool?.readOnly === true) return true
    return !!meta && NON_MUTATING_CATEGORIES.has(meta.category ?? '')
}

const NON_MUTATING_CATEGORIES = new Set(['document-read', 'discovery', 'interaction'])
