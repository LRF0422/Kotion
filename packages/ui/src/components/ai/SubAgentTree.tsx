/**
 * Sub-Agent Tree — AgentCore 版。
 *
 * 渲染当前 run 委派的子 agent（SubRunRecord + 带 subRunId 的前端工具记录）。
 *
 * 展示原则：子 agent 的进度属于「委派」这件事，不属于主回答正文 ——
 *  - 整体收成一个可折叠分组（默认只在有子任务运行时展开）；
 *  - 每个子任务只占一行：状态 + 任务首行 + 工具进度；
 *  - 点击某一行在左侧以 Popover 展开该子 agent 的完整步骤时间线（与主 agent
 *    同一套渲染，由 host 通过 renderDetail 注入），并支持 Pin 固定。
 *
 * 本组件不直接依赖 i18n：调用方通过 labels 传入翻译后的文案。
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    Loader2,
    Pin,
    PinOff,
    Sparkles,
    Wrench,
    X,
    XCircle,
} from '@kn/icon'
import { Badge } from '../ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { cn } from '../../lib/utils'

// ─── Human-friendly identity ──────────────────────────────────────
// A delegation reads far better as a named teammate than as an anonymous
// "#1". A backend-supplied name always wins; otherwise each child gets a stable
// name derived from its run id, so the same sub-agent keeps the same name across
// re-renders and reconnects (and even after a session reload).

const SUB_AGENT_NAMES = [
    'Nova', 'Atlas', 'Iris', 'Orion', 'Luna', 'Vega', 'Milo', 'Ivy',
    'Juno', 'Remy', 'Aria', 'Kai', 'Sage', 'Leo', 'Nina', 'Theo',
    'Cora', 'Ezra', 'Maya', 'Finn', 'Rowan', 'Lena', 'Ash', 'Noa',
]

/** Avatar tints, so each named child is visually distinct at a glance. */
const SUB_AGENT_TONES = [
    'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
    'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    'bg-rose-500/15 text-rose-600 dark:text-rose-400',
    'bg-sky-500/15 text-sky-600 dark:text-sky-400',
    'bg-violet-500/15 text-violet-600 dark:text-violet-400',
]

/** Deterministic string hash — the same run id always maps to the same name. */
function hashString(value: string): number {
    let hash = 0
    for (let i = 0; i < value.length; i += 1) {
        hash = (hash * 31 + value.charCodeAt(i)) | 0
    }
    return hash >>> 0
}

/** The child's display name: backend name first, generated fallback second. */
function subAgentDisplayName(sub: Pick<SubRunView, 'name' | 'subRunId'>): string {
    const explicit = sub.name?.trim()
    if (explicit) return explicit
    return SUB_AGENT_NAMES[hashString(sub.subRunId) % SUB_AGENT_NAMES.length]
}

function AgentAvatar({ name, subRunId, className }: {
    name: string
    subRunId: string
    className?: string
}) {
    const initial = Array.from(name.trim())[0]?.toUpperCase() ?? '·'
    const tone = SUB_AGENT_TONES[hashString(subRunId) % SUB_AGENT_TONES.length]
    return (
        <span
            aria-hidden="true"
            className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
                tone,
                className,
            )}
        >
            {initial}
        </span>
    )
}

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

/** One step of a child's own timeline (structurally = @kn/common AgentStepRecord). */
export interface SubRunStepView {
    id: string
    step: number
    startedSeq: number
    reasoning: string
    text: string
}

