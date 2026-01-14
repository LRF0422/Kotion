import { useTranslation } from '@kn/common'
import { Empty, ScrollArea, cn, Badge, Separator } from '@kn/ui'
import { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import React, { useState, useEffect } from 'react'
import { List } from '@kn/icon'


export const ToCItem: React.FC<{ item: any, onItemClick: any, index: number, isActive: boolean }> = ({ item, onItemClick, index, isActive }) => {
    // Light and dark mode color variants for different heading levels
    const levelColors = [
        'text-slate-900 dark:text-slate-100',
        'text-slate-700 dark:text-slate-300',
        'text-slate-600 dark:text-slate-400',
        'text-slate-500 dark:text-slate-500',
    ]

    return (
        <div
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
                    "flex items-start gap-2 w-full no-underline",
                    "text-sm leading-relaxed",
                    levelColors[Math.min(item.level - 1, 3)],
                    "hover:text-primary dark:hover:text-primary transition-colors",
                    isActive && "text-primary dark:text-primary font-medium"
                )}
                href={`#${item.id}`}
                onClick={e => onItemClick(e, item)}
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
}

export const ToCEmptyState = () => {

    const { t } = useTranslation()

    return (
        <Empty className=' h-full items-center border-none' title={t('toc.empty', "No Content")} desc='' />
    )
}

export const ToC: React.FC<{ editor: Editor, className?: string, items: any[] }> = ({
    editor,
    className,
    items
}) => {
    const [activeId, setActiveId] = useState<string | null>(null)
    const { t } = useTranslation()

    useEffect(() => {
        const handleScroll = () => {
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
        }

        const editorElement = editor.view.dom.closest('.overflow-auto')
        editorElement?.addEventListener('scroll', handleScroll)
        handleScroll() // Initial check

        return () => {
            editorElement?.removeEventListener('scroll', handleScroll)
        }
    }, [editor, items])

    if (items.length === 0) {
        return <ToCEmptyState />
    }

    const onItemClick = (e: Event, item: any) => {
        e.preventDefault()

        if (editor) {
            const element = editor.view.dom.querySelector(`[data-toc-id="${item.id}"]`)
            const pos = editor.view.posAtDOM(element as Element, 0)

            const tr = editor.view.state.tr
            tr.setSelection(new TextSelection(tr.doc.resolve(pos)))
                .scrollIntoView()
            editor.view.dispatch(tr)
            editor.view.focus()

            window.scrollTo({
                top: element!.getBoundingClientRect().top + window.scrollY - 100,
                behavior: 'smooth',
            })

            setActiveId(item.id)
        }
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
                <div className="space-y-1">
                    {items.map((item: any, i: number) => (
                        <ToCItem
                            onItemClick={onItemClick}
                            key={item.id}
                            item={item}
                            index={i + 1}
                            isActive={activeId === item.id}
                        />
                    ))}
                </div>
            </ScrollArea>
        </div>
    )
}