import { z } from "zod"
import type { ToolExecutionContext, ToolsRecord } from "../types"
import { getSkillToolSource, suggestSkills } from "../skills/skill-tool-bridge"
import { loadedSkillsFor, rememberLoadedSkill } from "../skills/loaded-skill-cache"

/**
 * `load_skill` — the discovery entry point the agent uses to pull in a skill's
 * tool schemas.
 *
 * The run is advertised the whole core page-editing baseline (with schemas) plus
 * the skills, whose fragments name the non-core tools they own. Those are learned
 * on demand: calling `load_skill` returns the JSON Schemas of that skill's tools
 * *inside the tool result*, which
 *
 *  - reaches the model as an appended message (the provider's cached prefix is
 *    untouched — adding a schema to the `tools` array would invalidate it), and
 *  - is read by the backend, which marks those tools routable for the rest of the
 *    run so the model's next call reaches this client.
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
 * The factory ignores the editor: discovery is an agent-protocol concern that
 * happens to be served by the client (see the bridge). Core registers it next to
 * the editor tool factories so it is always in the catalog.
 */
export const createSkillTools = (_editor?: unknown): ToolsRecord => ({
    load_skill: {
        description:
            '加载某个技能（skill）的工具参数格式。技能说明里列出了该技能可用的工具名；要调用其中一个而它不在你的工具列表里时，'
            + '先用本工具加载它，你会拿到这些工具的完整参数结构，然后按名字直接调用。一次只加载一个技能；'
            + '本会话中已经加载过的技能会一直可调用（列在【按需工具】里），不要再重复加载。',
        inputSchema: z.object({
            skill: z.string().describe('技能名（skill name），见上下文中【场景规范】各技能标题'),
        }),
        readOnly: true,
        execute: async ({ skill }: { skill: string }, _callId?: string, execCtx?: ToolExecutionContext) => {
            const source = getSkillToolSource()
            if (!source) {
                return { error: '当前会话没有可发现的技能（能力目录未就绪）。' }
            }
            // Ask as the CALLING run: a surface with no document yet must not be
            // offered document tools it cannot execute, and one that just acquired a
            // document must see what appeared.
            const isAvailable = execCtx?.isToolAvailable
            const wanted = typeof skill === 'string' ? skill.trim() : ''
            if (!wanted) {
                return { error: 'skill 不能为空。', available: source.skillNames(isAvailable) }
            }
            const bundle = source.resolve(wanted, isAvailable)
            if (!bundle || bundle.tools.length === 0) {
                const available = source.skillNames(isAvailable)
                const diagnosis = source.diagnose(wanted, isAvailable)
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
                        available,
                    }
                }
                const suggestions = suggestSkills(available, wanted)
                return {
                    error: `没有名为 "${wanted}" 的技能。`,
                    ...(suggestions.length > 0 ? { didYouMean: suggestions } : {}),
                    available,
                }
            }
            // Session memory, written before answering: the NEXT turn is a new run
            // with an empty routing pool, and the run-input builder files these very
            // tools as deferred for it (see skills/loaded-skill-cache).
            const conversationId = execCtx?.conversationId
            const sessionScoped = typeof conversationId === 'string' && conversationId.trim().length > 0
            const known = sessionScoped && loadedSkillsFor(conversationId).includes(bundle.skill)
            rememberLoadedSkill(conversationId, bundle.skill)
            return {
                success: true,
                skill: bundle.skill,
                // The backend reads this field and makes every listed tool callable
                // for the remainder of the run. It is also what the model reads to
                // learn the argument shapes, so it must stay the full spec.
                activateTools: bundle.tools,
                note: `技能 "${bundle.skill}" 的工具参数已加载：`
                    + bundle.tools.map(tool => tool.name).join('、')
                    + '。现在可以按名字直接调用它们。'
                    // A repeat call means the model lost track of what it already had.
                    // The answer has to stop the loop, not just hand the schema over
                    // again: the tools stay listed as callable for this conversation.
                    + (known
                        ? `（"${bundle.skill}" 在本会话中已经加载过，它的工具一直可调用，无需重复加载。）`
                        // Only claim session persistence where there IS a session: an
                        // ephemeral surface has nothing to carry across turns.
                        : sessionScoped
                            ? `本会话后续轮次无需再次加载 "${bundle.skill}"，它的工具会保持可调用。`
                            : ''),
            }
        },
    },
})
