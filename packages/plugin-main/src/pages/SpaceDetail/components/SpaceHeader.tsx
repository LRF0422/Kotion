import React from 'react'
import { IconButton, Input } from '@kn/ui'
import { Search, StarIcon } from '@kn/icon'
import { Space } from '@kn/common'
import { PageItemIcon } from './PageItemIcon'

interface SpaceHeaderProps {
    space: Space
    spaceId: string
    onNavigateHome: () => void
    onFavorite: () => void
    onSearchFocus: () => void
}

/**
 * Space header section in the sidebar.
 * Displays space icon, name, favorite button, and search trigger.
 */
export const SpaceHeader: React.FC<SpaceHeaderProps> = ({
    space,
    onNavigateHome,
    onFavorite,
    onSearchFocus,
}) => {
    return (
        <div className="flex flex-col gap-1.5 p-2 border-b pb-3 flex-shrink-0">
            <div className="flex items-center justify-between gap-2">
                <div
                    className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={onNavigateHome}
                >
                    <PageItemIcon icon={space?.icon} size={20} />
                    <div className="flex flex-col min-w-0 flex-1">
                        <h2 className="font-semibold text-sm truncate">{space.name}</h2>
                    </div>
                </div>
                <IconButton
                    icon={<StarIcon className="h-3.5 w-3.5" />}
                    onClick={onFavorite}
                    className="h-6 w-6"
                />
            </div>
            <div className="relative">
                <Input
                    placeholder="Search pages..."
                    className="h-7 pl-2.5 pr-8 text-xs bg-muted/50 border-0 focus:bg-background focus:border focus:border-border cursor-pointer"
                    onFocus={onSearchFocus}
                    readOnly
                />
                <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            </div>
            <div className="text-[10px] text-muted-foreground/60 text-center">
                Press <kbd className="px-1 py-0.5 bg-muted rounded text-[9px]">Ctrl+K</kbd> to search
            </div>
        </div>
    )
}
