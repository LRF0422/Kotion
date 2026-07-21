import { useTranslation } from "@kn/common";
import {
    Button, Input, Pagination, PaginationContent, PaginationEllipsis, PaginationItem,
    PaginationLink, PaginationNext, PaginationPrevious, Select, SelectContent, SelectItem,
    SelectTrigger, SelectValue, Skeleton, toast, cn, useIsMobile,
    Tabs, TabsContent, TabsList, TabsTrigger
} from "@kn/ui";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Box, Crown, EyeIcon, FolderOpen, Globe, Grid3X3, List, Plus, SearchIcon, Star, Users } from "@kn/icon";
import { Space } from "../../model/Space";
import { GlobalState, useApi, useDebounce, useNavigator, useSelector, useUploadFile } from "@kn/common";
import { APIS } from "../../api";
import { CreateSpaceDlg } from "../components/SpaceForm";
import { useLocation } from "react-router-dom";


// Deterministic color per space id — same palette/approach as the Home page so
// the two surfaces feel like one product. Used for icon chips and, when a space
// has no cover, a soft gradient banner fallback.
const HUE_PALETTE = [245, 262, 290, 330, 350, 25, 40, 150, 168, 190, 215]

const pickHue = (key?: string): number => {
    if (!key) return HUE_PALETTE[0]
    let hash = 0
    for (let i = 0; i < key.length; i++) {
        hash = (hash * 31 + key.charCodeAt(i)) | 0
    }
    return HUE_PALETTE[Math.abs(hash) % HUE_PALETTE.length]
}

// Solid base (bg-card class) + a translucent hue layer painted on top, so the
// chip reads as tinted but stays fully opaque even when it overlaps a cover image.
const chipStyle = (hue: number): React.CSSProperties => ({
    backgroundImage: `linear-gradient(hsl(${hue} 70% 55% / 0.16), hsl(${hue} 70% 55% / 0.16))`,
    color: `hsl(${hue} 60% 48%)`,
})

const bannerStyle = (hue: number): React.CSSProperties => ({
    backgroundImage: `linear-gradient(135deg, hsl(${hue} 70% 60% / 0.28), hsl(${(hue + 40) % 360} 70% 55% / 0.12))`,
})

// Small role badge distinguishing spaces the current user owns from ones they joined.
const RoleBadge: React.FC<{ owned: boolean; ownedLabel: string; joinedLabel: string }> = ({ owned, ownedLabel, joinedLabel }) => (
    <span
        className={cn(
            "inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none",
            owned
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                : "bg-muted text-muted-foreground"
        )}
    >
        {owned && <Crown className="h-2.5 w-2.5" />}
        {owned ? ownedLabel : joinedLabel}
    </span>
)


interface SpaceCardProps {
    space: Space
    favorite: boolean
    index: number
    cover?: string
    owned: boolean
    onOpen: (id: string) => void
    onToggleFavorite: (id: string, favorite: boolean) => void
    noDescription: string
    favoriteLabel: string
    ownedLabel: string
    joinedLabel: string
    publicLabel: string
}

// Gallery-style card: cover (or hue gradient) banner with the icon chip tucked
// over its lower edge, then name + description. Star toggle reveals on hover.
const SpaceCard: React.FC<SpaceCardProps> = ({
    space, favorite, index, cover, owned, onOpen, onToggleFavorite, noDescription, favoriteLabel, ownedLabel, joinedLabel, publicLabel
}) => {
    const hue = pickHue(space.id)
    return (
        <div
            role="button"
            tabIndex={0}
            onClick={() => onOpen(space.id)}
            onKeyDown={(e) => { if (e.key === "Enter") onOpen(space.id) }}
            className={cn(
                "space-fade-up group relative flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card text-left",
                "cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-border"
            )}
            style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
        >
            <div
                className="h-20 w-full bg-cover bg-center"
                style={cover ? { backgroundImage: `url('${cover}')` } : bannerStyle(hue)}
            >
                <Button
                    size="icon"
                    variant="secondary"
                    className={cn(
                        "absolute right-2 top-2 h-7 w-7 rounded-full shadow-sm backdrop-blur transition-opacity",
                        favorite ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    )}
                    aria-label={favoriteLabel}
                    onClick={(e) => { e.stopPropagation(); onToggleFavorite(space.id, favorite) }}
                >
                    <Star className={cn("h-3.5 w-3.5", favorite && "fill-amber-400 text-amber-400")} />
                </Button>
            </div>
            <div className="relative px-3 pb-3">
                <span
                    className="absolute -top-5 flex h-10 w-10 items-center justify-center rounded-lg bg-card text-xl leading-none ring-2 ring-card"
                    style={chipStyle(hue)}
                >
                    {space.icon?.icon || <Box className="h-5 w-5" />}
                </span>
                <p className="mt-7 truncate text-sm font-semibold">{space.name}</p>
                <div className="mt-1 flex items-center gap-1">
                    <RoleBadge owned={owned} ownedLabel={ownedLabel} joinedLabel={joinedLabel} />
                    {space.visibility === 'PUBLIC' && (
                        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium leading-none text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
                            <Globe className="h-2.5 w-2.5" />
                            {publicLabel}
                        </span>
                    )}
                </div>
                <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                    {space.description || noDescription}
                </p>
            </div>
        </div>
    )
}


