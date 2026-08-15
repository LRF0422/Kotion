/**
 * Sub-Agent Tree (P6)
 *
 * Renders the live sub-agent tree built by the system agent from `subagent_*`
 * annotations (`useSystemAgent().state.subAgents`). Each delegated sub-agent
 * gets a collapsible card showing its status, reasoning, tool steps, streaming
 * output and token usage. Tolerant of parallel interleaving — nodes are keyed
 * by agentId.
 *
 * Prop types are local/structural on purpose so this component has no coupling
 * to `@kn/common`'s internal type barrel.
 */

import React, { useMemo, useState } from 'react'
import { Loader2, CheckCircle2, XCircle, AlertTriangle, Sparkles } from '@kn/icon'
import { Badge } from '../ui/badge'
import { cn } from '../../lib/utils'

type StepStatus = 'running' | 'success' | 'error'

interface SubAgentStepView {
    id: string
    toolName: string
    status: StepStatus
    error?: string
    duration?: number
}

interface SubAgentNodeView {
    agentId: string
    parentAgentId: string | null
    depth: number
    task: string
    status: 'spawned' | 'running' | 'completed' | 'error'
    reasoningContent: string
    streamingContent: string
    steps: SubAgentStepView[]
    usage?: { promptTokens: number; completionTokens: number }
    error?: string
    /** Custom agent name from AgentSpec.name (orchestrator-spawned agents). */
    agentName?: string
    /** The agent's task description from AgentSpec.description. */
    description?: string
}

export interface SubAgentTreeProps {
    subAgents: Record<string, SubAgentNodeView>
    className?: string
}

function StatusIcon({ status }: { status: SubAgentNodeView['status'] | StepStatus }) {
    if (status === 'running' || status === 'spawned') {
        return <Loader2 className="h-3 w-3 animate-spin text-indigo-500" />
    }
    if (status === 'success' || status === 'completed') {
        return <CheckCircle2 className="h-3 w-3 text-green-500" />
    }
    return <XCircle className="h-3 w-3 text-red-500" />
}

function statusLabel(status: SubAgentNodeView['status']): string {
    switch (status) {
        case 'spawned': return '已派生'
        case 'running': return '运行中'
        case 'completed': return '已完成'
        case 'error': return '出错'
    }
}

/**
 * One-line "what is this sub-agent doing right now" summary, derived from live
 * state. Shown inline (not gated by the collapse toggle) so progress is visible
 * at a glance without expanding the card.
 */
function currentActivity(node: SubAgentNodeView): string | null {
    if (node.status === 'error') return null // error shown separately in red below
    if (node.status === 'completed') {
        const okTools = node.steps.filter(s => s.status === 'success').length
        return okTools > 0 ? `已完成 · 调用 ${okTools} 个工具` : '已完成'
    }
    // running / spawned — surface the most recent live signal
    const runningStep = [...node.steps].reverse().find(s => s.status === 'running')
    if (runningStep) return `正在调用 ${runningStep.toolName}…`
    if (node.streamingContent) return '正在生成…'
    if (node.reasoningContent) return '正在思考…'
    if (node.status === 'spawned') return '已派生，等待启动…'
    return '运行中…'
}