export interface SubRunView {
    callId: string
    subRunId: string
    task?: string
    /** Human-friendly display name; generated from the run id when absent. */
    name?: string
    /** One-line role/subtitle shown under the name. */
    description?: string
    status: 'running' | 'completed' | 'failed' | 'cancelled'
    result?: unknown
    error?: string
    /** Per-child tool calls, when the host already grouped them. */
    toolCalls?: SubToolCallView[]
    /** The child's own live output (tail-preview), streamed by the client. */
    text?: string
    reasoning?: string
    /** The child's own step timeline (full detail in the popover). */
    steps?: SubRunStepView[]
    /** Child step id chosen as the answer. */
    answerStepId?: string
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

/** Localized strings for the tree; pass translated values from the host. */
export interface SubAgentTreeLabels {
    /** Group header; use the literal {count} placeholder for the delegation count. */
    title: string
    running: string
    completed: string
    failed: string
    cancelled: string
    task: string
    tools: string
    liveOutput: string
    reasoning: string
    steps: string
    mergeBack: string
    result: string
    failureReason: string
    noTask: string
    usage: string
    pin: string
    unpin: string
    close: string
    runId: string
}

/** English fallbacks; hosts override with translated values. */
export const defaultSubAgentTreeLabels: SubAgentTreeLabels = {
    title: 'Sub-agent delegations · {count}',
    running: 'running',
    completed: 'completed',
    failed: 'failed',
    cancelled: 'cancelled',
    task: 'Task',
    tools: 'Tool calls',
    liveOutput: 'Live output',
    reasoning: 'Reasoning',
    steps: 'Steps',
    mergeBack: 'Merged into page',
    result: 'Result',
    failureReason: 'Failure',
    noTask: '(no task description)',
    usage: 'Token usage',
    pin: 'Pin',
    unpin: 'Unpin',
    close: 'Close',
    runId: 'run',
}

/**
 * Build the tree's labels from an i18n \`t\` function. This lives in the UI layer
 * (which cannot import @kn/common's i18n) so every host maps the same 18 keys
 * exactly once instead of re-declaring them per panel.
 */
export const buildSubAgentTreeLabels = (
    t: (key: string) => string,
): SubAgentTreeLabels => ({
    title: t('ai.chat.subAgentTitle'),
    running: t('ai.chat.subAgentRunning'),
    completed: t('ai.chat.subAgentCompleted'),
    failed: t('ai.chat.subAgentFailed'),
    cancelled: t('ai.chat.subAgentCancelled'),
    task: t('ai.chat.subAgentTask'),
    tools: t('ai.chat.subAgentTools'),
    liveOutput: t('ai.chat.subAgentLiveOutput'),
    reasoning: t('ai.chat.subAgentReasoning'),
    steps: t('ai.chat.subAgentSteps'),
    mergeBack: t('ai.chat.subAgentMergeBack'),
    result: t('ai.chat.subAgentResult'),
    failureReason: t('ai.chat.subAgentFailureReason'),
    noTask: t('ai.chat.subAgentNoTask'),
    usage: t('ai.chat.subAgentUsage'),
    pin: t('ai.chat.subAgentPin'),
    unpin: t('ai.chat.subAgentUnpin'),
    close: t('ai.chat.subAgentClose'),
    runId: t('ai.chat.subAgentRunId'),
})

export interface SubAgentTreeProps {
    subRuns: SubRunView[]
    /**
     * The run's whole frontend tool tape. Calls tagged with a subRunId are
     * attributed to that child (and should be kept out of the parent's list).
     */
    toolCalls?: SubToolCallView[]
    /** Localized labels; missing keys fall back to English. */
    labels?: Partial<SubAgentTreeLabels>
    /**
     * Render a child's full detail (typically the same timeline component the
     * main agent uses). When omitted a compact built-in timeline is shown.
     */
    renderDetail?: (sub: SubRunView, toolCalls: SubToolCallView[]) => React.ReactNode
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
    if (status === 'cancelled') {
        return <XCircle className={cn('h-3 w-3 text-muted-foreground', className)} />
    }
    return <XCircle className={cn('h-3 w-3 text-red-500', className)} />
}

function statusLabel(status: SubRunView['status'], labels: SubAgentTreeLabels): string {
    switch (status) {
        case 'running': return labels.running
        case 'completed': return labels.completed
        case 'cancelled': return labels.cancelled
        default: return labels.failed
    }
}

/** First non-empty line — the collapsed row never shows a whole prompt. */
function firstLine(task: string | undefined, empty: string): string {
    if (!task) return empty
    const line = task.split('\n').map(part => part.trim()).find(Boolean)
    return line ?? empty
}

/** Last non-empty line of a child's live output — one line, never a dump. */
function lastLine(text?: string): string {
    if (!text) return ''
    const lines = text.split('\n').map(part => part.trim()).filter(Boolean)
    return lines.length > 0 ? lines[lines.length - 1] : ''
}

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
    return ms < 1000 ? Math.round(ms) + 'ms' : (ms / 1000).toFixed(1) + 's'
}

