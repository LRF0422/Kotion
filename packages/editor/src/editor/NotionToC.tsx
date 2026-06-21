import { useTranslation } from '@kn/common'
import { cn, useIsMobile, Button, Input, Sheet, SheetContent, SheetTrigger, SheetTitle } from '@kn/ui'
import { List, Search, X } from '@kn/icon'
import { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import scrollIntoView from 'scroll-into-view-if-needed'
import { ToC, highlightMatch, type TocItem } from './ToC'

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
    const [tickGap, setTickGap] = useState(8)
    const [searchQuery, setSearchQuery] = useState('')
    const rafRef = useRef<number>(0)
    const isMobile = useIsMobile()
    const { t } = useTranslation()

    // Filter the expanded label panel by the search query. The tick strip keeps
    // showing every heading so it stays a faithful overview of the document.
    const filteredItems = useMemo(() => {
        const q = searchQuery.trim().toLowerCase()
        if (!q) return items
        return items.filter(item => item.textContent.toLowerCase().includes(q))
    }, [items, searchQuery])

    // Keep the tick strip inside the viewport: compress the gap between ticks as
    // the heading count grows so a long document never overflows off-screen.
    // Short documents keep the comfortable default spacing.
    useEffect(() => {
        const TICK_HEIGHT = 2 // h-0.5
        const STRIP_PADDING = 32 // py-4 (top + bottom)
        const DEFAULT_GAP = 8 // gap-2
        const compute = () => {
            const n = items.length
            if (n <= 1) {
                setTickGap(DEFAULT_GAP)
                return
            }
            const available = window.innerHeight - offsetTop - STRIP_PADDING
            const gap = (available - n * TICK_HEIGHT) / (n - 1)
            setTickGap(Math.max(0, Math.min(DEFAULT_GAP, gap)))
        }
        compute()
        window.addEventListener('resize', compute)
        return () => window.removeEventListener('resize', compute)
    }, [items.length, offsetTop])

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
            <div
                className="flex flex-col items-end max-h-full overflow-hidden pr-3 pl-12 py-4 transition-opacity duration-200 group-hover:opacity-0 group-hover:pointer-events-none"
                style={{ gap: tickGap }}
            >
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
                    'absolute right-2 top-1/2 -translate-y-1/2 flex flex-col max-h-[70vh]',
                    'min-w-[200px] max-w-[300px] rounded-lg border bg-background shadow-lg',
                    'opacity-0 translate-x-2 pointer-events-none transition-all duration-200',
                    'group-hover:opacity-100 group-hover:translate-x-0 group-hover:pointer-events-auto'
                )}
            >
                <div className="relative shrink-0 p-2 border-b">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <Input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder={t('toc.search.placeholder', 'Search headings...')}
                        aria-label={t('toc.search.placeholder', 'Search headings...')}
                        className="h-8 pl-7 pr-7 text-xs"
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => setSearchQuery('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-accent/60 text-muted-foreground hover:text-foreground transition-colors"
                            aria-label={t('toc.search.clear', 'Clear search')}
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>
                <div className="flex-1 overflow-y-auto py-2">
                    {filteredItems.length === 0 ? (
                        <div className="flex items-center justify-center py-6 px-3 text-xs text-muted-foreground">
                            {t('toc.search.noResults', 'No matching headings')}
                        </div>
                    ) : (
                        filteredItems.map(item => (
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
                                {searchQuery ? highlightMatch(item.textContent, searchQuery) : item.textContent}
                            </a>
                        ))
                    )}
                </div>
            </div>
        </div>
    )
}

NotionToC.displayName = 'NotionToC'
