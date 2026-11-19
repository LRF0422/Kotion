import React, { useCallback, useMemo, useState } from 'react'
import {
    AlertCircle,
    Check,
    Copy,
    CornerDownRight,
    StopCircle,
} from '@kn/icon'
import {
    Loader,
    Message,
    MessageAction,
    MessageActions,
    MessageAttachments,
    MessageContent,
    MessageResponse,
    MessageToolbar,
    Shimmer,
    SubAgentTree,
    TodoPanel,
    ZoomableImage,
    buildSubAgentTreeLabels,
} from '@kn/ui'
import { useTranslation } from '@kn/common'
import { Message as ChatMessage, TODO_TOOL_NAME, extractBlockReferences, subToolCallsFromSteps } from './chat-types'
import type { BlockReference } from './chat-types'
import { AgentActivityTimeline } from './ExecutionStepsDisplay'
import { BlockReferences } from './BlockReferences'
import { TurnUsageMeta } from './chat/TurnUsageMeta'
import { useImageViewerLabels } from './chat/image-viewer-labels'

interface MessageBubbleProps {
    message: ChatMessage
    isStreaming?: boolean
    /** Reveal a cited block in the editor (wired by the chat surface). */
    onRevealReference?: (ref: BlockReference) => void
}

/**
 * One transcript turn, rendered with the AI Elements message primitives.
 *
 * The data shape is still the agent's own (`Message` / `ExecutionStep`): the
 * AI Elements layer only owns presentation — user bubbles, the assistant
 * column, markdown, message actions and attachments.
 */