function ToolSteps({ calls }: { calls: SubToolCallView[] }) {
    if (calls.length === 0) return null
    return (
        <div className="mt-1 space-y-0.5">
            {calls.map(call => (
                <div key={call.callId} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Wrench className="h-2.5 w-2.5 shrink-0 opacity-70" />
                    <span className="truncate font-mono">{call.tool}</span>
                    {call.status === 'running' && <Loader2 className="h-2.5 w-2.5 animate-spin text-indigo-500" />}
                    {call.status === 'success' && <CheckCircle2 className="h-2.5 w-2.5 text-green-500" />}
                    {call.status === 'error' && <XCircle className="h-2.5 w-2.5 text-red-500" />}
                    {formatDuration(call.durationMs) && (
                        <span className="opacity-60">{formatDuration(call.durationMs)}</span>
                    )}
                    {call.error && <span className="truncate text-destructive">{call.error}</span>}
                </div>
            ))}
        </div>
    )
}

/** Compact fallback timeline when the host provides no renderDetail. */
function FallbackDetail({
    sub,
    calls,
    labels,
}: {
    sub: SubRunView
    calls: SubToolCallView[]
    labels: SubAgentTreeLabels
}) {
    const summary = resultText(sub.result, sub.error)
    return (
        <div className="space-y-3 text-[11px]">
            <div>
                <p className="mb-1 text-[10px] font-medium text-muted-foreground/70">{labels.task}</p>
                <p className="max-h-32 overflow-auto whitespace-pre-wrap break-words text-muted-foreground">
                    {sub.task || labels.noTask}
                </p>
            </div>
            {(sub.steps?.length ?? 0) > 0 && (
                <div className="space-y-2">
                    <p className="text-[10px] font-medium text-muted-foreground/70">{labels.steps}</p>
                    {sub.steps!.map(step => (
                        <div key={step.id} className="border-l border-border/70 pl-2.5">
                            {step.reasoning.trim() && (
                                <p className="max-h-32 overflow-auto whitespace-pre-wrap break-words text-[10px] italic text-muted-foreground/70">
                                    {step.reasoning}
                                </p>
                            )}
                            {step.text.trim() && (
                                <p className="whitespace-pre-wrap break-words text-muted-foreground">{step.text}</p>
                            )}
                        </div>
                    ))}
                </div>
            )}
            {calls.length > 0 && (
                <div>
                    <p className="mb-1 text-[10px] font-medium text-muted-foreground/70">{labels.tools}</p>
                    <ToolSteps calls={calls} />
                </div>
            )}
            {sub.status === 'running' && sub.text && (
                <div>
                    <p className="mb-1 text-[10px] font-medium text-muted-foreground/70">{labels.liveOutput}</p>
                    <p className="max-h-32 overflow-auto whitespace-pre-wrap break-words text-muted-foreground/70">
                        {sub.text}
                    </p>
                </div>
            )}
            {summary && (
                <div>
                    <p className="mb-1 text-[10px] font-medium text-muted-foreground/70">
                        {sub.status === 'failed' ? labels.failureReason : labels.result}
                    </p>
                    <p className={cn(
                        'max-h-48 overflow-auto whitespace-pre-wrap break-words',
                        sub.status === 'failed' ? 'text-destructive' : 'text-muted-foreground',
                    )}>
                        {summary}
                    </p>
                </div>
            )}
        </div>
    )
}

