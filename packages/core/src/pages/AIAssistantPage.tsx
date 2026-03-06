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
    RotateCcw,
    Settings2
} from '@kn/icon'
import {
    Button,
    Badge,
    Tooltip,
    TooltipContent,
    TooltipTrigger,
    TooltipProvider,
    ScrollArea,
    cn,
    Input
} from '@kn/ui'
import { SystemAgentProvider, useSystemAgent, type ExecutionStep } from '../ai/system-agent'

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
            <div className="flex flex-col h-full">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 bg-background/95 backdrop-blur-sm">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/20">
                            <Sparkles className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-lg font-semibold">AI Assistant</h1>
                            <p className="text-xs text-muted-foreground">
                                {agent.state.isGenerating ? (
                                    <span className="text-indigo-500 flex items-center gap-1">
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                        Generating...
                                    </span>
                                ) : (
                                    'Ready to help with your documents'
                                )}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleClear}
                                    disabled={messages.length === 0}
                                    className="gap-2"
                                >
                                    <Trash2 className="h-4 w-4" />
                                    Clear
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Clear conversation</TooltipContent>
                        </Tooltip>
                    </div>
                </div>

                {/* Messages Area */}
                <div className="flex-1 overflow-hidden">
                    <ScrollArea className="h-full">
                        <div className="max-w-3xl mx-auto p-6 space-y-6">
                            {messages.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-20 text-center">
                                    <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-600/10 mb-6">
                                        <MessageSquare className="h-10 w-10 text-indigo-500" />
                                    </div>
                                    <h2 className="text-xl font-semibold mb-2">Start a Conversation</h2>
                                    <p className="text-muted-foreground max-w-md mb-6">
                                        Ask me anything about your documents, or let me help you edit,
                                        organize, and improve your content.
                                    </p>
                                    <div className="grid grid-cols-2 gap-3 max-w-md">
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
                                        "flex gap-4",
                                        message.role === 'user' ? "flex-row-reverse" : ""
                                    )}
                                >
                                    {/* Avatar */}
                                    <div
                                        className={cn(
                                            "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
                                            message.role === 'user'
                                                ? "bg-primary text-primary-foreground"
                                                : "bg-gradient-to-br from-indigo-500 to-purple-600 text-white"
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
                                            "flex-1 max-w-[80%]",
                                            message.role === 'user' ? "text-right" : ""
                                        )}
                                    >
                                        <div
                                            className={cn(
                                                "rounded-2xl px-5 py-3",
                                                message.role === 'user'
                                                    ? "bg-primary text-primary-foreground rounded-tr-md"
                                                    : "bg-muted rounded-tl-md"
                                            )}
                                        >
                                            <div className="text-sm whitespace-pre-wrap">
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
                                        <div className={cn(
                                            "flex items-center gap-2 mt-2",
                                            message.role === 'user' ? "justify-end" : ""
                                        )}>
                                            {message.role === 'assistant' && message.content && (
                                                <>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-7 px-2 text-xs"
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
                                                                    className="h-7 px-2 text-xs"
                                                                    onClick={handleRegenerate}
                                                                >
                                                                    <RotateCcw className="h-3 w-3 mr-1" />
                                                                    Regenerate
                                                                </Button>
                                                            </TooltipTrigger>
                                                            <TooltipContent>Regenerate response</TooltipContent>
                                                        </Tooltip>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {/* Tool Execution Steps */}
                            {agent.state.executionSteps.length > 0 && (
                                <div className="border border-border/50 rounded-xl p-4 bg-muted/30">
                                    <p className="text-xs font-medium text-muted-foreground mb-3">Tool Calls</p>
                                    <div className="space-y-2">
                                        {agent.state.executionSteps.map((step) => (
                                            <div key={step.id} className="flex items-center gap-3 text-sm">
                                                {step.status === 'running' ? (
                                                    <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
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
                    <div className="px-6 py-3 bg-destructive/10 border-t border-destructive/20">
                        <div className="max-w-3xl mx-auto flex items-center gap-2 text-sm text-destructive">
                            <XCircle className="h-4 w-4" />
                            <span>{agent.state.error.message}</span>
                        </div>
                    </div>
                )}

                {/* Input Area */}
                <div className="border-t border-border/50 bg-background/95 backdrop-blur-sm p-4">
                    <div className="max-w-3xl mx-auto">
                        <div className="relative">
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Ask AI anything... (Enter to send, Shift+Enter for new line)"
                                disabled={agent.state.isGenerating}
                                rows={1}
                                className={cn(
                                    "w-full resize-none text-sm bg-muted/50 border border-border/50 rounded-xl",
                                    "px-4 py-3 pr-14 outline-none",
                                    "placeholder:text-muted-foreground/50",
                                    "focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/50",
                                    "disabled:opacity-50 transition-all"
                                )}
                                style={{ minHeight: 52, maxHeight: 200 }}
                            />
                            {agent.state.isGenerating ? (
                                <Button
                                    variant="destructive"
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
                                    className="absolute right-2 bottom-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700"
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
        <div className="font-medium text-sm mb-1 group-hover:text-indigo-500 transition-colors">
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
