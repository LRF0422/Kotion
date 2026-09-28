/**
 * Plugin-agent directory (docs/plugin-agents.md).
 *
 * The kernel agent ORCHESTRATES: it must know which plugin agents exist and how
 * to reach them, without their tools being advertised as its own. This builds
 * the per-turn `contextNote` fragment for that — volatile by design, so it can
 * change with scope/installed plugins without invalidating the system prefix.
 *
 * The prompt and tool subset are NOT dumped into the note: they ride with the
 * run (see {@link toPluginAgentSpecs} and `CreateRunInput.pluginAgents`) and
 * the backend resolves them from `agentId`. The model only picks an agent and
 * writes the task.
 */

import type { AgentPluginAgentSpec } from '../agent/types'
import type { ResolvedPluginAgent } from '../plugin-agent'

/** Max agents listed, to keep the note bounded. */
const MAX_LISTED = 12

/**
 * Freeze the directory into the run-creation payload. Only the fields the
 * backend needs to reconstruct a child run are sent; renderers and provenance
 * stay on the client.
 */
export function toPluginAgentSpecs(
    agents: ResolvedPluginAgent[] | undefined,
): AgentPluginAgentSpec[] {
    return (agents ?? [])
        .filter(agent => !!agent.id && !!agent.name)
        .map(agent => ({
            id: agent.id,
            systemPrompt: agent.systemPrompt,
            toolNames: agent.toolNames,
            model: agent.model,
        }))
}

export function describePluginAgents(agents: ResolvedPluginAgent[] | undefined): string | undefined {
    const usable = (agents ?? []).filter(agent => agent.id && agent.name)
    if (usable.length === 0) return undefined

    const lines: string[] = [
        '## 可委派的插件 Agent',
        '专项工作交给它们做：调用 delegate({ agentId, task })。',
        '提示词与工具集由系统按 agentId 自动装载，不要自己传 tools / systemPrompt。',
        '不要自己模仿它们干活。',
        '',
    ]

    for (const agent of usable.slice(0, MAX_LISTED)) {
        lines.push(`### ${agent.name}（agentId: ${agent.id}）`)
        lines.push(agent.description)
        if (agent.toolNames.length > 0) {
            lines.push(`它独有的工具：${agent.toolNames.join(', ')}`)
        }
        if (agent.skillNames?.length > 0) {
            lines.push(`它带着的技能：${agent.skillNames.join(', ')}`)
        }
        lines.push(`调用：delegate({ agentId: "${agent.id}", task: "<你的任务>" })`)
        lines.push('')
    }

    return lines.join('\n').trim()
}
