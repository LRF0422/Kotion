import React, { useState, useCallback } from 'react'
import { Copy, Check, StopCircle } from '@kn/icon'
import { Streamdown, formatDistanceToNow, useCopyToClipboard } from '@kn/ui'
import {
    ChatBubble,
    ChatBubbleAvatar,
    ChatBubbleMessage,
    ChatBubbleAction,
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
                className={`h-9 w-9 shrink-0 ${isAI
                    ? 'bg-gradient-to-br from-indigo-500 to-purple-500 text-primary-foreground shadow-lg shadow-indigo-500/20'
                    : 'bg-gradient-to-br from-blue-500 to-cyan-500 text-primary-foreground shadow-lg shadow-blue-500/20'
                }`}
                src={isAI ? AI_AVATAR_URL : userAvatarUrl}
                fallback={isAI ? AVATAR_FALLBACKS.ai : userFallback}
            />
            <div className="flex flex-col gap-2 max-w-[calc(100%-52px)] min-w-0">
                <div className="group relative">
                    <ChatBubbleMessage
                        variant={isAI ? 'received' : 'sent'}
                        className={isAI
                            ? 'bg-gradient-to-br from-indigo-50/90 to-purple-50/90 dark:from-indigo-950/40 dark:to-purple-950/40 border border-indigo-200/60 dark:border-indigo-800/60 shadow-lg shadow-indigo-500/5 p-4 rounded-2xl rounded-tl-sm'
                            : 'bg-gradient-to-br from-slate-100/90 to-gray-100/90 dark:from-slate-800/90 dark:to-gray-800/90 text-foreground border border-slate-200/60 dark:border-slate-700/60 shadow-lg shadow-slate-500/5 p-4 rounded-2xl rounded-tr-sm'
                        }
                    >
                        <Streamdown>{message.content}</Streamdown>
                        {message.stopped && (
                            <div className="flex items-center gap-1.5 mt-3 pt-2.5 border-t border-border/50 text-xs text-muted-foreground">
                                <StopCircle className="h-3.5 w-3.5" />
                                <span>已停止生成</span>
                            </div>
                        )}
                    </ChatBubbleMessage>

                    {/* Copy button + timestamp on hover */}
                    {isAI && (
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 mt-1.5 ml-1">
                            <ChatBubbleAction
                                icon={copied
                                    ? <Check className="h-3.5 w-3.5 text-green-500" />
                                    : <Copy className="h-3.5 w-3.5" />
                                }
                                onClick={handleCopy}
                                className="h-7 w-7 text-muted-foreground/60 hover:text-foreground bg-background/80 rounded-lg shadow-sm"
                            />
                            <span className="text-[10px] text-muted-foreground/60">{relativeTime}</span>
                        </div>
                    )}

                    {!isAI && (
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity mt-1.5 mr-1 text-right">
                            <span className="text-[10px] text-muted-foreground/60">{relativeTime}</span>
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