interface SpaceRowProps {
    space: Space
    favorite: boolean
    owned: boolean
    onOpen: (id: string) => void
    onToggleFavorite: (id: string, favorite: boolean) => void
    noDescription: string
    favoriteLabel: string
    viewLabel: string
    ownedLabel: string
    joinedLabel: string
    publicLabel: string
}

// Compact list row used by the "list" view mode.
const SpaceRow: React.FC<SpaceRowProps> = ({
    space, favorite, owned, onOpen, onToggleFavorite, noDescription, favoriteLabel, viewLabel, ownedLabel, joinedLabel, publicLabel
}) => {
    const hue = pickHue(space.id)
    return (
        <div
            role="button"
            tabIndex={0}
            onClick={() => onOpen(space.id)}
            onKeyDown={(e) => { if (e.key === "Enter") onOpen(space.id) }}
            className="space-fade-up group flex items-center gap-3 rounded-lg border border-border/60 bg-card px-3 py-2.5 cursor-pointer transition-colors duration-150 hover:bg-muted/50"
        >
            <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-card text-lg leading-none"
                style={chipStyle(hue)}
            >
                {space.icon?.icon || <Box className="h-4 w-4" />}
            </span>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-medium">{space.name}</p>
                    <RoleBadge owned={owned} ownedLabel={ownedLabel} joinedLabel={joinedLabel} />
                    {space.visibility === 'PUBLIC' && (
                        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium leading-none text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
                            <Globe className="h-2.5 w-2.5" />
                            {publicLabel}
                        </span>
                    )}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                    {space.description || noDescription}
                </p>
            </div>
            <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                <Button
                    size="icon" variant="ghost" className="h-7 w-7"
                    aria-label={favoriteLabel}
                    onClick={(e) => { e.stopPropagation(); onToggleFavorite(space.id, favorite) }}
                >
                    <Star className={cn("h-3.5 w-3.5", favorite && "fill-amber-400 text-amber-400")} />
                </Button>
                <Button
                    size="icon" variant="ghost" className="h-7 w-7"
                    aria-label={viewLabel}
                    onClick={(e) => { e.stopPropagation(); onOpen(space.id) }}
                >
                    <EyeIcon className="h-3.5 w-3.5" />
                </Button>
            </div>
        </div>
    )
}


