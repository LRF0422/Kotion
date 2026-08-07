/**
 * AI Assistant Panel
 *
 * A floating panel that provides AI assistant functionality.
 * Can be accessed globally via sidebar button or keyboard shortcut.
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
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
    AlertTriangle
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
import type { Editor } from '@kn/editor'
import { useSystemAgent, type ExecutionStep } from '@kn/common'
import { SubAgentTree } from './SubAgentTree'
import { PlanApprovalCard } from './PlanApprovalCard'

// ============ Types ============

export interface AIAssistantPanelProps {
    /** Whether the panel is open */
    open: boolean
    /** Callback when open state changes */
    onOpenChange: (open: boolean) => void
    /** Editor to bind */
    editor?: Editor
    /** Panel position */
    position?: 'bottom-right' | 'bottom-left' | 'center'
    /** Default width */
    width?: number
    /** Default height */
    height?: number
}

interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
    timestamp: number
    steps?: ExecutionStep[]
}

// Simple markdown-like content renderer
const renderContent = (content: string) => {
    // Basic handling - just return the content
    // In production, you might want to use a proper markdown renderer
    return content.split('\n').map((line, i) => (
        <React.Fragment key={i}>
            {line}
            {i < content.split('\n').length - 1 && <br />}
        </React.Fragment>
    ))
}

// ============ Panel Component ============

