import React, { useMemo } from 'react'
import { AlertCircle, Loader2, StopCircle } from '@kn/icon'
import {
    ChatBubble,
    ChatBubbleMessage,
    Streamdown,
    SubAgentTree,
    buildSubAgentTreeLabels,
} from '@kn/ui'
import { useTranslation } from '@kn/common'
import { Message, extractBlockReferences, subToolCallsFromSteps } from './chat-types'
import type { BlockReference } from './chat-types'
import { AgentActivityTimeline } from './ExecutionStepsDisplay'
import { ShimmerText } from './chat/ShimmerText'
import { BlockReferences } from './BlockReferences'
import { TurnUsageMeta } from './chat/TurnUsageMeta'

interface MessageBubbleProps {
    message: Message
    isStreaming?: boolean
    /** Reveal a cited block in the editor (wired by the chat surface). */
    onRevealReference?: (ref: BlockReference) => void
}

export const MessageBubble = React.memo(function MessageBubble({
    message,
    isStreaming = false,
    onRevealReference,
}: MessageBubbleProps) {
    const { t } = useTranslation()
    const isAI = message.sender === 'ai'
    const blockReferences = useMemo(() => extractBlockReferences(message.steps), [message.steps])
    // A delegated child's steps belong to the sub-agent tree, not this timeline.
    const parentSteps = useMemo(
        () => message.steps?.filter(step => !step.subRunId),
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

    if (!isAI) {
        return (
            <ChatBubble variant="sent">
                <div className="group flex max-w-[85%] min-w-0 flex-col items-end gap-1 lg:max-w-[78%]">
                    <ChatBubbleMessage
                        variant="sent"
                        className="min-w-0 rounded-2xl rounded-br-md bg-secondary px-3 py-2.5 text-[13px] leading-relaxed text-foreground dark:bg-muted/80"
                    >
                        {message.images && message.images.length > 0 && (
                            <div className="mb-1.5 flex flex-wrap justify-end gap-1.5">
                                {message.images.map((src, index) => (
                                    <img
                                        key={index}
                                        src={src}
                                        alt=""
                                        className="max-h-40 max-w-[180px] rounded-lg border border-border/40 object-cover"
                                    />
                                ))}
                            </div>
                        )}
                        {message.content
                            ? <div className="whitespace-pre-wrap break-words">{message.content}</div>
                            : null}
                    </ChatBubbleMessage>
                </div>
            </ChatBubble>
        )
    }

    return (
        <article
            className="group w-full min-w-0 px-2 py-3"
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
                <div className="mb-3">
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
                <div role="alert" className="mb-3 flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span className="break-words">{localizedError}</span>
                </div>
            )}

            {message.content ? (
                <div className="min-w-0 break-words text-[13px] leading-6 text-foreground [&_h1]:my-3 [&_h1]:text-base [&_h2]:my-3 [&_h2]:text-[15px] [&_h3]:my-2 [&_h3]:text-sm [&_p]:my-2 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:text-xs [&_td]:px-2 [&_th]:px-2">
                    <Streamdown
                        isAnimating={isStreaming}
                        controls={{
                            table: false,
                            code: true,
                            mermaid: { copy: true, download: false, fullscreen: true, panZoom: true },
                        }}
                    >
                        {message.content}
                    </Streamdown>
                </div>
            ) : isStreaming ? (
                <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground" role="status" aria-live="polite">
                    <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                    <ShimmerText>{t('ai.chat.preparingAnswer')}</ShimmerText>
                </div>
            ) : null}

            {blockReferences.length > 0 && (
                <BlockReferences references={blockReferences} onReveal={onRevealReference} />
            )}

            {message.stopped && (
                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <StopCircle className="h-3.5 w-3.5" />
                    <span>{t('ai.chat.stopped')}</span>
                </div>
            )}

            {!message.error && <TurnUsageMeta usage={message.usage} />}
        </article>
    )
})
