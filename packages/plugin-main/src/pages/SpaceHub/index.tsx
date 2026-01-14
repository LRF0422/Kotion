import { useTranslation } from "@kn/common";
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, Input, Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle, Label, Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton, toast } from "@kn/ui";
import React, { PropsWithChildren, useCallback, useEffect, useMemo, useState } from "react";
import { CardList } from "../components/CardList";
import { EyeIcon, SearchIcon, StarIcon } from "@kn/icon";
import { Space } from "../../model/Space";
import { useApi, useDebounce, useNavigator } from "@kn/core";
import { APIS } from "../../api";



export const SpaceHub: React.FC<PropsWithChildren> = (props) => {

    const { t } = useTranslation()
    const [favorites, setFavorites] = useState<Space[]>([])
    const [spaces, setSpaces] = useState<Space[]>([])
    const [category, setCategory] = useState<string>('All')
    const [searchValue, setSearchValue] = useState<string>()
    const [currentPage, setCurrentPage] = useState<number>(1)
    const [totalPages, setTotalPages] = useState<number>(1)
    const [isLoadingSpaces, setIsLoadingSpaces] = useState<boolean>(false)
    const [isLoadingFavorites, setIsLoadingFavorites] = useState<boolean>(true)
    const [showLoadingSpaces, setShowLoadingSpaces] = useState<boolean>(false)
    const [showLoadingFavorites, setShowLoadingFavorites] = useState<boolean>(true)
    const [dialogOpen, setDialogOpen] = useState<boolean>(false)
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
        setDialogOpen(false)
    }, [navigator])

    // Fetch spaces when filters change
    useEffect(() => {
        if (dialogOpen) {
            fetchSpaces()
        }
    }, [debouncedSearchValue, category, currentPage, dialogOpen, fetchSpaces])

    // Fetch favorites on mount
    useEffect(() => {
        if (dialogOpen) {
            fetchFavorites()
        }
    }, [dialogOpen, fetchFavorites])

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

    return <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>{props.children}</DialogTrigger>
        <DialogContent className="max-w-none w-[70%] overflow-auto">
            <DialogHeader>
                <DialogTitle>{t('space-hub.all-space', 'All Spaces')}</DialogTitle>
                <DialogDescription />
            </DialogHeader>
            <div className="space-y-2">
                <Label className="text-base font-semibold">{t('space-hub.favorites', 'Favorites')}</Label>
                {showLoadingFavorites ? (
                    <div className="grid grid-cols-6 gap-4 h-[250px]">
                        {Array.from({ length: 6 }).map((_, index) => (
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
                            className="h-[250px]"
                            containerClassName="grid-cols-6"
                            config={{
                                cover: 'cover',
                            }}
                            data={favorites}
                            footer={(data) => <div className="text-sm italic text-gray-500 truncate" title={data.name}>
                                {data.name}
                            </div>}
                            onClick={navigateToSpace}
                        />
                    </div>
                ) : (
                    <div className="h-[250px] flex items-center justify-center border border-dashed rounded-lg animate-in fade-in-50 duration-700">
                        <p className="text-sm text-muted-foreground">
                            {t('space-hub.no-favorites', 'No favorite spaces yet')}
                        </p>
                    </div>
                )}
            </div>
            <div className="space-y-2">
                <Label className="text-base font-semibold">{t('space-hub.all-spaces', 'All Spaces')}</Label>
                <div className="flex items-center gap-2">
                    <Input
                        className="h-9 flex-1"
                        icon={<SearchIcon className="h-4 w-4" />}
                        placeholder={t('space-hub.search-placeholder', 'Search spaces...')}
                        value={searchValue || ''}
                        onChange={(e) => setSearchValue(e.target.value)}
                        aria-label={t('space-hub.search-label', 'Search spaces')}
                    />
                    <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger className="h-9 w-[200px]" aria-label={t('space-hub.category-label', 'Filter by category')}>
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
            </div>
            <div className="flex flex-col gap-1 p-1 min-h-[300px]">
                {showLoadingSpaces ? (
                    <div className="space-y-2">
                        {Array.from({ length: 5 }).map((_, index) => (
                            <Skeleton
                                key={index}
                                className="h-16 w-full rounded-md animate-pulse"
                                style={{
                                    animationDelay: `${index * 80}ms`,
                                    animationDuration: '1.5s',
                                    opacity: 1 - index * 0.1
                                }}
                            />
                        ))}
                    </div>
                ) : spaces.length > 0 ? (
                    <div className="animate-in fade-in-50 duration-500 space-y-2">
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
                                        className="hover:bg-muted/50 transition-all duration-200"
                                    >
                                        <ItemMedia variant="image" className="text-[30px]">
                                            {space.icon?.icon || '📄'}
                                        </ItemMedia>
                                        <ItemContent>
                                            <ItemTitle>{space.name}</ItemTitle>
                                            <ItemDescription>
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
                                                    className={`h-4 w-4 ${isFavorite ? 'fill-yellow-400 text-yellow-400' : ''}`}
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
                                                <EyeIcon className="h-4 w-4" />
                                            </Button>
                                        </ItemActions>
                                    </Item>
                                </div>
                            )
                        })}
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-[300px] border border-dashed rounded-lg animate-in fade-in-50 duration-700">
                        <div className="text-center space-y-2 animate-in zoom-in-95 duration-500">
                            <p className="text-sm text-muted-foreground">
                                {searchValue
                                    ? t('space-hub.no-results', 'No spaces found matching your search')
                                    : t('space-hub.no-spaces', 'No spaces available')}
                            </p>
                            {searchValue && (
                                <Button
                                    variant="link"
                                    size="sm"
                                    onClick={() => setSearchValue('')}
                                >
                                    {t('space-hub.clear-search', 'Clear search')}
                                </Button>
                            )}
                        </div>
                    </div>
                )}
            </div>
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
        </DialogContent>
    </Dialog>
}