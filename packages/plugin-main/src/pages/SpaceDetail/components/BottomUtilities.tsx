import React from 'react'
import { Button, Badge, cn } from '@kn/ui'
import { LayoutTemplate, Network, Settings, Trash2, Undo2, CircleArrowUp, FileDown, FileUp, Users } from '@kn/icon'
import { useTranslation } from '@kn/common'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@kn/ui'
import { TemplateCreator } from '../TemplateCreator'
import { PageItemIcon } from './PageItemIcon'

interface TrashItem {
    id: string
    title: string
    icon?: { type?: string; icon: string }
}

interface BottomUtilitiesProps {
    spaceId: string
    pageId?: string
    trash: TrashItem[]
    onOpenTemplates: () => void
    onNavigateGraph: () => void
    onNavigateSettings: () => void
    onNavigateTeamHome?: () => void
    onRestorePage: (pageId: string) => void
    onImport?: () => void
    onExport?: () => void
    className?: string
}

/**
 * Bottom utilities section in the sidebar.
 * Contains Templates, Graph, Import/Export, Settings, Trash.
 */
export const BottomUtilities: React.FC<BottomUtilitiesProps> = ({
    spaceId,
    pageId,
    trash,
    onOpenTemplates,
    onNavigateGraph,
    onNavigateSettings,
    onNavigateTeamHome,
    onRestorePage,
    onImport,
    onExport,
    className,
}) => {
    const { t } = useTranslation()

    return (
        <div className={cn("border-t pt-1 mt-auto space-y-0.5 px-1 pb-2 flex-shrink-0", className)}>
            {/* Team Space Home */}
            {onNavigateTeamHome && (
                <button
                    className="flex items-center gap-2 w-full py-1.5 px-3 rounded-md cursor-pointer hover:bg-muted transition-colors text-xs sm:text-sm"
                    onClick={onNavigateTeamHome}
                >
                    <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="flex-1 text-left">{t('teamSpace.home') || 'Team Home'}</span>
                </button>
            )}

            {/* Templates */}
            <button
                className="flex items-center gap-2 w-full py-1.5 px-3 rounded-md cursor-pointer hover:bg-muted transition-colors text-xs sm:text-sm"
                onClick={onOpenTemplates}
            >
                <LayoutTemplate className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 text-left">{t('template.title') || 'Templates'}</span>
            </button>

            {/* Graph View */}
            <button
                className="flex items-center gap-2 w-full py-1.5 px-3 rounded-md cursor-pointer hover:bg-muted transition-colors text-xs sm:text-sm"
                onClick={onNavigateGraph}
            >
                <Network className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 text-left">{t('graph.title') || 'Graph View'}</span>
            </button>

            {/* Import */}
            {onImport && (
                <button
                    className="flex items-center gap-2 w-full py-1.5 px-3 rounded-md cursor-pointer hover:bg-muted transition-colors text-xs sm:text-sm"
                    onClick={onImport}
                >
                    <FileUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="flex-1 text-left">{t('import.title') || 'Import'}</span>
                </button>
            )}

            {/* Export */}
            {onExport && (
                <button
                    className="flex items-center gap-2 w-full py-1.5 px-3 rounded-md cursor-pointer hover:bg-muted transition-colors text-xs sm:text-sm"
                    onClick={onExport}
                >
                    <FileDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="flex-1 text-left">{t('export.title') || 'Export'}</span>
                </button>
            )}

            {/* Settings */}
            <button
                className="flex items-center gap-2 w-full py-1.5 px-3 rounded-md cursor-pointer hover:bg-muted transition-colors text-xs sm:text-sm"
                onClick={onNavigateSettings}
            >
                <Settings className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 text-left">{t('settings.title') || 'Settings'}</span>
            </button>

            {/* Trash */}
            <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-2 w-full py-1.5 px-3 rounded-md text-xs sm:text-sm hover:bg-muted transition-colors">
                    <Trash2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="flex-1 text-left">{t('trash.title') || 'Trash'}</span>
                    {trash.length > 0 && (
                        <Badge variant="secondary" className="h-4 sm:h-5 px-1 sm:px-1.5 text-[10px] sm:text-xs">
                            {trash.length}
                        </Badge>
                    )}
                </DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="start" className="w-[280px] sm:w-[320px] max-h-[350px] sm:max-h-[400px]">
                    <DropdownMenuLabel className="pb-2">
                        <div className="flex items-center justify-between text-xs sm:text-sm">
                            <span>{t('trash.title') || 'Trash'}</span>
                            <span className="text-[10px] sm:text-xs text-muted-foreground">{trash.length} items</span>
                        </div>
                    </DropdownMenuLabel>
                    <div className="max-h-[300px] sm:max-h-[350px] overflow-auto">
                        {trash.length > 0 ? trash.map((item, index) => (
                            <DropdownMenuItem key={index} className="flex flex-row justify-between items-center gap-2 py-2">
                                <div className="flex-1 truncate text-xs sm:text-sm flex items-center">
                                    {item.icon?.icon && <PageItemIcon icon={item.icon} className="mr-1" />}
                                    {item.title}
                                </div>
                                <div className="flex items-center gap-1">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 sm:h-7 px-1.5 sm:px-2"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            onRestorePage(item.id)
                                        }}
                                        title={t('trash.restore') || 'Restore'}
                                    >
                                        <Undo2 className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                                    </Button>
                                </div>
                            </DropdownMenuItem>
                        )) : (
                            <div className="flex flex-col items-center justify-center py-6 sm:py-8 text-center">
                                <Trash2 className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground/50 mb-2" />
                                <p className="text-xs sm:text-sm text-muted-foreground">{t('trash.empty') || 'Trash is empty'}</p>
                            </div>
                        )}
                    </div>
                </DropdownMenuContent>
            </DropdownMenu>

            {/* Save as Template */}
            {pageId && (
                <TemplateCreator mode="page" pageId={pageId} className="flex items-center gap-2 w-full py-1.5 px-3 rounded-md text-xs sm:text-sm hover:bg-muted transition-colors">
                    <CircleArrowUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="flex-1 text-left">{t('template.saveAsTemplate') || 'Save as Template'}</span>
                </TemplateCreator>
            )}
        </div>
    )
}
