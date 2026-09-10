import React, { useMemo, useState } from 'react'
import { ChevronDown, Loader2, Sparkles } from '@kn/icon'
import { Streamdown } from '@kn/ui'
import type { AgentStepRecord } from '@kn/common'
import { useTranslation } from '@kn/common'
import { ExecutionStep, formatToolName, sanitizeToolPayload } from './chat-types'

interface AgentActivityTimelineProps {
    steps?: ExecutionStep[]
    activitySteps?: AgentStepRecord[]
    answerStepId?: string
    reasoningFallback?: string
    isRunning?: boolean
}

type TimelineItem =
    | {
        kind: 'thinking'
        id: string
        sequence: number
        step: number
        reasoning: string
        text: string
    }
    | {
        kind: 'tool'
        id: string
        sequence: number
        step: ExecutionStep
    }

function formatDetails(value: unknown): string {
    if (value === undefined) return ''
    try {
        const formatted = typeof value === 'string'
            ? String(sanitizeToolPayload(value))
            : JSON.stringify(sanitizeToolPayload(value), null, 2)
        return formatted.length > 4000 ? `${formatted.slice(0, 4000)}
…` : formatted
    } catch {
        return String(value)
    }
}

function hasInspectableValue(value: unknown): boolean {
    if (value === undefined || value === null || value === '') return false
    if (Array.isArray(value)) return value.length > 0
    if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0
    return true
}

function buildTimelineItems(
    activitySteps: AgentStepRecord[],
    toolSteps: ExecutionStep[],
    answerStepId?: string,
    reasoningFallback?: string,
): TimelineItem[] {
    const toolStepIds = new Set(toolSteps.map(tool => tool.stepId).filter(Boolean))
    const normalizedSteps = activitySteps.map((step, index) => ({
        ...step,
        id: step.id || `legacy-step-${index}`,
    }))
    const legacyAnswerId = answerStepId || activitySteps.every(step => Boolean(step.id))
        ? undefined
        : [...normalizedSteps].reverse().find(step =>
            step.text.trim() && !toolStepIds.has(step.id)
            && !toolSteps.some(tool => !tool.stepId && tool.step === step.step)
        )?.id
    const resolvedAnswerId = answerStepId ?? legacyAnswerId

    const thinkingItems: TimelineItem[] = normalizedSteps
        .filter(step => step.reasoning.trim() || (step.text.trim() && step.id !== resolvedAnswerId))
        .map(step => ({
            kind: 'thinking',
            id: step.id,
            sequence: step.startedSeq,
            step: step.step,
            reasoning: step.reasoning,
            text: step.id === resolvedAnswerId ? '' : step.text,
        }))

    if (thinkingItems.length === 0 && reasoningFallback?.trim()) {
        thinkingItems.push({
            kind: 'thinking',
            id: 'thinking-legacy',
            sequence: -1,
            step: 1,
            reasoning: reasoningFallback,
            text: '',
        })
    }

    const toolItems: TimelineItem[] = toolSteps.map((step, index) => ({
        kind: 'tool',
        id: step.callId || step.id,
        sequence: step.sequence ?? 100000 + index,
        step,
    }))

    return [...thinkingItems, ...toolItems].sort((a, b) => {
        if (a.sequence !== b.sequence) return a.sequence - b.sequence
        return a.kind === 'thinking' ? -1 : 1
    })
}

export const AgentActivityTimeline = React.memo(function AgentActivityTimeline({
    steps = [],
    activitySteps = [],
    answerStepId,
    reasoningFallback,
    isRunning = false,
}: AgentActivityTimelineProps) {
    const { t } = useTranslation()
    const items = useMemo(
        () => buildTimelineItems(activitySteps, steps, answerStepId, reasoningFallback),
        [activitySteps, answerStepId, reasoningFallback, steps],
    )

    const [open, setOpen] = useState(true)

    if (items.length === 0 && !isRunning) return null

    return (
        <details
            className="group/activity mb-4"
            open={open}
            onToggle={event => setOpen(event.currentTarget.open)}
        >
            <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                <span>{t('ai.chat.steps', { count: Math.max(items.length, 1) })}</span>
                <ChevronDown className="h-3.5 w-3.5 transition-transform group-open/activity:rotate-180" />
            </summary>
            <div className="relative ml-2 mt-2 border-l border-border/80 pl-5">
                {items.map((item, index) => (
                    <div key={item.id} className={index === items.length - 1 ? 'relative' : 'relative pb-4'}>
                        <span className="absolute -left-[24px] top-2 h-2 w-2 rounded-full bg-muted-foreground/60 ring-4 ring-background" />
                        {item.kind === 'thinking'
                            ? <ThinkingItem item={item} expanded={isRunning && index === items.length - 1} />
                            : <ToolItem step={item.step} />}
                    </div>
                ))}
                {items.length === 0 && isRunning && (
                    <div className="relative flex min-h-8 items-center gap-2 text-xs text-muted-foreground" role="status" aria-live="polite">
                        <span className="absolute -left-[24px] top-3 h-2 w-2 rounded-full bg-primary ring-4 ring-background" />
                        <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                        <span>{t('ai.chat.thinking')}</span>
                    </div>
                )}
            </div>
        </details>
    )
})

