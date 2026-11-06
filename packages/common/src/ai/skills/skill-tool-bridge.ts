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
    /**
     * The skill's own work instructions, when it has any.
     *
     * Plugin/marketplace skills have their fragment withheld from the prompt (the
     * 【技能索引】 only lists name + purpose + tool names), so this is where the
     * prose travels: `load_skill` returns it in the tool result next to the
     * schemas. Eager (built-in/framing) skills already shipped it inline, but
     * repeating it here is harmless and keeps a re-load self-contained.
     */
    fragment?: string
}

/**
 * Whether one run can execute a tool right now. Optional because most surfaces
 * can run everything they registered; a workbench run without a document cannot
 * run its page-scoped tools even though the client owns them.
 */
export type ToolAvailability = (name: string) => boolean

/** Why a skill could not serve a run. */
export interface SkillDiagnosis {
    /** The skill's real name, when the reference matched exactly one. */
    name?: string
    /** Declared tools that this run cannot execute right now. */
    unavailable: string[]
    /**
     * Real skill names the reference matched ambiguously. Folding (`doc-review`
     * vs `doc_review`) can make a reference collide as the catalogue grows; the
     * honest answer is "these are the candidates", not "no such skill".
     */
    ambiguous?: string[]
}

/** The live skill → tool-spec mapping of this client. */
export interface SkillToolSource {
    /** Skill names this run can load on demand (tools and/or instructions). */
    skillNames: (isAvailable?: ToolAvailability) => string[]
    /**
     * Resolve one skill for one run; null when it cannot serve that run.
     *
     * A prompt-only skill (an installed SKILL.md with no owned tools) resolves with
     * an EMPTY `tools` and a `fragment`: loading it means "give me the
     * instructions", not "make tools callable".
     */
    resolve: (skill: string, isAvailable?: ToolAvailability) => SkillToolBundle | null
    /**
     * Explain a failed resolve. "No such skill", "several skills match" and "this
     * skill exists but its tools cannot run here yet" need different answers: the
     * first is a naming mistake, the third is a capability the run has not
     * unlocked (a workbench run has no document until it creates or opens one).
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
 * All skills a reference plausibly names, at the first tier that matches.
 *
 * Exact name first, then case-only differences, then the folded spelling
 * (`bitable` → `bitable-skill`), then the declared tags (the vocabulary a user
 * would say — "多维表格", "批注", "chart"). Returning the whole tier lets the caller
 * report candidates instead of silently picking one: guessing between two
 * capabilities is worse than asking, and as the catalogue grows a folded
 * collision is not hypothetical.
 */
export function matchSkillMatches(
    skillProvider: SkillProvider,
    reference: string,
): SkillDefinition[] {
    const wanted = (reference || '').trim()
    if (!wanted) return []
    const exact = skillProvider.getSkill(wanted)
    if (exact) return [exact]

    const skills = skillProvider.getAllSkills()
    const lowered = wanted.toLowerCase()
    const folded = normalizeSkillKey(wanted)

    const byName = skills.filter(skill => skill.name.trim().toLowerCase() === lowered)
    if (byName.length > 0) return byName
    const byFolded = skills.filter(skill => normalizeSkillKey(skill.name) === folded)
    if (byFolded.length > 0) return byFolded
    return skills.filter(skill =>
        (skill.tags ?? []).some(tag => tag.trim().toLowerCase() === lowered))
}

/**
 * Resolve a skill the way the model actually names it.
 *
 * Only an UNAMBIGUOUS match resolves; use {@link matchSkillMatches} when the
 * candidates are needed to explain a miss.
 */
export function matchSkill(
    skillProvider: SkillProvider,
    reference: string,
): SkillDefinition | undefined {
    const matches = matchSkillMatches(skillProvider, reference)
    return matches.length === 1 ? matches[0] : undefined
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
    // A skill can be loaded when it has instructions to hand over (a prompt-only
    // installed skill: its SKILL.md was never in the prompt) or at least one tool
    // this run can execute. Prompt-only skills were previously invisible to
    // discovery — their content shipped inline, so loading them was pointless.
    // Now that fragments are indexed on demand, they are served like any other.
    //
    // A skill that DECLARES tools is judged by them: if none can run in this scope
    // it stays out of the loadable list, so the model is told about the missing
    // precondition instead of receiving instructions it cannot act on.
    const fragmentOf = (skill: { systemPromptFragment?: string }) =>
        (skill.systemPromptFragment ?? '').trim()
    const servable = (
        skill: { requiredTools?: string[]; optionalTools?: string[]; systemPromptFragment?: string },
        executable: Record<string, any>,
        isAvailable?: ToolAvailability,
    ) => {
        const declared = callableNames(skill)
        if (declared.length > 0) {
            return declared.some(name => runnable(name, executable, isAvailable))
        }
        return fragmentOf(skill).length > 0
    }

    // Resolved live, per call, with the ASKING run's availability: the workbench
    // gains its document mid-conversation (createPage acquires the hidden editor),
    // and that run must be able to reach the capabilities that just appeared
    // without waiting for its next turn.
    //
    // `getAllTools()` COPIES the whole tool map, so it is hoisted to one call per
    // operation — the per-name form made discovery O(skills × tools) map copies.
    const runnable = (name: string, executable: Record<string, any>, isAvailable?: ToolAvailability) =>
        !!executable[name] && (isAvailable ? isAvailable(name) : true)

    return {
        skillNames: (isAvailable?: ToolAvailability) => {
            const executable = toolProvider.getAllTools()
            return skillProvider.getAllSkills()
                .filter(skill => servable(skill, executable, isAvailable))
                .map(skill => skill.name)
                .sort()
        },
        resolve: (skillName: string, isAvailable?: ToolAvailability) => {
            const skill = matchSkill(skillProvider, skillName)
            if (!skill) return null
            const executable = toolProvider.getAllTools()
            const seen = new Set<string>()
            const tools: AgentToolSpec[] = []
            for (const name of callableNames(skill)) {
                if (seen.has(name)) continue
                seen.add(name)
                const tool = executable[name]
                if (!tool || typeof tool.execute !== 'function'
                    || !runnable(name, executable, isAvailable)) continue
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
            const fragment = fragmentOf(skill)
            const declared = callableNames(skill)
            if (tools.length === 0) {
                // A prompt-only skill (no declared tools) is served for its
                // instructions alone. A skill that declares tools but cannot run any
                // of them here is NOT served: the model must fix the precondition
                // first (see `diagnose`), not receive instructions it cannot act on.
                if (declared.length > 0 || !fragment) return null
                return { skill: skill.name, tools: [], fragment }
            }
            return {
                skill: skill.name,
                tools,
                ...(fragment ? { fragment } : {}),
            }
        },
        diagnose: (reference: string, isAvailable?: ToolAvailability) => {
            const matches = matchSkillMatches(skillProvider, reference)
            // Several skills fold to the same reference: report the candidates
            // instead of claiming the skill does not exist.
            if (matches.length > 1) {
                return {
                    unavailable: [],
                    ambiguous: matches.map(skill => skill.name).sort(),
                }
            }
            if (matches.length === 0) return { unavailable: [] }
            const skill = matches[0]
            const executable = toolProvider.getAllTools()
            return {
                name: skill.name,
                unavailable: callableNames(skill)
                    .filter((name, index, all) => all.indexOf(name) === index)
                    .filter(name => !runnable(name, executable, isAvailable)),
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
