/**
 * Sub-Agent Tree — AgentCore 版。
 *
 * 渲染当前 run 委派的子 agent（SubRunRecord + 带 subRunId 的前端工具记录）。
 *
 * 展示原则：子 agent 的进度属于「委派」这件事，不属于主回答正文 ——
 *  - 整体收成一个可折叠分组（默认只在有子任务运行时展开）；
 *  - 每个子任务只占一行：状态 + 任务首行 + 工具进度；完整任务、该子 agent
 *    自己的工具步骤和结果都在展开后才出现，绝不把整段 prompt 平铺进正文。
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    Loader2,
    Sparkles,
    Wrench,
    XCircle,
} from '@kn/icon'
import { Badge } from '../ui/badge'
import { cn } from '../../lib/utils'

export interface SubToolCallView {
    callId: string
    tool: string
    status: 'running' | 'success' | 'error'
    args?: Record<string, any>
    result?: unknown
    error?: string
    durationMs?: number
    /** Owning sub-agent run; calls without it belong to the parent run. */
    subRunId?: string
}

export interface SubRunView {
    callId: string
    subRunId: string
    task?: string
    status: 'running' | 'completed' | 'failed'
    result?: unknown
    error?: string
    /** Per-child tool calls, when the host already grouped them. */
    toolCalls?: SubToolCallView[]
    /** The child's own live output (tail-preview), streamed by the client. */
    text?: string
    reasoning?: string
    /** The child's own token usage, when reported. */
    usage?: { promptTokens: number; completionTokens: number; cachedPromptTokens?: number }
    /** Private-document merge outcome (true-parallel fork/merge). */
    merge?: {
        applied: number
        conflicts: number
        reorderDetected?: boolean
        summary: string
    }
}

export interface SubAgentTreeProps {
    subRuns: SubRunView[]
    /**
     * The run's whole frontend tool tape. Calls tagged with `subRunId` are
     * attributed to that child (and should be kept out of the parent's list).
     */
    toolCalls?: SubToolCallView[]
    /** Initial expansion of the group. Defaults to open while any child runs. */
    defaultOpen?: boolean
    className?: string
}

function StatusIcon({ status, className }: { status: SubRunView['status']; className?: string }) {
    if (status === 'running') {
        return <Loader2 className={cn('h-3 w-3 animate-spin text-indigo-500', className)} />
    }
    if (status === 'completed') {
        return <CheckCircle2 className={cn('h-3 w-3 text-green-500', className)} />
    }
    return <XCircle className={cn('h-3 w-3 text-red-500', className)} />
}

function statusLabel(status: SubRunView['status']): string {
    switch (status) {
        case 'running': return '运行中'
        case 'completed': return '已完成'
        case 'failed': return '出错'
    }
}

/** First non-empty line — the collapsed row never shows a whole prompt. */
function firstLine(task?: string): string {
    if (!task) return '（未提供任务描述）'
    const line = task.split('\n').map(part => part.trim()).find(Boolean)
    return line ?? '（未提供任务描述）'
}

/** Last non-empty line of a child's live output — one line, never a dump. */
function lastLine(text?: string): string {
    if (!text) return ''
    const lines = text.split('\n').map(part => part.trim()).filter(Boolean)
    return lines.length > 0 ? lines[lines.length - 1] : ''
}

/**
 * Child result → display text. Delegated children report `{subRunId, text}`,
 * but a plain string (or any other payload) must stay readable.
 */
function resultText(result: unknown, error?: string): string {
    if (error) return error
    if (result == null) return ''
    if (typeof result === 'string') return result
    if (typeof result === 'object') {
        const text = (result as { text?: unknown }).text
        if (typeof text === 'string') return text
    }
    try {
        return JSON.stringify(result, null, 2)
    } catch {
        return String(result)
    }
}

