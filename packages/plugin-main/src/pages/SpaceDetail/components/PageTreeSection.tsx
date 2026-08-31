import React, { useCallback, useMemo, useState } from 'react'
import { Button, Input, TreeView, cn } from '@kn/ui'
import { Plus, MoreHorizontal, Star, Trash2, Package, Link, AppWindow, LocateFixed } from '@kn/icon'
import { type PageTreeNode, useTranslation, PageEditWindow } from '@kn/common'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@kn/ui'
import { SiderMenuItemProps } from '../../../pages/components/SiderMenu'
import { PageItemIcon } from './PageItemIcon'

interface PageTreeSectionProps {
    spaceId: string
    pageTree: PageTreeNode[]
    loading: boolean
    searchValue?: string
    selectedPageId?: string
    onSearchChange: (value: string) => void
    onCreatePage: (parentId?: string) => void
    onMoveToTrash: (pageId: string) => void
    onAddFavorite: (pageId: string) => void
    onPageClick: (pageId: string) => void
    onTreeSelected?: () => void
    className?: string
}

/**
 * Page tree section with hierarchical navigation, search filter,
 * and per-node actions (add subpage, favorite, delete, copy link).
 */
export const PageTreeSection: React.FC<PageTreeSectionProps> = ({
    spaceId,
    pageTree,
    loading,
    searchValue,
    selectedPageId,
    onSearchChange,
    onCreatePage,
    onMoveToTrash,
    onAddFavorite,
    onPageClick,
    onTreeSelected,
    className,
}) => {
    const { t } = useTranslation()
    // Pages currently opened in floating PageEditWindows (multiple windows cascade)
    const [editWindowPageIds, setEditWindowPageIds] = useState<string[]>([])
    // Locate request passed to TreeView; token bump re-triggers expand + scroll
    const [locateTarget, setLocateTarget] = useState<{ id: string; token: number } | null>(null)

    const handleLocateCurrentPage = useCallback(() => {
        if (!selectedPageId) return
        setLocateTarget({ id: selectedPageId, token: Date.now() })
    }, [selectedPageId])

    const openEditWindow = useCallback((pageId: string) => {
        // Ignore if this page's window is already open — the impl handles focus
        setEditWindowPageIds((prev) => prev.includes(pageId) ? prev : [...prev, pageId])
    }, [])

    const closeEditWindow = useCallback((pageId: string) => {
        setEditWindowPageIds((prev) => prev.filter((id) => id !== pageId))
    }, [])

    const handleCopyLink = useCallback((pageId: string) => {
        const url = `${window.location.origin}/space-detail/${spaceId}/page/edit/${pageId}`
        if (typeof window !== 'undefined' && window.navigator?.clipboard) {
            window.navigator.clipboard.writeText(url)
        }
    }, [spaceId])

    const resolve = useCallback((treeNode: PageTreeNode): SiderMenuItemProps => {
        const name = (
            <div className="flex flex-row gap-1 items-center group w-full overflow-hidden text-ellipsis relative">
                <div className="text-left text-ellipsis text-nowrap overflow-hidden flex-1 min-w-0 flex items-center w-full">
                    <PageItemIcon icon={treeNode.icon} className="mr-1.5" />
                    <span className="text-xs sm:text-sm">{treeNode.name || treeNode.title}</span>
                    {treeNode.isDraft && (
                        <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Draft" />
                    )}
                    {treeNode.status === 'PUBLISHED' && (
                        <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" title="Published" />
                    )}
                </div>
                <div className="absolute right-0 left-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-50 bg-muted">
                    <Button
                        size="sm"
                        className="h-5 w-5 sm:h-6 sm:w-6 p-0"
                        variant="ghost"
                        onClick={(e) => {
                            e.stopPropagation()
                            onCreatePage(treeNode.id)
                        }}
                        title="Add subpage"
                    >
                        <Plus className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                    </Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                size="sm"
                                className="h-5 w-5 sm:h-6 sm:w-6 p-0"
                                variant="ghost"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    e.preventDefault()
                                }}
                            >
                                <MoreHorizontal className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent side="right" align="start" className="w-[200px] sm:w-[220px]">
                            <DropdownMenuItem
                                className="flex flex-row gap-2 text-xs sm:text-sm"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onAddFavorite(treeNode.id)
                                }}
                            >
                                <Star className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> {t('favorites.add') || 'Add to favorites'}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                className="flex flex-row gap-2 text-xs sm:text-sm"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    openEditWindow(treeNode.id)
                                }}
                            >
                                <AppWindow className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> {t('page.editInWindow') || 'Edit in window'}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                className="flex flex-row gap-2 text-xs sm:text-sm"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    handleCopyLink(treeNode.id)
                                }}
                            >
                                <Link className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> {t('page.copyLink') || 'Copy link'}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                className="flex flex-row gap-2 text-destructive focus:text-destructive text-xs sm:text-sm"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onMoveToTrash(treeNode.id)
                                }}
                            >
                                <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> {t('page.moveToTrash') || 'Move to trash'}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
        )

        const baseItem: SiderMenuItemProps = {
            icon: null,
            name: name,
            key: treeNode.id,
            id: treeNode.id,
            onClick: () => onPageClick(treeNode.id),
        }

        if (treeNode.children) {
            return {
                ...baseItem,
                children: treeNode.children.map(resolve),
            }
        }

        return baseItem
    }, [spaceId, onCreatePage, onMoveToTrash, onAddFavorite, onPageClick, handleCopyLink, t])

    const elements: SiderMenuItemProps[] = useMemo(() => {
        if (!pageTree || pageTree.length === 0) return []
        return pageTree.map((it) => resolve(it))
    }, [pageTree, resolve])

    return (
        <div className={cn("flex-1 flex flex-col min-h-0", className)}>
            {/* Section Header */}
            <div className="flex items-center gap-1 px-3 py-1.5 flex-shrink-0">
                <div className="flex items-center gap-1.5 text-xs sm:text-sm font-medium text-muted-foreground flex-1">
                    <Package className="h-3.5 w-3.5" />
                    <span>{t('pages.title') || 'Pages'}</span>
                </div>
                <div className="flex items-center gap-0.5">
                    <Input
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="h-5 w-[80px] text-[11px] bg-muted/50 border-0 focus:bg-background focus:border focus:border-border focus:w-[120px] transition-all"
                        placeholder="Filter..."
                    />
                    <Button
                        className="h-5 w-5 p-0"
                        variant="ghost"
                        size="icon"
                        disabled={!selectedPageId}
                        onClick={handleLocateCurrentPage}
                        title={t('pages.locate') || 'Locate current page'}
                    >
                        <LocateFixed className="h-3 w-3" />
                    </Button>
                    <Button
                        className="h-5 w-5 p-0"
                        variant="ghost"
                        size="icon"
                        onClick={() => onCreatePage()}
                        title={t('page.create') || 'New page'}
                    >
                        <Plus className="h-3 w-3" />
                    </Button>
                </div>
            </div>

            {/* Tree */}
            <div className="flex-1 min-h-0 overflow-auto">
                {elements.length > 0 ? (
                    <TreeView
                        initialSelectedId={selectedPageId}
                        loading={loading}
                        size="sm"
                        selectParent={true}
                        className="w-full"
                        elements={elements}
                        locateTarget={locateTarget}
                        onTreeSelected={onTreeSelected}
                    />
                ) : !loading ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                        <Package className="h-6 w-6 text-muted-foreground/50 mb-2" />
                        <p className="text-xs text-muted-foreground mb-2">
                            {t('pages.empty') || 'No pages yet'}
                        </p>
                        <Button size="sm" onClick={() => onCreatePage()} className="h-7 text-xs">
                            <Plus className="h-3 w-3 mr-1" />
                            {t('page.create') || 'Create Page'}
                        </Button>
                    </div>
                ) : null}
            </div>

            {/* Floating page editors opened from the node context menu */}
            {editWindowPageIds.map((pageId) => (
                <PageEditWindow
                    key={pageId}
                    pageId={pageId}
                    onClose={() => closeEditWindow(pageId)}
                />
            ))}
        </div>
    )
}
