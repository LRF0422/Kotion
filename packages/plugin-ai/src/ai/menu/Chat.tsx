"use client"

import { useState, FormEvent, useCallback, useMemo, useRef, useEffect } from "react"
import { Bot, Paperclip, Mic, CornerDownLeft, ChevronDown, ChevronUp, Code2, CheckCircle2, Loader2, Sparkles, Send, Terminal, XCircle, Trash2, HelpCircle, MessageSquareMore, Square } from "@kn/icon"
import { Button, Streamdown, Badge, Collapsible, CollapsibleContent, CollapsibleTrigger, Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, Input } from "@kn/ui"
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
import { useEditorAgentOptimized, useUploadFile, ToolExecutionEvent, UserChoiceRequest, UserChoiceOption } from "@kn/core"
import { useSelector } from "@kn/common"
import { GlobalState } from "@kn/core"

// Types
interface Message {
    id: string
    content: string
    sender: "user" | "ai"
    timestamp: number
    steps?: ExecutionStep[]  // Agent execution steps
}

interface ExecutionStep {
    id: string
    toolName: string
    args: any
    result?: any
    status: 'running' | 'success' | 'error'
    timestamp: number
    duration?: number
}

// Pending user choice state
interface PendingUserChoice {
    request: UserChoiceRequest
    resolve: (value: string) => void
    reject: (reason?: any) => void
}

// Constants - Use a more professional AI avatar
const AI_AVATAR_URL = undefined  // We'll use fallback with gradient

const AVATAR_FALLBACKS = {
    ai: "AI",
} as const

const INITIAL_MESSAGE: Message = {
    id: "initial-1",
    content: "Hello! I'm your AI assistant. I can help you edit documents, answer questions, and perform various tasks. How can I assist you today?",
    sender: "ai",
    timestamp: Date.now(),
}