export const SpaceHub: React.FC = () => {

    const isMobile = useIsMobile()
    const { t } = useTranslation()
    const navigator = useNavigator()
    const { usePath } = useUploadFile()
    const location = useLocation()
    const { userInfo } = useSelector((state: GlobalState) => state)

    // Read initial tab from URL query parameter (?tab=team)
    const initialTab = useMemo(() => {
        const params = new URLSearchParams(location.search)
        return params.get('tab') || 'all'
    }, [])

    const [favorites, setFavorites] = useState<Space[]>([])
    const [spaces, setSpaces] = useState<Space[]>([])
    const [totalSpaces, setTotalSpaces] = useState<number>(0)
    const [category, setCategory] = useState<string>('All')
    const [spaceTab, setSpaceTab] = useState<string>(initialTab)
    const [searchValue, setSearchValue] = useState<string>('')
    const [currentPage, setCurrentPage] = useState<number>(1)
    const [totalPages, setTotalPages] = useState<number>(1)
    const [isLoadingSpaces, setIsLoadingSpaces] = useState<boolean>(true)
    const [showLoadingSpaces, setShowLoadingSpaces] = useState<boolean>(true)
    const [showLoadingFavorites, setShowLoadingFavorites] = useState<boolean>(true)
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

    const debouncedSearchValue = useDebounce(searchValue, { wait: 500 })
    const pageSize = 12

    const noDescription = t('space-hub.no-description', 'No description')
    const favoriteLabel = t('space-hub.toggle-favorite', 'Toggle favorite')
    const viewLabel = t('space-hub.view-space', 'View space')
    const ownedLabel = t('space-hub.badge-owned', 'Owned')
    const joinedLabel = t('space-hub.badge-joined', 'Joined')
    const publicLabel = t('space-hub.badge-public', 'Public')

    // Whether the current user owns the space (vs. joined as a member/guest)
    const isOwned = useCallback((space: Space) =>
        !!userInfo?.id && space.userId != null && String(space.userId) === String(userInfo.id),
        [userInfo?.id])

    // Fetch the paginated, filtered list of spaces.
    const fetchSpaces = useCallback(async () => {
        setIsLoadingSpaces(true)
        // Delay the skeleton slightly so fast loads don't flash it.
        const loadingTimer = setTimeout(() => setShowLoadingSpaces(true), 250)
        try {
            const params: any = { template: false, pageSize, current: currentPage }
            if (debouncedSearchValue) params.searchValue = debouncedSearchValue
            if (category !== 'All') params.category = category
            // Filter by type based on selected tab
            if (spaceTab === 'team') params.type = 'COLLABORATION'
            else if (spaceTab === 'normal') params.type = 'SPACE'

            const res = await useApi(APIS.QUERY_SPACE, params)
            const total = res.data.total || 0
            setSpaces(res.data.records || [])
            setTotalSpaces(total)
            setTotalPages(Math.max(1, Math.ceil(total / pageSize)))
        } catch (error) {
            console.error('Failed to fetch spaces:', error)
            toast.error(t('space-hub.fetch-error', 'Failed to load spaces'))
            setSpaces([])
        } finally {
            clearTimeout(loadingTimer)
            setShowLoadingSpaces(false)
            setIsLoadingSpaces(false)
        }
    }, [currentPage, debouncedSearchValue, category, spaceTab, t])

    // Fetch the favorite spaces shown in the pinned section.
    const fetchFavorites = useCallback(async () => {
        const loadingTimer = setTimeout(() => setShowLoadingFavorites(true), 250)
        try {
            const res = await useApi(APIS.QUERY_SPACE, { template: false, favorite: true, pageSize: 8 })
            setFavorites(res.data.records || [])
        } catch (error) {
            console.error('Failed to fetch favorites:', error)
            setFavorites([])
        } finally {
            clearTimeout(loadingTimer)
            setShowLoadingFavorites(false)
        }
    }, [])

    const toggleFavorite = useCallback(async (spaceId: string) => {
        try {
            await useApi(APIS.ADD_SPACE_FAVORITE, { id: spaceId })
            await Promise.all([fetchFavorites(), fetchSpaces()])
            toast.success(t('space-hub.favorite-updated', 'Favorite updated'))
        } catch (error) {
            console.error('Failed to toggle favorite:', error)
            toast.error(t('space-hub.favorite-error', 'Failed to update favorite'))
        }
    }, [fetchFavorites, fetchSpaces, t])

    const navigateToSpace = useCallback((spaceId: string) => {
        navigator.go({ to: `/space-detail/${spaceId}` })
    }, [navigator])

    const handleGoBack = useCallback(() => navigator.go({ to: '/home' }), [navigator])

    const handleRefresh = useCallback(() => {
        fetchSpaces()
        fetchFavorites()
    }, [fetchSpaces, fetchFavorites])

    useEffect(() => { fetchSpaces() }, [fetchSpaces])
    useEffect(() => { fetchFavorites() }, [fetchFavorites])

    // Reset to page 1 whenever the search term or category or tab changes.
    useEffect(() => {
        setCurrentPage(1)
    }, [debouncedSearchValue, category, spaceTab])

    const favoriteIds = useMemo(() => new Set(favorites.map(f => f.id)), [favorites])
    const isFavorite = useCallback((space: Space) => favoriteIds.has(space.id), [favoriteIds])

    const coverOf = useCallback((space: Space) => (space.cover ? usePath(space.cover) : undefined), [usePath])

    // Page numbers with ellipsis collapsing for long ranges.
    const paginationItems = useMemo(() => {
        const items: (number | 'ellipsis')[] = []
        const maxVisible = 5
        if (totalPages <= maxVisible) {
            for (let i = 1; i <= totalPages; i++) items.push(i)
        } else if (currentPage <= 3) {
            items.push(1, 2, 3, 4, 'ellipsis', totalPages)
        } else if (currentPage >= totalPages - 2) {
            items.push(1, 'ellipsis', totalPages - 3, totalPages - 2, totalPages - 1, totalPages)
        } else {
            items.push(1, 'ellipsis', currentPage - 1, currentPage, currentPage + 1, 'ellipsis', totalPages)
        }
        return items
    }, [currentPage, totalPages])

    const gridCols = "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
    const showFavorites = showLoadingFavorites || favorites.length > 0

    return (
        <div className={cn("flex justify-center overflow-auto h-full pb-10 pt-2", isMobile && "px-4")}>
            <style>{`
                @keyframes space-fade-up {
                    from { opacity: 0; transform: translateY(6px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .space-fade-up { animation: space-fade-up 0.35s ease both; }
            `}</style>

            <div className={cn("flex flex-col gap-8 w-full", !isMobile && "max-w-[1080px]")}>

                {/* Header */}
                <div className={cn("flex items-center justify-between gap-3 shrink-0", isMobile ? "mt-4" : "mt-8")}>
                    <div className="flex items-center gap-2.5 min-w-0">
                        <Button variant="ghost" size="icon" onClick={handleGoBack} className="h-9 w-9 shrink-0">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <div className="min-w-0">
                            <h1 className={cn("font-semibold tracking-tight", isMobile ? "text-xl" : "text-2xl")}>
                                {t('space-hub.all-space', 'All Spaces')}
                            </h1>
                            <p className="truncate text-sm text-muted-foreground">
                                {t('space-hub.count', { n: totalSpaces, defaultValue: '{{n}} spaces' })}
                            </p>
                        </div>
                    </div>
                    <CreateSpaceDlg
                        trigger={
                            <Button size="sm" className="gap-1.5 h-9 shrink-0">
                                <Plus className="h-4 w-4" />
                                {!isMobile && t('space-hub.create-space', 'Create Space')}
                            </Button>
                        }
                        callBack={handleRefresh}
                    />
                </div>

                {/* Favorites */}
                {showFavorites && (
                    <section className="flex flex-col gap-3.5 shrink-0">
                        <div className="flex items-center gap-2">
                            <Star size={14} className="text-amber-500" />
                            <h2 className="text-sm font-medium text-muted-foreground">
                                {t('space-hub.favorites', 'Favorites')}
                            </h2>
                        </div>
                        {showLoadingFavorites ? (
                            <div className={cn("grid gap-3", gridCols)}>
                                {Array.from({ length: isMobile ? 2 : 4 }).map((_, i) => (
                                    <Skeleton key={i} className="h-[124px] w-full rounded-xl" />
                                ))}
                            </div>
                        ) : (
                            <div className={cn("grid gap-3", gridCols)}>
                                {favorites.map((space, index) => (
                                    <SpaceCard
                                        key={space.id}
                                        space={space}
                                        favorite
                                        index={index}
                                        cover={coverOf(space)}
                                        owned={isOwned(space)}
                                        onOpen={navigateToSpace}
                                        onToggleFavorite={(id) => toggleFavorite(id)}
                                        noDescription={noDescription}
                                        favoriteLabel={favoriteLabel}
                                        ownedLabel={ownedLabel}
                                        joinedLabel={joinedLabel}
                                        publicLabel={publicLabel}
                                    />
                                ))}
                            </div>
                        )}
                    </section>
                )}

                {/* All spaces */}
                <section className="flex flex-col gap-3.5 shrink-0">
                    <div className="flex items-center justify-between gap-2">
                        <Tabs value={spaceTab} onValueChange={setSpaceTab} className="w-auto">
                            <TabsList className="h-8">
                                <TabsTrigger value="all" className="text-xs px-3 h-6 gap-1">
                                    <FolderOpen size={12} />
                                    {t('space-hub.tab-all', 'All')}
                                </TabsTrigger>
                                <TabsTrigger value="normal" className="text-xs px-3 h-6 gap-1">
                                    <Box size={12} />
                                    {t('space-hub.tab-normal', 'Normal')}
                                </TabsTrigger>
                                <TabsTrigger value="team" className="text-xs px-3 h-6 gap-1">
                                    <Users size={12} />
                                    {t('space-hub.tab-team', 'Team')}
                                </TabsTrigger>
                            </TabsList>
                        </Tabs>
                        {!isMobile && (
                            <div className="flex items-center gap-0.5 rounded-md border border-border/60 p-0.5">
                                <Button
                                    variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                                    size="icon" className="h-6 w-6"
                                    onClick={() => setViewMode('grid')}
                                    aria-label={t('space-hub.grid-view', 'Grid view')}
                                >
                                    <Grid3X3 className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                    variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                                    size="icon" className="h-6 w-6"
                                    onClick={() => setViewMode('list')}
                                    aria-label={t('space-hub.list-view', 'List view')}
                                >
                                    <List className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Search + category filter */}
                    <div className={cn("flex gap-2", isMobile ? "flex-col" : "items-center")}>
                        <Input
                            className="h-9 flex-1"
                            icon={<SearchIcon className="h-4 w-4" />}
                            placeholder={t('space-hub.search-placeholder', 'Search spaces...')}
                            value={searchValue}
                            onChange={(e) => setSearchValue(e.target.value)}
                            aria-label={t('space-hub.search-label', 'Search spaces')}
                        />
                        <Select value={category} onValueChange={setCategory}>
                            <SelectTrigger
                                className={cn("h-9", isMobile ? "w-full" : "w-[180px]")}
                                aria-label={t('space-hub.category-label', 'Filter by category')}
                            >
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

                    {/* Results */}
                    <div className={cn(isMobile ? "min-h-[200px]" : "min-h-[300px]")}>
                        {showLoadingSpaces ? (
                            viewMode === 'grid' ? (
                                <div className={cn("grid gap-3", gridCols)}>
                                    {Array.from({ length: isMobile ? 4 : 8 }).map((_, i) => (
                                        <Skeleton key={i} className="h-[124px] w-full rounded-xl" />
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    {Array.from({ length: 6 }).map((_, i) => (
                                        <Skeleton key={i} className="h-[58px] w-full rounded-lg" />
                                    ))}
                                </div>
                            )
                        ) : spaces.length > 0 ? (
                            viewMode === 'grid' ? (
                                <div className={cn("grid gap-3", gridCols)}>
                                    {spaces.map((space, index) => (
                                        <SpaceCard
                                            key={space.id}
                                            space={space}
                                            favorite={isFavorite(space)}
                                            index={index}
                                            cover={coverOf(space)}
                                            owned={isOwned(space)}
                                            onOpen={navigateToSpace}
                                            onToggleFavorite={(id) => toggleFavorite(id)}
                                            noDescription={noDescription}
                                            favoriteLabel={favoriteLabel}
                                            ownedLabel={ownedLabel}
                                            joinedLabel={joinedLabel}
                                            publicLabel={publicLabel}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    {spaces.map((space) => (
                                        <SpaceRow
                                            key={space.id}
                                            space={space}
                                            favorite={isFavorite(space)}
                                            owned={isOwned(space)}
                                            onOpen={navigateToSpace}
                                            onToggleFavorite={(id) => toggleFavorite(id)}
                                            noDescription={noDescription}
                                            favoriteLabel={favoriteLabel}
                                            viewLabel={viewLabel}
                                            ownedLabel={ownedLabel}
                                            joinedLabel={joinedLabel}
                                            publicLabel={publicLabel}
                                        />
                                    ))}
                                </div>
                            )
                        ) : (
                            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 py-14 text-center">
                                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                                    <FolderOpen className="h-5 w-5" />
                                </div>
                                <p className="text-sm font-medium">
                                    {searchValue
                                        ? t('space-hub.no-results', 'No spaces found matching your search')
                                        : t('space-hub.no-spaces', 'No spaces available')}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {searchValue
                                        ? t('space-hub.try-different', 'Try a different search term')
                                        : t('space-hub.create-first', 'Create your first space to get started')}
                                </p>
                                {searchValue ? (
                                    <Button variant="outline" size="sm" onClick={() => setSearchValue('')} className="mt-3 h-8 text-xs">
                                        {t('space-hub.clear-search', 'Clear search')}
                                    </Button>
                                ) : (
                                    <CreateSpaceDlg
                                        trigger={
                                            <Button size="sm" className="mt-3 gap-1.5 h-8 text-xs">
                                                <Plus className="h-3.5 w-3.5" />
                                                {t('space-hub.create-space', 'Create Space')}
                                            </Button>
                                        }
                                        callBack={handleRefresh}
                                    />
                                )}
                            </div>
                        )}
                    </div>

                    {/* Pagination */}
                    {!isLoadingSpaces && spaces.length > 0 && totalPages > 1 && (
                        <Pagination className="pt-1">
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
                                                onClick={() => setCurrentPage(item)}
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
                </section>
            </div>
        </div>
    )
}
