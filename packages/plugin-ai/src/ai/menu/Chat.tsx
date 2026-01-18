"use client"

import { useState, FormEvent, useCallback, useMemo, useRef, useEffect } from "react"
import { Bot, Paperclip, Mic, CornerDownLeft, ChevronDown, ChevronUp, Code2, CheckCircle2, Loader2 } from "@kn/icon"
import { Button, Streamdown, Badge, Collapsible, CollapsibleContent, CollapsibleTrigger } from "@kn/ui"
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
import { useEditorAgent, useEditorAgentOptimized, useUploadFile, ToolExecutionEvent } from "@kn/core"
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

// Constants
const AI_AVATAR_URL = "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=64&h=64&q=80&crop=faces&fit=crop"

const AVATAR_FALLBACKS = {
    ai: "AI",
} as const

const INITIAL_MESSAGE: Message = {
    id: "initial-1",
    content: "Hello! How can I help you today?",
    sender: "ai",
    timestamp: Date.now(),
}

export const ExpandableChatDemo: React.FC<{ editor: Editor }> = ({ editor }) => {
    const [currentSteps, setCurrentSteps] = useState<ExecutionStep[]>([])  // Track current execution steps
    const stepsRef = useRef<ExecutionStep[]>([])  // Ref to track steps during streaming

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

    const agent = useEditorAgentOptimized(editor, handleToolExecution)
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
    }, [messages, currentMessage, scrollToBottom])

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

            const { textStream } = await agent.stream({
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
        } catch (err) {
            console.error("Error generating AI response:", err)
            setError("Failed to generate response. Please try again.")
            setCurrentMessage(null)
            setCurrentSteps([])
        } finally {
            setIsLoading(false)
        }
    }, [input, isInputValid, agent, generateMessageId])

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

    return (
        <ExpandableChat
            size="sm"
            position="bottom-right"
            icon={<Bot className="h-6 w-6" />}
        >
            <ExpandableChatHeader className="flex-col text-center justify-center">
                <h1 className="text-xl font-semibold">Chat with AI ✨</h1>
                <p className="text-sm text-muted-foreground">
                    Ask me anything about the components
                </p>
                <div className="mt-2 flex items-center justify-center gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowSteps(!showSteps)}
                        className="text-xs"
                    >
                        {showSteps ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
                        {showSteps ? 'Hide' : 'Show'} Execution Steps
                    </Button>
                </div>
            </ExpandableChatHeader>

            <ExpandableChatBody>
                <ChatMessageList>
                    {messages.map((message) => (
                        <ChatBubble
                            key={message.id}
                            variant={message.sender === "user" ? "sent" : "received"}
                        >
                            <ChatBubbleAvatar
                                className="h-8 w-8 shrink-0"
                                src={message.sender === "user"
                                    ? (userInfo?.avatar ? usePath(userInfo.avatar) : undefined)
                                    : AI_AVATAR_URL
                                }
                                fallback={message.sender === "user"
                                    ? (userInfo?.name?.substring(0, 2).toUpperCase() || userInfo?.account?.substring(0, 2).toUpperCase() || "U")
                                    : AVATAR_FALLBACKS.ai
                                }
                            />
                            <div className="flex flex-col gap-2 w-full">
                                <ChatBubbleMessage
                                    variant={message.sender === "user" ? "sent" : "received"}
                                >
                                    <Streamdown>{message.content}</Streamdown>
                                </ChatBubbleMessage>

                                {/* Show execution steps for AI messages */}
                                {message.sender === "ai" && message.steps && message.steps.length > 0 && showSteps && (
                                    <div className="mt-2 space-y-1">
                                        <Collapsible>
                                            <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                                                <Code2 className="h-3 w-3" />
                                                <span>{message.steps.length} tool {message.steps.length === 1 ? 'call' : 'calls'}</span>
                                                <ChevronDown className="h-3 w-3" />
                                            </CollapsibleTrigger>
                                            <CollapsibleContent className="mt-2 space-y-1">
                                                {message.steps.map((step, index) => (
                                                    <div
                                                        key={step.id}
                                                        className="flex items-start gap-2 p-2 rounded-md bg-muted/50 text-xs"
                                                    >
                                                        <CheckCircle2 className="h-3 w-3 mt-0.5 text-green-500 shrink-0" />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <Badge variant="secondary" className="text-[10px] px-1 py-0">
                                                                    {formatToolName(step.toolName)}
                                                                </Badge>
                                                                {step.duration && (
                                                                    <span className="text-[10px] text-muted-foreground">
                                                                        {step.duration}ms
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {step.args && Object.keys(step.args).length > 0 && (
                                                                <div className="mt-1 text-[10px] text-muted-foreground truncate">
                                                                    {JSON.stringify(step.args).slice(0, 100)}...
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </CollapsibleContent>
                                        </Collapsible>
                                    </div>
                                )}
                            </div>
                        </ChatBubble>
                    ))}

                    {/* Show current execution steps while loading */}
                    {isLoading && currentSteps.length > 0 && showSteps && (
                        <div className="px-4 py-2 space-y-1">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                <span>Executing tools...</span>
                            </div>
                            {currentSteps.map((step) => (
                                <div
                                    key={step.id}
                                    className="flex items-start gap-2 p-2 rounded-md bg-muted/30 text-xs"
                                >
                                    {step.status === 'running' ? (
                                        <Loader2 className="h-3 w-3 mt-0.5 animate-spin text-blue-500 shrink-0" />
                                    ) : step.status === 'success' ? (
                                        <CheckCircle2 className="h-3 w-3 mt-0.5 text-green-500 shrink-0" />
                                    ) : (
                                        <CheckCircle2 className="h-3 w-3 mt-0.5 text-red-500 shrink-0" />
                                    )}
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <Badge variant="secondary" className="text-[10px] px-1 py-0">
                                                {formatToolName(step.toolName)}
                                            </Badge>
                                            {step.duration && (
                                                <span className="text-[10px] text-muted-foreground">
                                                    {step.duration}ms
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {currentMessage && (
                        <ChatBubble variant="received">
                            <ChatBubbleAvatar
                                className="h-8 w-8 shrink-0"
                                src={AI_AVATAR_URL}
                                fallback={AVATAR_FALLBACKS.ai}
                            />
                            <ChatBubbleMessage>
                                <Streamdown isAnimating>{currentMessage}</Streamdown>
                            </ChatBubbleMessage>
                        </ChatBubble>
                    )}

                    {isLoading && !currentMessage && (
                        <ChatBubble variant="received">
                            <ChatBubbleAvatar
                                className="h-8 w-8 shrink-0"
                                src={AI_AVATAR_URL}
                                fallback={AVATAR_FALLBACKS.ai}
                            />
                            <ChatBubbleMessage isLoading />
                        </ChatBubble>
                    )}

                    {error && (
                        <ChatBubble variant="received">
                            <ChatBubbleAvatar
                                className="h-8 w-8 shrink-0"
                                src={AI_AVATAR_URL}
                                fallback={AVATAR_FALLBACKS.ai}
                            />
                            <ChatBubbleMessage className="text-red-500">
                                {error}
                            </ChatBubbleMessage>
                        </ChatBubble>
                    )}

                    <div ref={messagesEndRef} />
                </ChatMessageList>
            </ExpandableChatBody>

            <ExpandableChatFooter>
                <form
                    onSubmit={handleSubmit}
                    className="relative rounded-lg border bg-background focus-within:ring-1 focus-within:ring-ring p-1"
                >
                    <ChatInput
                        value={input}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
                        disabled={isLoading}
                        className="min-h-12 resize-none rounded-lg bg-background border-0 p-3 shadow-none focus-visible:ring-0"
                    />
                    <div className="flex items-center p-3 pt-0 justify-between">
                        <div className="flex gap-1">
                            <Button
                                variant="ghost"
                                size="icon"
                                type="button"
                                onClick={handleAttachFile}
                                disabled={isLoading}
                                title="Attach file (coming soon)"
                            >
                                <Paperclip className="size-4" />
                            </Button>

                            <Button
                                variant="ghost"
                                size="icon"
                                type="button"
                                onClick={handleMicrophoneClick}
                                disabled={isLoading}
                                title="Voice input (coming soon)"
                            >
                                <Mic className="size-4" />
                            </Button>
                        </div>
                        <Button
                            type="submit"
                            size="sm"
                            className="ml-auto gap-1.5"
                            disabled={!isInputValid}
                        >
                            {isLoading ? "Sending..." : "Send Message"}
                            <CornerDownLeft className="size-3.5" />
                        </Button>
                    </div>
                </form>
            </ExpandableChatFooter>
        </ExpandableChat>
    )
}
