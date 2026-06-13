/**
 * Sub-Agent Tree (P6) — plugin-ai inline chat copy.
 *
 * Same component as @kn/core's SubAgentTree, duplicated here because plugin-ai
 * depends on @kn/common/@kn/ui/@kn/icon but NOT @kn/core. Renders the live
 * sub-agent tree derived from `subagent_*` annotations.
 *
 * Prop types are local/structural so this has no coupling to @kn/common's
 * internal type barrel (a `Record<string, SubAgentNode>` passes structurally).
 */

import React, { useMemo, useState } from 'react'
import { Loader2, CheckCircle2, XCircle, AlertTriangle, Sparkles } from '@kn/icon'
import { Badge, cn } from '@kn/ui'

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

function SubAgentCard({ node, indent }: { node: SubAgentNodeView; indent: number }) {
    const [open, setOpen] = useState(node.status === 'running' || node.status === 'spawned')

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
                    <span className="font-medium truncate max-w-[160px]" title={node.task}>
                        {node.task || node.agentId}
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

export const SubAgentTree: React.FC<SubAgentTreeProps> = ({ subAgents, className }) => {
    const ordered = useMemo(() => {
        const nodes = Object.values(subAgents)
        const byParent = new Map<string | null, SubAgentNodeView[]>()
        const ids = new Set(nodes.map(n => n.agentId))
        for (const n of nodes) {
            const parent = n.parentAgentId && ids.has(n.parentAgentId) ? n.parentAgentId : null
            const arr = byParent.get(parent) || []
            arr.push(n)
            byParent.set(parent, arr)
        }
        const out: Array<{ node: SubAgentNodeView; indent: number }> = []
        const visit = (parent: string | null, indent: number) => {
            for (const n of byParent.get(parent) || []) {
                out.push({ node: n, indent })
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
                {ordered.map(({ node, indent }) => (
                    <SubAgentCard key={node.agentId} node={node} indent={indent} />
                ))}
            </div>
        </div>
    )
}
