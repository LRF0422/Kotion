import React, { useEffect, useMemo, useRef, useState } from "react"
import {
    Dialog, DialogContent,
    Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator
} from "@kn/ui"
import { FileText, Plus, FilePlus2, LayoutDashboard, Loader2, AlignLeft } from "@kn/icon"
import { useApi, useTranslation } from "@kn/common"
import { APIS } from "../../../api"

/** A block-level search hit returned by the backend */
interface BlockSearchResult {
    id: string
    type: string
    text: string
    pageId: string | number
    pageTitle?: string
    spaceId?: string | number
    spaceName?: string
}

interface FlatPage {
    id: string
    title: string
    icon?: string
}

interface GlobalSearchDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    spaceId?: string
    pageTree: any[]
    onNavigateToPage: (pageId: string) => void
    onCreatePage: () => void
    onCreateSiblingPage: () => void
    onGoToPersonalSpace: () => void
}

/** Flatten the hutool page tree into a plain list for client-side title matching */
function flattenPageTree(tree: any[], acc: FlatPage[] = []): FlatPage[] {
    for (const node of tree || []) {
        acc.push({
            id: String(node.id),
            title: node.name || node.title || 'Untitled',
            icon: node.icon,
        })
        if (node.children?.length) {
            flattenPageTree(node.children, acc)
        }
    }
    return acc
}

/** Build a short snippet centered on the first keyword occurrence */
function makeSnippet(text: string, keyword: string, radius = 36): string {
    if (!text) return ''
    const idx = text.toLowerCase().indexOf(keyword.toLowerCase())
    if (idx < 0) return text.length > radius * 2 ? text.slice(0, radius * 2) + '…' : text
    const start = Math.max(0, idx - radius)
    const end = Math.min(text.length, idx + keyword.length + radius)
    return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
}

