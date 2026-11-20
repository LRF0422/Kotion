import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Loader2, Sparkles } from '@kn/icon'
import {
    MessageResponse,
    Reasoning,
    ReasoningContent,
    ReasoningTrigger,
    Task,
    TaskContent,
    TaskTrigger,
    Tool,
    ToolApprovalCard,
    ToolContent,
    ToolHeader,
    ToolInput,
    ToolOutput,
} from '@kn/ui'
import type { ToolState } from '@kn/ui'
import type { AgentStepRecord } from '@kn/common'
import { AgentToolResultCard, useTranslation } from '@kn/common'
import { ExecutionStep, sanitizeToolPayload } from './chat-types'
import { toolCallTitle } from './tool-titles'
import { ShimmerText } from './chat/ShimmerText'
import { getToolIcon } from './tool-icons'

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

/** Tool id of the user-choice frontend tool (see core `misc-tools`). */
const USER_CHOICE_TOOL = 'askUserChoice'

/**
 * The user-choice tool returns `{ selectedLabel, isCustomInput, ... }`. Surface
 * the question and the picked answer inline so the decision stays visible in
 * the timeline after the interactive card is gone.
 */
function readUserChoice(
    step: ExecutionStep,
): { question?: string; answer?: string; waiting: boolean } | null {
    if (step.toolName !== USER_CHOICE_TOOL) return null
    const args = step.args as { question?: unknown } | null | undefined
    const result = step.result as
        | { selectedLabel?: unknown; error?: unknown }
        | null
        | undefined
    const question = typeof args?.question === 'string' && args.question.trim()
        ? args.question.trim()
        : undefined
    const label = typeof result?.selectedLabel === 'string' ? result.selectedLabel.trim() : ''
    if (label) return { question, answer: label, waiting: false }
    if (step.status === 'running') return { question, waiting: true }
    return { question, waiting: false }
}

/** Display-only cap: a tool payload is not a document, and megabytes of JSON
 * would freeze the transcript. The cap says so instead of silently truncating. */
const DISPLAY_MAX_CHARS = 4000

function toDisplayPayload(
    value: unknown,
    t: (key: string, options?: { total?: number }) => string,
): unknown {
    const sanitized = sanitizeToolPayload(value)
    if (typeof sanitized === 'string') {
        return sanitized.length > DISPLAY_MAX_CHARS
            ? `${sanitized.slice(0, DISPLAY_MAX_CHARS)}\n${t('ai.chat.toolOutputCapped', { total: sanitized.length })}`
            : sanitized
    }
    if (sanitized && typeof sanitized === 'object') {
        try {
            const json = JSON.stringify(sanitized)
            if (json.length > DISPLAY_MAX_CHARS) {
                return `${json.slice(0, DISPLAY_MAX_CHARS)}\n${t('ai.chat.toolOutputCapped', { total: json.length })}`
            }
        } catch {
            return String(sanitized)
        }
    }
    return sanitized
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

/**
 * The run's reasoning + tool calls, as one collapsible activity group.
 *
 * Presentation uses AI Elements: `Task` for the group, `Reasoning` for a
 * thinking block and `Tool` for each call. The event/step projection that feeds
 * it is unchanged, so live runs and replayed transcripts look the same.
 */
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
        <Task open={open} onOpenChange={setOpen} className="mb-2">
            <TaskTrigger title={t('ai.chat.steps', { count: Math.max(items.length, 1) })}>
                <button
                    type="button"
                    className="flex min-h-8 w-full items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground lg:min-h-6"
                >
                    <span>{t('ai.chat.steps', { count: Math.max(items.length, 1) })}</span>
                    <ChevronDown
                        className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
                    />
                </button>
            </TaskTrigger>
            <TaskContent className="mt-1">
                {/* The run reads as a timeline, not a stack: a continuous rail with
                    one status dot per step, so "what ran, in what order, what is
                    still going" is legible at a glance. */}
                <div className="relative ml-2 border-l border-border/70 pl-4">
                    {items.map((item, index) => (
                        <div key={item.id} className="relative min-w-0 pb-3 last:pb-0">
                            <TimelineDot item={item} />
                            {item.kind === 'thinking'
                                ? <ThinkingItem item={item} expanded={isRunning && index === items.length - 1} />
                                : <ToolItem step={item.step} />}
                        </div>
                    ))}
                    {items.length === 0 && isRunning && (
                        <div className="relative flex min-h-7 items-center gap-1.5 text-xs text-muted-foreground" role="status" aria-live="polite">
                            <TimelineDot active />
                            <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                            <ShimmerText>{t('ai.chat.thinking')}</ShimmerText>
                        </div>
                    )}
                </div>
            </TaskContent>
        </Task>
    )
})

/**
 * Dot for one timeline row. The rail line is drawn by the parent, so the dot
 * only needs to sit on it (`-left` = parent padding + half its own size) and
 * punch a hole in the line with its ring.
 */
function TimelineDot({ item, active = false }: { item?: TimelineItem; active?: boolean }) {
    let tone = 'bg-muted-foreground/40'
    let pulse = false
    if (active) {
        tone = 'bg-primary'
        pulse = true
    } else if (item?.kind === 'tool') {
        if (item.step.approval?.status === 'pending') {
            tone = 'bg-amber-500'
        } else if (item.step.status === 'error') {
            tone = 'bg-destructive'
        } else if (item.step.status === 'running') {
            tone = 'bg-primary'
            pulse = true
        }
    }
    return (
        <span
            aria-hidden="true"
            className={`absolute -left-[19px] top-3 size-1.5 rounded-full ring-2 ring-background ${tone} ${pulse ? 'animate-pulse motion-reduce:animate-none' : ''}`}
        />
    )
}

