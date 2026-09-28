import { z } from "zod"
import type { ToolsRecord } from "../types"
import { getSkillToolSource } from "../skills/skill-tool-bridge"

/**
 * `load_skill` — the discovery entry point the agent uses to pull in a skill's
 * tool schemas.
 *
 * The run is advertised a small essential tool set plus the skills (whose
 * fragments name the tools they own). Everything else is learned on demand:
 * calling `load_skill` returns the JSON Schemas of that skill's tools *inside the
 * tool result*, which
 *
 *  - reaches the model as an appended message (the provider's cached prefix is
 *    untouched — adding a schema to the `tools` array would invalidate it), and
 *  - is read by the backend, which marks those tools routable for the rest of the
 *    run so the model's next call reaches this client.
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
            + '先用本工具加载它，你会拿到这些工具的完整参数结构，然后按名字直接调用。一次只加载一个技能。',
        inputSchema: z.object({
            skill: z.string().describe('技能名（skill name），见上下文中【场景规范】各技能标题'),
        }),
        readOnly: true,
        execute: async ({ skill }: { skill: string }) => {
            const source = getSkillToolSource()
            if (!source) {
                return { error: '当前会话没有可发现的技能（能力目录未就绪）。' }
            }
            const wanted = typeof skill === 'string' ? skill.trim() : ''
            if (!wanted) {
                return { error: 'skill 不能为空。', available: source.skillNames() }
            }
            const bundle = source.resolve(wanted)
            if (!bundle || bundle.tools.length === 0) {
                return {
                    error: `没有名为 "${wanted}" 的技能（或它没有可调用的工具）。`,
                    available: source.skillNames(),
                }
            }
            return {
                success: true,
                skill: bundle.skill,
                // The backend reads this field and makes every listed tool callable
                // for the remainder of the run. It is also what the model reads to
                // learn the argument shapes, so it must stay the full spec.
                activateTools: bundle.tools,
                note: `技能 "${bundle.skill}" 的工具参数已加载：`
                    + bundle.tools.map(tool => tool.name).join('、')
                    + '。现在可以按名字直接调用它们。',
            }
        },
    },
})
