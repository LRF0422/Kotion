import React, { useState, useCallback, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Editor, Plugin, PluginKey, Decoration, DecorationSet } from '@kn/editor'
import { Sparkles, Send, X, Loader2, CheckCircle2, XCircle, MessageSquare } from '@kn/icon'
import { Button, Badge, Streamdown } from '@kn/ui'
import { useEditorAgentOptimized } from './use-agent-optimized'
import type { ToolExecutionEvent, UserChoiceRequest } from './types'

// ─── shared ─────────────────────────────────────────────────────

interface ExecutionStep {
    id: string
    toolName: string
    args: any
    result?: any
    status: 'running' | 'success' | 'error'
    timestamp: number
    duration?: number
}

interface SelectionSnapshot {
    from: number
    to: number
    text: string
    rect: { top: number; left: number }
}

const AI_INLINE_EVENT = 'ai-inline-open'

const formatToolName = (name: string) =>
    name.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim()

// ─── Virtual selection decoration plugin ────────────────────────

const aiSelectionKey = new PluginKey('ai-virtual-selection')

function createAiSelectionPlugin() {
    return new Plugin({
        key: aiSelectionKey,
        state: {
            init() {
                return DecorationSet.empty
            },
            apply(tr, set) {
                const meta = tr.getMeta(aiSelectionKey)
                // meta === null  → clear
                // meta === { from, to } → set
                // meta === undefined → keep (map through doc changes)
                if (meta === null) return DecorationSet.empty
                if (meta) {
                    return DecorationSet.create(tr.doc, [
                        Decoration.inline(meta.from, meta.to, {
                            style: 'background-color:rgba(99,102,241,0.18);border-radius:2px;',
                        }),
                    ])
                }
                return set.map(tr.mapping, tr.doc)
            },
        },
        props: {
            decorations(state) {
                return aiSelectionKey.getState(state)
            },
        },
    })
}

/** Set or clear the virtual selection highlight */
function setVirtualSelection(editor: Editor, range: { from: number; to: number } | null) {
    editor.view.dispatch(
        editor.state.tr.setMeta(aiSelectionKey, range)
    )
}

// ─── Trigger (flotMenuConfig — inside bubble menu) ──────────────

export const AiInlineTrigger: React.FC<{ editor: Editor }> = ({ editor }) => {
    // Use mouseDown: selection is still alive before focus shifts
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault()  // keep editor focused → selection stays
        e.stopPropagation()

        const { from, to } = editor.state.selection
        const text = editor.state.doc.textBetween(from, to, ' ')
        if (!text) return

        const endCoords = editor.view.coordsAtPos(to)

        const detail: SelectionSnapshot = {
            from,
            to,
            text,
            rect: { top: endCoords.bottom, left: endCoords.left },
        }

        // Paint virtual selection highlight (decoration, focus-independent)
        setVirtualSelection(editor, { from, to })

        editor.view.dom.dispatchEvent(
            new CustomEvent(AI_INLINE_EVENT, { detail })
        )
    }, [editor])

    return (
        <Button
            size="sm"
            variant="ghost"
            className="flex flex-row gap-1 items-center text-purple-500 hover:text-purple-500"
            onMouseDown={handleMouseDown}
        >
            <MessageSquare className="h-4 w-4" />
            Ask AI
        </Button>
    )
}

// ─── Panel (floatingUI — always mounted) ────────────────────────

