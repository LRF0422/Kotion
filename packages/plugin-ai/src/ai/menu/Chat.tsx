"use client"

import { useState, FormEvent, useCallback, useMemo, useRef, useEffect } from "react"
import { Paperclip, Mic, Sparkles, Send, Terminal, Trash2, HelpCircle, Square, XCircle } from "@kn/icon"
import {
    Button, Streamdown, Badge,
    Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, Input,
} from "@kn/ui"
import {
    ChatBubble,
    ChatBubbleAvatar,
    ChatBubbleMessage,
} from "@kn/ui"
import { ChatInput } from "@kn/ui"
import {
    ExpandableChat,
    ExpandableChatHeader,
    ExpandableChatBody,
    ExpandableChatFooter,
} from "@kn/ui"
import { ChatMessageList } from "@kn/ui"
import React from "react"
import { Editor } from "@kn/editor"
import { useEditorAgentOptimized, useUploadFile, ToolExecutionEvent, UserChoiceRequest } from "@kn/core"
import { useSelector } from "@kn/common"
import { GlobalState } from "@kn/core"

import {
    Message, ExecutionStep, PendingUserChoice, ChatError,
    INITIAL_MESSAGE, AI_AVATAR_URL, AVATAR_FALLBACKS,
    classifyError,
} from "./chat-types"
import type { AnnotationData } from "./chat-types"
import { useTeamStatus, createInitialTeamState } from "./useTeamStatus"
import { useSessionManager } from "./useSessionManager"
import { TeamStatusPanel } from "./TeamStatusPanel"
import { loadMessages, saveMessages, clearPersistedMessages, getHistoryForAI } from "./chat-persistence"
import { useStreamingBuffer } from "./use-streaming-buffer"
import { MessageBubble } from "./MessageBubble"
import { LiveSteps } from "./ExecutionStepsDisplay"
import { QuickPrompts } from "./QuickPrompts"
import { ErrorDisplay } from "./ErrorDisplay"