export const MessageBubble = React.memo(function MessageBubble({
    message,
    isStreaming = false,
    onRevealReference,
}: MessageBubbleProps) {
    const { t } = useTranslation()
    const imageViewer = useImageViewerLabels()
    const [copied, setCopied] = useState(false)
    const isAI = message.sender === 'ai'
    const blockReferences = useMemo(() => extractBlockReferences(message.steps), [message.steps])
    // A delegated child's steps belong to the sub-agent tree, not this timeline.
    // `update_todos` is folded into the task panel instead of rendering a row.
    const parentSteps = useMemo(
        () => message.steps?.filter(step => !step.subRunId && step.toolName !== TODO_TOOL_NAME),
        [message.steps]
    )
    const subToolCalls = useMemo(() => subToolCallsFromSteps(message.steps), [message.steps])
    const hasActivity = Boolean(
        parentSteps?.length
        || message.reasoningContent?.trim()
        || message.activitySteps?.some(step => step.reasoning.trim())
        || (message.activitySteps?.length ?? 0) > 1
    )
    const localizedError = message.errorType
        ? t(`ai.chat.errors.${message.errorType}`)
        : message.errorMessage

    const handleCopy = useCallback(() => {
        if (!message.content || typeof navigator === 'undefined' || !navigator.clipboard) return
        void navigator.clipboard.writeText(message.content).then(() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1600)
        }).catch(() => { /* clipboard unavailable — keep the icon */ })
    }, [message.content])

    if (!isAI) {
        return (
            <Message from="user" className="px-2 py-1">
                {message.images && message.images.length > 0 && (
                    <MessageAttachments className="mb-0.5 justify-end">
                        {message.images.map((src, index) => (
                            <ZoomableImage
                                key={index}
                                src={src}
                                alt=""
                                gallery={message.images}
                                index={index}
                                zoomLabel={imageViewer.zoomLabel}
                                labels={imageViewer.labels}
                                className="max-h-40 max-w-[180px] border border-border/40 object-cover"
                            />
                        ))}
                    </MessageAttachments>
                )}
                <MessageContent className="max-w-[85%] rounded-br-md bg-secondary px-3 py-2.5 text-[13px] leading-relaxed text-foreground dark:bg-muted/80">
                    {message.content
                        ? <div className="whitespace-pre-wrap break-words">{message.content}</div>
                        : null}
                </MessageContent>
                {message.steered && (
                    <div className="flex items-center gap-1 pr-0.5 text-[11px] text-muted-foreground">
                        <CornerDownRight aria-hidden="true" className="h-3 w-3 shrink-0" />
                        <span>
                            {t('ai.chat.steeredBadge', {
                                defaultValue: '插话给正在执行的任务，本步结束后处理',
                            })}
                        </span>
                    </div>
                )}
            </Message>
        )
    }

    return (
        <Message
            from="assistant"
            className="max-w-full px-2 py-2"
            aria-busy={isStreaming || undefined}
        >
            {(hasActivity || (isStreaming && !message.content)) && (
                <AgentActivityTimeline
                    steps={parentSteps}
                    activitySteps={message.activitySteps}
                    answerStepId={message.answerStepId}
                    reasoningFallback={message.reasoningContent}
                    isRunning={isStreaming}
                />
            )}

            {message.subRuns && message.subRuns.length > 0 && (
                <div className="mb-1">
                    <SubAgentTree
                        subRuns={message.subRuns}
                        toolCalls={subToolCalls}
                        labels={buildSubAgentTreeLabels(t)}
                        renderDetail={(sub, calls) => (
                            <AgentActivityTimeline
                                activitySteps={sub.steps}
                                steps={message.steps?.filter(step => step.subRunId === sub.subRunId)}
                                answerStepId={sub.answerStepId}
                                isRunning={sub.status === 'running'}
                            />
                        )}
                    />
                </div>
            )}

            {localizedError && (
                <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span className="break-words">{localizedError}</span>
                </div>
            )}

            <MessageContent className="w-full min-w-0 gap-2">
                {message.content ? (
                    <MessageResponse
                        isAnimating={isStreaming}
                        controls={{
                            table: false,
                            code: true,
                            mermaid: { copy: true, download: false, fullscreen: true, panZoom: true },
                        }}
                        className="text-[13px] leading-6 text-foreground [&_h1]:my-3 [&_h1]:text-base [&_h2]:my-3 [&_h2]:text-[15px] [&_h3]:my-2 [&_h3]:text-sm [&_p]:my-2 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:text-xs [&_td]:px-2 [&_th]:px-2"
                    >
                        {message.content}
                    </MessageResponse>
                ) : isStreaming ? (
                    <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground" role="status" aria-live="polite">
                        <Loader size={14} />
                        <Shimmer as="span" className="text-xs">
                            {t('ai.chat.preparingAnswer')}
                        </Shimmer>
                    </div>
                ) : null}
            </MessageContent>

            {blockReferences.length > 0 && (
                <BlockReferences references={blockReferences} onReveal={onRevealReference} />
            )}

            {message.todos && message.todos.length > 0 && (
                <TodoPanel
                    todos={message.todos}
                    ended={!isStreaming}
                    labels={{
                        title: t('ai.chat.todos.title', { defaultValue: '任务清单' }),
                        completed: (done: number, total: number) => done >= total
                            ? t('ai.chat.todos.completed', {
                                count: done,
                                defaultValue: '{{count}} 项已完成',
                            })
                            : t('ai.chat.todos.completedOf', {
                                done,
                                total,
                                defaultValue: '{{done}}/{{total}} 项已完成',
                            }),
                        unfinished: (count: number) => t('ai.chat.todos.unfinished', {
                            count,
                            defaultValue: '{{count}} 项未完成',
                        }),
                    }}
                />
            )}

            {message.stopped && (
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <StopCircle className="h-3.5 w-3.5" />
                    <span>{t('ai.chat.stopped')}</span>
                </div>
            )}

            {(message.content || message.usage) && (
                <MessageToolbar className="mt-0 px-0.5">
                    <MessageActions>
                        {message.content && !isStreaming && (
                            <MessageAction
                                tooltip={t('ai.copy', { defaultValue: '复制' })}
                                label={t('ai.copy', { defaultValue: '复制' })}
                                onClick={handleCopy}
                                className="h-7 w-7 text-muted-foreground"
                            >
                                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                            </MessageAction>
                        )}
                    </MessageActions>
                    {!message.error && <TurnUsageMeta usage={message.usage} />}
                </MessageToolbar>
            )}
        </Message>
    )
})
