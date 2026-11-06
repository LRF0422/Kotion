import { z } from "zod"
import type { ToolExecutionContext, ToolsRecord } from "../types"
import { getSkillToolSource, suggestSkills, type SkillToolSource } from "../skills/skill-tool-bridge"
import { loadedSkillsFor, rememberLoadedSkill } from "../skills/loaded-skill-cache"

/**
 * `load_skill` — the discovery entry point the agent uses to pull in a skill.
 *
 * The run advertises the whole core page-editing baseline (with schemas), a
 * one-line index entry per skill, and the skills' tool names — but NOT their full
 * instructions. Calling `load_skill` returns that skill's prompt fragment and the
 * JSON Schemas of its tools *inside the tool result*, which
 *
 *  - reaches the model as an appended message (the provider's cached prefix is
 *    untouched — adding a schema to the `tools` array would invalidate it), and
 *  - is read by the backend, which marks those tools routable for the rest of the
 *    run (the `activateTools` field) so the model's next call reaches this client.
 *
 * A prompt-only skill (an installed SKILL.md with no owned tools) is served the
 * same way: it has no `activateTools` to deliver, just its fragment. That is the
 * whole point of indexing fragments — the catalogue can grow without the prompt
 * growing with it.
 *
 * Loading is a SESSION event, not a run event: the executor also files the skill
 * in the loaded-skill cache, so the next user turn — a fresh run, with an empty
 * routing pool — ships those tools as *deferred* (callable, no re-load) instead of
 * making the model discover them a second time.
 *
 * The schemas themselves come from the live capability catalog through
 * {@link getSkillToolSource}; this factory only owns the tool's contract.
 */

/**
 * Cap on the skill names returned with a failed lookup.
 *
 * The list is a hint, not the catalogue: with a marketplace-sized skill set every
 * typo used to dump every name, which is pure prompt cost. `didYouMean` carries
 * the actionable part; the total count says whether the list was cut.
 */
const MAX_AVAILABLE_SKILLS = 24

/** What the model may load, capped for the error path (see above). */
function availableSkills(source: SkillToolSource, isAvailable?: (name: string) => boolean) {
    const names = source.skillNames(isAvailable)
    const available = names.slice(0, MAX_AVAILABLE_SKILLS)
    return names.length > available.length
        ? { available, availableTotal: names.length }
        : { available }
}

/**
 * The factory ignores the editor: discovery is an agent-protocol concern that
 * happens to be served by the client (see the bridge). Core registers it next to
 * the editor tool factories so it is always in the catalog.
 */