export const ExpandableChatDemo: React.FC<{ editor: Editor }> = ({ editor }) => {
    const [currentSteps, setCurrentSteps] = useState<ExecutionStep[]>([])
    const stepsRef = useRef<ExecutionStep[]>([])

    // User choice state
    const [pendingChoice, setPendingChoice] = useState<PendingUserChoice | null>(null)
    const [customInput, setCustomInput] = useState("")
    const pendingChoiceRef = useRef<PendingUserChoice | null>(null)

    // Tool execution callback
    const handleToolExecution = useCallback((event: ToolExecutionEvent) => {
        if (event.status === 'start') {
            const newStep: ExecutionStep = {
                id: `step-${event.timestamp}-${Math.random().toString(36).substr(2, 9)}`,
                toolName: event.toolName,
                args: event.args,
                status: 'running',
                timestamp: event.timestamp
            }
            stepsRef.current = [...stepsRef.current, newStep]
            setCurrentSteps([...stepsRef.current])
        } else {
            const updatedSteps = stepsRef.current.map(step => {
                if (step.toolName === event.toolName && step.status === 'running') {
                    return {
                        ...step,
                        result: event.result,
                        status: event.status === 'success' ? 'success' as const : 'error' as const,
                        duration: event.duration
                    }
                }
                return step
            })
            stepsRef.current = updatedSteps
            setCurrentSteps([...updatedSteps])
        }
    }, [])

    // User choice request handler
    const handleUserChoiceRequest = useCallback((request: UserChoiceRequest): Promise<string> => {
        return new Promise((resolve, reject) => {
            const choice: PendingUserChoice = { request, resolve, reject }
            pendingChoiceRef.current = choice
            setPendingChoice(choice)
        })
    }, [])

    const handleOptionSelect = useCallback((optionId: string) => {
        if (pendingChoiceRef.current) {
            pendingChoiceRef.current.resolve(optionId)
            pendingChoiceRef.current = null
            setPendingChoice(null)
            setCustomInput("")
        }
    }, [])

    const handleCustomSubmit = useCallback(() => {
        if (pendingChoiceRef.current && customInput.trim()) {
            pendingChoiceRef.current.resolve(customInput.trim())
            pendingChoiceRef.current = null
            setPendingChoice(null)
            setCustomInput("")
        }
    }, [customInput])

    const handleCancelChoice = useCallback(() => {
        if (pendingChoiceRef.current) {
            pendingChoiceRef.current.reject(new Error('User cancelled the choice'))
            pendingChoiceRef.current = null
            setPendingChoice(null)
            setCustomInput("")
        }
    }, [])

    const { stream, stop } = useEditorAgentOptimized(editor, handleToolExecution, handleUserChoiceRequest)
    const { userInfo } = useSelector((state: GlobalState) => state)
    const { usePath } = useUploadFile()

    // Session management
    const { sessionId, conversationId, parseAnnotations, clearSession } = useSessionManager()

    // Team status tracking
    const [annotations, setAnnotations] = useState<AnnotationData[]>([])
    const teamState = useTeamStatus(annotations)

    // Persistence: load from localStorage on init
    const [messages, setMessages] = useState<Message[]>(() => loadMessages())
    const [input, setInput] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [showSteps, setShowSteps] = useState(true)
    const [error, setError] = useState<ChatError | null>(null)

    // Streaming buffer (rAF batched)
    const buffer = useStreamingBuffer()

    // Last user message ref for retry
    const lastUserMessageRef = useRef<string>("")

    // Persist messages on change
    useEffect(() => {
        saveMessages(messages)
    }, [messages])

    // Generate unique message ID
    const generateMessageId = useCallback(() => {
        return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    }, [])

    // Check if input is valid
    const isInputValid = useMemo(() => {
        return input.trim().length > 0 && !isLoading
    }, [input, isLoading])

    // User avatar info
    const userAvatarUrl = userInfo?.avatar ? usePath(userInfo.avatar) : undefined
    const userFallback = userInfo?.name?.substring(0, 2).toUpperCase()
        || userInfo?.account?.substring(0, 2).toUpperCase()
        || "U"

    // Core submit logic (used by both form submit and retry)
    const submitMessage = useCallback(async (messageText: string) => {
        const userMessage: Message = {
            id: generateMessageId(),
            content: messageText,
            sender: "user",
            timestamp: Date.now(),
        }

        setMessages((prev) => [...prev, userMessage])
        setIsLoading(true)
        setError(null)
        lastUserMessageRef.current = messageText
        stepsRef.current = []
        setCurrentSteps([])
        buffer.reset()
        setAnnotations([]) // Reset team state for new message

        try {
            // Build history with token-limited context
            const currentMessages = [...messages, userMessage]
            const historyMessages = getHistoryForAI(currentMessages)
            // Remove the last user message from history since it's passed as prompt
            const history = historyMessages.slice(0, -1)

            const { textStream } = await stream({
                prompt: messageText,
                messages: history,
                sessionId: sessionId || undefined,
                conversationId: conversationId || undefined,
                onAnnotation: (newAnnotations: AnnotationData[]) => {
                    setAnnotations(prev => [...prev, ...newAnnotations])
                    parseAnnotations(newAnnotations)
                },
            })

            for await (const part of textStream) {
                buffer.append(part)
            }

            const aiMessage: Message = {
                id: generateMessageId(),
                content: buffer.getContent(),
                sender: "ai",
                timestamp: Date.now(),
                steps: [...stepsRef.current]
            }

            setMessages((prev) => [...prev, aiMessage])
            buffer.reset()
            setCurrentSteps([])
        } catch (err: any) {
            if (err?.name === 'AbortError' || err?.message?.includes('abort')) {
                const currentContent = buffer.getContent()
                if (currentContent) {
                    const aiMessage: Message = {
                        id: generateMessageId(),
                        content: currentContent,
                        sender: "ai",
                        timestamp: Date.now(),
                        steps: [...stepsRef.current],
                        stopped: true,
                    }
                    setMessages((prev) => [...prev, aiMessage])
                }
                buffer.reset()
                setCurrentSteps([])
            } else {
                console.error("Error generating AI response:", err)
                setError(classifyError(err))
                buffer.reset()
                setCurrentSteps([])
            }
        } finally {
            setIsLoading(false)
        }
    }, [stream, generateMessageId, messages, buffer])

    const handleSubmit = useCallback(async (e: FormEvent) => {
        e.preventDefault()
        if (!isInputValid) return
        const messageText = input
        setInput("")
        submitMessage(messageText)
    }, [input, isInputValid, submitMessage])

    // Quick prompt submit
    const handleQuickSubmit = useCallback((prompt: string) => {
        if (isLoading) return
        submitMessage(prompt)
    }, [isLoading, submitMessage])

    // Retry last failed message
    const handleRetry = useCallback(() => {
        if (!lastUserMessageRef.current || isLoading) return
        setError(null)
        submitMessage(lastUserMessageRef.current)
    }, [isLoading, submitMessage])

    const handleStop = useCallback(() => {
        stop()
    }, [stop])

    const handleAttachFile = useCallback(() => {
        console.log("Attach file clicked")
    }, [])

    const handleMicrophoneClick = useCallback(() => {
        console.log("Microphone clicked")
    }, [])

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value)
        setError(null)
    }, [])

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            if (isInputValid) {
                handleSubmit(e as any)
            }
        }
    }, [isInputValid, handleSubmit])

    // Clear chat history
    const handleClearChat = useCallback(() => {
        setMessages([INITIAL_MESSAGE])
        setCurrentSteps([])
        stepsRef.current = []
        clearPersistedMessages()
        setAnnotations([])
        clearSession()
    }, [clearSession])

    // Message count (excluding initial message)
    const messageCount = messages.length - 1

    // Show quick prompts when empty state
    const showQuickPrompts = messages.length === 1 && !isLoading

    return (
        <ExpandableChat
            size="md"
            icon={
                <div className="relative">
                    <Sparkles className={`h-6 w-6 ${isLoading ? 'animate-pulse' : ''}`} />
                    {isLoading && (
                        <>
                            <span className="absolute inset-0 -m-1 rounded-full border-2 border-primary-foreground/30 animate-ping" />
                            <span className="absolute -inset-1">
                                <svg className="h-8 w-8 animate-spin" viewBox="0 0 32 32">
                                    <circle
                                        cx="16"
                                        cy="16"
                                        r="14"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeDasharray="60 40"
                                        className="opacity-75"
                                    />
                                </svg>
                            </span>
                        </>
                    )}
                </div>
            }
        >
            {/* Header with message count badge */}
            <ExpandableChatHeader className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-indigo-500/5 via-purple-500/5 to-transparent">
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl blur-md opacity-30" />
                        <div className="relative p-2 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 shadow-lg shadow-indigo-500/20">
                            <Sparkles className="h-5 w-5 text-white" />
                        </div>
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-base font-semibold text-foreground">AI Assistant</h1>
                            {messageCount > 0 && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-medium">
                                    {messageCount}
                                </Badge>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Ask questions, edit documents, or get help with tasks
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowSteps(!showSteps)}
                                    className={`h-8 w-8 p-0 text-muted-foreground hover:text-foreground transition-colors ${showSteps ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20' : 'hover:text-indigo-500'}`}
                                >
                                    <Terminal className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-xs">
                                {showSteps ? 'Hide tool execution details' : 'Show tool execution details'}
                            </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleClearChat}
                                    className="h-8 w-8 p-0 text-muted-foreground hover:text-red-500 transition-colors"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-xs">
                                Clear chat history
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            </ExpandableChatHeader>

            <ExpandableChatBody className="bg-background overflow-x-hidden">
                <TeamStatusPanel teamState={teamState} />
                <ChatMessageList>
                    {messages.map((message) => (
                        <MessageBubble
                            key={message.id}
                            message={message}
                            showSteps={showSteps}
                            userAvatarUrl={userAvatarUrl}
                            userFallback={userFallback}
                        />
                    ))}

                    {/* Quick prompts in empty state */}
                    {showQuickPrompts && (
                        <QuickPrompts onSubmit={handleQuickSubmit} />
                    )}

                    {/* Live execution steps */}
                    {isLoading && currentSteps.length > 0 && showSteps && (
                        <LiveSteps steps={currentSteps} />
                    )}

                    {/* Streaming message (rAF buffered) */}
                    {buffer.displayText && (
                        <ChatBubble variant="received">
                            <ChatBubbleAvatar
                                className="h-9 w-9 shrink-0 bg-gradient-to-br from-indigo-500 to-purple-500 text-primary-foreground"
                                src={AI_AVATAR_URL}
                                fallback={AVATAR_FALLBACKS.ai}
                            />
                            <ChatBubbleMessage className="bg-gradient-to-br from-indigo-50/80 to-purple-50/80 dark:from-indigo-950/40 dark:to-purple-950/40 border border-indigo-200/60 dark:border-indigo-800/60 shadow-sm shadow-indigo-500/5 p-4 rounded-2xl rounded-tl-sm">
                                <Streamdown isAnimating>{buffer.displayText}</Streamdown>
                            </ChatBubbleMessage>
                        </ChatBubble>
                    )}

                    {/* Loading indicator */}
                    {isLoading && !buffer.displayText && currentSteps.length === 0 && (
                        <ChatBubble variant="received">
                            <ChatBubbleAvatar
                                className="h-9 w-9 shrink-0 bg-gradient-to-br from-indigo-500 to-purple-500 text-primary-foreground"
                                src={AI_AVATAR_URL}
                                fallback={AVATAR_FALLBACKS.ai}
                            />
                            <ChatBubbleMessage isLoading className="bg-gradient-to-br from-indigo-50/80 to-purple-50/80 dark:from-indigo-950/40 dark:to-purple-950/40 border border-indigo-200/60 dark:border-indigo-800/60 shadow-sm shadow-indigo-500/5 p-4 rounded-2xl rounded-tl-sm" />
                        </ChatBubble>
                    )}

                    {/* User Choice Dialog */}
                    {pendingChoice && (
                        <div className="mx-4 my-3 p-4 rounded-2xl bg-gradient-to-br from-indigo-50/80 to-purple-50/80 dark:from-indigo-950/30 dark:to-purple-950/30 border border-indigo-200/60 dark:border-indigo-800/60 shadow-lg shadow-indigo-500/5 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
                            <div className="flex items-start gap-3 mb-3">
                                <div className="relative">
                                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-lg blur-sm opacity-30" />
                                    <div className="relative p-2 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 shadow-lg">
                                        <HelpCircle className="h-4 w-4 text-white" />
                                    </div>
                                </div>
                                <div className="flex-1 min-w-0 pt-1">
                                    <p className="font-medium text-sm text-foreground">{pendingChoice.request.question}</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">Please select an option to continue</p>
                                </div>
                            </div>

                            <div className="space-y-2">
                                {pendingChoice.request.options.map((option) => (
                                    <button
                                        key={option.id}
                                        onClick={() => handleOptionSelect(option.id)}
                                        className="w-full p-3 rounded-xl border border-indigo-200/60 dark:border-indigo-800/60 bg-background/80 hover:bg-indigo-50/80 dark:hover:bg-indigo-950/40 transition-all text-left group"
                                    >
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 group-hover:scale-125 transition-transform" />
                                            <span className="font-medium text-sm">{option.label}</span>
                                        </div>
                                        {option.description && (
                                            <p className="text-xs text-muted-foreground mt-1 ml-4 line-clamp-2">{option.description}</p>
                                        )}
                                    </button>
                                ))}
                            </div>

                            {pendingChoice.request.allowCustomInput && (
                                <div className="mt-4 pt-3 border-t border-indigo-200/50 dark:border-indigo-800/50">
                                    <p className="text-xs text-muted-foreground mb-2">Or provide a custom response:</p>
                                    <div className="flex gap-2">
                                        <Input
                                            value={customInput}
                                            onChange={(e) => setCustomInput(e.target.value)}
                                            placeholder="Type your response..."
                                            className="flex-1 h-9 text-sm"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && customInput.trim()) {
                                                    e.preventDefault()
                                                    handleCustomSubmit()
                                                }
                                            }}
                                        />
                                        <Button
                                            size="sm"
                                            onClick={handleCustomSubmit}
                                            disabled={!customInput.trim()}
                                            className="h-9 px-3 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 shadow-lg shadow-indigo-500/20"
                                        >
                                            <Send className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            )}

                            <div className="mt-4 flex justify-end">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleCancelChoice}
                                    className="h-8 px-3 border-red-200/60 text-red-500 hover:bg-red-50/80 dark:hover:bg-red-950/30"
                                >
                                    <XCircle className="h-4 w-4 mr-1" />
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Error display with retry */}
                    {error && (
                        <ErrorDisplay
                            error={error}
                            onRetry={handleRetry}
                            onDismiss={() => setError(null)}
                        />
                    )}
                </ChatMessageList>
            </ExpandableChatBody>

            {/* Footer */}
            <ExpandableChatFooter className="bg-background/80 backdrop-blur-sm p-4 border-t">
                <form
                    onSubmit={handleSubmit}
                    className="relative rounded-2xl border border-border/80 bg-background/50 focus-within:ring-2 focus-within:ring-indigo-500/30 focus-within:border-indigo-500/50 transition-all shadow-sm"
                >
                    <ChatInput
                        value={input}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask anything... (Enter to send)"
                        disabled={isLoading}
                        className="min-h-[52px] resize-none rounded-2xl bg-transparent border-0 px-4 py-3 text-sm shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
                    />
                    <div className="flex items-center px-3 pb-3 pt-0 justify-between">
                        <div className="flex gap-1">
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            type="button"
                                            onClick={handleAttachFile}
                                            disabled={isLoading}
                                            className="h-9 w-9 text-muted-foreground/60 hover:text-foreground hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 transition-colors"
                                        >
                                            <Paperclip className="h-4 w-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs">Attach file (coming soon)</TooltipContent>
                                </Tooltip>

                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            type="button"
                                            onClick={handleMicrophoneClick}
                                            disabled={isLoading}
                                            className="h-9 w-9 text-muted-foreground/60 hover:text-foreground hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 transition-colors"
                                        >
                                            <Mic className="h-4 w-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs">Voice input (coming soon)</TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </div>
                        {isLoading ? (
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="destructive"
                                            className="h-9 px-4 gap-2 rounded-xl shadow-lg"
                                            onClick={handleStop}
                                        >
                                            <Square className="h-4 w-4" />
                                            <span className="text-xs font-medium">Stop</span>
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs">Stop generation</TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        ) : (
                            <Button
                                type="submit"
                                size="sm"
                                className="h-9 px-4 gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 shadow-lg shadow-indigo-500/20 transition-all"
                                disabled={!isInputValid}
                            >
                                <Send className="h-4 w-4" />
                                <span className="text-xs font-medium">Send</span>
                            </Button>
                        )}
                    </div>
                </form>
            </ExpandableChatFooter>
        </ExpandableChat>
    )
}
