import { useTranslation } from '@kn/common'
import { Empty, ScrollArea, cn, Badge } from '@kn/ui'
import { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import React, { useState, useEffect, useCallback, useRef, memo } from 'react'
import { List } from '@kn/icon'
import scrollIntoView from 'scroll-into-view-if-needed'

export interface TocItem {
    id: string
    level: number
    itemIndex: string
    textContent: string
    isActive?: boolean
    isScrolledOver?: boolean
}

export const ToCItem: React.FC<{ item: TocItem; onItemClick: (e: React.MouseEvent, item: TocItem) => void; isActive: boolean; focusedIndex: number; index: number; onKeyDown: (e: React.KeyboardEvent, index: number) => void }> = memo(({ item, onItemClick, isActive, focusedIndex, index, onKeyDown }) => {
    const levelColors = [
        'text-slate-900 dark:text-slate-100',
        'text-slate-700 dark:text-slate-300',
        'text-slate-600 dark:text-slate-400',
        'text-slate-500 dark:text-slate-500',
    ]

    return (
        <div
            role="treeitem"
            aria-selected={isActive}
            className={cn(
                "group relative rounded-md transition-all duration-200 cursor-pointer",
                "hover:bg-accent/50 dark:hover:bg-accent/30",
                isActive && "bg-accent/70 dark:bg-accent/50 shadow-sm"
            )}
            style={{
                paddingLeft: `${Math.min(item.level - 1, 3) * 12 + 8}px`,
                paddingRight: '8px',
                paddingTop: '6px',
                paddingBottom: '6px',
                marginBottom: '2px'
            }}
        >
            <a
                className={cn(
                    "flex items-start gap-2 w-full no-underline outline-none",
                    "text-sm leading-relaxed",
                    levelColors[Math.min(item.level - 1, 3)],
                    "hover:text-primary dark:hover:text-primary transition-colors",
                    "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 rounded",
                    isActive && "text-primary dark:text-primary font-medium"
                )}
                href={`#${item.id}`}
                onClick={e => onItemClick(e, item)}
                onKeyDown={e => onKeyDown(e, index)}
                tabIndex={focusedIndex === index ? 0 : -1}
            >
                <span className="text-xs opacity-60 dark:opacity-50 min-w-[24px] font-mono">
                    {item.itemIndex}.
                </span>
                <span className="flex-1 overflow-hidden text-ellipsis">
                    {item.textContent}
                </span>
            </a>
            {isActive && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary dark:bg-primary rounded-r shadow-sm" />
            )}
        </div>
    )
})

ToCItem.displayName = 'ToCItem'

export const ToCEmptyState = () => {

    const { t } = useTranslation()

    return (
        <Empty className=' h-full items-center border-none' title={t('toc.empty', "No Content")} desc='' />
    )
}

export const ToC: React.FC<{ editor: Editor; className?: string; items: TocItem[] }> = ({
    editor,
    className,
    items
}) => {
    const [activeId, setActiveId] = useState<string | null>(null)
    const { t } = useTranslation()
    const rafRef = useRef<number>(0)
    const [focusedIndex, setFocusedIndex] = useState<number>(-1)

    useEffect(() => {
        const handleScroll = () => {
            cancelAnimationFrame(rafRef.current)
            rafRef.current = requestAnimationFrame(() => {
                const headings = items.map(item => {
                    const element = editor.view.dom.querySelector(`[data-toc-id="${item.id}"]`)
                    if (element) {
                        const rect = element.getBoundingClientRect()
                        return { id: item.id, top: rect.top }
                    }
                    return null
                }).filter(Boolean)

                // Find the heading closest to the top of the viewport
                const current = headings.find(h => h!.top > 0 && h!.top < 200)
                if (current) {
                    setActiveId(current.id)
                } else if (headings.length > 0) {
                    // If no heading is in the ideal zone, use the last one above viewport
                    const above = headings.filter(h => h!.top <= 0)
                    if (above.length > 0) {
                        setActiveId(above[above.length - 1]!.id)
                    }
                }
            })
        }

        const editorElement = editor.view.dom.closest('.overflow-auto')
        editorElement?.addEventListener('scroll', handleScroll, { passive: true })
        handleScroll() // Initial check

        return () => {
            cancelAnimationFrame(rafRef.current)
            editorElement?.removeEventListener('scroll', handleScroll)
        }
    }, [editor, items])

    const onItemClick = useCallback((e: React.MouseEvent, item: TocItem) => {
        e.preventDefault()

        if (editor) {
            const element = editor.view.dom.querySelector(`[data-toc-id="${item.id}"]`) as HTMLElement
            if (!element) return

            scrollIntoView(element, {
                behavior: 'smooth',
                scrollMode: 'always',
                block: 'start',
                inline: 'nearest'
            })

            setTimeout(() => {
                const pos = editor.view.posAtDOM(element, 0)
                const tr = editor.view.state.tr
                tr.setSelection(new TextSelection(tr.doc.resolve(pos)))
                editor.view.dispatch(tr)
                editor.view.focus()

                element.classList.remove('toc-highlight-flash')
                void element.offsetWidth
                element.classList.add('toc-highlight-flash')

                setTimeout(() => {
                    element.classList.remove('toc-highlight-flash')
                }, 1000)
            }, 300)

            setActiveId(item.id)
        }
    }, [editor])

    const onItemKeyDown = useCallback((e: React.KeyboardEvent, index: number) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            const next = Math.min(index + 1, items.length - 1)
            setFocusedIndex(next)
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            const prev = Math.max(index - 1, 0)
            setFocusedIndex(prev)
        } else if (e.key === 'Enter') {
            e.preventDefault()
            const item = items[index]
            if (item) onItemClick(e as unknown as React.MouseEvent, item)
        } else if (e.key === 'Home') {
            e.preventDefault()
            setFocusedIndex(0)
        } else if (e.key === 'End') {
            e.preventDefault()
            setFocusedIndex(items.length - 1)
        }
    }, [items, onItemClick])

    if (items.length === 0) {
        return <ToCEmptyState />
    }

    return (
        <div className={cn("h-full w-full flex flex-col bg-background dark:bg-background", className)}>
            <div className="sticky top-0 bg-background/95 dark:bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 dark:supports-[backdrop-filter]:bg-background/60 z-10 border-b dark:border-border px-4 py-3 shadow-sm">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-primary/10 dark:bg-primary/20">
                        <List className="h-4 w-4 text-primary dark:text-primary" />
                    </div>
                    <h3 className="font-semibold text-sm text-foreground dark:text-foreground">{t("toc.title", "Table of Contents")}</h3>
                </div>
                <Badge variant="secondary" className="mt-2 text-xs bg-muted dark:bg-muted hover:bg-muted/80 dark:hover:bg-muted/80 text-foreground dark:text-foreground">
                    {items.length} {items.length === 1 ? 'section' : 'sections'}
                </Badge>
            </div>
            <ScrollArea className="flex-1 px-3 py-2 bg-background dark:bg-background">
                <div role="tree" className="space-y-1">
                    {items.map((item, index) => (
                        <ToCItem
                            onItemClick={onItemClick}
                            onKeyDown={onItemKeyDown}
                            key={item.id}
                            item={item}
                            index={index}
                            focusedIndex={focusedIndex}
                            isActive={activeId === item.id}
                        />
                    ))}
                </div>
            </ScrollArea>
        </div>
    )
}