import React, { useState, useCallback } from 'react'
import { StopCircle } from '@kn/icon'
import { Streamdown, formatDistanceToNow, useCopyToClipboard } from '@kn/ui'
import {
    ChatBubble,
    ChatBubbleAvatar,
    ChatBubbleMessage,
} from '@kn/ui'
import { Message, AI_AVATAR_URL, AVATAR_FALLBACKS } from './chat-types'
import { CompletedSteps } from './ExecutionStepsDisplay'

interface MessageBubbleProps {
    message: Message
    showSteps: boolean
    userAvatarUrl?: string
    userFallback: string
}

export const MessageBubble = React.memo(function MessageBubble({
    message,
    showSteps,
    userAvatarUrl,
    userFallback,
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
            <ChatBubbleAvatar
                className={`h-7 w-7 shrink-0 ${isAI
                    ? 'bg-gradient-to-br from-indigo-500 to-purple-500 text-primary-foreground'
                    : 'bg-gradient-to-br from-blue-500 to-cyan-500 text-primary-foreground'
                    }`}
                src={isAI ? AI_AVATAR_URL : userAvatarUrl}
                fallback={isAI ? AVATAR_FALLBACKS.ai : userFallback}
            />
            <div className="flex flex-col gap-1 max-w-[calc(100%-40px)] min-w-0">
                <div className="group relative">
                    <ChatBubbleMessage
                        variant={isAI ? 'received' : 'sent'}
                        className={isAI
                            ? 'bg-gradient-to-br from-indigo-50/90 to-purple-50/90 dark:from-indigo-950/40 dark:to-purple-950/40 border border-indigo-200/60 dark:border-indigo-800/60 p-2.5 text-[13px] leading-relaxed rounded-xl rounded-tl-sm'
                            : 'bg-gradient-to-br from-slate-100/90 to-gray-100/90 dark:from-slate-800/90 dark:to-gray-800/90 text-foreground border border-slate-200/60 dark:border-slate-700/60 p-2.5 text-[13px] leading-relaxed rounded-xl rounded-tr-sm'
                        }
                    >
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
