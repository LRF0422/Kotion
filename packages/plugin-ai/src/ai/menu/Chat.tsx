"use client"

import { useState, FormEvent } from "react"
import { Send, Bot, Paperclip, Mic, CornerDownLeft } from "@kn/icon"
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
import { useEditorAgent } from "@kn/core"

export const ExpandableChatDemo: React.FC<{ editor: Editor }> = ({ editor }) => {
    const agent = useEditorAgent(editor)
    const [messages, setMessages] = useState([
        {
            id: 1,
            content: "Hello! How can I help you today?",
            sender: "ai",
        },
        {
            id: 2,
            content: "I have a question about the component library.",
            sender: "user",
        },
        {
            id: 3,
            content: "Sure! I'd be happy to help. What would you like to know?",
            sender: "ai",
        },
    ])

    const [input, setInput] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [currentMessage, setCurrentMessage] = useState<string | null>(null)

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault()
        if (!input.trim()) return

        setMessages((prev) => [
            ...prev,
            {
                id: prev.length + 1,
                content: input,
                sender: "user",
            },
        ])
        setInput("")
        setIsLoading(true)

        let result = ""
        const { textStream } = await agent.stream({
            prompt: input,
        })
        for await (const part of textStream) {
            result += part
            setCurrentMessage(result)
        }
        setMessages((prev) => [
            ...prev,
            {
                id: prev.length + 1,
                content: result,
                sender: "ai",
            },
        ])
        setCurrentMessage(null)
        setIsLoading(false)
    }

    const handleAttachFile = () => {
        //
    }

    const handleMicrophoneClick = () => {
        //
    }

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
                                src={
                                    message.sender === "user"
                                        ? "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=64&h=64&q=80&crop=faces&fit=crop"
                                        : "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=64&h=64&q=80&crop=faces&fit=crop"
                                }
                                fallback={message.sender === "user" ? "US" : "AI"}
                            />
                            <ChatBubbleMessage
                                className=""
                                variant={message.sender === "user" ? "sent" : "received"}
                            >
                                <Streamdown>{message.content}</Streamdown>
                            </ChatBubbleMessage>
                        </ChatBubble>

                    ))}
                    {
                        currentMessage && (
                            <ChatBubble variant="received">
                                <ChatBubbleAvatar
                                    className="h-8 w-8 shrink-0"
                                    src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=64&h=64&q=80&crop=faces&fit=crop"
                                    fallback="AI"
                                />
                                <ChatBubbleMessage className="">
                                    <Streamdown isAnimating>{currentMessage}</Streamdown>
                                </ChatBubbleMessage>
                            </ChatBubble>
                        )
                    }

                    {isLoading && (
                        <ChatBubble variant="received">
                            <ChatBubbleAvatar
                                className="h-8 w-8 shrink-0"
                                src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=64&h=64&q=80&crop=faces&fit=crop"
                                fallback="AI"
                            />
                            <ChatBubbleMessage isLoading />
                        </ChatBubble>
                    )}
                </ChatMessageList>
            </ExpandableChatBody>

            <ExpandableChatFooter>
                <form
                    onSubmit={handleSubmit}
                    className="relative rounded-lg border bg-background focus-within:ring-1 focus-within:ring-ring p-1"
                >
                    <ChatInput
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Type your message..."
                        className="min-h-12 resize-none rounded-lg bg-background border-0 p-3 shadow-none focus-visible:ring-0"
                    />
                    <div className="flex items-center p-3 pt-0 justify-between">
                        <div className="flex">
                            <Button
                                variant="ghost"
                                size="icon"
                                type="button"
                                onClick={handleAttachFile}
                            >
                                <Paperclip className="size-4" />
                            </Button>

                            <Button
                                variant="ghost"
                                size="icon"
                                type="button"
                                onClick={handleMicrophoneClick}
                            >
                                <Mic className="size-4" />
                            </Button>
                        </div>
                        <Button type="submit" size="sm" className="ml-auto gap-1.5">
                            Send Message
                            <CornerDownLeft className="size-3.5" />
                        </Button>
                    </div>
                </form>
            </ExpandableChatFooter>
        </ExpandableChat>
    )
}
