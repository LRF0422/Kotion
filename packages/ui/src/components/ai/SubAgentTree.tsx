/**
 * Sub-Agent Tree — AgentCore 版。
 *
 * 渲染当前 run 的子 agent 委派记录（SubRunRecord 列表）：每个子任务一张
 * 卡片，展示状态（running/completed/failed）、任务描述与结果摘要。子 run 的
 * 完整事件日志可通过 runId 下钻（预留）。
 */

import React from 'react'
import { Loader2, CheckCircle2, XCircle, Sparkles } from '@kn/icon'
import { Badge } from '../ui/badge'
import { cn } from '../../lib/utils'

export interface SubRunView {
    callId: string
    subRunId: string
    task?: string
    status: 'running' | 'completed' | 'failed'
    result?: unknown
    error?: string
}

export interface SubAgentTreeProps {
    subRuns: SubRunView[]
    className?: string
}

function StatusIcon({ status }: { status: SubRunView['status'] }) {
    if (status === 'running') {
        return <Loader2 className="h-3 w-3 animate-spin text-indigo-500" />
    }
    if (status === 'completed') {
        return <CheckCircle2 className="h-3 w-3 text-green-500" />
    }
    return <XCircle className="h-3 w-3 text-red-500" />
}

function statusLabel(status: SubRunView['status']): string {
    switch (status) {
        case 'running': return '运行中'
        case 'completed': return '已完成'
        case 'failed': return '出错'
    }
}

function summarize(result: unknown, error?: string): string {
    if (error) return error
    if (result == null) return ''
    if (typeof result === 'string') {
        return result.length > 120 ? result.slice(0, 120) + '…' : result
    }
    const text = JSON.stringify(result)
    return text.length > 120 ? text.slice(0, 120) + '…' : text
}

/**
 * 子 agent 委派列表。
 */
export const SubAgentTree: React.FC<SubAgentTreeProps> = ({ subRuns, className }) => {
    if (subRuns.length === 0) return null
    return (
        <div className={cn('mt-2 space-y-1.5', className)}>
            {subRuns.map(sub => (
                <div
                    key={sub.subRunId}
                    className="flex items-start gap-2 rounded-lg border border-border/60 bg-background/60 px-2.5 py-2"
                >
                    <div className="mt-0.5 shrink-0">
                        <StatusIcon status={sub.status} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                            <Sparkles className="h-3 w-3 text-indigo-400" />
                            <span className="text-[11px] font-medium">子 Agent #{sub.subRunId.slice(0, 6)}</span>
                            <Badge variant="outline" className="text-[9px] px-1 py-0">
                                {statusLabel(sub.status)}
                            </Badge>
                        </div>
                        {sub.task && (
                            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                                {sub.task}
                            </p>
                        )}
                        {(sub.status === 'completed' || sub.status === 'failed') && (
                            <p className="text-[10px] text-muted-foreground/70 mt-0.5 line-clamp-2">
                                {summarize(sub.result, sub.error)}
                            </p>
                        )}
                    </div>
                </div>
            ))}
        </div>
    )
}