export const ExpandableChatDemo: React.FC<{ editor: Editor }> = ({ editor }) => {
    const [currentSteps, setCurrentSteps] = useState<ExecutionStep[]>([])  // Track current execution steps
    const stepsRef = useRef<ExecutionStep[]>([])  // Ref to track steps during streaming

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
            // Find and update the matching step
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
            const pendingChoice: PendingUserChoice = { request, resolve, reject }
            pendingChoiceRef.current = pendingChoice
            setPendingChoice(pendingChoice)
        })
    }, [])

    // Handle user selecting an option
    const handleOptionSelect = useCallback((optionId: string) => {
        if (pendingChoiceRef.current) {
            pendingChoiceRef.current.resolve(optionId)
            pendingChoiceRef.current = null
            setPendingChoice(null)
            setCustomInput("")
        }
    }, [])

    // Handle user submitting custom input
    const handleCustomSubmit = useCallback(() => {
        if (pendingChoiceRef.current && customInput.trim()) {
            pendingChoiceRef.current.resolve(customInput.trim())
            pendingChoiceRef.current = null
            setPendingChoice(null)
            setCustomInput("")
        }
    }, [customInput])

    // Handle cancel user choice
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
    const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE])
    const [input, setInput] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [currentMessage, setCurrentMessage] = useState<string | null>(null)
    const [showSteps, setShowSteps] = useState(true)  // Toggle to show/hide steps
    const [error, setError] = useState<string | null>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    // Auto-scroll to latest message
    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [])

    useEffect(() => {
        scrollToBottom()
    }, [messages, currentMessage, pendingChoice, scrollToBottom])

    // Generate unique message ID
    const generateMessageId = useCallback(() => {
        return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    }, [])

    // Check if input is valid
    const isInputValid = useMemo(() => {
        return input.trim().length > 0 && !isLoading
    }, [input, isLoading])

    const handleSubmit = useCallback(async (e: FormEvent) => {
        e.preventDefault()
        if (!isInputValid) return

        const userMessage: Message = {
            id: generateMessageId(),
            content: input,
            sender: "user",
            timestamp: Date.now(),
        }

        setMessages((prev) => [...prev, userMessage])
        setInput("")
        setIsLoading(true)
        setError(null)
        // Reset steps for new request
        stepsRef.current = []
        setCurrentSteps([])

        try {
            let result = ""

            const { textStream } = await stream({
                prompt: input,
            })

            for await (const part of textStream) {
                result += part
                setCurrentMessage(result)
            }

            const aiMessage: Message = {
                id: generateMessageId(),
                content: result,
                sender: "ai",
                timestamp: Date.now(),
                steps: [...stepsRef.current]  // Capture steps from ref
            }

            setMessages((prev) => [...prev, aiMessage])
            setCurrentMessage(null)
            setCurrentSteps([])  // Clear current steps display
        } catch (err: any) {
            // Check if it's an abort error (user stopped generation)
            if (err?.name === 'AbortError' || err?.message?.includes('abort')) {
                // Handle stopped generation gracefully
                const currentContent = currentMessage || ''
                if (currentContent) {
                    const aiMessage: Message = {
                        id: generateMessageId(),
                        content: currentContent + '\n\n*[Generation stopped by user]*',
                        sender: "ai",
                        timestamp: Date.now(),
                        steps: [...stepsRef.current]
                    }
                    setMessages((prev) => [...prev, aiMessage])
                }
                setCurrentMessage(null)
                setCurrentSteps([])
            } else {
                console.error("Error generating AI response:", err)
                setError("Failed to generate response. Please try again.")
                setCurrentMessage(null)
                setCurrentSteps([])
            }
        } finally {
            setIsLoading(false)
        }
    }, [input, isInputValid, stream, generateMessageId, currentMessage])

    // Handle stop generation
    const handleStop = useCallback(() => {
        stop()
    }, [stop])

    const handleAttachFile = useCallback(() => {
        // TODO: Implement file attachment functionality
        console.log("Attach file clicked")
    }, [])

    const handleMicrophoneClick = useCallback(() => {
        // TODO: Implement voice input functionality
        console.log("Microphone clicked")
    }, [])

    // Helper function to format tool names for display
    const formatToolName = useCallback((toolName: string) => {
        // Convert camelCase to Title Case
        return toolName
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase())
            .trim()
    }, [])

    // Helper function to format tool arguments
    const formatArgs = useCallback((args: any) => {
        if (!args) return 'No arguments'
        return JSON.stringify(args, null, 2)
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
    }, [])

    return (
        <ExpandableChat
            size="md"
            icon={
                <div className="relative">
                    <Sparkles className={`h-6 w-6 ${isLoading ? 'animate-pulse' : ''}`} />
                    {/* Loading indicator ring when AI is generating */}
                    {isLoading && (
                        <>
                            {/* Pulsing ring animation */}
                            <span className="absolute inset-0 -m-1 rounded-full border-2 border-primary-foreground/30 animate-ping" />
                            {/* Spinning arc indicator */}
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
            {/* Enhanced Header with Gradient */}
            <ExpandableChatHeader className="flex items-center justify-between p-4 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border-b">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500">
                        <Sparkles className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-base font-semibold text-foreground">AI Assistant</h1>
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
                                    className={`h-8 w-8 p-0 text-muted-foreground hover:text-foreground ${showSteps ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20' : 'hover:text-indigo-500'}`}
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
                                    className="h-8 w-8 p-0 text-muted-foreground hover:text-red-500"
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
                <ChatMessageList>
                    {messages.map((message) => (
                        <ChatBubble
                            key={message.id}
                            variant={message.sender === "user" ? "sent" : "received"}
                        >
                            <ChatBubbleAvatar
                                className={`h-9 w-9 shrink-0 ${message.sender === "ai" ? "bg-gradient-to-br from-indigo-500 to-purple-500 text-primary-foreground" : "bg-gradient-to-br from-blue-500 to-cyan-500 text-primary-foreground"}`}
                                src={message.sender === "user"
                                    ? (userInfo?.avatar ? usePath(userInfo.avatar) : undefined)
                                    : AI_AVATAR_URL
                                }
                                fallback={message.sender === "user"
                                    ? (userInfo?.name?.substring(0, 2).toUpperCase() || userInfo?.account?.substring(0, 2).toUpperCase() || "U")
                                    : AVATAR_FALLBACKS.ai
                                }
                            />
                            <div className="flex flex-col gap-2 max-w-[calc(100%-52px)] min-w-0">
                                <ChatBubbleMessage
                                    variant={message.sender === "user" ? "sent" : "received"}
                                    className={message.sender === "ai" ? "bg-gradient-to-br from-indigo-50/50 to-purple-50/50 dark:from-indigo-950/30 dark:to-purple-950/30 border border-indigo-200/50 dark:border-indigo-800/50 shadow-sm p-4 max-w-full overflow-x-auto" : "bg-gradient-to-br from-blue-500 to-cyan-500 text-primary-foreground p-4 max-w-full overflow-x-auto"}
                                >
                                    <Streamdown>{message.content}</Streamdown>
                                </ChatBubbleMessage>

                                {/* Enhanced execution steps display */}
                                {message.sender === "ai" && message.steps && message.steps.length > 0 && showSteps && (
                                    <Collapsible className="mt-3">
                                        <CollapsibleTrigger className="flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-300 hover:text-indigo-700 transition-colors group px-1 py-1.5 -ml-1 rounded-md hover:bg-indigo-50 dark:hover:bg-indigo-950/30">
                                            <Terminal className="h-3.5 w-3.5" />
                                            <span className="font-medium">{message.steps.length} tool {message.steps.length === 1 ? 'call' : 'calls'}</span>
                                            <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
                                        </CollapsibleTrigger>
                                        <CollapsibleContent className="mt-2 space-y-2 animate-in fade-in-0 slide-in-from-top-1 duration-200 max-w-full overflow-x-auto">
                                            {message.steps.map((step) => (
                                                <div
                                                    key={step.id}
                                                    className="flex items-start gap-3 p-3 rounded-lg bg-card border border-border text-xs max-w-full overflow-x-auto"
                                                >
                                                    <div className="mt-0.5 flex-shrink-0">
                                                        {step.status === 'success' ? (
                                                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                                                        ) : step.status === 'error' ? (
                                                            <XCircle className="h-4 w-4 text-red-500" />
                                                        ) : (
                                                            <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                                                        )}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap max-w-full overflow-x-auto">
                                                            <Badge variant="secondary" className="text-[10px] px-2 py-0.5 font-mono bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 max-w-full overflow-x-auto">
                                                                {formatToolName(step.toolName)}
                                                            </Badge>
                                                            {step.duration && (
                                                                <span className="text-[10px] text-muted-foreground">
                                                                    {step.duration}ms
                                                                </span>
                                                            )}
                                                        </div>
                                                        {step.args && Object.keys(step.args).length > 0 && (
                                                            <div className="mt-2 text-[10px] text-muted-foreground font-mono bg-indigo-50/50 dark:bg-indigo-950/20 rounded px-2 py-1.5 truncate max-w-full overflow-x-auto">
                                                                {JSON.stringify(step.args).slice(0, 80)}{JSON.stringify(step.args).length > 80 ? '...' : ''}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </CollapsibleContent>
                                    </Collapsible>
                                )}
                            </div>
                        </ChatBubble>
                    ))}

                    {/* Enhanced loading state for execution steps */}
                    {isLoading && currentSteps.length > 0 && showSteps && (
                        <div className="mx-4 my-3 p-4 rounded-xl bg-gradient-to-br from-indigo-50/30 to-purple-50/30 dark:from-indigo-950/20 dark:to-purple-950/20 border border-indigo-200/50 dark:border-indigo-800/50 animate-in fade-in-0 slide-in-from-bottom-2 duration-300 max-w-full overflow-x-auto">
                            <div className="flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-300 mb-3">
                                <div className="flex items-center gap-1.5 text-indigo-500">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <span className="font-medium">Running tools...</span>
                                </div>
                            </div>
                            <div className="space-y-2 max-w-full overflow-x-auto">
                                {currentSteps.map((step) => (
                                    <div
                                        key={step.id}
                                        className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border text-xs max-w-full overflow-x-auto"
                                    >
                                        {step.status === 'running' ? (
                                            <Loader2 className="h-4 w-4 animate-spin text-indigo-500 shrink-0" />
                                        ) : step.status === 'success' ? (
                                            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                                        ) : (
                                            <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                                        )}
                                        <div className="flex-1 flex items-center gap-2 min-w-0">
                                            <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-mono shrink-0 border-indigo-200 dark:border-indigo-800 max-w-full overflow-x-auto">
                                                {formatToolName(step.toolName)}
                                            </Badge>
                                            {step.status === 'running' && (
                                                <span className="text-[10px] text-muted-foreground animate-pulse">executing...</span>
                                            )}
                                            {step.duration && (
                                                <span className="text-[10px] text-green-600">
                                                    {step.duration}ms
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Streaming message with enhanced styling */}
                    {currentMessage && (
                        <ChatBubble variant="received">
                            <ChatBubbleAvatar
                                className="h-9 w-9 shrink-0 bg-gradient-to-br from-indigo-500 to-purple-500 text-primary-foreground"
                                src={AI_AVATAR_URL}
                                fallback={AVATAR_FALLBACKS.ai}
                            />
                            <ChatBubbleMessage className="bg-gradient-to-br from-indigo-50/50 to-purple-50/50 dark:from-indigo-950/30 dark:to-purple-950/30 border border-indigo-200/50 dark:border-indigo-800/50 shadow-sm p-4 max-w-full overflow-x-auto">
                                <Streamdown isAnimating>{currentMessage}</Streamdown>
                            </ChatBubbleMessage>
                        </ChatBubble>
                    )}

                    {/* Loading indicator */}
                    {isLoading && !currentMessage && currentSteps.length === 0 && (
                        <ChatBubble variant="received">
                            <ChatBubbleAvatar
                                className="h-9 w-9 shrink-0 bg-gradient-to-br from-indigo-500 to-purple-500 text-primary-foreground"
                                src={AI_AVATAR_URL}
                                fallback={AVATAR_FALLBACKS.ai}
                            />
                            <ChatBubbleMessage isLoading className="bg-gradient-to-br from-indigo-50/50 to-purple-50/50 dark:from-indigo-950/30 dark:to-purple-950/30 border border-indigo-200/50 dark:border-indigo-800/50 shadow-sm p-4 max-w-full overflow-x-auto" />
                        </ChatBubble>
                    )}

                    {/* User Choice Dialog */}
                    {pendingChoice && (
                        <div className="mx-4 my-3 p-4 rounded-xl bg-gradient-to-br from-indigo-50/50 to-purple-50/50 dark:from-indigo-950/20 dark:to-purple-950/20 border border-indigo-200/50 dark:border-indigo-800/50 shadow-sm animate-in fade-in-0 slide-in-from-bottom-2 duration-300 max-w-full overflow-x-auto">
                            <div className="flex items-start gap-3 mb-3">
                                <div className="p-2 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 shrink-0">
                                    <HelpCircle className="h-4 w-4 text-white" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm text-foreground">{pendingChoice.request.question}</p>
                                    <p className="text-xs text-muted-foreground mt-1">Please select an option to continue</p>
                                </div>
                            </div>

                            <div className="space-y-2">
                                {pendingChoice.request.options.map((option) => (
                                    <button
                                        key={option.id}
                                        onClick={() => handleOptionSelect(option.id)}
                                        className="w-full p-3 rounded-lg border border-indigo-200/50 dark:border-indigo-800/50 bg-background hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-all text-left group max-w-full overflow-x-auto"
                                    >
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-indigo-500 group-hover:bg-purple-500 transition-colors" />
                                            <span className="font-medium text-sm truncate">{option.label}</span>
                                        </div>
                                        {option.description && (
                                            <p className="text-xs text-muted-foreground mt-1 ml-4 truncate max-w-full overflow-x-auto">{option.description}</p>
                                        )}
                                    </button>
                                ))}
                            </div>

                            {pendingChoice.request.allowCustomInput && (
                                <div className="mt-4 pt-3 border-t border-indigo-200/50 dark:border-indigo-800/50 max-w-full overflow-x-auto">
                                    <p className="text-xs text-muted-foreground mb-2">Or provide a custom response:</p>
                                    <div className="flex gap-2">
                                        <Input
                                            value={customInput}
                                            onChange={(e) => setCustomInput(e.target.value)}
                                            placeholder="Type your response..."
                                            className="flex-1 h-9 text-sm max-w-full overflow-x-auto"
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
                                            className="h-9 px-3 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600"
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
                                    className="h-8 px-3 border-red-200 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                                >
                                    <XCircle className="h-4 w-4 mr-1" />
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Enhanced error display */}
                    {error && (
                        <div className="mx-4 my-3 p-3 rounded-lg bg-red-50/80 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-sm animate-in fade-in-0 slide-in-from-bottom-2 max-w-full overflow-x-auto">
                            <div className="flex items-start gap-2">
                                <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-red-600 dark:text-red-400">Error</p>
                                    <p className="text-xs text-red-500/80 mt-0.5 truncate">{error}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </ChatMessageList>
            </ExpandableChatBody>

            {/* Enhanced Footer */}
            <ExpandableChatFooter className="bg-background p-4 border-t">
                <form
                    onSubmit={handleSubmit}
                    className="relative rounded-lg border bg-background focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary/50 transition-all shadow-sm max-w-full overflow-x-auto"
                >
                    <ChatInput
                        value={input}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask anything... (Enter to send)"
                        disabled={isLoading}
                        className="min-h-[48px] resize-none rounded-lg bg-background border-0 px-4 py-3 text-sm shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/60 max-w-full overflow-x-auto"
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
                                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
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
                                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
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
                                            className="h-9 px-3 gap-1.5 rounded-lg"
                                            onClick={handleStop}
                                        >
                                            <Square className="h-4 w-4" />
                                            <span className="text-xs">Stop</span>
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs">Stop generation</TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        ) : (
                            <Button
                                type="submit"
                                size="sm"
                                className="h-9 px-3 gap-1.5 rounded-lg"
                                disabled={!isInputValid}
                            >
                                <Send className="h-4 w-4" />
                                <span className="text-xs">Send</span>
                            </Button>
                        )}
                    </div>
                </form>
            </ExpandableChatFooter>
        </ExpandableChat>
    )
}
