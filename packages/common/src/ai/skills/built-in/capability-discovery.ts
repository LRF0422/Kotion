/**
 * Capability discovery skill — tells the model how to pull in a skill's tools.
 *
 * <p>This is the client's own mechanism description, so it ships from here: the
 * backend agent knows nothing about skills beyond "the fragments I was handed are
 * the scenario's rules" (see the backend's `AgentPrompts`). The tools themselves
 * arrive on demand — the model sees their names under each skill fragment, and
 * `load_skill` hands over the argument shapes when they are actually needed.
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

本次运行只预先带了最常用的一小部分工具（带完整参数结构）。其余工具按**技能（skill）**分组，
上面的【场景规范】里每个技能标题下都列出了它拥有的工具名。

- 需要一个工具但它不在你的工具列表里 → 先调用 \`load_skill\`，参数就是该技能名。
  它的返回内容包含该技能全部工具的**完整参数结构**，之后就可以按名字直接调用。
- 一次只加载一个技能；已经加载过的不用重复加载。
- 不要猜工具的参数名；先 \`load_skill\` 再调用。
- 如果连"该用哪个技能"都不确定，按技能说明里的用途挑一个最接近的，或直接问用户。`,
    tags: ['discovery', 'essential'],
    source: 'builtin',
}
