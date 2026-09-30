/**
 * Capability discovery skill — tells the model how to pull in a skill's tools.
 *
 * <p>This is the client's own mechanism description, so it ships from here: the
 * backend agent knows nothing about skills beyond "the fragments I was handed are
 * the scenario's rules" (see the backend's `AgentPrompts`).
 *
 * <p>Only NON-CORE capabilities are discovered. The whole built-in page-editing
 * baseline (read, write, format, tables, layout, page management) is already in
 * the model's tool list with full schemas, so ordinary page work never spends a
 * step here. What `load_skill` delivers is the tools of a plugin or an installed
 * skill — the model sees their names under each skill fragment and asks for the
 * argument shapes only when it actually needs them.
 *
 * <p>Carries no `requiredTools`, so it is never dropped by scope filtering: it
 * describes how to reach a capability, not a capability.
 */

import type { Skill } from '../../types'

export const capabilityDiscoverySkill: Skill = {
    name: 'capability-discovery',
    description: 'How to load the tool schemas of a skill that is not in the current tool list.',
    requiredTools: [],
    systemPromptFragment: `# CAPABILITY DISCOVERY

页面编辑的内置工具（读取、写入、格式化、表格、流程/布局、页面管理）已经全部在你的工具列表里，
并且带完整参数结构——**直接用，不要为它们做任何发现**。

需要发现的只有**插件/已安装技能**提供的能力，它们按**技能（skill）**分组；
上面的【场景规范】里每个技能标题下都列出了它拥有的工具名。

- 每条【场景规范】都以 \`【技能名】xxx\` 开头，**那个 xxx 就是技能名**，也是 \`load_skill\` 的参数，照抄即可，不要自己编名字。
- 需要插件工具但它不在你的工具列表里 → 先调用 \`load_skill\`，参数写该技能名。
  它的返回内容包含该技能全部工具的**完整参数结构**，之后就可以按名字直接调用。
- 一次只加载一个技能；**本会话中已经加载过的技能不要再加载**：它的工具会一直列在【按需工具】里，
  可直接按名字调用（参数结构见之前 \`load_skill\` 的返回，如已忘记再加载一次即可）。
- 不要猜工具的参数名；先 \`load_skill\` 再调用。
- 技能名记不准时（大小写、有没有 -skill 后缀、中英文）可以直接试；调用失败时返回的 available 列表就是官方名字。
- 如果连"该用哪个技能"都不确定，按技能说明里的用途挑一个最接近的，或直接问用户。`,
    tags: ['discovery', 'essential'],
    source: 'builtin',
}
