import React from 'react'
import { Alert, AlertDescription, cn } from '@kn/ui'
import { AlertCircle } from '@kn/icon'
import { type ResolvedPageType, Space } from '@kn/common'
import { SpaceHeader } from './SpaceHeader'
import { QuickActions } from './QuickActions'
import { RecentPages } from './RecentPages'
import { FavoritesSection } from './FavoritesSection'
import { PageTreeSection } from './PageTreeSection'
import { BottomUtilities } from './BottomUtilities'
import { RecentPageItem } from '../hooks/useRecentPages'

interface SpaceSidebarProps {
    space: Space
    spaceId: string
    pageId?: string
    // Data
    favorites: any[]
    pageTree: any[]
    trash: any[]
    recentPages: RecentPageItem[]
    // State
    loading: boolean
    error: string | null
    searchValue?: string
    // Handlers
    onNavigateHome: () => void
    onFavorite: () => void
    onSearchFocus: () => void
    onSearchChange: (value: string) => void
    onCreatePage: (parentId?: string, pageType?: ResolvedPageType) => void
    onOpenTemplates: () => void
    onMoveToTrash: (pageId: string) => void
    onAddFavorite: (pageId: string) => void
    onRemoveFavorite: (pageId: string) => void
    onRestorePage: (pageId: string) => void
    onPageClick: (pageId: string) => void
    onNavigateGraph: () => void
    onNavigateSettings: () => void
    onNavigateTeamHome?: () => void
    onTreeSelected?: () => void
    onImport?: () => void
    onExport?: () => void
    className?: string
}

/**
 * Complete sidebar container for SpaceDetail.
 * Orchestrates all sidebar sections: header, quick actions, recent pages,
 * favorites, page tree, and bottom utilities.
 */
export const SpaceSidebar: React.FC<SpaceSidebarProps> = ({
    space,
    spaceId,
    pageId,
    favorites,
    pageTree,
    trash,
    recentPages,
    loading,
    error,
    searchValue,
    onNavigateHome,
    onFavorite,
    onSearchFocus,
    onSearchChange,
    onCreatePage,
    onOpenTemplates,
    onMoveToTrash,
    onAddFavorite,
    onRemoveFavorite,
    onRestorePage,
    onPageClick,
    onNavigateGraph,
    onNavigateSettings,
    onNavigateTeamHome,
    onTreeSelected,
    onImport,
    onExport,
    className,
}) => {
    return (
        <div className={cn("h-full flex flex-col min-h-0", className)}>
            {/* Error Alert */}
            {error && (
                <Alert variant="destructive" className="m-2 flex-shrink-0">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {/* Space Header with search */}
            <SpaceHeader
                space={space}
                spaceId={spaceId}
                onNavigateHome={onNavigateHome}
                onFavorite={onFavorite}
                onSearchFocus={onSearchFocus}
            />

            {/* Quick Actions */}
            <QuickActions
                onCreatePage={(pageType) => onCreatePage(undefined, pageType)}
                onOpenTemplates={onOpenTemplates}
                onImportDocument={onImport}
            />

            {/* Recent Pages */}
            <RecentPages
                pages={recentPages}
                onPageClick={onPageClick}
                className="border-b pb-1"
            />

            {/* Favorites */}
            <FavoritesSection
                favorites={favorites}
                spaceId={spaceId}
                onPageClick={onPageClick}
                onRemoveFavorite={onRemoveFavorite}
                className="border-b pb-1 pt-1"
            />

            {/* Page Tree — takes remaining space */}
            <PageTreeSection
                spaceId={spaceId}
                pageTree={pageTree}
                loading={loading}
                searchValue={searchValue}
                selectedPageId={pageId}
                onSearchChange={onSearchChange}
                onCreatePage={onCreatePage}
                onMoveToTrash={onMoveToTrash}
                onAddFavorite={onAddFavorite}
                onPageClick={onPageClick}
                onTreeSelected={onTreeSelected}
            />

            {/* Bottom Utilities */}
            <BottomUtilities
                spaceId={spaceId}
                pageId={pageId}
                trash={trash}
                onOpenTemplates={onOpenTemplates}
                onNavigateGraph={onNavigateGraph}
                onNavigateSettings={onNavigateSettings}
                onNavigateTeamHome={onNavigateTeamHome}
                onRestorePage={onRestorePage}
                onImport={onImport}
                onExport={onExport}
            />
        </div>
    )
}