function SubAgentCard({ node, indent, parentLabel }: { node: SubAgentNodeView; indent: number; parentLabel: string }) {
    // Auto-expand while running, collapse once done (user can toggle).
    const [open, setOpen] = useState(node.status === 'running' || node.status === 'spawned')

    const activity = currentActivity(node)
    const hasBody =
        !!node.reasoningContent || node.steps.length > 0 || !!node.streamingContent || !!node.error

    return (
        <div style={{ marginLeft: indent * 12 }}>
            <div
                className={cn(
                    'rounded-md p-1.5',
                    node.status === 'error' && 'bg-red-50/50 dark:bg-red-950/20 border border-red-200/60 dark:border-red-800/40'
                )}
            >
                <button
                    type="button"
                    onClick={() => hasBody && setOpen(o => !o)}
                    className="flex w-full items-center gap-2 text-xs text-left"
                >
                    <span className={cn('text-muted-foreground transition-transform', open && 'rotate-90')}>
                        {hasBody ? '▸' : '·'}
                    </span>
                    <Sparkles className="h-3 w-3 text-indigo-400 shrink-0" />
                    <StatusIcon status={node.status} />
                    <span className="font-medium truncate max-w-[160px]" title={node.agentName || node.task || node.agentId}>
                        {node.agentName || node.task || node.agentId}
                    </span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                        {statusLabel(node.status)}
                    </Badge>
                    {node.usage && (node.usage.promptTokens + node.usage.completionTokens > 0) && (
                        <span className="text-[10px] text-muted-foreground shrink-0">
                            ↳ {node.usage.promptTokens + node.usage.completionTokens} tok
                        </span>
                    )}
                </button>

                {/* Agent description subtitle (from AgentSpec.description). */}
                {node.description && (
                    <div className="ml-5 text-[10px] text-muted-foreground truncate" title={node.description}>
                        {node.description}
                    </div>
                )}
                {/* Inline progress + reporting target — always visible, no expand needed. */}
                {activity && (
                    <div className="ml-5 text-[10px] text-muted-foreground truncate" title={activity}>
                        {activity}
                    </div>
                )}
                <div className="ml-5 text-[10px] text-muted-foreground/70 truncate" title={`汇报给 ${parentLabel}`}>
                    ↳ 汇报给 {parentLabel}
                </div>

                {open && hasBody && (
                    <div className="ml-5 mt-1 space-y-1">
                        {node.reasoningContent && (
                            <div className="text-[10px] text-muted-foreground/80 italic line-clamp-3 whitespace-pre-wrap">
                                💭 {node.reasoningContent}
                            </div>
                        )}
                        {node.steps.map(step => (
                            <div key={step.id} className="flex items-center gap-1.5 text-[10px]">
                                <StatusIcon status={step.status} />
                                <Badge variant="outline" className="text-[9px] px-1 py-0">
                                    {step.toolName}
                                </Badge>
                                {step.duration != null && (
                                    <span className="text-muted-foreground">{step.duration}ms</span>
                                )}
                                {step.status === 'error' && step.error && (
                                    <span className="text-red-500 break-words">{step.error}</span>
                                )}
                            </div>
                        ))}
                        {node.streamingContent && (
                            <div className="text-[11px] text-foreground/90 whitespace-pre-wrap">
                                {node.streamingContent}
                            </div>
                        )}
                        {node.status === 'error' && node.error && (
                            <div className="flex items-start gap-1 text-[10px] text-red-500 dark:text-red-400">
                                <AlertTriangle className="h-3 w-3 shrink-0 mt-px" />
                                <span className="break-words">{node.error}</span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

/** Display name of the agent a node reports to (its parent, or the root agent). */
function parentLabelFor(node: SubAgentNodeView, subAgents: Record<string, SubAgentNodeView>): string {
    const pid = node.parentAgentId
    const parent = pid ? subAgents[pid] : undefined
    if (!parent) return '主 Agent'
    const t = (parent.agentName || parent.task || parent.agentId || '').trim()
    if (!t) return '主 Agent'
    return t.length > 20 ? `${t.slice(0, 20)}…` : t
}

export const SubAgentTree: React.FC<SubAgentTreeProps> = ({ subAgents, className }) => {
    // Order nodes so each parent is immediately followed by its children
    // (depth-first). Roots = parentAgentId null/unknown.
    const ordered = useMemo(() => {
        const nodes = Object.values(subAgents)
        const byParent = new Map<string | null, SubAgentNodeView[]>()
        const ids = new Set(nodes.map(n => n.agentId))
        for (const n of nodes) {
            // Treat a parent we never saw as a root so nothing is dropped.
            const parent = n.parentAgentId && ids.has(n.parentAgentId) ? n.parentAgentId : null
            const arr = byParent.get(parent) || []
            arr.push(n)
            byParent.set(parent, arr)
        }
        const out: Array<{ node: SubAgentNodeView; indent: number; parentLabel: string }> = []
        const visit = (parent: string | null, indent: number) => {
            for (const n of byParent.get(parent) || []) {
                out.push({ node: n, indent, parentLabel: parentLabelFor(n, subAgents) })
                visit(n.agentId, indent + 1)
            }
        }
        visit(null, 0)
        return out
    }, [subAgents])

    if (ordered.length === 0) return null

    return (
        <div className={cn('border border-border/50 rounded-lg p-2 bg-muted/30', className)}>
            <p className="text-[10px] font-medium text-muted-foreground mb-2">
                子 Agent ({ordered.length})
            </p>
            <div className="space-y-1">
                {ordered.map(({ node, indent, parentLabel }) => (
                    <SubAgentCard key={node.agentId} node={node} indent={indent} parentLabel={parentLabel} />
                ))}
            </div>
        </div>
    )
}