export const AIAssistantPanel: React.FC<AIAssistantPanelProps> = ({
    open,
    onOpenChange,
    editor,
    position = 'bottom-right',
    width = 400,
    height = 600
}) => {
    const agent = useSystemAgent()
    const [input, setInput] = useState('')
    const [messages, setMessages] = useState<Message[]>([])
    const [copiedId, setCopiedId] = useState<string | null>(null)

    const inputRef = useRef<HTMLTextAreaElement>(null)
    const scrollRef = useRef<HTMLDivElement>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    // Bind editor
    useEffect(() => {
        if (editor) {
            agent.setEditor(editor)
        }
    }, [agent, editor])

    // Auto scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [agent.state.streamingContent, messages])

    // Focus input when opened
    useEffect(() => {
        if (open) {
            setTimeout(() => inputRef.current?.focus(), 100)
        }
    }, [open])

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
            timestamp: Date.now() + 1,
            steps: []
        }

        setMessages(prev => [...prev, userMessage, assistantMessage])
        const currentInput = input.trim()
        setInput('')

        try {
            await agent.stream(currentInput, { editor })
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
    }, [input, agent, editor])

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

    // Stop generation
    const handleStop = useCallback(() => {
        agent.stop()
    }, [agent])

    // Get position styles
    const positionStyles = useMemo(() => {
        switch (position) {
            case 'bottom-left':
                return { bottom: 80, left: 80 }
            case 'center':
                return { bottom: '50%', left: '50%', transform: 'translate(-50%, 50%)' }
            case 'bottom-right':
            default:
                return { bottom: 80, right: 16 }
        }
    }, [position])

    if (!open) return null

    return createPortal(
        <TooltipProvider>
            <div
                className={cn(
                    "flex flex-col bg-background",
                    "border border-border/50 rounded-xl shadow-2xl animate-in fade-in-0 slide-in-from-bottom-4 duration-200"
                )}
                style={{
                    position: 'fixed',
                    ...positionStyles,
                    width,
                    height,
                    zIndex: 9999
                }}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600">
                            <Sparkles className="h-4 w-4 text-white" />
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold">AI Assistant</h3>
                            <p className="text-[10px] text-muted-foreground">
                                {agent.state.isGenerating ? 'Generating...' : 'Ready to help'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={handleClear}
                                    disabled={messages.length === 0}
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Clear chat</TooltipContent>
                        </Tooltip>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => onOpenChange(false)}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {/* Messages */}
                <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                    <div className="space-y-4">
                        {messages.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                <div className="p-3 rounded-full bg-muted mb-4">
                                    <MessageSquare className="h-6 w-6 text-muted-foreground" />
                                </div>
                                <p className="text-sm font-medium mb-1">Start a conversation</p>
                                <p className="text-xs text-muted-foreground max-w-[240px]">
                                    Ask me anything about your documents, or let me help you edit and organize content.
                                </p>
                            </div>
                        )}

                        {messages.map((message) => (
                            <div
                                key={message.id}
                                className={cn(
                                    "flex gap-3",
                                    message.role === 'user' ? "flex-row-reverse" : ""
                                )}
                            >
                                {/* Avatar */}
                                <div
                                    className={cn(
                                        "flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center",
                                        message.role === 'user'
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-gradient-to-br from-indigo-500 to-purple-600 text-white"
                                    )}
                                >
                                    {message.role === 'user' ? (
                                        <span className="text-xs font-medium">U</span>
                                    ) : (
                                        <Sparkles className="h-3.5 w-3.5" />
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
                                            "rounded-2xl px-4 py-2.5 text-sm",
                                            message.role === 'user'
                                                ? "bg-primary text-primary-foreground rounded-tr-sm"
                                                : "bg-muted rounded-tl-sm"
                                        )}
                                    >
                                        {message.role === 'assistant' ? (
                                            message.content || agent.state.streamingContent || (
                                                <div className="flex items-center gap-2">
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                    <span className="text-muted-foreground">Thinking...</span>
                                                </div>
                                            )
                                        ) : (
                                            message.content
                                        )}
                                    </div>

                                    {/* Actions for assistant messages */}
                                    {message.role === 'assistant' && message.content && (
                                        <div className="flex items-center gap-1 mt-1.5">
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6"
                                                        onClick={() => handleCopy(message.content, message.id)}
                                                    >
                                                        {copiedId === message.id ? (
                                                            <Check className="h-3 w-3 text-green-500" />
                                                        ) : (
                                                            <Copy className="h-3 w-3" />
                                                        )}
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent>Copy</TooltipContent>
                                            </Tooltip>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {/* Execution steps */}
                        {agent.state.executionSteps.length > 0 && (
                            <div className="border border-border/50 rounded-lg p-2 bg-muted/30">
                                <p className="text-[10px] font-medium text-muted-foreground mb-2">Tool Calls</p>
                                <div className="space-y-1">
                                    {agent.state.executionSteps.map((step) => (
                                        <div key={step.id} className={`rounded-md p-1.5 ${step.status === 'error' ? 'bg-red-50/50 dark:bg-red-950/20 border border-red-200/60 dark:border-red-800/40' : ''}`}>
                                            <div className="flex items-center gap-2 text-xs">
                                                {step.status === 'running' ? (
                                                    <Loader2 className="h-3 w-3 animate-spin text-indigo-500" />
                                                ) : step.status === 'success' ? (
                                                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                                                ) : (
                                                    <XCircle className="h-3 w-3 text-red-500" />
                                                )}
                                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                                    {step.toolName}
                                                </Badge>
                                                {step.duration && (
                                                    <span className={`text-[10px] ${step.status === 'error' ? 'text-red-500' : 'text-muted-foreground'}`}>
                                                        {step.duration}ms
                                                    </span>
                                                )}
                                            </div>
                                            {step.status === 'error' && (
                                                <div className="ml-5 mt-1 space-y-1">
                                                    {step.args && Object.keys(step.args).length > 0 && (
                                                        <div className="text-[9px] text-muted-foreground/80 font-mono bg-muted/50 rounded px-1.5 py-0.5 truncate max-w-full">
                                                            {Object.entries(step.args).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join(', ').slice(0, 120)}
                                                        </div>
                                                    )}
                                                    {step.error && (
                                                        <div className="flex items-start gap-1 text-[9px] text-red-500 dark:text-red-400">
                                                            <AlertTriangle className="h-3 w-3 shrink-0 mt-px" />
                                                            <span className="break-words">{step.error}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Sub-agent tree (P6) */}
                        {Object.keys(agent.state.subAgents).length > 0 && (
                            <SubAgentTree subAgents={agent.state.subAgents} />
                        )}

                        {/* Plan approval card (P7) */}
                        {agent.state.pendingPlan && (
                            <PlanApprovalCard
                                plan={agent.state.pendingPlan.plan}
                                disabled={agent.state.isGenerating}
                                onApprove={() => { void agent.resolvePlan('approved') }}
                                onReject={() => { void agent.resolvePlan('rejected') }}
                            />
                        )}

                        <div ref={messagesEndRef} />
                    </div>
                </ScrollArea>

                {/* Error display */}
                {agent.state.error && (
                    <div className="px-4 py-2 bg-destructive/10 border-t border-destructive/20">
                        <div className="flex items-center gap-2 text-xs text-destructive">
                            <XCircle className="h-3.5 w-3.5" />
                            <span>{agent.state.error.message}</span>
                        </div>
                    </div>
                )}

                {/* Input */}
                <div className="p-3 border-t border-border/50">
                    <div className="flex items-end gap-2">
                        <div className="flex-1 relative">
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
                                    "px-4 py-2.5 pr-10 outline-none",
                                    "placeholder:text-muted-foreground/50",
                                    "focus:ring-2 focus:ring-primary/20 focus:border-primary/50",
                                    "disabled:opacity-50 transition-all"
                                )}
                                style={{ minHeight: 44, maxHeight: 120 }}
                            />
                            {agent.state.isGenerating ? (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-1.5 bottom-1.5 h-8 w-8 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    onClick={handleStop}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            ) : (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-1.5 bottom-1.5 h-8 w-8 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 text-white hover:from-indigo-600 hover:to-purple-700"
                                    onClick={handleSubmit}
                                    disabled={!input.trim()}
                                >
                                    <Send className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
                        <span>Press Enter to send, Shift+Enter for new line</span>
                        {editor && (
                            <Badge variant="outline" className="text-[10px]">
                                Editor connected
                            </Badge>
                        )}
                    </div>
                </div>
            </div>
        </TooltipProvider>,
        document.body
    )
}

// ============ Trigger Button ============

export interface AIAssistantTriggerProps {
    /** Whether the panel is open */
    open: boolean
    /** Callback when clicked */
    onClick: () => void
    /** Show label */
    showLabel?: boolean
}

export const AIAssistantTrigger: React.FC<AIAssistantTriggerProps> = ({
    open,
    onClick,
    showLabel = false
}) => {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    variant="ghost"
                    size={showLabel ? "default" : "icon"}
                    className={cn(
                        "flex items-center gap-2",
                        open && "bg-muted"
                    )}
                    onClick={onClick}
                >
                    <div className="p-1 rounded-md bg-gradient-to-br from-indigo-500 to-purple-600">
                        <Sparkles className="h-4 w-4 text-white" />
                    </div>
                    {showLabel && <span className="text-sm font-medium">AI Assistant</span>}
                </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
                <span>AI Assistant (Ctrl+Shift+A)</span>
            </TooltipContent>
        </Tooltip>
    )
}

// ============ Hook for keyboard shortcut ============

/**
 * @deprecated The agent shortcut is owned by `Layout` (Ctrl+Shift+A) now that the
 * panel lives in the side dock. Kept only for plugin bundles compiled against the
 * old export; it binds nothing.
 */
export function useAIAssistantShortcut(
    _open: boolean,
    _onOpenChange: (open: boolean) => void
) {
    // Intentionally empty: binding Ctrl+K here would collide with the space's
    // global search.
}
