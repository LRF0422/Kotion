/**
 * AI Assistant Page
 *
 * A standalone page for AI assistant functionality.
 * Accessible via sidebar menu.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react'
import {
    Sparkles,
    Send,
    X,
    Loader2,
    CheckCircle2,
    XCircle,
    MessageSquare,
    Copy,
    Check,
    Trash2,
    RotateCcw
} from '@kn/icon'
import {
    Button,
    Badge,
    Tooltip,
    TooltipContent,
    TooltipTrigger,
    TooltipProvider,
    ScrollArea,
    cn
} from '@kn/ui'
import { SystemAgentProvider, useSystemAgent, type ExecutionStep } from '@kn/common'

// ============ Types ============

interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
    timestamp: number
    steps?: ExecutionStep[]
}

// ============ Chat Interface ============

const AIChatInterface: React.FC = () => {
    const agent = useSystemAgent()
    const [input, setInput] = useState('')
    const [messages, setMessages] = useState<Message[]>([])
    const [copiedId, setCopiedId] = useState<string | null>(null)

    const inputRef = useRef<HTMLTextAreaElement>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    // Auto scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [agent.state.streamingContent, messages])

    // Focus input on mount
    useEffect(() => {
        inputRef.current?.focus()
    }, [])

    // Update streaming message
    useEffect(() => {
        if (agent.state.isGenerating) {
            setMessages(prev => {
                const lastMessage = prev[prev.length - 1]
                if (lastMessage?.role === 'assistant') {
                    return prev.map((m, i) =>
                        i === prev.length - 1
                            ? { ...m, content: agent.state.streamingContent }
                            : m
                    )
                }
                return prev
            })
        }
    }, [agent.state.streamingContent, agent.state.isGenerating])

    // Handle submit
    const handleSubmit = useCallback(async () => {
        if (!input.trim() || agent.state.isGenerating) return

        const userMessage: Message = {
            id: `msg-${Date.now()}`,
            role: 'user',
            content: input.trim(),
            timestamp: Date.now()
        }

        const assistantMessage: Message = {
            id: `msg-${Date.now() + 1}`,
            role: 'assistant',
            content: '',
            timestamp: Date.now() + 1
        }

        setMessages(prev => [...prev, userMessage, assistantMessage])
        const currentInput = input.trim()
        setInput('')

        try {
            await agent.stream(currentInput)
            // Update final message content
            setMessages(prev => {
                const lastMessage = prev[prev.length - 1]
                if (lastMessage?.role === 'assistant') {
                    return prev.map((m, i) =>
                        i === prev.length - 1
                            ? { ...m, content: agent.state.streamingContent }
                            : m
                    )
                }
                return prev
            })
        } catch (error) {
            console.error('Stream error:', error)
        }
    }, [input, agent])

    // Handle key down
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSubmit()
        }
    }, [handleSubmit])

    // Copy message
    const handleCopy = useCallback(async (content: string, id: string) => {
        await navigator.clipboard.writeText(content)
        setCopiedId(id)
        setTimeout(() => setCopiedId(null), 2000)
    }, [])

    // Clear messages
    const handleClear = useCallback(() => {
        setMessages([])
        agent.reset()
    }, [agent])

    // Regenerate last response
    const handleRegenerate = useCallback(() => {
        if (messages.length < 2) return

        // Get the last user message
        const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')
        if (!lastUserMessage) return

        // Remove last assistant message
        setMessages(prev => prev.slice(0, -1))

        // Re-send the last user message
        agent.stream(lastUserMessage.content)
    }, [messages, agent])

    // Stop generation
    const handleStop = useCallback(() => {
        agent.stop()
    }, [agent])

    return (
        <TooltipProvider>
            <div className="flex flex-col h-full bg-background">
                {/* Header */}
                <div className="flex items-center justify-between px-8 py-5 border-b border-border/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                            <Sparkles className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-xl font-semibold">AI Assistant</h1>
                            <p className="text-sm text-muted-foreground">
                                {agent.state.isGenerating ? (
                                    <span className="flex items-center gap-1">
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                        Generating...
                                    </span>
                                ) : (
                                    'Ready to help'
                                )}
                            </p>
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleClear}
                        disabled={messages.length === 0}
                        className="gap-2 text-muted-foreground hover:text-foreground"
                    >
                        <Trash2 className="h-4 w-4" />
                        Clear
                    </Button>
                </div>

                {/* Messages Area */}
                <div className="flex-1 overflow-hidden">
                    <ScrollArea className="h-full">
                        <div className="max-w-3xl mx-auto px-6 py-8">
                            {messages.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-24 text-center">
                                    <div className="p-4 rounded-2xl bg-primary/5 mb-6">
                                        <MessageSquare className="h-12 w-12 text-primary/60" />
                                    </div>
                                    <h2 className="text-2xl font-semibold mb-3">Start a Conversation</h2>
                                    <p className="text-muted-foreground max-w-md mb-8">
                                        Ask me anything about your documents, or let me help you edit,
                                        organize, and improve your content.
                                    </p>
                                    <div className="grid grid-cols-2 gap-3 max-w-lg w-full">
                                        <QuickActionCard
                                            title="Summarize"
                                            description="Get a summary of your document"
                                            onClick={() => setInput('Please summarize this document')}
                                        />
                                        <QuickActionCard
                                            title="Improve Writing"
                                            description="Enhance clarity and style"
                                            onClick={() => setInput('Help me improve the writing quality')}
                                        />
                                        <QuickActionCard
                                            title="Generate Ideas"
                                            description="Brainstorm content ideas"
                                            onClick={() => setInput('Generate some ideas for this topic')}
                                        />
                                        <QuickActionCard
                                            title="Ask Questions"
                                            description="Get answers about content"
                                            onClick={() => setInput('I have a question about ')}
                                        />
                                    </div>
                                </div>
                            )}

                            {messages.map((message) => (
                                <div
                                    key={message.id}
                                    className={cn(
                                        "flex gap-4 mb-6",
                                        message.role === 'user' ? "flex-row-reverse" : ""
                                    )}
                                >
                                    {/* Avatar */}
                                    <div
                                        className={cn(
                                            "flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center mt-1",
                                            message.role === 'user'
                                                ? "bg-primary text-primary-foreground"
                                                : "bg-primary/10 text-primary"
                                        )}
                                    >
                                        {message.role === 'user' ? (
                                            <span className="text-sm font-medium">U</span>
                                        ) : (
                                            <Sparkles className="h-4 w-4" />
                                        )}
                                    </div>

                                    {/* Content */}
                                    <div
                                        className={cn(
                                            "flex-1 max-w-[85%]",
                                            message.role === 'user' ? "text-right" : ""
                                        )}
                                    >
                                        <div
                                            className={cn(
                                                "rounded-2xl px-5 py-4 text-left",
                                                message.role === 'user'
                                                    ? "bg-primary text-primary-foreground rounded-tr-md"
                                                    : "bg-muted/50 rounded-tl-md"
                                            )}
                                        >
                                            <div className="text-sm leading-relaxed whitespace-pre-wrap">
                                                {message.role === 'assistant' ? (
                                                    message.content || agent.state.streamingContent || (
                                                        <div className="flex items-center gap-2 text-muted-foreground">
                                                            <Loader2 className="h-4 w-4 animate-spin" />
                                                            <span>Thinking...</span>
                                                        </div>
                                                    )
                                                ) : (
                                                    message.content
                                                )}
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        {message.role === 'assistant' && message.content && (
                                            <div className={cn(
                                                "flex items-center gap-1 mt-2",
                                                "justify-start"
                                            )}>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                                                            onClick={() => handleCopy(message.content, message.id)}
                                                        >
                                                            {copiedId === message.id ? (
                                                                <Check className="h-3 w-3 mr-1 text-green-500" />
                                                            ) : (
                                                                <Copy className="h-3 w-3 mr-1" />
                                                            )}
                                                            {copiedId === message.id ? 'Copied' : 'Copy'}
                                                        </Button>
                                                    </TooltipTrigger>
                                                    <TooltipContent>Copy to clipboard</TooltipContent>
                                                </Tooltip>
                                                {message === messages[messages.length - 1] && !agent.state.isGenerating && (
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                                                                onClick={handleRegenerate}
                                                            >
                                                                <RotateCcw className="h-3 w-3 mr-1" />
                                                                Regenerate
                                                            </Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent>Regenerate response</TooltipContent>
                                                    </Tooltip>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}

                            {/* Tool Execution Steps */}
                            {agent.state.executionSteps.length > 0 && (
                                <div className="border border-border/50 rounded-xl p-4 bg-muted/30 mt-4">
                                    <p className="text-xs font-medium text-muted-foreground mb-3">Tool Calls</p>
                                    <div className="space-y-2">
                                        {agent.state.executionSteps.map((step) => (
                                            <div key={step.id} className="flex items-center gap-3 text-sm">
                                                {step.status === 'running' ? (
                                                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                                ) : step.status === 'success' ? (
                                                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                                                ) : (
                                                    <XCircle className="h-4 w-4 text-red-500" />
                                                )}
                                                <Badge variant="outline" className="text-xs">
                                                    {step.toolName}
                                                </Badge>
                                                {step.duration && (
                                                    <span className="text-xs text-muted-foreground">
                                                        {step.duration}ms
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div ref={messagesEndRef} />
                        </div>
                    </ScrollArea>
                </div>

                {/* Error Display */}
                {agent.state.error && (
                    <div className="px-8 py-3 bg-destructive/10 border-t border-destructive/20">
                        <div className="max-w-3xl mx-auto flex items-center gap-2 text-sm text-destructive">
                            <XCircle className="h-4 w-4" />
                            <span>{agent.state.error.message}</span>
                        </div>
                    </div>
                )}

                {/* Input Area */}
                <div className="border-t border-border/50 px-8 py-4">
                    <div className="max-w-3xl mx-auto">
                        <div className="relative">
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Ask AI anything..."
                                disabled={agent.state.isGenerating}
                                rows={1}
                                className={cn(
                                    "w-full resize-none text-sm bg-muted/50 border border-border/50 rounded-xl",
                                    "px-4 py-3 pr-24 outline-none",
                                    "placeholder:text-muted-foreground/50",
                                    "focus:ring-2 focus:ring-primary/20 focus:border-primary/50",
                                    "disabled:opacity-50 transition-all"
                                )}
                                style={{ minHeight: 52, maxHeight: 200 }}
                            />
                            {agent.state.isGenerating ? (
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    className="absolute right-2 bottom-2 rounded-lg"
                                    onClick={handleStop}
                                >
                                    <X className="h-4 w-4 mr-1" />
                                    Stop
                                </Button>
                            ) : (
                                <Button
                                    size="sm"
                                    className="absolute right-2 bottom-2 rounded-lg"
                                    onClick={handleSubmit}
                                    disabled={!input.trim()}
                                >
                                    <Send className="h-4 w-4 mr-1" />
                                    Send
                                </Button>
                            )}
                        </div>
                        <div className="flex items-center justify-center mt-3 text-xs text-muted-foreground">
                            <span>AI Assistant can make mistakes. Consider checking important information.</span>
                        </div>
                    </div>
                </div>
            </div>
        </TooltipProvider>
    )
}

// ============ Quick Action Card ============

interface QuickActionCardProps {
    title: string
    description: string
    onClick: () => void
}

const QuickActionCard: React.FC<QuickActionCardProps> = ({ title, description, onClick }) => (
    <button
        onClick={onClick}
        className="p-4 rounded-xl border border-border/50 bg-muted/30 hover:bg-muted/50 hover:border-border text-left transition-all group"
    >
        <div className="font-medium text-sm mb-1 group-hover:text-primary transition-colors">
            {title}
        </div>
        <div className="text-xs text-muted-foreground">
            {description}
        </div>
    </button>
)

// ============ Page Component with Provider ============

const AIAssistantPageInner: React.FC = () => {
    return <AIChatInterface />
}

export const AIAssistantPage: React.FC = () => {
    return (
        <SystemAgentProvider>
            <AIAssistantPageInner />
        </SystemAgentProvider>
    )
}

export default AIAssistantPage
