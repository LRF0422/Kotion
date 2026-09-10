import React, { useCallback, useMemo, useState } from 'react'
import { AlertCircle, IconCopy, Loader2, StopCircle } from '@kn/icon'
import {
    ChatBubble,
    ChatBubbleMessage,
    Streamdown,
    SubAgentTree,
    formatDistanceToNow,
    useCopyToClipboard,
} from '@kn/ui'
import { useTranslation } from '@kn/common'
import { Message, extractBlockReferences } from './chat-types'
import type { BlockReference } from './chat-types'
import { AgentActivityTimeline } from './ExecutionStepsDisplay'
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
    const [, copy] = useCopyToClipboard()
    const [copied, setCopied] = useState(false)

    const handleCopy = useCallback(() => {
        if (!message.content) return
        copy(message.content).then((ok) => {
            if (ok) {
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
            }
        })
    }, [copy, message.content])

    const isAI = message.sender === 'ai'
    const relativeTime = formatDistanceToNow(message.timestamp, { addSuffix: true })
    const blockReferences = useMemo(() => extractBlockReferences(message.steps), [message.steps])
    const hasActivity = Boolean(
        message.steps?.length
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
                        <div className="whitespace-pre-wrap break-words">{message.content}</div>
                    </ChatBubbleMessage>
                    <div className="flex min-h-11 items-center justify-end gap-1 text-[10px] text-muted-foreground/70 lg:min-h-7">
                        <button
                            type="button"
                            onClick={handleCopy}
                            className="flex h-11 w-11 items-center justify-center rounded-md transition-colors hover:bg-muted hover:text-foreground lg:h-7 lg:w-7"
                            aria-label={t('ai.copy')}
                            title={t('ai.copy')}
                        >
                            {copied
                                ? <span className="text-[10px] text-emerald-600">{t('ai.copied')}</span>
                                : <IconCopy className="h-3.5 w-3.5" />}
                        </button>
                        <span>{relativeTime}</span>
                    </div>
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
                    steps={message.steps}
                    activitySteps={message.activitySteps}
                    answerStepId={message.answerStepId}
                    reasoningFallback={message.reasoningContent}
                    isRunning={isStreaming}
                />
            )}

            {message.subRuns && message.subRuns.length > 0 && (
                <div className="mb-3">
                    <SubAgentTree subRuns={message.subRuns} />
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
                    <span>{t('ai.chat.preparingAnswer')}</span>
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

            {!isStreaming && (
                <div className="mt-1 flex min-h-11 items-center gap-1 text-[10px] text-muted-foreground/70 lg:min-h-7">
                    <button
                        type="button"
                        onClick={handleCopy}
                        disabled={!message.content}
                        className="flex h-11 min-w-11 items-center justify-center gap-1 rounded-md px-2 transition-colors hover:bg-muted hover:text-foreground disabled:cursor-default disabled:opacity-40 lg:h-7 lg:min-w-7"
                        aria-label={t('ai.copy')}
                        title={t('ai.copy')}
                    >
                        <IconCopy className="h-3.5 w-3.5" />
                        {copied && <span>{t('ai.copied')}</span>}
                    </button>
                    <span>{relativeTime}</span>
                </div>
            )}
        </article>
    )
})
