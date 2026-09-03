import React from "react";
import {
    Button,
    cn,
    TreeView,
    Skeleton,
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@kn/ui";
import {
    HomeIcon,
    ClockIcon,
    StarIcon,
    Trash2,
    PanelLeftClose,
    PanelLeftOpen,
} from "@kn/icon";
import type { FileView } from "./FileContext";
import { useI18n } from "../../i18n/use-i18n";

export interface FileSidebarProps {
    view: FileView;
    currentFolderId: string;
    rootFolderId?: string;
    treeElements: any[];
    loading: boolean;
    selectable?: boolean;
    collapsed?: boolean;
    collapsible?: boolean;
    onToggleCollapsed?: () => void;
    onHome: () => void;
    onSelectView: (view: FileView) => void;
    onAfterNavigate?: () => void;
}

type LibraryView = 'home' | 'recent' | 'favorites' | 'trash';

const LIBRARY_ICONS: Record<LibraryView, React.ReactNode> = {
    home: <HomeIcon className="h-4 w-4" />,
    recent: <ClockIcon className="h-4 w-4" />,
    favorites: <StarIcon className="h-4 w-4" />,
    trash: <Trash2 className="h-4 w-4" />,
};

const LIBRARY_KEYS: Record<LibraryView, string> = {
    home: 'sidebar.home',
    recent: 'sidebar.recent',
    favorites: 'sidebar.favorites',
    trash: 'sidebar.trash',
};

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="px-3 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        {children}
    </div>
);

export const FileSidebar: React.FC<FileSidebarProps> = ({
    view,
    currentFolderId,
    rootFolderId = '',
    treeElements,
    loading,
    selectable,
    collapsed = false,
    collapsible = false,
    onToggleCollapsed,
    onHome,
    onSelectView,
    onAfterNavigate,
}) => {
    const { t } = useI18n();
    const libraryItems: LibraryView[] = selectable
        ? ['home', 'recent', 'favorites']
        : ['home', 'recent', 'favorites', 'trash'];

    const navigateLibrary = (key: LibraryView) => {
        if (key === 'home') onHome();
        else onSelectView(key);
        onAfterNavigate?.();
    };

    if (collapsed) {
        return (
            <TooltipProvider delayDuration={250}>
                <div className="flex h-full flex-col items-center border-r-0 bg-muted/20 px-1.5 py-2">
                    {collapsible && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="mb-2 h-11 w-11 rounded-lg text-muted-foreground transition-colors duration-150 hover:text-foreground active:bg-muted/70 motion-reduce:transition-none"
                                    onClick={onToggleCollapsed}
                                    aria-label={t('sidebar.expand')}
                                >
                                    <PanelLeftOpen className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="right">{t('sidebar.expand')}</TooltipContent>
                        </Tooltip>
                    )}

                    <div className="flex w-full flex-col items-center gap-1">
                        {libraryItems.map((key) => {
                            const active = key === 'home'
                                ? view === 'home' && currentFolderId === rootFolderId
                                : view === key;
                            return (
                                <Tooltip key={key}>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className={cn(
                                                "h-11 w-11 rounded-lg transition-colors duration-150 active:bg-muted/70 motion-reduce:transition-none",
                                                active
                                                    ? "bg-accent text-accent-foreground"
                                                    : "text-muted-foreground hover:text-foreground",
                                            )}
                                            aria-current={active ? 'page' : undefined}
                                            aria-label={t(LIBRARY_KEYS[key])}
                                            onClick={() => navigateLibrary(key)}
                                        >
                                            {LIBRARY_ICONS[key]}
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="right">{t(LIBRARY_KEYS[key])}</TooltipContent>
                                </Tooltip>
                            );
                        })}
                    </div>
                </div>
            </TooltipProvider>
        );
    }

    return (
        <div className="flex h-full min-w-0 flex-col bg-muted/20">
            {collapsible && (
                <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/60 px-3">
                    <span className="text-xs font-medium text-muted-foreground">{t('sidebar.library')}</span>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11 rounded-lg text-muted-foreground transition-colors duration-150 hover:text-foreground active:bg-muted/70 motion-reduce:transition-none"
                        onClick={onToggleCollapsed}
                        aria-label={t('sidebar.collapse')}
                    >
                        <PanelLeftClose className="h-4 w-4" />
                    </Button>
                </div>
            )}

            {!collapsible && <SectionLabel>{t('sidebar.library')}</SectionLabel>}
            <div className="space-y-0.5 px-2">
                {libraryItems.map((key) => {
                    const active = key === 'home'
                        ? view === 'home' && currentFolderId === rootFolderId
                        : view === key;
                    return (
                        <Button
                            key={key}
                            variant="ghost"
                            size="sm"
                            className={cn(
                                "h-11 w-full justify-start gap-2.5 rounded-md px-2.5 text-[13px] font-normal transition-colors duration-150 active:bg-muted/70 motion-reduce:transition-none lg:h-8",
                                active
                                    ? "bg-accent font-medium text-accent-foreground"
                                    : "text-foreground/80 hover:text-foreground",
                            )}
                            aria-current={active ? 'page' : undefined}
                            onClick={() => navigateLibrary(key)}
                        >
                            <span className={cn("flex items-center", active ? "text-foreground" : "text-muted-foreground")}>
                                {LIBRARY_ICONS[key]}
                            </span>
                            {t(LIBRARY_KEYS[key])}
                        </Button>
                    );
                })}
            </div>

            <SectionLabel>{t('sidebar.folders')}</SectionLabel>
            <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-1 pb-safe">
                {loading ? (
                    <div className="space-y-1 p-2">
                        <Skeleton className="h-11 w-full lg:h-8" />
                        <div className="space-y-1 pl-4">
                            <Skeleton className="h-11 w-[85%] lg:h-8" />
                            <Skeleton className="h-11 w-[90%] lg:h-8" />
                            <Skeleton className="h-11 w-[80%] lg:h-8" />
                            <Skeleton className="h-11 w-[70%] lg:h-8" />
                        </div>
                    </div>
                ) : (
                    <TreeView
                        initialSelectedId={currentFolderId}
                        selectParent
                        size="sm"
                        className="m-0 w-full [&_[data-tree-item-id]]:min-h-11 lg:[&_[data-tree-item-id]]:min-h-8"
                        elements={treeElements}
                        onTreeSelected={() => onAfterNavigate?.()}
                    />
                )}
            </div>
        </div>
    );
};
