"use client"

import { useState, FormEvent, useCallback, useMemo, useRef, useEffect } from "react"
import { Sparkles, Send, Terminal, Trash2, HelpCircle, Square, XCircle, Settings, Plus, ChevronDown, MessageSquarePlus, Globe, X } from "@kn/icon"
import {
    Button, Streamdown,
    Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, Input,
} from "@kn/ui"
import {
    ChatBubble,
    ChatBubbleMessage,
} from "@kn/ui"
import { ChatInput } from "@kn/ui"
import {
    ExpandableChat,
    ExpandableChatHeader,
    ExpandableChatBody,
    ExpandableChatFooter,
    useChatContext,
} from "@kn/ui"
import { ChatMessageList } from "@kn/ui"
import React from "react"
import { Editor } from "@kn/editor"
import { useEditorAgentOptimized, ToolExecutionEvent, UserChoiceRequest } from "@kn/common"

import {
    Message, ExecutionStep, PendingUserChoice, ChatError,
    INITIAL_MESSAGES,
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
    const chatContext = useChatContext()
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
    const [autoMode, setAutoMode] = useState(true)

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

            // textStream is an async iterable of strings from the backend
            for await (const part of textStream) {
                buffer.append(part)
            }

            // Force-flush the buffer to guarantee the streaming bubble
            // is rendered at least once before we replace it with the
            // final message.  Without this, if all chunks arrive within
            // a single animation frame the rAF callback never fires and
            // `buffer.reset()` cancels it – the user never sees the
            // streaming text, only the final message appearing at once.
            buffer.forceFlush()

            // Yield one frame so React can render the streaming text.
            // Without this gap, React 18 batches forceFlush (setDisplayText)
            // and reset (setDisplayText(null)) into a single render where
            // only the final null state is committed.
            await new Promise<void>(r => requestAnimationFrame(() => r()))

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
                const classifiedError = classifyError(err)
                setError(classifiedError)

                // Show the error as an AI message in the dialog so the
                // user can see what went wrong instead of a blank bubble.
                const currentContent = buffer.getContent()
                const errorMessage = currentContent
                    ? `${currentContent}\n\n⚠️ ${classifiedError.message}`
                    : `⚠️ ${classifiedError.message}`
                const aiMessage: Message = {
                    id: generateMessageId(),
                    content: errorMessage,
                    sender: "ai",
                    timestamp: Date.now(),
                    steps: [...stepsRef.current],
                    error: true,
                }
                setMessages((prev) => [...prev, aiMessage])

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
        setMessages([...INITIAL_MESSAGES])
        setCurrentSteps([])
        stepsRef.current = []
        clearPersistedMessages()
        setAnnotations([])
        clearSession()
    }, [clearSession])

    // Message count
    const messageCount = messages.length

    // Show quick prompts when empty state
    const showQuickPrompts = messages.length === 0 && !isLoading

    return (
        <ExpandableChat
            size="lg"
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
            {/* Header */}
            <ExpandableChatHeader className="flex items-center justify-between px-3 py-1.5 border-b bg-background/95 backdrop-blur-sm">
                <div className="flex items-center gap-1">
                    <button className="flex items-center gap-1 text-xs font-semibold text-foreground hover:text-foreground/80 transition-colors">
                        <span>New AI chat</span>
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    </button>
                </div>
                <div className="flex items-center gap-px">
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleClearChat}
                                    className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                                >
                                    <MessageSquarePlus className="h-3.5 w-3.5" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-xs">New chat</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowSteps(!showSteps)}
                                    className={`h-6 w-6 p-0 text-muted-foreground hover:text-foreground transition-colors ${showSteps ? 'text-foreground bg-muted' : ''}`}
                                >
                                    <Terminal className="h-3.5 w-3.5" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-xs">
                                {showSteps ? 'Hide tool details' : 'Show tool details'}
                            </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleClearChat}
                                    className="h-6 w-6 p-0 text-muted-foreground hover:text-red-500 transition-colors"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-xs">Clear chat</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => chatContext?.toggleChat()}
                                    className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-xs">Close</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            </ExpandableChatHeader>

            <ExpandableChatBody className="bg-[#F8F9FA] dark:bg-background overflow-x-hidden">
                <TeamStatusPanel teamState={teamState} />
                <ChatMessageList>
                    {/* Empty state greeting */}
                    {showQuickPrompts && (
                        <div className="flex flex-col items-center justify-center py-4 px-3">
                            <h2 className="text-sm font-semibold text-foreground mb-0.5">How can I help you today?</h2>
                            <p className="text-xs text-muted-foreground mb-4 text-center max-w-[240px]">
                                Ask about your documents or try an action below.
                            </p>
                        </div>
                    )}

                    {/* Quick prompts in empty state */}
                    {showQuickPrompts && (
                        <QuickPrompts onSubmit={handleQuickSubmit} />
                    )}

                    {messages.map((message) => (
                        <MessageBubble
                            key={message.id}
                            message={message}
                            showSteps={showSteps}
                        />
                    ))}

                    {/* Live execution steps */}
                    {isLoading && currentSteps.length > 0 && showSteps && (
                        <LiveSteps steps={currentSteps} />
                    )}

                    {/* Streaming message (rAF buffered) */}
                    {buffer.displayText && (
                        <ChatBubble variant="received">
                            <ChatBubbleMessage className="bg-white dark:bg-muted/40 p-2.5 text-[13px] leading-relaxed rounded-xl rounded-tl-sm">
                                <Streamdown isAnimating>{buffer.displayText}</Streamdown>
                            </ChatBubbleMessage>
                        </ChatBubble>
                    )}

                    {/* Loading indicator */}
                    {isLoading && !buffer.displayText && currentSteps.length === 0 && (
                        <ChatBubble variant="received">
                            <ChatBubbleMessage isLoading className="bg-white dark:bg-muted/40 p-2.5 rounded-xl rounded-tl-sm" />
                        </ChatBubble>
                    )}

                    {/* User Choice Dialog */}
                    {pendingChoice && (
                        <div className="mx-2 my-1.5 p-2.5 rounded-lg bg-muted/50 border border-border/60 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
                            <div className="flex items-start gap-2 mb-2">
                                <div className="p-1.5 rounded bg-muted">
                                    <HelpCircle className="h-3 w-3 text-muted-foreground" />
                                </div>
                                <div className="flex-1 min-w-0 pt-0.5">
                                    <p className="font-medium text-xs text-foreground">{pendingChoice.request.question}</p>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">Select an option to continue</p>
                                </div>
                            </div>

                            <div className="space-y-1">
                                {pendingChoice.request.options.map((option) => (
                                    <button
                                        key={option.id}
                                        onClick={() => handleOptionSelect(option.id)}
                                        className="w-full p-2 rounded-md border border-border/60 bg-background/80 hover:bg-muted/60 transition-all text-left group"
                                    >
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 group-hover:bg-foreground transition-colors" />
                                            <span className="font-medium text-xs">{option.label}</span>
                                        </div>
                                        {option.description && (
                                            <p className="text-[10px] text-muted-foreground mt-0.5 ml-3 line-clamp-2">{option.description}</p>
                                        )}
                                    </button>
                                ))}
                            </div>

                            {pendingChoice.request.allowCustomInput && (
                                <div className="mt-2 pt-2 border-t border-border/50">
                                    <p className="text-[10px] text-muted-foreground mb-1">Or provide a custom response:</p>
                                    <div className="flex gap-1.5">
                                        <Input
                                            value={customInput}
                                            onChange={(e) => setCustomInput(e.target.value)}
                                            placeholder="Type your response..."
                                            className="flex-1 h-7 text-xs"
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
                                            className="h-7 px-2 bg-foreground text-background hover:bg-foreground/90"
                                        >
                                            <Send className="h-3 w-3" />
                                        </Button>
                                    </div>
                                </div>
                            )}

                            <div className="mt-2 flex justify-end">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleCancelChoice}
                                    className="h-6 px-2 border-red-200/60 text-red-500 hover:bg-red-50/80 dark:hover:bg-red-950/30 text-[10px]"
                                >
                                    <XCircle className="h-3 w-3 mr-0.5" />
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
            <ExpandableChatFooter className="bg-background/80 backdrop-blur-sm p-2 border-t">
                <form
                    onSubmit={handleSubmit}
                    className="relative rounded-xl border border-border/60 bg-background focus-within:ring-1 focus-within:ring-border transition-all"
                >
                    {/* Context tag */}
                    {showQuickPrompts && (
                        <div className="flex items-center gap-1.5 px-3 pt-2">
                            <div className="inline-flex items-center gap-0.5 px-1.5 py-px rounded-full bg-muted/60 text-[10px] text-muted-foreground">
                                <Globe className="h-2.5 w-2.5" />
                                <span>Knowledge Doc</span>
                            </div>
                        </div>
                    )}
                    <ChatInput
                        value={input}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        placeholder="Do anything with AI..."
                        disabled={isLoading}
                        className="min-h-[40px] resize-none rounded-xl bg-transparent border-0 px-3 py-2 text-xs shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
                    />
                    <div className="flex items-center px-2 pb-2 pt-0 justify-between">
                        <div className="flex items-center gap-px">
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            type="button"
                                            onClick={handleAttachFile}
                                            disabled={isLoading}
                                            className="h-7 w-7 text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 transition-colors"
                                        >
                                            <Plus className="h-3.5 w-3.5" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs">Add content</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            type="button"
                                            disabled={isLoading}
                                            className="h-7 w-7 text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 transition-colors"
                                        >
                                            <Settings className="h-3.5 w-3.5" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs">Settings</TooltipContent>
                                </Tooltip>
                                <button
                                    type="button"
                                    onClick={() => setAutoMode(!autoMode)}
                                    className={`h-7 px-2 rounded text-[10px] font-medium transition-colors ${autoMode
                                        ? 'bg-foreground/10 text-foreground hover:bg-foreground/15'
                                        : 'text-muted-foreground/60 hover:text-foreground hover:bg-muted/60'
                                        }`}
                                >
                                    Auto
                                </button>
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
                                            className="h-7 px-2.5 gap-1 rounded-lg"
                                            onClick={handleStop}
                                        >
                                            <Square className="h-3 w-3" />
                                            <span className="text-[10px] font-medium">Stop</span>
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs">Stop generation</TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        ) : (
                            <Button
                                type="submit"
                                size="sm"
                                className="h-7 w-7 p-0 rounded-lg bg-foreground text-background hover:bg-foreground/90 transition-all"
                                disabled={!isInputValid}
                            >
                                <Send className="h-3.5 w-3.5" />
                            </Button>
                        )}
                    </div>
                </form>
            </ExpandableChatFooter>
        </ExpandableChat>
    )
}
