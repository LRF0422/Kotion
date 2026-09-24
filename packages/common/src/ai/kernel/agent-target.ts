/**
 * Working-target helpers (kernel spec: docs/agent-kernel-spec.md).
 *
 * The target lives in the pane API (`useAgentPane().target`); this module adds
 * the two things every surface needs from it: a stable key (for UI highlight)
 * and the per-turn context note handed to the model.
 */

import type { AgentArtifact } from '../plugin-agent'
import { agentArtifactKey } from './agent-artifact-collect'

/** Stable key of the working target (`kind:id`), or null. */
export function agentTargetKey(target: AgentArtifact | null): string | null {
    return target ? agentArtifactKey(target) : null
}

/**
 * The per-turn context note describing the working target.
 *
 * Model-facing (not localized, like prompts). It travels as `contextNote`, so
 * the backend appends it behind the cacheable history: switching targets never
 * rewrites the system prefix and never invalidates the prompt cache.
 */
export function describeAgentTarget(target: AgentArtifact | null): string | undefined {
    if (!target) {
        return '当前没有聚焦的产物。用户点了某张卡片或你调用了聚焦工具后，这里会说明正在操作哪一个。'
    }
    const title = target.title ?? target.id
    const space = target.spaceId ? `，spaceId: ${target.spaceId}` : ''
    return [
        '## 当前工作目标',
        `- 类型：${target.kind}`,
        `- 标题：${title}`,
        `- id：${target.id}${space}`,
        '- 这就是用户此刻在看的产物，也是你默认应当操作与引用的对象。',
        '- 需要切换目标时，调用聚焦工具（页面用 openPageSide，其他产物用 focusArtifact）或按用户指示打开另一个产物；不要假设别的对象。',
    ].join('\n')
}
