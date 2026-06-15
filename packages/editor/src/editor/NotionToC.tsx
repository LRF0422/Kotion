import { cn, useIsMobile, Button, Sheet, SheetContent, SheetTrigger, SheetTitle } from '@kn/ui'
import { List } from '@kn/icon'
import { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import scrollIntoView from 'scroll-into-view-if-needed'
import { ToC, type TocItem } from './ToC'

/**
 * Notion-style floating outline.
 *
 * Renders a column of thin tick marks anchored to the right edge of the
 * viewport — one per heading, length scaled by heading level so deeper
 * headings read as indented. The active section's tick is highlighted.
 * Hovering anywhere over the strip fades the ticks out and reveals a
 * compact panel of heading labels; clicking a label scrolls to it.
 */

// Tick length by heading level — shorter = deeper, which reads as indentation.
const tickWidth = (level: number) => Math.max(24 - (Math.min(level, 6) - 1) * 4, 8)

export const NotionToC: React.FC<{ editor: Editor; items: TocItem[]; offsetTop?: number }> = ({
    editor,
    items,
    offsetTop = 80,
}) => {
    const [activeId, setActiveId] = useState<string | null>(null)
    const [mobileOpen, setMobileOpen] = useState(false)
    const rafRef = useRef<number>(0)
    const isMobile = useIsMobile()

    // Track which heading is currently at the top of the viewport.
    useEffect(() => {
        const handleScroll = () => {
            cancelAnimationFrame(rafRef.current)
            rafRef.current = requestAnimationFrame(() => {
                const headings = items
                    .map(item => {
                        const el = editor.view.dom.querySelector(`[data-toc-id="${item.id}"]`)
                        if (!el) return null
                        return { id: item.id, top: el.getBoundingClientRect().top }
                    })
                    .filter(Boolean) as { id: string; top: number }[]

                const current = headings.find(h => h.top > 0 && h.top < 200)
                if (current) {
                    setActiveId(current.id)
                } else {
                    const above = headings.filter(h => h.top <= 0)
                    if (above.length > 0) setActiveId(above[above.length - 1].id)
                    else if (headings.length > 0) setActiveId(headings[0].id)
                }
            })
        }

        const scrollContainer =
            editor.view.dom.closest('#editor-container') ||
            editor.view.dom.closest('.overflow-y-auto') ||
            editor.view.dom.closest('.overflow-auto')
        scrollContainer?.addEventListener('scroll', handleScroll, { passive: true })
        handleScroll()

        return () => {
            cancelAnimationFrame(rafRef.current)
            scrollContainer?.removeEventListener('scroll', handleScroll)
        }
    }, [editor, items])

    const onItemClick = useCallback(
        (e: React.MouseEvent, item: TocItem) => {
            e.preventDefault()
            const element = editor.view.dom.querySelector(`[data-toc-id="${item.id}"]`) as HTMLElement
            if (!element) return

            scrollIntoView(element, {
                behavior: 'smooth',
                scrollMode: 'always',
                block: 'start',
                inline: 'nearest',
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
                setTimeout(() => element.classList.remove('toc-highlight-flash'), 1000)
            }, 300)

            setActiveId(item.id)
        },
        [editor]
    )

    if (items.length === 0) return null

    // Mobile: a floating button opens the full outline in a bottom-anchored
    // sheet. The thin tick strip is a hover affordance, so it has no place on
    // touch devices.
    if (isMobile) {
        return (
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                    <Button
                        variant="outline"
                        size="icon"
                        className="fixed right-4 z-40 h-10 w-10 rounded-full shadow-lg bg-background"
                        style={{ bottom: "calc(5rem + env(safe-area-inset-bottom))" }}
                        aria-label="Table of contents"
                    >
                        <List className="h-4 w-4" />
                    </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[280px] p-0">
                    <SheetTitle className="sr-only">Table of Contents</SheetTitle>
                    <ToC editor={editor} items={items} onNavigate={() => setMobileOpen(false)} />
                </SheetContent>
            </Sheet>
        )
    }

    return (
        <div
            className="group fixed right-0 z-40 flex justify-end"
            style={{ top: offsetTop, height: `calc(100vh - ${offsetTop}px)`, alignItems: 'center' }}
        >
            {/* Collapsed: tick marks. Fade out while the strip is hovered. */}
            <div className="flex flex-col items-end gap-2 pr-3 pl-12 py-4 transition-opacity duration-200 group-hover:opacity-0 group-hover:pointer-events-none">
                {items.map(item => (
                    <div
                        key={item.id}
                        className={cn(
                            'h-0.5 rounded-full transition-all duration-200',
                            activeId === item.id
                                ? 'bg-primary'
                                : 'bg-muted-foreground/30 dark:bg-muted-foreground/40'
                        )}
                        style={{ width: tickWidth(item.level) }}
                    />
                ))}
            </div>

            {/* Expanded: heading labels. Revealed on hover of the strip. */}
            <div
                className={cn(
                    'absolute right-2 top-1/2 -translate-y-1/2 max-h-[70vh] overflow-y-auto',
                    'min-w-[200px] max-w-[300px] rounded-lg border bg-background shadow-lg',
                    'py-2 opacity-0 translate-x-2 pointer-events-none transition-all duration-200',
                    'group-hover:opacity-100 group-hover:translate-x-0 group-hover:pointer-events-auto'
                )}
            >
                {items.map(item => (
                    <a
                        key={item.id}
                        href={`#${item.id}`}
                        onClick={e => onItemClick(e, item)}
                        className={cn(
                            'block truncate px-3 py-1 text-sm no-underline transition-colors cursor-pointer',
                            'hover:bg-accent/60 hover:text-primary',
                            activeId === item.id
                                ? 'text-primary font-medium'
                                : 'text-muted-foreground'
                        )}
                        style={{ paddingLeft: 12 + (Math.min(item.level, 6) - 1) * 12 }}
                        title={item.textContent}
                    >
                        {item.textContent}
                    </a>
                ))}
            </div>
        </div>
    )
}

NotionToC.displayName = 'NotionToC'