interface SubAgentRowProps {
    sub: SubRunView
    toolCalls: SubToolCallView[]
    labels: SubAgentTreeLabels
    renderDetail?: SubAgentTreeProps['renderDetail']
    open: boolean
    pinned: boolean
    onOpenChange: (open: boolean) => void
    onClose: () => void
    onTogglePin: () => void
}

const SubAgentRow: React.FC<SubAgentRowProps> = ({
    sub, toolCalls, labels, renderDetail,
    open, pinned, onOpenChange, onClose, onTogglePin,
}) => {
    const finishedTools = toolCalls.filter(call => call.status !== 'running').length
    const name = subAgentDisplayName(sub)

    return (
        <Popover open={open} onOpenChange={onOpenChange}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-expanded={open}
                    className={cn(
                        'flex w-full items-center gap-1.5 rounded-md border border-border/40 bg-background/60 px-2 py-1 text-left',
                        open && 'border-indigo-500/50 ring-1 ring-indigo-500/30',
                    )}
                >
                    <ChevronRight className={cn('h-2.5 w-2.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />
                    <AgentAvatar name={name} subRunId={sub.subRunId} />
                    <StatusIcon status={sub.status} />
                    <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[11px] font-medium" title={name}>
                            {name}
                        </span>
                        <span
                            className={cn(
                                'truncate text-[10px] text-muted-foreground/70',
                                sub.status === 'running' && lastLine(sub.text) && 'italic',
                            )}
                            title={
                                sub.status === 'running' && lastLine(sub.text)
                                    ? sub.text
                                    : (sub.description || sub.task)
                            }
                        >
                            {sub.status === 'running' && lastLine(sub.text)
                                ? lastLine(sub.text)
                                : firstLine(sub.description || sub.task, labels.noTask)}
                        </span>
                    </span>
                    {toolCalls.length > 0 && (
                        <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-muted-foreground">
                            <Wrench className="h-2.5 w-2.5 opacity-70" />
                            {finishedTools}/{toolCalls.length}
                        </span>
                    )}
                    <Badge variant="outline" className="shrink-0 px-1 py-0 text-[9px]">
                        {statusLabel(sub.status, labels)}
                    </Badge>
                </button>
            </PopoverTrigger>
            <PopoverContent
                side="left"
                align="start"
                sideOffset={8}
                collisionPadding={12}
                onOpenAutoFocus={event => event.preventDefault()}
                className="w-[380px] max-w-[90vw] p-0"
            >
                <div className="flex items-start gap-2 border-b border-border/50 px-3 py-2">
                    <AgentAvatar name={name} subRunId={sub.subRunId} className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 text-[11px] font-medium" title={name}>
                            <span className="truncate">{name}</span>
                            <StatusIcon status={sub.status} className="h-3 w-3 shrink-0" />
                        </p>
                        <p className="truncate text-[10px] text-muted-foreground/70" title={sub.description || sub.task}>
                            {firstLine(sub.description || sub.task, labels.noTask)}
                        </p>
                        <p className="font-mono text-[9px] text-muted-foreground/50">
                            {labels.runId} {sub.subRunId}
                        </p>
                    </div>
                    <button
                        type="button"
                        aria-pressed={pinned}
                        title={pinned ? labels.unpin : labels.pin}
                        aria-label={pinned ? labels.unpin : labels.pin}
                        onClick={onTogglePin}
                        className={cn(
                            'shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                            pinned && 'text-indigo-500',
                        )}
                    >
                        {pinned ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
                    </button>
                    <button
                        type="button"
                        title={labels.close}
                        aria-label={labels.close}
                        onClick={onClose}
                        className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>
                <div className="max-h-[60vh] overflow-y-auto px-3 py-2.5">
                    {renderDetail
                        ? renderDetail(sub, toolCalls)
                        : <FallbackDetail sub={sub} calls={toolCalls} labels={labels} />}
                    {sub.merge && (
                        <div className="mt-3">
                            <p className="mb-1 text-[10px] font-medium text-muted-foreground/70">{labels.mergeBack}</p>
                            <p className={cn('text-[11px]', sub.merge.conflicts > 0 ? 'text-amber-600' : 'text-muted-foreground')}>
                                {sub.merge.summary}
                            </p>
                        </div>
                    )}
                    {sub.usage && sub.usage.promptTokens > 0 && (
                        <div className="mt-3">
                            <p className="mb-1 text-[10px] font-medium text-muted-foreground/70">{labels.usage}</p>
                            <p className="text-[10px] text-muted-foreground">
                                {sub.usage.promptTokens.toLocaleString()} in · {sub.usage.completionTokens.toLocaleString()} out
                                {sub.usage.cachedPromptTokens
                                    ? ' · ' + sub.usage.cachedPromptTokens.toLocaleString() + ' cached'
                                    : ''}
                            </p>
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    )
}

/**
 * 子 agent 委派分组。
 */
export const SubAgentTree: React.FC<SubAgentTreeProps> = ({
    subRuns,
    toolCalls,
    labels,
    renderDetail,
    defaultOpen,
    className,
}) => {
    const l = useMemo(() => ({ ...defaultSubAgentTreeLabels, ...labels }), [labels])

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
        let cancelled = 0
        for (const sub of subRuns) {
            if (sub.status === 'running') running += 1
            else if (sub.status === 'completed') completed += 1
            else if (sub.status === 'cancelled') cancelled += 1
            else failed += 1
        }
        return { running, completed, failed, cancelled }
    }, [subRuns])

    const [open, setOpen] = useState(defaultOpen ?? counts.running > 0)
    const [openRunId, setOpenRunId] = useState<string | null>(null)
    const [pinned, setPinned] = useState(false)

    // Drop the popover if its child disappears from the list.
    useEffect(() => {
        if (openRunId && !subRuns.some(sub => sub.subRunId === openRunId)) {
            setOpenRunId(null)
            setPinned(false)
        }
    }, [openRunId, subRuns])

    // A new delegation (or the first running child) pulls the group open.
    const knownCountRef = useRef(subRuns.length)
    useEffect(() => {
        if (subRuns.length !== knownCountRef.current) {
            knownCountRef.current = subRuns.length
            if (counts.running > 0) setOpen(true)
        }
    }, [subRuns.length, counts.running])

    if (subRuns.length === 0) return null

    const handleOpenChange = (subRunId: string, nextOpen: boolean) => {
        if (!nextOpen) {
            // A pinned popover ignores outside-click/escape closes.
            if (pinned && openRunId === subRunId) return
            setOpenRunId(current => (current === subRunId ? null : current))
            return
        }
        setOpenRunId(subRunId)
    }

    const closePopover = () => {
        setOpenRunId(null)
        setPinned(false)
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
                    <span className="truncate text-[11px] font-medium">
                        {l.title.replace('{count}', String(subRuns.length))}
                    </span>
                    <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[10px] text-muted-foreground">
                        {counts.running > 0 && <span className="text-indigo-500">{counts.running} {l.running}</span>}
                        {counts.completed > 0 && <span className="text-green-600">{counts.completed} {l.completed}</span>}
                        {counts.failed > 0 && <span className="text-red-500">{counts.failed} {l.failed}</span>}
                        {counts.cancelled > 0 && <span>{counts.cancelled} {l.cancelled}</span>}
                    </span>
                </button>
            </div>

            {open && (
                <div className="space-y-1 px-2.5 pb-2">
                    {subRuns.map((sub) => (
                        <SubAgentRow
                            key={sub.subRunId}
                            sub={sub}
                            toolCalls={callsBySubRun.get(sub.subRunId) ?? []}
                            labels={l}
                            renderDetail={renderDetail}
                            open={openRunId === sub.subRunId}
                            pinned={pinned && openRunId === sub.subRunId}
                            onOpenChange={next => handleOpenChange(sub.subRunId, next)}
                            onClose={closePopover}
                            onTogglePin={() => setPinned(value => !value)}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}
