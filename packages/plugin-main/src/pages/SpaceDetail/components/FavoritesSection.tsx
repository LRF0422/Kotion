import React, { useState } from 'react'
import { Button, cn, Dialog, DialogContent, DialogHeader, DialogTitle } from '@kn/ui'
import { Star, Trash2, ChevronDown, ChevronRight } from '@kn/icon'
import { useTranslation, useApi } from '@kn/common'
import { APIS } from '../../../api'
import { PageItemIcon } from './PageItemIcon'

interface FavoriteItem {
    id: string
    title: string
    icon?: { type?: string; icon: string }
}

interface FavoritesSectionProps {
    favorites: FavoriteItem[]
    allFavorites?: FavoriteItem[]
    spaceId: string
    onPageClick: (pageId: string) => void
    onRemoveFavorite: (pageId: string) => void
    className?: string
}

/**
 * Favorites section in the sidebar with collapsible list and "View All" dialog.
 */
export const FavoritesSection: React.FC<FavoritesSectionProps> = ({
    favorites,
    spaceId,
    onPageClick,
    onRemoveFavorite,
    className,
}) => {
    const { t } = useTranslation()
    const [collapsed, setCollapsed] = useState(false)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [allFavs, setAllFavs] = useState<FavoriteItem[]>([])
    const [loadingAll, setLoadingAll] = useState(false)

    const handleViewAll = () => {
        setDialogOpen(true)
        setLoadingAll(true)
        useApi(APIS.QUERY_FAVORITE, { scope: spaceId, pageSize: 100 })
            .then((res) => {
                setAllFavs(res.data || [])
            })
            .catch(() => {
                setAllFavs(favorites)
            })
            .finally(() => setLoadingAll(false))
    }

    const handleRemoveInDialog = (id: string) => {
        onRemoveFavorite(id)
        setAllFavs((prev) => prev.filter((f) => f.id !== id))
    }

    return (
        <div className={cn("flex flex-col flex-shrink-0", className)}>
            {/* Section Header */}
            <div className="flex items-center gap-1.5 px-3 py-1.5">
                <button
                    className="flex items-center gap-1.5 text-xs sm:text-sm font-medium text-muted-foreground hover:text-foreground transition-colors flex-1 text-left"
                    onClick={() => setCollapsed(!collapsed)}
                >
                    {collapsed ? (
                        <ChevronRight className="h-3.5 w-3.5" />
                    ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                    )}
                    <Star className="h-3.5 w-3.5" />
                    <span>{t('favorites.title') || 'Favorites'}</span>
                </button>
                {favorites.length > 0 && (
                    <button
                        className="text-[10px] sm:text-xs text-muted-foreground hover:text-foreground transition-colors"
                        onClick={handleViewAll}
                    >
                        {t('favorites.viewAll') || 'View all'}
                    </button>
                )}
            </div>

            {/* Favorites List */}
            {!collapsed && (
                <div className="flex flex-col gap-0.5 px-1">
                    {favorites.length > 0 ? (
                        favorites.map((item) => (
                            <div
                                key={item.id}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs sm:text-sm hover:bg-muted transition-colors cursor-pointer group relative"
                                onClick={() => onPageClick(item.id)}
                            >
                                {item.icon?.icon && (
                                    <PageItemIcon icon={item.icon} />
                                )}
                                <span className="flex-1 truncate">{item.title || 'Untitled'}</span>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity absolute right-1"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onRemoveFavorite(item.id)
                                    }}
                                >
                                    <Trash2 className="h-2.5 w-2.5 text-muted-foreground hover:text-destructive" />
                                </Button>
                            </div>
                        ))
                    ) : (
                        <div className="flex flex-col items-center py-3 text-center">
                            <Star className="h-4 w-4 text-muted-foreground/40 mb-1" />
                            <p className="text-[10px] sm:text-xs text-muted-foreground/60">
                                {t('favorites.empty') || 'Star pages for quick access'}
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* View All Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-md max-h-[70vh]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-sm">
                            <Star className="h-4 w-4" />
                            {t('favorites.allFavorites') || 'All Favorites'}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="overflow-auto max-h-[50vh] -mx-2">
                        {loadingAll ? (
                            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                                Loading...
                            </div>
                        ) : allFavs.length > 0 ? (
                            <div className="flex flex-col gap-0.5">
                                {allFavs.map((item) => (
                                    <div
                                        key={item.id}
                                        className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted transition-colors cursor-pointer group"
                                        onClick={() => {
                                            onPageClick(item.id)
                                            setDialogOpen(false)
                                        }}
                                    >
                                        {item.icon?.icon && (
                                            <PageItemIcon icon={item.icon} size={16} />
                                        )}
                                        <span className="flex-1 text-sm truncate">{item.title || 'Untitled'}</span>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                handleRemoveInDialog(item.id)
                                            }}
                                            title="Remove from favorites"
                                        >
                                            <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center py-8 text-center">
                                <Star className="h-6 w-6 text-muted-foreground/40 mb-2" />
                                <p className="text-sm text-muted-foreground">No favorites yet</p>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