/** Highlight keyword occurrences inside a snippet */
const Highlighted: React.FC<{ text: string; keyword: string }> = ({ text, keyword }) => {
    if (!keyword) return <>{text}</>
    const parts = text.split(new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
    return (
        <>
            {parts.map((part, i) =>
                part.toLowerCase() === keyword.toLowerCase()
                    ? <mark key={i} className="bg-primary/20 text-foreground rounded-[2px] px-0">{part}</mark>
                    : <React.Fragment key={i}>{part}</React.Fragment>
            )}
        </>
    )
}

/**
 * Global search command palette (Ctrl/Cmd+K).
 *
 * - Page titles are matched client-side against the already-loaded page tree.
 * - Block contents are searched server-side via /space/page/block/search (debounced).
 * - With an empty query it falls back to quick actions.
 */
export const GlobalSearchDialog: React.FC<GlobalSearchDialogProps> = ({
    open,
    onOpenChange,
    spaceId,
    pageTree,
    onNavigateToPage,
    onCreatePage,
    onCreateSiblingPage,
    onGoToPersonalSpace,
}) => {
    const { t } = useTranslation()
    const [query, setQuery] = useState('')
    const [blockResults, setBlockResults] = useState<BlockSearchResult[]>([])
    const [searching, setSearching] = useState(false)
    const requestSeq = useRef(0)

    const flatPages = useMemo(() => flattenPageTree(pageTree), [pageTree])

    const pageMatches = useMemo(() => {
        const kw = query.trim().toLowerCase()
        if (!kw) return []
        return flatPages.filter(p => p.title.toLowerCase().includes(kw)).slice(0, 10)
    }, [flatPages, query])

    // Reset state whenever the palette closes
    useEffect(() => {
        if (!open) {
            setQuery('')
            setBlockResults([])
            setSearching(false)
        }
    }, [open])

    // Debounced server-side block content search
    useEffect(() => {
        const kw = query.trim()
        if (!kw || !spaceId) {
            setBlockResults([])
            setSearching(false)
            return
        }
        setSearching(true)
        const seq = ++requestSeq.current
        const timer = setTimeout(() => {
            useApi(APIS.SEARCH_BLOCKS, { keyword: kw, spaceId })
                .then((res) => {
                    if (seq !== requestSeq.current) return
                    const list: BlockSearchResult[] = (res?.data || [])
                        // title blocks duplicate what the page-title match already shows
                        .filter((b: BlockSearchResult) => b.type !== 'title' && b.text)
                    setBlockResults(list.slice(0, 20))
                })
                .catch((err) => {
                    console.error('Block search failed:', err)
                    if (seq === requestSeq.current) setBlockResults([])
                })
                .finally(() => {
                    if (seq === requestSeq.current) setSearching(false)
                })
        }, 250)
        return () => clearTimeout(timer)
    }, [query, spaceId])

    const kw = query.trim()
    const hasQuery = kw.length > 0
    const noResults = hasQuery && !searching && pageMatches.length === 0 && blockResults.length === 0

    const handleSelectPage = (pageId: string) => {
        onNavigateToPage(pageId)
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="overflow-hidden p-0 max-w-xl">
                <Command
                    shouldFilter={false}
                    className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2.5 [&_[cmdk-item]_svg]:h-4 [&_[cmdk-item]_svg]:w-4"
                >
                    <CommandInput
                        placeholder={t('search.placeholder') || 'Search pages and content...'}
                        value={query}
                        onValueChange={setQuery}
                    />
                    <CommandList className="max-h-[420px]">
                        {noResults && (
                            <CommandEmpty>{t('search.empty') || 'No results found.'}</CommandEmpty>
                        )}

                        {/* Page title matches */}
                        {pageMatches.length > 0 && (
                            <CommandGroup heading={t('search.pages') || 'Pages'}>
                                {pageMatches.map(page => (
                                    <CommandItem
                                        key={`page-${page.id}`}
                                        value={`page-${page.id}`}
                                        onSelect={() => handleSelectPage(page.id)}
                                    >
                                        <FileText className="mr-2 shrink-0 text-muted-foreground" />
                                        <span className="truncate">
                                            <Highlighted text={page.title} keyword={kw} />
                                        </span>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        )}

                        {/* Block content matches */}
                        {hasQuery && (searching || blockResults.length > 0) && (
                            <CommandGroup heading={t('search.content') || 'Content'}>
                                {searching && blockResults.length === 0 && (
                                    <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        {t('search.searching') || 'Searching...'}
                                    </div>
                                )}
                                {blockResults.map(block => (
                                    <CommandItem
                                        key={`block-${block.id}`}
                                        value={`block-${block.id}`}
                                        onSelect={() => handleSelectPage(String(block.pageId))}
                                    >
                                        <AlignLeft className="mr-2 mt-0.5 shrink-0 self-start text-muted-foreground" />
                                        <div className="flex min-w-0 flex-col gap-0.5">
                                            <span className="truncate text-sm">
                                                <Highlighted text={makeSnippet(block.text, kw)} keyword={kw} />
                                            </span>
                                            {block.pageTitle && (
                                                <span className="truncate text-xs text-muted-foreground">
                                                    {block.pageTitle}
                                                </span>
                                            )}
                                        </div>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        )}

                        {/* Quick actions (always available; primary content when query is empty) */}
                        {(hasQuery && (pageMatches.length > 0 || blockResults.length > 0)) && <CommandSeparator />}
                        <CommandGroup heading={t('search.quickActions') || 'Quick Actions'}>
                            <CommandItem
                                value="action-create-page"
                                onSelect={() => {
                                    onCreatePage()
                                    onOpenChange(false)
                                }}
                            >
                                <Plus className="mr-2" />
                                <span>{t('page.create') || 'Create Page'}</span>
                            </CommandItem>
                            <CommandItem
                                value="action-create-sibling-page"
                                onSelect={() => {
                                    onCreateSiblingPage()
                                    onOpenChange(false)
                                }}
                            >
                                <FilePlus2 className="mr-2" />
                                <span>{t('page.createSibling') || 'New Sibling Page'}</span>
                            </CommandItem>
                            <CommandItem
                                value="action-personal-space"
                                onSelect={() => {
                                    onGoToPersonalSpace()
                                }}
                            >
                                <LayoutDashboard className="mr-2" />
                                <span>{t('space.personal') || 'Personal Space'}</span>
                            </CommandItem>
                        </CommandGroup>
                    </CommandList>
                </Command>
            </DialogContent>
        </Dialog>
    )
}
