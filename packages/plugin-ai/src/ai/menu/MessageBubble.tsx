import React, { useState, useCallback } from 'react'
import { StopCircle, AlertCircle, Sparkles, IconCopy } from '@kn/icon'
import { Streamdown, formatDistanceToNow, useCopyToClipboard } from '@kn/ui'
import {
    ChatBubble,
    ChatBubbleMessage,
} from '@kn/ui'
import { Message } from './chat-types'
import { CompletedSteps } from './ExecutionStepsDisplay'

interface MessageBubbleProps {
    message: Message
}

export const MessageBubble = React.memo(function MessageBubble({
    message,
}: MessageBubbleProps) {
    const [, copy] = useCopyToClipboard()
    const [copied, setCopied] = useState(false)

    const handleCopy = useCallback(() => {
        copy(message.content).then((ok) => {
            if (ok) {
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
            }
        })
    }, [copy, message.content])

    const isAI = message.sender === 'ai'
    const relativeTime = formatDistanceToNow(message.timestamp, { addSuffix: true })

    return (
        <ChatBubble variant={isAI ? 'received' : 'sent'}>
            <div className="flex flex-col gap-1 max-w-[calc(100%-8px)] min-w-0">
                <div className="group relative">
                    <ChatBubbleMessage
                        variant={isAI ? 'received' : 'sent'}
                        className={isAI
                            ? message.error
                                ? 'bg-destructive/10 border border-destructive/20 text-destructive p-2.5 text-[13px] leading-relaxed rounded-lg rounded-tl-sm'
                                : 'bg-card border border-border/60 dark:bg-muted/40 dark:border-transparent text-foreground p-2.5 text-[13px] leading-relaxed rounded-lg rounded-tl-sm'
                            : 'bg-secondary text-foreground dark:bg-muted/80 p-2.5 text-[13px] leading-relaxed rounded-lg rounded-tr-sm'
                        }
                    >
                        {message.error && (
                            <div className="flex items-center gap-1 mb-1">
                                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                <span className="font-medium text-[11px]">Error</span>
                            </div>
                        )}
                        {/* Reasoning/thinking process (collapsible) */}
                        {isAI && message.reasoningContent && (
                            <details className="mb-2 group/reasoning">
                                <summary className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors">
                                    <Sparkles className="h-3 w-3" />
                                    <span>思考过程</span>
                                    <span className="text-[9px] text-muted-foreground/50 group-open/reasoning:hidden">▸</span>
                                </summary>
                                <div className="mt-1.5 pl-1 border-l-2 border-muted-foreground/20 text-[11px] leading-relaxed text-muted-foreground/80 whitespace-pre-wrap break-words">
                                    {message.reasoningContent}
                                </div>
                            </details>
                        )}
                        <Streamdown>{message.content}</Streamdown>
                        {message.stopped && (
                            <div className="flex items-center gap-1 mt-1.5 pt-1.5 border-t border-border/50 text-[10px] text-muted-foreground">
                                <StopCircle className="h-3 w-3" />
                                <span>Stopped</span>
                            </div>
                        )}
                    </ChatBubbleMessage>

                    {/* Inline timestamp + copy on hover */}
                    {isAI && (
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 mt-0.5 ml-0.5">
                            <button
                                onClick={handleCopy}
                                className="text-[9px] text-muted-foreground/50 hover:text-foreground transition-colors"
                            >
                                {copied ? 'Copied' : relativeTime}
                            </button>
                        </div>
                    )}

                    {!isAI && (
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-end gap-1.5 mt-0.5 mr-0.5">
                            <button
                                onClick={handleCopy}
                                className="text-muted-foreground/50 hover:text-foreground transition-colors p-0.5"
                                title="Copy"
                            >
                                {copied
                                    ? <span className="text-[9px] text-green-500">Copied</span>
                                    : <IconCopy className="h-3 w-3" />
                                }
                            </button>
                            <span className="text-[9px] text-muted-foreground/50">{relativeTime}</span>
                        </div>
                    )}
                </div>

                {/* Execution steps for completed AI messages */}
                {isAI && message.steps && message.steps.length > 0 && (
                    <CompletedSteps steps={message.steps} />
                )}
            </div>
        </ChatBubble>
    )
})
