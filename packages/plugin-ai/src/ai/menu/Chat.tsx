"use client"

import { useState, FormEvent, useCallback, useMemo, useRef, useEffect } from "react"
import { Bot, Paperclip, Mic, CornerDownLeft } from "@kn/icon"
import { Button, Streamdown } from "@kn/ui"
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
import { useEditorAgent, useUploadFile } from "@kn/core"
import { useSelector } from "@kn/common"
import { GlobalState } from "@kn/core"

// Types
interface Message {
    id: string
    content: string
    sender: "user" | "ai"
    timestamp: number
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
    const agent = useEditorAgent(editor)
    const { userInfo } = useSelector((state: GlobalState) => state)
    const { usePath } = useUploadFile()
    const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE])
    const [input, setInput] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [currentMessage, setCurrentMessage] = useState<string | null>(null)
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
            }

            setMessages((prev) => [...prev, aiMessage])
            setCurrentMessage(null)
        } catch (err) {
            console.error("Error generating AI response:", err)
            setError("Failed to generate response. Please try again.")
            setCurrentMessage(null)
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
            size="lg"
            className=" bottom-5 right-5"
            position="bottom-right"
            icon={<Bot className="h-6 w-6" />}
        >
            <ExpandableChatHeader className="flex-col text-center justify-center">
                <h1 className="text-xl font-semibold">Chat with AI ✨</h1>
                <p className="text-sm text-muted-foreground">
                    Ask me anything about the components
                </p>
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
                            <ChatBubbleMessage
                                variant={message.sender === "user" ? "sent" : "received"}
                            >
                                <Streamdown>{message.content}</Streamdown>
                            </ChatBubbleMessage>
                        </ChatBubble>
                    ))}

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
