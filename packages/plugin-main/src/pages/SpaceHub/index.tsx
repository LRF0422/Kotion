import { useTranslation } from "@kn/common";
import { Badge, Button, Card, CardContent, Input, Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle, Label, Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton, toast, cn, useIsMobile } from "@kn/ui";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CardList } from "../components/CardList";
import { ArrowLeft, EyeIcon, FolderOpen, Grid3X3, LayoutGrid, List, Plus, SearchIcon, Star, StarIcon, TrendingUp } from "@kn/icon";
import { Space } from "../../model/Space";
import { useApi, useDebounce, useNavigator } from "@kn/core";
import { APIS } from "../../api";
import { CreateSpaceDlg } from "../components/SpaceForm";



export const SpaceHub: React.FC = () => {

    const isMobile = useIsMobile()
    const { t } = useTranslation()
    const [favorites, setFavorites] = useState<Space[]>([])
    const [spaces, setSpaces] = useState<Space[]>([])
    const [totalSpaces, setTotalSpaces] = useState<number>(0)
    const [category, setCategory] = useState<string>('All')
    const [searchValue, setSearchValue] = useState<string>()
    const [currentPage, setCurrentPage] = useState<number>(1)
    const [totalPages, setTotalPages] = useState<number>(1)
    const [isLoadingSpaces, setIsLoadingSpaces] = useState<boolean>(false)
    const [isLoadingFavorites, setIsLoadingFavorites] = useState<boolean>(true)
    const [showLoadingSpaces, setShowLoadingSpaces] = useState<boolean>(false)
    const [showLoadingFavorites, setShowLoadingFavorites] = useState<boolean>(true)
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('list')
    const navigator = useNavigator()

    const debouncedSearchValue = useDebounce(searchValue, {
        wait: 500
    })

    const pageSize = 5

    // Fetch spaces with filters
    const fetchSpaces = useCallback(async () => {
        setIsLoadingSpaces(true)

        // Delay showing loading state to avoid flicker on fast loads
        const loadingTimer = setTimeout(() => {
            setShowLoadingSpaces(true)
        }, 300)

        try {
            const params: any = {
                template: false,
                pageSize,
                current: currentPage,
            }

            if (debouncedSearchValue) {
                params.searchValue = debouncedSearchValue
            }

            if (category !== 'All') {
                params.category = category
            }

            const res = await useApi(APIS.QUERY_SPACE, params)
            setSpaces(res.data.records || [])
            setTotalSpaces(res.data.total || 0)
            setTotalPages(Math.ceil((res.data.total || 0) / pageSize))
        } catch (error) {
            console.error('Failed to fetch spaces:', error)
            toast.error(t('space-hub.fetch-error', 'Failed to load spaces'))
            setSpaces([])
        } finally {
            clearTimeout(loadingTimer)
            setShowLoadingSpaces(false)
            setIsLoadingSpaces(false)
        }
    }, [currentPage, debouncedSearchValue, category, pageSize, t])

    // Fetch favorites
    const fetchFavorites = useCallback(async () => {
        setIsLoadingFavorites(true)

        // Delay showing loading state to avoid flicker on fast loads
        const loadingTimer = setTimeout(() => {
            setShowLoadingFavorites(true)
        }, 300)

        try {
            const res = await useApi(APIS.QUERY_SPACE, {
                template: false,
                favorite: true,
                pageSize: 6
            })
            setFavorites(res.data.records || [])
        } catch (error) {
            console.error('Failed to fetch favorites:', error)
            setFavorites([])
        } finally {
            clearTimeout(loadingTimer)
            setShowLoadingFavorites(false)
            setIsLoadingFavorites(false)
        }
    }, [])

    // Toggle favorite
    const toggleFavorite = useCallback(async (spaceId: string, isFavorite: boolean) => {
        try {
            if (isFavorite) {
                // Remove from favorites - API endpoint might differ
                await useApi(APIS.ADD_SPACE_FAVORITE, { id: spaceId })
            } else {
                await useApi(APIS.ADD_SPACE_FAVORITE, { id: spaceId })
            }

            // Refresh both lists
            await Promise.all([fetchFavorites(), fetchSpaces()])
            toast.success(t('space-hub.favorite-updated', 'Favorite updated'))
        } catch (error) {
            console.error('Failed to toggle favorite:', error)
            toast.error(t('space-hub.favorite-error', 'Failed to update favorite'))
        }
    }, [fetchFavorites, fetchSpaces, t])

    // Navigate to space
    const navigateToSpace = useCallback((space: Space | string) => {
        const spaceId = typeof space === 'string' ? space : space.id
        navigator.go({
            to: `/space-detail/${spaceId}`
        })
    }, [navigator])

    // Fetch spaces when filters change
    useEffect(() => {
        fetchSpaces()
    }, [debouncedSearchValue, category, currentPage, fetchSpaces])

    // Fetch favorites on mount
    useEffect(() => {
        fetchFavorites()
    }, [fetchFavorites])

    // Reset to first page when search or category changes
    useEffect(() => {
        if (currentPage !== 1) {
            setCurrentPage(1)
        }
    }, [debouncedSearchValue, category])

    // Check if space is in favorites
    const isSpaceFavorite = useCallback((spaceId: string) => {
        return favorites.some(fav => fav.id === spaceId)
    }, [favorites])

    // Generate pagination items
    const paginationItems = useMemo(() => {
        const items: (number | 'ellipsis')[] = []
        const maxVisible = 5

        if (totalPages <= maxVisible) {
            for (let i = 1; i <= totalPages; i++) {
                items.push(i)
            }
        } else {
            if (currentPage <= 3) {
                for (let i = 1; i <= 4; i++) {
                    items.push(i)
                }
                items.push('ellipsis')
                items.push(totalPages)
            } else if (currentPage >= totalPages - 2) {
                items.push(1)
                items.push('ellipsis')
                for (let i = totalPages - 3; i <= totalPages; i++) {
                    items.push(i)
                }
            } else {
                items.push(1)
                items.push('ellipsis')
                items.push(currentPage - 1)
                items.push(currentPage)
                items.push(currentPage + 1)
                items.push('ellipsis')
                items.push(totalPages)
            }
        }

        return items
    }, [currentPage, totalPages])

    const handleGoBack = useCallback(() => {
        navigator.go({ to: '/home' })
    }, [navigator])

    const handleRefresh = useCallback(() => {
        fetchSpaces()
        fetchFavorites()
    }, [fetchSpaces, fetchFavorites])

    return (
        <div className={cn(
            "flex justify-center pb-4 pt-2 overflow-auto h-full",
            isMobile && "px-3"
        )}>
            <div className={cn(
                "flex flex-col gap-4 w-full",
                !isMobile && "max-w-[1000px] px-4"
            )}>
                {/* Header Section */}
                <div className="flex flex-col gap-3 relative z-10">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleGoBack}
                                className="h-8 w-8"
                            >
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                            <div>
                                <h1 className="text-xl font-bold">{t('space-hub.all-space', 'All Spaces')}</h1>
                                <p className="text-xs text-muted-foreground">{t('space-hub.subtitle', 'Manage and explore all your knowledge spaces')}</p>
                            </div>
                        </div>
                        <CreateSpaceDlg
                            trigger={
                                <Button size="sm" className="gap-1.5 h-8">
                                    <Plus className="h-3.5 w-3.5" />
                                    {!isMobile && t('space-hub.create-space', 'Create Space')}
                                </Button>
                            }
                            callBack={handleRefresh}
                        />
                    </div>

                    {/* Stats Cards */}
                    <div className={cn(
                        "grid gap-2",
                        isMobile ? "grid-cols-2" : "grid-cols-4"
                    )}>
                        <Card className="border-border/50 bg-card">
                            <CardContent className="p-3 flex items-center gap-2">
                                <div className="p-1.5 rounded-md bg-blue-500/10">
                                    <FolderOpen className="h-4 w-4 text-blue-500" />
                                </div>
                                <div>
                                    <p className="text-lg font-bold leading-none">{totalSpaces}</p>
                                    <p className="text-[10px] text-muted-foreground">{t('space-hub.stat-total', 'Total Spaces')}</p>
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="border-border/50 bg-card">
                            <CardContent className="p-3 flex items-center gap-2">
                                <div className="p-1.5 rounded-md bg-yellow-500/10">
                                    <Star className="h-4 w-4 text-yellow-500" />
                                </div>
                                <div>
                                    <p className="text-lg font-bold leading-none">{favorites.length}</p>
                                    <p className="text-[10px] text-muted-foreground">{t('space-hub.stat-favorites', 'Favorites')}</p>
                                </div>
                            </CardContent>
                        </Card>
                        {!isMobile && (
                            <>
                                <Card className="border-border/50 bg-card">
                                    <CardContent className="p-3 flex items-center gap-2">
                                        <div className="p-1.5 rounded-md bg-green-500/10">
                                            <TrendingUp className="h-4 w-4 text-green-500" />
                                        </div>
                                        <div>
                                            <p className="text-lg font-bold leading-none">{spaces.length}</p>
                                            <p className="text-[10px] text-muted-foreground">{t('space-hub.stat-current', 'Current Page')}</p>
                                        </div>
                                    </CardContent>
                                </Card>
                                <Card className="border-border/50 bg-card">
                                    <CardContent className="p-3 flex items-center gap-2">
                                        <div className="p-1.5 rounded-md bg-purple-500/10">
                                            <LayoutGrid className="h-4 w-4 text-purple-500" />
                                        </div>
                                        <div>
                                            <p className="text-lg font-bold leading-none">{totalPages}</p>
                                            <p className="text-[10px] text-muted-foreground">{t('space-hub.stat-pages', 'Total Pages')}</p>
                                        </div>
                                    </CardContent>
                                </Card>
                            </>
                        )}
                    </div>
                </div>

                {/* Favorites Section */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                            <Star className="h-4 w-4 text-yellow-500" />
                            <Label className="text-sm font-semibold">{t('space-hub.favorites', 'Favorites')}</Label>
                            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{favorites.length}</Badge>
                        </div>
                    </div>
                    {showLoadingFavorites ? (
                        <div className={cn(
                            "grid gap-2",
                            isMobile ? "grid-cols-2 h-[120px]" : "grid-cols-6 h-[140px]"
                        )}>
                            {Array.from({ length: isMobile ? 2 : 6 }).map((_, index) => (
                                <Skeleton
                                    key={index}
                                    className="h-full w-full rounded-lg animate-pulse"
                                    style={{
                                        animationDelay: `${index * 100}ms`,
                                        animationDuration: '1.5s'
                                    }}
                                />
                            ))}
                        </div>
                    ) : favorites.length > 0 ? (
                        <div className="animate-in fade-in-50 duration-500">
                            <CardList
                                className={isMobile ? "h-[100px]" : "h-[140px]"}
                                containerClassName={isMobile ? "grid-cols-2" : "grid-cols-6"}
                                config={{
                                    cover: 'cover',
                                }}
                                data={favorites}
                                footer={(data) => <div className="text-xs italic text-gray-500 truncate" title={data.name}>
                                    {data.name}
                                </div>}
                                onClick={navigateToSpace}
                            />
                        </div>
                    ) : (
                        <div className={cn(
                            "flex flex-col items-center justify-center border border-dashed rounded-lg bg-muted/20 animate-in fade-in-50 duration-700",
                            isMobile ? "h-[80px] gap-1" : "h-[100px] gap-2"
                        )}>
                            <div className="p-2 rounded-full bg-yellow-500/10">
                                <Star className="h-4 w-4 text-yellow-500" />
                            </div>
                            <div className="text-center">
                                <p className="text-xs font-medium text-muted-foreground">
                                    {t('space-hub.no-favorites', 'No favorite spaces yet')}
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* All Spaces Section */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                            <FolderOpen className="h-4 w-4 text-blue-500" />
                            <Label className="text-sm font-semibold">{t('space-hub.all-spaces', 'All Spaces')}</Label>
                            <Badge variant="outline" className="text-[10px] h-4 px-1.5">{totalSpaces}</Badge>
                        </div>
                        {!isMobile && (
                            <div className="flex items-center gap-0.5 border rounded-md p-0.5">
                                <Button
                                    variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                                    size="sm"
                                    className="h-6 w-6 p-0"
                                    onClick={() => setViewMode('list')}
                                >
                                    <List className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                    variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                                    size="sm"
                                    className="h-6 w-6 p-0"
                                    onClick={() => setViewMode('grid')}
                                >
                                    <Grid3X3 className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Search and Filter Bar */}
                    <div className={cn(
                        "flex gap-2 p-2 rounded-md bg-muted/30 border",
                        isMobile ? "flex-col" : "items-center"
                    )}>
                        <Input
                            className="h-9 flex-1"
                            icon={<SearchIcon className="h-4 w-4" />}
                            placeholder={t('space-hub.search-placeholder', 'Search spaces...')}
                            value={searchValue || ''}
                            onChange={(e) => setSearchValue(e.target.value)}
                            aria-label={t('space-hub.search-label', 'Search spaces')}
                        />
                        <Select value={category} onValueChange={setCategory}>
                            <SelectTrigger className={cn(
                                "h-9",
                                isMobile ? "w-full" : "w-[200px]"
                            )} aria-label={t('space-hub.category-label', 'Filter by category')}>
                                <SelectValue placeholder={t('space-hub.category-placeholder', 'Category')} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="All">{t('space-hub.category-all', 'All')}</SelectItem>
                                <SelectItem value="APP">{t('space-hub.category-app', 'App')}</SelectItem>
                                <SelectItem value="FEATURE">{t('space-hub.category-feature', 'Feature')}</SelectItem>
                                <SelectItem value="CONNECTOR">{t('space-hub.category-connector', 'Connector')}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Spaces List/Grid */}
                    <div className={cn(
                        "flex flex-col gap-1.5",
                        isMobile ? "min-h-[180px]" : "min-h-[280px]"
                    )}>
                        {showLoadingSpaces ? (
                            <div className="space-y-1.5">
                                {Array.from({ length: 5 }).map((_, index) => (
                                    <Skeleton
                                        key={index}
                                        className="h-12 w-full rounded-md animate-pulse"
                                        style={{
                                            animationDelay: `${index * 80}ms`,
                                            animationDuration: '1.5s',
                                            opacity: 1 - index * 0.1
                                        }}
                                    />
                                ))}
                            </div>
                        ) : spaces.length > 0 ? (
                            viewMode === 'grid' && !isMobile ? (
                                <div className="grid grid-cols-3 gap-2 animate-in fade-in-50 duration-500">
                                    {spaces.map((space, index) => {
                                        const isFavorite = isSpaceFavorite(space.id)
                                        return (
                                            <Card
                                                key={space.id}
                                                className="group cursor-pointer hover:shadow-sm transition-all duration-200 animate-in slide-in-from-bottom-2 fade-in-50"
                                                style={{
                                                    animationDelay: `${index * 50}ms`,
                                                    animationDuration: '400ms',
                                                    animationFillMode: 'backwards'
                                                }}
                                                onClick={() => navigateToSpace(space.id)}
                                            >
                                                <CardContent className="p-3">
                                                    <div className="flex items-start justify-between mb-2">
                                                        <div className="text-2xl">{space.icon?.icon || '📄'}</div>
                                                        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <Button
                                                                size="icon"
                                                                variant="ghost"
                                                                className="w-6 h-6"
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    toggleFavorite(space.id, isFavorite)
                                                                }}
                                                            >
                                                                <StarIcon className={`h-3.5 w-3.5 ${isFavorite ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                    <h3 className="text-sm font-semibold truncate mb-0.5">{space.name}</h3>
                                                    <p className="text-xs text-muted-foreground line-clamp-1">
                                                        {space.description || t('space-hub.no-description', 'No description')}
                                                    </p>
                                                </CardContent>
                                            </Card>
                                        )
                                    })}
                                </div>
                            ) : (
                                <div className="animate-in fade-in-50 duration-500 space-y-1.5">
                                    {spaces.map((space, index) => {
                                        const isFavorite = isSpaceFavorite(space.id)
                                        return (
                                            <div
                                                key={space.id}
                                                className="animate-in slide-in-from-bottom-2 fade-in-50"
                                                style={{
                                                    animationDelay: `${index * 50}ms`,
                                                    animationDuration: '400ms',
                                                    animationFillMode: 'backwards'
                                                }}
                                            >
                                                <Item
                                                    variant="outline"
                                                    size="sm"
                                                    className="hover:bg-muted/50 hover:shadow-sm transition-all duration-200 cursor-pointer py-2"
                                                    onClick={() => navigateToSpace(space.id)}
                                                >
                                                    <ItemMedia variant="image" className="text-[24px]">
                                                        {space.icon?.icon || '📄'}
                                                    </ItemMedia>
                                                    <ItemContent>
                                                        <ItemTitle className="text-sm font-semibold">{space.name}</ItemTitle>
                                                        <ItemDescription className="text-xs line-clamp-1">
                                                            {space.description || t('space-hub.no-description', 'No description')}
                                                        </ItemDescription>
                                                    </ItemContent>
                                                    <ItemActions>
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className="w-7 h-7"
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                toggleFavorite(space.id, isFavorite)
                                                            }}
                                                            aria-label={isFavorite ? t('space-hub.remove-favorite', 'Remove from favorites') : t('space-hub.add-favorite', 'Add to favorites')}
                                                        >
                                                            <StarIcon
                                                                className={`h-3.5 w-3.5 ${isFavorite ? 'fill-yellow-400 text-yellow-400' : ''}`}
                                                            />
                                                        </Button>
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className="w-7 h-7"
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                navigateToSpace(space.id)
                                                            }}
                                                            aria-label={t('space-hub.view-space', 'View space')}
                                                        >
                                                            <EyeIcon className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </ItemActions>
                                                </Item>
                                            </div>
                                        )
                                    })}
                                </div>
                            )
                        ) : (
                            <div className={cn(
                                "flex flex-col items-center justify-center border border-dashed rounded-lg bg-muted/20 animate-in fade-in-50 duration-700",
                                isMobile ? "h-[150px] gap-2" : "h-[200px] gap-3"
                            )}>
                                <div className="p-3 rounded-full bg-muted">
                                    <FolderOpen className="h-6 w-6 text-muted-foreground" />
                                </div>
                                <div className="text-center space-y-1 animate-in zoom-in-95 duration-500">
                                    <p className="text-sm font-medium text-muted-foreground">
                                        {searchValue
                                            ? t('space-hub.no-results', 'No spaces found matching your search')
                                            : t('space-hub.no-spaces', 'No spaces available')}
                                    </p>
                                    <p className="text-xs text-muted-foreground/70">
                                        {searchValue
                                            ? t('space-hub.try-different', 'Try a different search term')
                                            : t('space-hub.create-first', 'Create your first space to get started')}
                                    </p>
                                    {searchValue ? (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setSearchValue('')}
                                            className="mt-1 h-7 text-xs"
                                        >
                                            {t('space-hub.clear-search', 'Clear search')}
                                        </Button>
                                    ) : (
                                        <CreateSpaceDlg
                                            trigger={
                                                <Button size="sm" className="mt-1 gap-1.5 h-7 text-xs">
                                                    <Plus className="h-3 w-3" />
                                                    {t('space-hub.create-space', 'Create Space')}
                                                </Button>
                                            }
                                            callBack={handleRefresh}
                                        />
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Pagination */}
                    {!isLoadingSpaces && spaces.length > 0 && totalPages > 1 && (
                        <Pagination>
                            <PaginationContent>
                                <PaginationItem>
                                    <PaginationPrevious
                                        size="sm"
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                                        aria-disabled={currentPage === 1}
                                    />
                                </PaginationItem>
                                {paginationItems.map((item, index) => (
                                    <PaginationItem key={index}>
                                        {item === 'ellipsis' ? (
                                            <PaginationEllipsis />
                                        ) : (
                                            <PaginationLink
                                                size="sm"
                                                onClick={() => setCurrentPage(item as number)}
                                                isActive={currentPage === item}
                                                className="cursor-pointer"
                                                aria-label={`${t('space-hub.goto-page', 'Go to page')} ${item}`}
                                            >
                                                {item}
                                            </PaginationLink>
                                        )}
                                    </PaginationItem>
                                ))}
                                <PaginationItem>
                                    <PaginationNext
                                        size="sm"
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                                        aria-disabled={currentPage === totalPages}
                                    />
                                </PaginationItem>
                            </PaginationContent>
                        </Pagination>
                    )}
                </div>
            </div>
        </div>
    )
}