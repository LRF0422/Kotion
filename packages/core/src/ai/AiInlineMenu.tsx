import React, { useState, useCallback, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Editor, Plugin, PluginKey, Decoration, DecorationSet } from '@kn/editor'
import { Sparkles, Send, X, Loader2, MessageSquare, XCircle } from '@kn/icon'
import { Button, Streamdown } from '@kn/ui'
import { streamKnowledgeText } from '@kn/common'

// ─── shared ─────────────────────────────────────────────────────

interface SelectionSnapshot {
    from: number
    to: number
    text: string
    rect: { top: number; left: number }
}

const AI_INLINE_EVENT = 'ai-inline-open'

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
    const [response, setResponse] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [streamText, setStreamText] = useState<string | null>(null)
    const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

    const selectionRef = useRef<SelectionSnapshot | null>(null)
    const panelRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const abortRef = useRef<AbortController | null>(null)

    // ── register / unregister decoration plugin ──
    useEffect(() => {
        const plugin = createAiSelectionPlugin()
        editor.registerPlugin(plugin)
        return () => {
            // clear decoration before unregistering
            try { setVirtualSelection(editor, null) } catch { }
            editor.unregisterPlugin(aiSelectionKey)
        }
    }, [editor])

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
            setResponse(null)
            setError(null)
            setStreamText(null)

            setTimeout(() => inputRef.current?.focus(), 50)
        }

        dom.addEventListener(AI_INLINE_EVENT, onOpen)
        return () => dom.removeEventListener(AI_INLINE_EVENT, onOpen)
    }, [editor])

    // ── close ──
    const handleClose = useCallback(() => {
        abortRef.current?.abort()
        setOpen(false)
        selectionRef.current = null
        setStreamText(null)
        setResponse(null)
        setError(null)
        // Clear virtual selection highlight
        try { setVirtualSelection(editor, null) } catch { }
    }, [editor])

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
            ? '用户选中了以下文本:\n```\n' + selectedText + '\n```\n\n用户指令: ' + input.trim()
            : input.trim()

        abortRef.current?.abort()
        const ac = new AbortController()
        abortRef.current = ac

        setIsLoading(true)
        setError(null)
        setResponse(null)
        setStreamText('')

        let acc = ''
        try {
            const { textStream } = streamKnowledgeText(prompt, { signal: ac.signal })
            for await (const part of textStream) {
                if (ac.signal.aborted) break
                acc += part
                setStreamText(acc)
            }
            if (!ac.signal.aborted) {
                setResponse(acc)
                setStreamText(null)
            }
        } catch (err: any) {
            if (err?.name === 'AbortError' || err?.message?.includes('abort') || ac.signal.aborted) {
                if (acc) setResponse(acc)
                setStreamText(null)
            } else {
                setError(err?.message || '执行失败，请重试')
                setStreamText(null)
            }
        } finally {
            if (abortRef.current === ac) abortRef.current = null
            setIsLoading(false)
        }
    }, [input, isLoading])

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

            {/* Scrollable content area — streaming / response / error */}
            <div className="flex-1 min-h-0 overflow-y-auto">
                {(streamText || response) && (
                    <div className="px-3 py-2">
                        <div className="text-xs text-foreground/90">
                            <Streamdown isAnimating={!!streamText}>
                                {streamText || response || ''}
                            </Streamdown>
                        </div>
                    </div>
                )}

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