function ThinkingItem({
    item,
    expanded,
}: {
    item: Extract<TimelineItem, { kind: 'thinking' }>
    expanded: boolean
}) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(expanded)
    return (
        <div className="min-w-0 space-y-2.5">
            {item.reasoning.trim() ? (
                <details
                    className="group/thought"
                    open={open}
                    onToggle={event => setOpen(event.currentTarget.open)}
                >
                    <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                        <Sparkles className="h-4 w-4 shrink-0" />
                        <span className="font-medium">{t('ai.chat.thought')}</span>
                        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open/thought:rotate-180" />
                    </summary>
                    <div className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap break-words pr-1 text-xs leading-relaxed text-muted-foreground">
                        {item.reasoning.trim()}
                    </div>
                </details>
            ) : (
                <div className="flex min-h-8 items-center gap-2 text-xs text-muted-foreground">
                    <Sparkles className="h-4 w-4 shrink-0" />
                    <span className="font-medium">{t('ai.chat.thought')}</span>
                </div>
            )}
            {item.text.trim() && (
                <div className="min-w-0 break-words text-[13px] leading-6 text-foreground [&_p]:my-1.5 [&_pre]:max-w-full [&_pre]:overflow-x-auto">
                    <Streamdown controls={false}>{item.text.trim()}</Streamdown>
                </div>
            )}
        </div>
    )
}

function ToolItem({ step }: { step: ExecutionStep }) {
    const { t } = useTranslation()
    const hasDetails = hasInspectableValue(step.args)
        || hasInspectableValue(step.result)
        || hasInspectableValue(step.error)

    return (
        <div className="min-w-0 py-1">
            <div className="flex min-h-7 min-w-0 items-center gap-2 text-xs">
                <span className={step.status === 'error' ? 'truncate font-medium text-destructive' : 'truncate font-medium text-foreground/80'}>
                    {formatToolName(step.toolName)}
                </span>
                {step.status === 'running' && (
                    <span className="shrink-0 text-muted-foreground">{t('ai.chat.toolRunning')}</span>
                )}
                {step.status === 'error' && (
                    <span className="shrink-0 text-destructive">{t('ai.chat.toolFailed')}</span>
                )}
            </div>
            {hasDetails && <ToolDetails step={step} />}
        </div>
    )
}

function ToolDetails({ step }: { step: ExecutionStep }) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)

    return (
        <details
            className="mt-1 text-[11px] text-muted-foreground"
            onToggle={event => setOpen(event.currentTarget.open)}
        >
            <summary className="cursor-pointer select-none hover:text-foreground">
                {t('ai.chat.toolDetails')}
            </summary>
            {open && (
                <div className="mt-2 space-y-2">
                    {hasInspectableValue(step.args) && (
                        <DetailBlock label={t('ai.chat.toolInput')} value={formatDetails(step.args)} />
                    )}
                    {hasInspectableValue(step.result) && (
                        <DetailBlock label={t('ai.chat.toolOutput')} value={formatDetails(step.result)} />
                    )}
                    {hasInspectableValue(step.error) && (
                        <DetailBlock label={t('ai.chat.toolError')} value={formatDetails(step.error)} destructive />
                    )}
                </div>
            )}
        </details>
    )
}

function DetailBlock({ label, value, destructive = false }: { label: string; value: string; destructive?: boolean }) {
    return (
        <div>
            <div className={destructive ? 'mb-1 font-medium text-destructive' : 'mb-1 font-medium text-foreground/70'}>
                {label}
            </div>
            <pre className="max-h-40 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/70 p-2 font-mono text-[10px] leading-relaxed text-foreground/75">
                {value}
            </pre>
        </div>
    )
}