function ThinkingItem({
    item,
    expanded,
}: {
    item: Extract<TimelineItem, { kind: 'thinking' }>
    expanded: boolean
}) {
    const { t } = useTranslation()
    const bodyRef = useRef<HTMLDivElement | null>(null)

    // Reasoning streams token by token: keep the newest line visible while the
    // block is the active one, without stealing the outer transcript scroll.
    useEffect(() => {
        if (!expanded || !bodyRef.current) return
        bodyRef.current.scrollTop = bodyRef.current.scrollHeight
    }, [item.reasoning, expanded])

    const label = expanded
        ? <ShimmerText className="font-medium">{t('ai.chat.thought')}</ShimmerText>
        : <span className="font-medium">{t('ai.chat.thought')}</span>

    return (
        <div className="min-w-0 space-y-1">
            {item.reasoning.trim() ? (
                <Reasoning isStreaming={expanded} defaultOpen={expanded} className="mb-0">
                    <ReasoningTrigger getThinkingMessage={() => label} />
                    <div ref={bodyRef} className="max-h-48 overflow-y-auto pr-1">
                        <ReasoningContent className="mt-0.5 text-[11px] leading-5">
                            {item.reasoning}
                        </ReasoningContent>
                    </div>
                </Reasoning>
            ) : (
                <div className="flex min-h-7 items-center gap-1.5 text-xs text-muted-foreground">
                    <Sparkles className="h-4 w-4 shrink-0" />
                    {label}
                </div>
            )}
            {item.text.trim() && (
                <div className="min-w-0 break-words text-[13px] leading-6 text-foreground [&_p]:my-1.5 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_code]:text-[length:1em] [&_pre]:text-[length:1em]">
                    <MessageResponse controls={false}>{item.text.trim()}</MessageResponse>
                </div>
            )}
        </div>
    )
}

function toolState(step: ExecutionStep): ToolState {
    if (step.approval?.status === 'pending') return 'approval-requested'
    if (step.status === 'error') return 'output-error'
    if (step.status === 'running') {
        return hasInspectableValue(step.args) ? 'input-available' : 'input-streaming'
    }
    return 'output-available'
}

function ToolItem({ step }: { step: ExecutionStep }) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const userChoice = readUserChoice(step)
    const hasDetails = hasInspectableValue(step.args)
        || hasInspectableValue(step.result)
        || hasInspectableValue(step.error)
    const state = toolState(step)

    const labels: Partial<Record<ToolState, string>> = {
        'input-streaming': t('ai.chat.toolRunning'),
        'input-available': t('ai.chat.toolRunning'),
        'approval-requested': t('ai.chat.toolApprovalRequested'),
        'approval-responded': t('ai.chat.toolApprovalResponded'),
        'output-available': t('ai.chat.toolCompleted'),
        'output-error': t('ai.chat.toolFailed'),
        'output-denied': t('ai.chat.toolFailed'),
    }

    const args = useMemo(() => toDisplayPayload(step.args, t), [step.args, t])
    const result = useMemo(() => toDisplayPayload(step.result, t), [step.result, t])
    // The title names what this call did when its own arguments say so
    // ("搜索「季度目标」"), not just which tool ran ("搜索文档").
    const title = toolCallTitle(
        (key, options) => t(key, options),
        { toolName: step.toolName, args: step.args, result: step.result },
    )

    return (
        <div className="min-w-0 space-y-1">
            <Tool open={open} onOpenChange={setOpen} className="mb-0">
                <ToolHeader
                    title={title}
                    type={`tool-${step.toolName}`}
                    state={state}
                    labels={labels}
                    icon={getToolIcon(step.toolName)}
                />
                <ToolContent>
                    {hasDetails ? (
                        <>
                            <ToolInput input={args} label={t('ai.chat.toolInput')} />
                            <ToolOutput
                                output={result}
                                errorText={step.error}
                                label={t('ai.chat.toolOutput')}
                                errorLabel={t('ai.chat.toolError')}
                            />
                        </>
                    ) : (
                        <div className="px-3 pb-3 text-[11px] text-muted-foreground">
                            {t('ai.chat.toolNoDetails')}
                        </div>
                    )}
                </ToolContent>
            </Tool>

            {/* Plugin-registered card for this tool's result. Renders nothing
                when no plugin declared a renderer, so the structured block above
                remains the universal fallback. While the call is waiting for
                approval it renders the approval card instead (plugin card by
                request.kind, else the host's generic ToolApprovalCard). */}
            <AgentToolResultCard
                tool={step.toolName}
                args={step.args}
                result={step.result}
                owner={step.subRunId}
                callId={step.callId ?? step.id}
                status={step.status}
                approval={step.approval}
                ApprovalCard={ToolApprovalCard}
            />

            {userChoice && (
                <div className="space-y-0.5 pl-1 text-[11px]">
                    {userChoice.question && (
                        <div className="line-clamp-2 text-muted-foreground">{userChoice.question}</div>
                    )}
                    {userChoice.answer ? (
                        <div className="flex items-start gap-1">
                            <Check className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                            <span className="min-w-0 break-words font-medium text-foreground">
                                {t('ai.chat.userChoiceLabel')}{userChoice.answer}
                            </span>
                        </div>
                    ) : userChoice.waiting ? (
                        <div className="text-muted-foreground">{t('ai.chat.userChoiceWaiting')}</div>
                    ) : null}
                </div>
            )}
        </div>
    )
}
