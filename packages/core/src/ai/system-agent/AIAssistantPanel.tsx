/**
 * AI Assistant Panel — AgentCore 版（editor 为主要服务对象）
 *
 * 内部全部基于新 SDK：useEditorAgent 驱动 run 生命周期（创建/断点恢复/
 * 工具自动执行/计划审批/预算续跑），useCapabilityProviders 提供编辑器工具
 * 目录与技能片段。导出名保持兼容（AIAssistantPanel / AIAssistantTrigger /
 * useAIAssistantShortcut）。
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
    Sparkles,
    Send,
    X,
    CheckCircle2,
    XCircle,
    MessageSquare,
    Copy,
    Check,
    Trash2,
    AlertTriangle,
    Play,
    Wrench
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
import {
    useEditorAgent,
    useCapabilityProviders,
    buildAgentRunInputs,
    getPageNavigationBridge,
    type AgentChatMessage,
} from '@kn/common'
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
    toolCalls?: import('@kn/common').ToolCallRecord[]
    subRuns?: import('@kn/common').SubRunRecord[]
}

const CONVERSATION_KEY = 'agentcore:editor-conversation'

function loadConversationId(): string {
    try {
        const existing = localStorage.getItem(CONVERSATION_KEY)
        if (existing) return existing
        const fresh = 'editor-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
        localStorage.setItem(CONVERSATION_KEY, fresh)
        return fresh
    } catch {
        return 'editor-' + Math.random().toString(36).slice(2)
    }
}

const renderContent = (content: string) => {
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
    const conversationId = useMemo(loadConversationId, [])
    const [input, setInput] = useState('')
    const [mode, setMode] = useState<'execute' | 'plan'>('execute')
    const [messages, setMessages] = useState<Message[]>([])
    const [copiedId, setCopiedId] = useState<string | null>(null)

    const inputRef = useRef<HTMLTextAreaElement>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    // 编辑器工具目录 + 技能片段（保留的供应商层）
    const { allTools, getCatalog } = useCapabilityProviders(editor ?? null)
    const catalog = useMemo(() => getCatalog(), [getCatalog])
    // tools[] 常驻；技能自带的工具随 skills[] 下发，首次调用前不展开参数结构。
    const { tools: toolSpecs, skills } = useMemo(() => buildAgentRunInputs(catalog), [catalog])
    const resolveTools = useCallback(() => allTools, [allTools])
    const currentPage = getPageNavigationBridge()?.getCurrentPage()

    const agent = useEditorAgent({
        conversationId,
        tools: toolSpecs,
        skills,
        resolveTools,
        spaceId: currentPage?.spaceId,
        pageId: currentPage?.pageId !== undefined ? String(currentPage.pageId) : undefined,
    })

    // 断点恢复：面板打开且空闲时自动续接未过期的 run（防重入）。
    useEffect(() => {
        if (open && currentPage?.pageId && agent.state.phase === 'idle' && !agent.state.runId) {
            void agent.attach()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, currentPage?.pageId])

    // run 终态 → 快照进消息历史，重置 agent 状态迎接下一轮。
    const lastPhaseRef = useRef(agent.state.phase)
    useEffect(() => {
        const phase = agent.state.phase
        if (lastPhaseRef.current === phase) return
        lastPhaseRef.current = phase
        if (phase === 'completed' || phase === 'failed' || phase === 'cancelled') {
            const text = agent.state.text
            const hasContent = text.trim().length > 0 || agent.state.toolCalls.length > 0
            if (hasContent) {
                const snapshot: Message = {
                    id: 'assistant-' + Date.now().toString(36),
                    role: 'assistant',
                    content: text || (phase === 'failed' ? '' : '（本轮无文本输出）'),
                    timestamp: Date.now(),
                    toolCalls: agent.state.toolCalls.slice(),
                    subRuns: agent.state.subRuns.slice(),
                }
                setMessages(prev => [...prev, snapshot])
            }
            agent.reset()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [agent.state.phase])

    // 自动滚动到底部
    useEffect(() => {
        if (agent.state.phase === 'streaming' || agent.state.phase === 'waiting-tools') {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        }
    }, [agent.state.text, agent.state.phase, agent.state.toolCalls.length])

    const handleSubmit = useCallback(async () => {
        const trimmed = input.trim()
        if (!trimmed || !currentPage?.pageId || agent.state.phase !== 'idle') return
        const userMessage: Message = {
            id: 'user-' + Date.now().toString(36),
            role: 'user',
            content: trimmed,
            timestamp: Date.now(),
        }
        setMessages(prev => [...prev, userMessage])
        setInput('')
        const history: AgentChatMessage[] = messages.map(m => ({
            role: m.role,
            content: m.content,
        }))
        await agent.start([...history, { role: 'user', content: trimmed }], { mode })
            .catch(() => undefined)
    }, [input, agent, messages, mode, currentPage?.pageId])

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            void handleSubmit()
        }
    }

    const handleCopy = (content: string, id: string) => {
        void navigator.clipboard?.writeText(content).then(() => {
            setCopiedId(id)
            setTimeout(() => setCopiedId(null), 1500)
        })
    }

    const isGenerating = agent.state.phase === 'creating' || agent.state.phase === 'streaming'
    const isWaiting = agent.state.phase === 'waiting-tools'

    if (!open) return null

    const positionClasses = {
        'bottom-right': 'bottom-4 right-4',
        'bottom-left': 'bottom-4 left-4',
        center: 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
    }[position]

    return createPortal(
        <TooltipProvider>
            <div
                className={cn(
                    'fixed z-[100] flex flex-col rounded-2xl border border-border/60 bg-background/95 backdrop-blur-xl shadow-2xl',
                    positionClasses
                )}
                style={{ width, height }}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600">
                            <Sparkles className="h-3.5 w-3.5 text-white" />
                        </div>
                        <div>
                            <div className="text-sm font-semibold">Editor Agent</div>
                            <div className="text-[10px] text-muted-foreground">
                                {editor ? '已连接编辑器' : '未绑定编辑器'} · {agent.state.runId ? '可断点恢复' : '空闲'}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            className={cn('h-7 w-7 rounded-lg', mode === 'plan' && 'bg-primary/10 text-primary')}
                            onClick={() => setMode(mode === 'plan' ? 'execute' : 'plan')}
                        >
                            <Wrench className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-lg"
                            onClick={() => onOpenChange(false)}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {/* Messages */}
                <ScrollArea className="flex-1">
                    <div className="p-4 space-y-4">
                        {messages.length === 0 && !isGenerating && !isWaiting && agent.state.phase === 'idle' && (
                            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground py-16">
                                <div className="p-3 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-600/10">
                                    <MessageSquare className="h-6 w-6" />
                                </div>
                                <p className="text-sm">让 AI 直接编辑你的文档</p>
                                <p className="text-xs text-muted-foreground/60">
                                    支持计划模式（先调研后批准）、子 agent 委派与长期记忆
                                </p>
                            </div>
                        )}

                        {messages.map(message => (
                            <div key={message.id} className={cn('flex gap-2', message.role === 'user' ? 'justify-end' : 'justify-start')}>
                                <div
                                    className={cn(
                                        'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap',
                                        message.role === 'user'
                                            ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white'
                                            : 'bg-muted/60'
                                    )}
                                >
                                    {message.role === 'assistant' && message.content && renderContent(message.content)}
                                    {message.role === 'user' && message.content}
                                    {message.role === 'assistant' && (
                                        <div className="flex items-center gap-1.5 mt-1.5">
                                            {message.toolCalls && message.toolCalls.length > 0 && (
                                                <Badge variant="outline" className="text-[10px]">
                                                    {message.toolCalls.length} 次工具调用
                                                </Badge>
                                            )}
                                            {message.subRuns && message.subRuns.length > 0 && (
                                                <SubAgentTree subRuns={message.subRuns} />
                                            )}
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6 rounded-md"
                                                onClick={() => handleCopy(message.content, message.id)}
                                            >
                                                {copiedId === message.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {/* 当前进行中的 assistant 气泡 */}
                        {(isGenerating || isWaiting || agent.state.phase === 'suspended' || agent.state.phase === 'waiting-approval') && (
                            <div className="flex gap-2 justify-start">
                                <div className="max-w-[85%] rounded-2xl bg-muted/60 px-3.5 py-2.5 text-sm whitespace-pre-wrap">
                                    {agent.state.text ? renderContent(agent.state.text) : (
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
                                            {isWaiting ? '正在执行编辑器操作…' : '思考中…'}
                                        </div>
                                    )}

                                    {/* 工具执行记录 */}
                                    {agent.state.toolCalls.length > 0 && (
                                        <div className="mt-2 space-y-1.5">
                                            {agent.state.toolCalls.map(call => (
                                                <div key={call.callId} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                                    {call.status === 'success' && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
                                                    {call.status === 'error' && <XCircle className="h-3 w-3 text-destructive" />}
                                                    {call.status === 'running' && <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />}
                                                    <span className="font-mono">{call.tool}</span>
                                                    {call.error && <span className="text-destructive">失败: {call.error}</span>}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* 子 agent 树 */}
                                    {agent.state.subRuns.length > 0 && (
                                        <SubAgentTree subRuns={agent.state.subRuns} />
                                    )}

                                    {/* 计划审批卡片 */}
                                    {agent.state.phase === 'waiting-approval' && agent.state.plan && (
                                        <PlanApprovalCard
                                            planText={agent.state.plan.text}
                                            onDecision={(approved, feedback) => agent.approvePlan(approved, feedback)}
                                        />
                                    )}

                                    {/* 预算耗尽 → 继续执行 */}
                                    {agent.state.phase === 'suspended' && agent.state.suspendReason === 'budget' && (
                                        <div className="mt-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => void agent.continueRun()}
                                            >
                                                <Play className="h-3.5 w-3.5 mr-1" />
                                                继续执行（续批预算）
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>
                </ScrollArea>

                {/* 连接错误保持 run 可恢复，不把后端任务误判为终态。 */}
                {agent.state.phase !== 'failed' && agent.state.error && (
                    <div className="px-4 py-2 bg-amber-500/10 border-t border-amber-500/20">
                        <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            <span className="min-w-0 flex-1">{agent.state.error}</span>
                            {agent.state.phase === 'suspended' && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 border-amber-500/30 px-2 text-xs"
                                    onClick={agent.retryConnection}
                                >
                                    重试
                                </Button>
                            )}
                        </div>
                    </div>
                )}
                {agent.state.phase === 'failed' && agent.state.error && (
                    <div className="px-4 py-2 bg-destructive/10 border-t border-destructive/20">
                        <div className="flex items-center gap-2 text-xs text-destructive">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            <span>{agent.state.error}</span>
                        </div>
                    </div>
                )}

                {/* 输入区 */}
                <div className="p-3 border-t border-border/50">
                    <div className="flex items-end gap-2">
                        <div className="flex-1 relative">
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={mode === 'plan' ? '描述目标，Agent 先调研并提交计划…' : '让 AI 编辑这篇文档…'}
                                disabled={agent.state.phase !== 'idle'}
                                rows={1}
                                className={cn(
                                    'w-full resize-none text-sm bg-muted/50 border border-border/50 rounded-xl',
                                    'px-4 py-2.5 pr-10 outline-none',
                                    'placeholder:text-muted-foreground/50',
                                    'focus:ring-2 focus:ring-primary/20 focus:border-primary/50',
                                    'disabled:opacity-50 transition-all',
                                )}
                                style={{ minHeight: 44, maxHeight: 120 }}
                            />
                            {isGenerating || isWaiting ? (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-1.5 bottom-1.5 h-8 w-8 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    onClick={() => void agent.cancel()}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            ) : (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-1.5 bottom-1.5 h-8 w-8 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 text-white hover:from-indigo-600 hover:to-purple-700"
                                    onClick={() => void handleSubmit()}
                                    disabled={!input.trim() || agent.state.phase !== 'idle'}
                                >
                                    <Send className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
                        <span>Enter 发送 · Shift+Enter 换行 · {mode === 'plan' ? '计划模式' : '执行模式'}</span>
                        {agent.state.runId && (
                            <Badge variant="outline" className="text-[10px]">
                                run #{agent.state.runId.slice(0, 8)}
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
                    size={showLabel ? 'default' : 'icon'}
                    className={cn('flex items-center gap-2', open && 'bg-muted')}
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
 * @deprecated The agent shortcut is owned by Layout (Ctrl+Shift+A). Kept only
 * for plugin bundles compiled against the old export; it binds nothing.
 */
export function useAIAssistantShortcut(
    _open: boolean,
    _onOpenChange: (open: boolean) => void
) {
    // Intentionally empty: binding Ctrl+K here would collide with the space's
    // global search.
}