export const createSkillTools = (_editor?: unknown): ToolsRecord => ({
    load_skill: {
        description:
            '加载某个技能（skill）的完整说明和工具参数格式。技能索引里列出了每个技能拥有的工具名；'
            + '要调用其中一个而它不在你的工具列表里时，先用本工具加载它，你会拿到该技能的说明和这些工具的完整参数结构，'
            + '然后按说明操作、按名字直接调用。没有自带工具的技能也可以加载，用它的说明即可。'
            + '一次只加载一个技能；本会话中已经加载过的技能不要再重复加载（它的工具会一直列在【按需工具】里）。',
        inputSchema: z.object({
            skill: z.string().describe('技能名（skill name），见上下文中【技能索引】或【技能名】后的名字'),
        }),
        readOnly: true,
        execute: async ({ skill }: { skill: string }, _callId?: string, execCtx?: ToolExecutionContext) => {
            const source = getSkillToolSource()
            if (!source) {
                return { error: '当前会话没有可发现的技能（能力目录未就绪）。' }
            }
            // Ask as the CALLING run: a surface with no document yet must not be
            // offered document tools it cannot execute, and one that just acquired
            // a document must see what appeared.
            const isAvailable = execCtx?.isToolAvailable
            const wanted = typeof skill === 'string' ? skill.trim() : ''
            if (!wanted) {
                return { error: 'skill 不能为空。', ...availableSkills(source, isAvailable) }
            }
            const bundle = source.resolve(wanted, isAvailable)
            if (!bundle) {
                const listed = availableSkills(source, isAvailable)
                const diagnosis = source.diagnose(wanted, isAvailable)
                if (diagnosis.ambiguous && diagnosis.ambiguous.length > 0) {
                    // Folding (`doc-review` vs `doc_review`) is what lets the model's
                    // loose spellings reach a skill; when it collides, the candidates
                    // ARE the answer — picking one silently would be a guess.
                    return {
                        error: `技能名 "${wanted}" 对应多个技能：${diagnosis.ambiguous.join('、')}。请改用完整技能名。`,
                        didYouMean: diagnosis.ambiguous,
                        ...listed,
                    }
                }
                if (diagnosis.name) {
                    // The skill is real; this run just cannot execute its tools yet.
                    // Saying "no such skill" here sent the model looking for a second
                    // capability instead of fixing the missing precondition.
                    return {
                        error: `技能 "${diagnosis.name}" 存在，但它的工具在当前场景不可调用`
                            + `（未就绪：${diagnosis.unavailable.join(', ')}）。`
                            + '这类工具需要一个可编辑的目标：先在文档/页面上下文里工作'
                            + '（例如先创建或打开一个页面），再调用本工具加载它的参数格式。',
                        skill: diagnosis.name,
                        unavailableTools: diagnosis.unavailable,
                        ...listed,
                    }
                }
                const suggestions = suggestSkills(listed.available, wanted)
                return {
                    error: `没有名为 "${wanted}" 的技能。`,
                    ...(suggestions.length > 0 ? { didYouMean: suggestions } : {}),
                    ...listed,
                }
            }
            // Session memory, written before answering: the NEXT turn is a new run
            // with an empty routing pool, and the run-input builder files these very
            // tools as deferred for it (see skills/loaded-skill-cache).
            const conversationId = execCtx?.conversationId
            const sessionScoped = typeof conversationId === 'string' && conversationId.trim().length > 0
            const known = sessionScoped && loadedSkillsFor(conversationId).includes(bundle.skill)
            rememberLoadedSkill(conversationId, bundle.skill)
            const toolNames = bundle.tools.map(tool => tool.name)
            // Only claim session persistence where there IS a session: an ephemeral
            // surface has nothing to carry across turns.
            const settle = known
                ? (toolNames.length > 0
                    // A repeat call means the model lost track of what it already had.
                    // The answer has to stop the loop, not just hand the schema over
                    // again: the tools stay listed as callable for this conversation.
                    ? `（"${bundle.skill}" 在本会话中已经加载过，它的工具一直可调用，无需重复加载。）`
                    : `（"${bundle.skill}" 在本会话中已经加载过；说明就在此前的工具结果里，遗忘时再加载一次即可。）`)
                : sessionScoped
                    ? (toolNames.length > 0
                        ? `本会话后续轮次无需再次加载 "${bundle.skill}"，它的工具会保持可调用。`
                        : `本会话后续轮次无需再次加载 "${bundle.skill}"；说明已在上面的结果里。`)
                    : ''
            const what = bundle.fragment
                ? (toolNames.length > 0
                    ? `技能 "${bundle.skill}" 的说明和工具参数已加载：${toolNames.join('、')}。`
                        + '现在可以按说明操作，并按名字直接调用这些工具。'
                    : `技能 "${bundle.skill}" 的完整说明已加载（该技能没有自带工具，按说明用现有工具完成即可）。`)
                : `技能 "${bundle.skill}" 的工具参数已加载：${toolNames.join('、')}。`
                    + '现在可以按名字直接调用它们。'
            return {
                success: true,
                skill: bundle.skill,
                // The prompt fragment is delivered here because the run only carried
                // this skill's one-line index entry (see catalog-to-run-input). It is
                // the skill's full work instruction, labelled the same way an eager
                // fragment is; the backend appends tool messages verbatim.
                ...(bundle.fragment
                    ? { skillFragment: `【技能名】${bundle.skill}\n\n${bundle.fragment}` }
                    : {}),
                // The backend reads this field and makes every listed tool callable
                // for the remainder of the run. It is also what the model reads to
                // learn the argument shapes, so it must stay the full spec. Omitted
                // for a prompt-only skill: there is nothing to activate.
                ...(bundle.tools.length > 0 ? { activateTools: bundle.tools } : {}),
                note: what + settle,
            }
        },
    },
})