function formatDuration(ms?: number): string {
    if (ms == null || !Number.isFinite(ms) || ms <= 0) return ''
    return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`
}

function ToolSteps({ calls }: { calls: SubToolCallView[] }) {
    if (calls.length === 0) return null
    return (
        <div className="mt-1 space-y-0.5">
            {calls.map(call => (
                <div key={call.callId} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Wrench className="h-2.5 w-2.5 shrink-0 opacity-70" />
                    <span className="font-mono truncate">{call.tool}</span>
                    {call.status === 'running' && <Loader2 className="h-2.5 w-2.5 animate-spin text-indigo-500" />}
                    {call.status === 'success' && <CheckCircle2 className="h-2.5 w-2.5 text-green-500" />}
                    {call.status === 'error' && <XCircle className="h-2.5 w-2.5 text-red-500" />}
                    {formatDuration(call.durationMs) && (
                        <span className="opacity-60">{formatDuration(call.durationMs)}</span>
                    )}
                    {call.error && <span className="text-destructive truncate">{call.error}</span>}
                </div>
            ))}
        </div>
    )
}

/**
 * 子 agent 委派分组。
 */
export const SubAgentTree: React.FC<SubAgentTreeProps> = ({
    subRuns,
    toolCalls,
    defaultOpen,
    className,
}) => {
    /** Attribute every tagged tool call to its owning child (deduped). */
    const callsBySubRun = useMemo(() => {
        const fromTape = new Map<string, SubToolCallView[]>()
        for (const call of toolCalls ?? []) {
            if (!call.subRunId) continue
            const list = fromTape.get(call.subRunId)
            if (list) list.push(call)
            else fromTape.set(call.subRunId, [call])
        }
        const merged = new Map<string, SubToolCallView[]>()
        for (const sub of subRuns) {
            const inline = sub.toolCalls ?? []
            const known = new Set(inline.map(call => call.callId))
            merged.set(sub.subRunId, [
                ...inline,
                ...(fromTape.get(sub.subRunId) ?? []).filter(call => !known.has(call.callId)),
            ])
        }
        return merged
    }, [subRuns, toolCalls])

    const counts = useMemo(() => {
        let running = 0
        let completed = 0
        let failed = 0
        for (const sub of subRuns) {
            if (sub.status === 'running') running += 1
            else if (sub.status === 'completed') completed += 1
            else failed += 1
        }
        return { running, completed, failed }
    }, [subRuns])

    const [open, setOpen] = useState(defaultOpen ?? counts.running > 0)
    const [expanded, setExpanded] = useState<Record<string, boolean>>({})

    // A new delegation (or the first running child) pulls the group open; a
    // settled group stays where the user left it.
    const knownCountRef = useRef(subRuns.length)
    useEffect(() => {
        if (subRuns.length !== knownCountRef.current) {
            knownCountRef.current = subRuns.length
            if (counts.running > 0) setOpen(true)
        }
    }, [subRuns.length, counts.running])

    if (subRuns.length === 0) return null

    const allExpanded = subRuns.every(sub => expanded[sub.subRunId] === true)
    const toggleAll = () => {
        if (allExpanded) {
            setExpanded({})
            return
        }
        setExpanded(Object.fromEntries(subRuns.map(sub => [sub.subRunId, true])))
    }

    return (
        <div className={cn('mt-2 rounded-lg border border-border/60 bg-background/40', className)}>
            <div className="flex w-full items-center gap-1.5 px-2.5 py-1.5">
                <button
                    type="button"
                    onClick={() => setOpen(value => !value)}
                    aria-expanded={open}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                >
                    {open
                        ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                        : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />}
                    {counts.running > 0
                        ? <Loader2 className="h-3 w-3 shrink-0 animate-spin text-indigo-500" />
                        : <Sparkles className="h-3 w-3 shrink-0 text-indigo-400" />}
                    <span className="truncate text-[11px] font-medium">子 Agent 委派 · {subRuns.length} 个</span>
                    <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[10px] text-muted-foreground">
                        {counts.running > 0 && <span className="text-indigo-500">{counts.running} 运行中</span>}
                        {counts.completed > 0 && <span className="text-green-600">{counts.completed} 已完成</span>}
                        {counts.failed > 0 && <span className="text-red-500">{counts.failed} 出错</span>}
                    </span>
                </button>
                {open && (
                    <button
                        type="button"
                        onClick={toggleAll}
                        className="shrink-0 text-[10px] text-muted-foreground hover:text-foreground"
                    >
                        {allExpanded ? '全部收起' : '展开全部'}
                    </button>
                )}
            </div>

            {open && (
                <div className="space-y-1 px-2.5 pb-2">
                    {subRuns.map((sub, index) => (
                        <SubAgentRow
                            key={sub.subRunId}
                            index={index + 1}
                            sub={sub}
                            toolCalls={callsBySubRun.get(sub.subRunId) ?? []}
                            expanded={expanded[sub.subRunId] === true}
                            onToggle={() => setExpanded(prev => ({
                                ...prev,
                                [sub.subRunId]: prev[sub.subRunId] !== true,
                            }))}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

interface SubAgentRowProps {
    /** 1-based delegation ordinal — a stable, human-sized handle per row. */
    index: number
    sub: SubRunView
    toolCalls: SubToolCallView[]
    expanded: boolean
    onToggle: () => void
}

const SubAgentRow: React.FC<SubAgentRowProps> = ({ index, sub, toolCalls, expanded, onToggle }) => {
    const summary = resultText(sub.result, sub.error)
    const finishedTools = toolCalls.filter(call => call.status !== 'running').length

    return (
        <div className="rounded-md border border-border/40 bg-background/60">
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={expanded}
                className="flex w-full items-center gap-1.5 px-2 py-1 text-left"
            >
                {expanded
                    ? <ChevronDown className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />
                    : <ChevronRight className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />}
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground/60">#{index}</span>
                <StatusIcon status={sub.status} />
                <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[11px]" title={sub.task}>
                        {firstLine(sub.task)}
                    </span>
                    {sub.status === 'running' && lastLine(sub.text) && (
                        <span className="truncate text-[10px] italic text-muted-foreground/70" title={sub.text}>
                            {lastLine(sub.text)}
                        </span>
                    )}
                </span>
                {toolCalls.length > 0 && (
                    <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-muted-foreground">
                        <Wrench className="h-2.5 w-2.5 opacity-70" />
                        {finishedTools}/{toolCalls.length}
                    </span>
                )}
                <Badge variant="outline" className="shrink-0 px-1 py-0 text-[9px]">
                    {statusLabel(sub.status)}
                </Badge>
            </button>

            {expanded && (
                <div className="space-y-1.5 border-t border-border/40 px-2 py-1.5">
                    <div>
                        <p className="text-[10px] text-muted-foreground/70">任务</p>
                        <p className="max-h-32 overflow-auto whitespace-pre-wrap break-words text-[11px] text-muted-foreground">
                            {sub.task || '（未提供任务描述）'}
                        </p>
                    </div>

                    {toolCalls.length > 0 && (
                        <div>
                            <p className="text-[10px] text-muted-foreground/70">工具调用</p>
                            <ToolSteps calls={toolCalls} />
                        </div>
                    )}

                    {sub.status === 'running' && sub.text && (
                        <div>
                            <p className="text-[10px] text-muted-foreground/70">实时输出</p>
                            <p className="max-h-32 overflow-auto whitespace-pre-wrap break-words text-[11px] text-muted-foreground">
                                {sub.text}
                            </p>
                        </div>
                    )}

                    {sub.reasoning && sub.status === 'running' && (
                        <div>
                            <p className="text-[10px] text-muted-foreground/70">推理过程</p>
                            <p className="max-h-32 overflow-auto whitespace-pre-wrap break-words text-[10px] italic text-muted-foreground/70">
                                {sub.reasoning}
                            </p>
                        </div>
                    )}

                    {sub.usage && sub.usage.promptTokens > 0 && (
                        <div>
                            <p className="text-[10px] text-muted-foreground/70">Token 用量</p>
                            <p className="text-[10px] text-muted-foreground">
                                输入 {sub.usage.promptTokens.toLocaleString()} · 输出 {sub.usage.completionTokens.toLocaleString()}
                                {sub.usage.cachedPromptTokens
                                    ? ' · 缓存命中 ' + sub.usage.cachedPromptTokens.toLocaleString()
                                    : ''}
                            </p>
                        </div>
                    )}

                    {sub.merge && (
                        <div>
                            <p className="text-[10px] text-muted-foreground/70">合并回页面</p>
                            <p className={cn(
                                'text-[11px]',
                                sub.merge.conflicts > 0 ? 'text-amber-600' : 'text-muted-foreground'
                            )}>
                                {sub.merge.summary}
                            </p>
                        </div>
                    )}

                    {summary && (
                        <div>
                            <p className="text-[10px] text-muted-foreground/70">
                                {sub.status === 'failed' ? '失败原因' : '结果'}
                            </p>
                            <p
                                className={cn(
                                    'max-h-48 overflow-auto whitespace-pre-wrap break-words text-[11px]',
                                    sub.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'
                                )}
                            >
                                {summary}
                            </p>
                        </div>
                    )}

                    <p className="font-mono text-[9px] text-muted-foreground/50">run {sub.subRunId}</p>
                </div>
            )}
        </div>
    )
}
