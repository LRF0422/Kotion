import React, { useState, useCallback } from 'react'
import { StopCircle, AlertCircle } from '@kn/icon'
import { Streamdown, formatDistanceToNow, useCopyToClipboard } from '@kn/ui'
import {
    ChatBubble,
    ChatBubbleMessage,
} from '@kn/ui'
import { Message } from './chat-types'
import { CompletedSteps } from './ExecutionStepsDisplay'

interface MessageBubbleProps {
    message: Message
    showSteps: boolean
}

export const MessageBubble = React.memo(function MessageBubble({
    message,
    showSteps,
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
                                ? 'bg-red-50 dark:bg-red-950/30 border border-red-200/60 dark:border-red-900/40 text-red-700 dark:text-red-300 p-2.5 text-[13px] leading-relaxed rounded-xl rounded-tl-sm'
                                : 'bg-white dark:bg-muted/40 text-foreground p-2.5 text-[13px] leading-relaxed rounded-xl rounded-tl-sm'
                            : 'bg-[#E6E6E6] dark:bg-muted/80 text-foreground p-2.5 text-[13px] leading-relaxed rounded-xl rounded-tr-sm'
                        }
                    >
                        {message.error && (
                            <div className="flex items-center gap-1 mb-1">
                                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                <span className="font-medium text-[11px]">Error</span>
                            </div>
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
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 mr-0.5 text-right">
                            <span className="text-[9px] text-muted-foreground/50">{relativeTime}</span>
                        </div>
                    )}
                </div>

                {/* Execution steps for completed AI messages */}
                {isAI && message.steps && message.steps.length > 0 && showSteps && (
                    <CompletedSteps steps={message.steps} />
                )}
            </div>
        </ChatBubble>
    )
})