export const AiInlinePanel: React.FC<{ editor: Editor }> = ({ editor }) => {
    const [open, setOpen] = useState(false)
    const [input, setInput] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [steps, setSteps] = useState<ExecutionStep[]>([])
    const [response, setResponse] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [streamText, setStreamText] = useState<string | null>(null)
    const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

    const selectionRef = useRef<SelectionSnapshot | null>(null)
    const panelRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const stepsRef = useRef<ExecutionStep[]>([])
    const bufferRef = useRef('')
    const rafRef = useRef<number | null>(null)

    // ── register / unregister decoration plugin ──
    useEffect(() => {
        const plugin = createAiSelectionPlugin()
        editor.registerPlugin(plugin)
        return () => {
            // clear decoration before unregistering
            try { setVirtualSelection(editor, null) } catch {}
            editor.unregisterPlugin(aiSelectionKey)
        }
    }, [editor])

    // ── streaming buffer ──
    const flushBuffer = useCallback(() => {
        setStreamText(bufferRef.current)
        rafRef.current = null
    }, [])

    const appendBuffer = useCallback((chunk: string) => {
        bufferRef.current += chunk
        if (rafRef.current === null) {
            rafRef.current = requestAnimationFrame(flushBuffer)
        }
    }, [flushBuffer])

    const resetBuffer = useCallback(() => {
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current)
            rafRef.current = null
        }
        bufferRef.current = ''
        setStreamText(null)
    }, [])

    useEffect(() => {
        return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current) }
    }, [])

    // ── agent callbacks ──
    const handleToolExecution = useCallback((event: ToolExecutionEvent) => {
        if (event.status === 'start') {
            const newStep: ExecutionStep = {
                id: `step-${event.timestamp}-${Math.random().toString(36).substr(2, 9)}`,
                toolName: event.toolName,
                args: event.args,
                status: 'running',
                timestamp: event.timestamp,
            }
            stepsRef.current = [...stepsRef.current, newStep]
            setSteps([...stepsRef.current])
        } else {
            const updatedSteps = stepsRef.current.map((step) => {
                if (step.toolName === event.toolName && step.status === 'running') {
                    return {
                        ...step,
                        result: event.result,
                        status: (event.status === 'success' ? 'success' : 'error') as 'success' | 'error',
                        duration: event.duration,
                    }
                }
                return step
            })
            stepsRef.current = updatedSteps
            setSteps([...updatedSteps])
        }
    }, [])

    const handleUserChoiceRequest = useCallback((request: UserChoiceRequest): Promise<string> => {
        return new Promise((resolve) => {
            if (request.options.length > 0) resolve(request.options[0].id)
        })
    }, [])

    const { stream, stop } = useEditorAgentOptimized(editor, handleToolExecution, handleUserChoiceRequest)

    // ── listen for trigger event ──
    useEffect(() => {
        const dom = editor.view.dom

        const onOpen = (e: Event) => {
            const snap = (e as CustomEvent<SelectionSnapshot>).detail
            selectionRef.current = snap

            const panelWidth = 320
            const vw = window.innerWidth
            const vh = window.innerHeight

            let top = snap.rect.top + 8
            let left = snap.rect.left
            if (left + panelWidth > vw - 16) left = vw - panelWidth - 16
            if (left < 16) left = 16
            if (top + 200 > vh) top = Math.max(16, snap.rect.top - 208)

            setPosition({ top, left })
            setOpen(true)
            setInput('')
            setIsLoading(false)
            setSteps([])
            setResponse(null)
            setError(null)
            stepsRef.current = []
            resetBuffer()

            setTimeout(() => inputRef.current?.focus(), 50)
        }

        dom.addEventListener(AI_INLINE_EVENT, onOpen)
        return () => dom.removeEventListener(AI_INLINE_EVENT, onOpen)
    }, [editor, resetBuffer])

    // ── close ──
    const handleClose = useCallback(() => {
        if (isLoading) stop()
        setOpen(false)
        selectionRef.current = null
        resetBuffer()
        // Clear virtual selection highlight
        try { setVirtualSelection(editor, null) } catch {}
    }, [isLoading, stop, resetBuffer, editor])

    // Escape
    useEffect(() => {
        if (!open) return
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [open, handleClose])

    // Click outside
    useEffect(() => {
        if (!open) return
        const onClick = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                handleClose()
            }
        }
        const timer = setTimeout(() => document.addEventListener('mousedown', onClick), 0)
        return () => {
            clearTimeout(timer)
            document.removeEventListener('mousedown', onClick)
        }
    }, [open, handleClose])

    // ── submit ──
    const handleSubmit = useCallback(async () => {
        if (!input.trim() || isLoading) return

        const selectedText = selectionRef.current?.text || ''
        const prompt = selectedText
            ? `用户选中了以下文本:\n\`\`\`\n${selectedText}\n\`\`\`\n\n用户指令: ${input.trim()}`
            : input.trim()

        setIsLoading(true)
        setError(null)
        setResponse(null)
        stepsRef.current = []
        setSteps([])
        resetBuffer()

        try {
            const { textStream } = await stream({ prompt })
            for await (const part of textStream) {
                appendBuffer(part)
            }
            setResponse(bufferRef.current)
            resetBuffer()
        } catch (err: any) {
            if (err?.name === 'AbortError' || err?.message?.includes('abort')) {
                const content = bufferRef.current
                if (content) setResponse(content)
                resetBuffer()
            } else {
                setError(err?.message || '执行失败，请重试')
                resetBuffer()
            }
        } finally {
            setIsLoading(false)
        }
    }, [input, isLoading, stream, resetBuffer, appendBuffer])

    const handleInputKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit()
            }
            e.stopPropagation()
        },
        [handleSubmit]
    )

    if (!open) return null

    return createPortal(
        <div
            ref={panelRef}
            className="flex flex-col w-[320px] max-h-[60vh] rounded-lg border border-indigo-200/60 dark:border-indigo-800/60 bg-background shadow-xl animate-in fade-in-0 slide-in-from-top-1 duration-150"
            style={{ position: 'fixed', top: position.top, left: position.left, zIndex: 9999 }}
        >
            {/* Header — fixed */}
            <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-border/50 bg-gradient-to-r from-indigo-500/5 to-purple-500/5 rounded-t-lg">
                <div className="flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
                    <span className="text-xs font-medium">Ask AI</span>
                    {selectionRef.current?.text && (
                        <span className="text-[10px] text-muted-foreground truncate max-w-[140px]">
                            — "{selectionRef.current.text.slice(0, 30)}{selectionRef.current.text.length > 30 ? '...' : ''}"
                        </span>
                    )}
                </div>
                <button
                    onClick={handleClose}
                    className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                    <X className="h-3.5 w-3.5" />
                </button>
            </div>

            {/* Input — fixed */}
            <div className="shrink-0 px-3 py-2 border-b border-border/30">
                <div className="flex items-end gap-2">
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleInputKeyDown}
                        placeholder="对选中内容做什么..."
                        disabled={isLoading}
                        rows={2}
                        className="flex-1 resize-none text-sm bg-transparent border-0 outline-none placeholder:text-muted-foreground/50 disabled:opacity-50"
                    />
                    <button
                        onClick={handleSubmit}
                        disabled={!input.trim() || isLoading}
                        className="shrink-0 p-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 text-white disabled:opacity-40 hover:from-indigo-600 hover:to-purple-600 transition-all"
                    >
                        {isLoading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <Send className="h-3.5 w-3.5" />
                        )}
                    </button>
                </div>
            </div>

            {/* Scrollable content area — steps + response + error */}
            <div className="flex-1 min-h-0 overflow-y-auto">
                {/* Steps */}
                {steps.length > 0 && (
                    <div className="px-3 py-2 border-b border-border/30">
                        <div className="space-y-1">
                            {steps.map((step) => (
                                <div key={step.id} className="flex items-center gap-2 text-[11px]">
                                    {step.status === 'running' ? (
                                        <Loader2 className="h-3 w-3 animate-spin text-indigo-500 shrink-0" />
                                    ) : step.status === 'success' ? (
                                        <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                                    ) : (
                                        <XCircle className="h-3 w-3 text-red-500 shrink-0" />
                                    )}
                                    <Badge
                                        variant="outline"
                                        className="text-[10px] px-1.5 py-0 font-mono border-indigo-200/50 dark:border-indigo-800/50"
                                    >
                                        {formatToolName(step.toolName)}
                                    </Badge>
                                    {step.duration && (
                                        <span className="text-[10px] text-muted-foreground">{step.duration}ms</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Streaming / Response */}
                {(streamText || response) && (
                    <div className="px-3 py-2">
                        <div className="text-xs text-foreground/90">
                            <Streamdown isAnimating={!!streamText}>
                                {streamText || response || ''}
                            </Streamdown>
                        </div>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div className="px-3 py-2">
                        <div className="flex items-center gap-2 text-xs text-red-500">
                            <XCircle className="h-3.5 w-3.5 shrink-0" />
                            <span>{error}</span>
                        </div>
                    </div>
                )}
            </div>
        </div>,
        document.body
    )
}
