/**
 * Plugin-agent directory (docs/plugin-agents.md).
 *
 * The kernel agent ORCHESTRATES: it must know which plugin agents exist and how
 * to reach them, without their tools being advertised as its own. This builds
 * the per-turn `contextNote` fragment for that — volatile by design, so it can
 * change with scope/installed plugins without invalidating the system prefix.
 */

import type { ResolvedPluginAgent } from '../plugin-agent'

/** Max agents listed, to keep the note bounded. */
const MAX_LISTED = 12

export function describePluginAgents(agents: ResolvedPluginAgent[] | undefined): string | undefined {
    const usable = (agents ?? []).filter(agent => agent.id && agent.name)
    if (usable.length === 0) return undefined

    const lines: string[] = [
        '## 可委派的插件 Agent',
        '专项工作交给它们做：调用 delegate，并按示例原样传入 agentId / tools / systemPrompt，task 写清你的具体需求。',
        '不要自己模仿它们干活。',
        '',
    ]

    for (const agent of usable.slice(0, MAX_LISTED)) {
        lines.push(`### ${agent.name}（agentId: ${agent.id}）`)
        lines.push(agent.description)
        if (agent.toolNames.length > 0) {
            lines.push(`该 agent 的工具：${agent.toolNames.join(', ')}`)
        }
        lines.push(
            `调用：delegate({ agentId: "${agent.id}", task: "<你的任务>", `
            + `tools: ${JSON.stringify(agent.toolNames)}${
                agent.systemPrompt ? ', systemPrompt: "<下面这段，原样传入>"' : ''
            } })`,
        )
        if (agent.systemPrompt) {
            lines.push('它的系统提示（必须原样作为 systemPrompt 传入）：')
            lines.push(agent.systemPrompt)
        }
        lines.push('')
    }

    return lines.join('\n').trim()
}
