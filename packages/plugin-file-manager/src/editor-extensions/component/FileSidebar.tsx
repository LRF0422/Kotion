import React from "react";
import { Button, cn, ScrollArea, TreeView, Skeleton } from "@kn/ui";
import { HomeIcon, ClockIcon, StarIcon, Trash2 } from "@kn/icon";
import type { FileView } from "./FileContext";
import { useI18n } from "../../i18n/use-i18n";

export interface FileSidebarProps {
    view: FileView;
    currentFolderId: string;
    /** 已构建好的 TreeView 元素 */
    treeElements: any[];
    loading: boolean;
    /** 回到 Home(根目录) */
    onHome: () => void;
    /** 切换到 recent / favorites / trash */
    onSelectView: (view: FileView) => void;
    /** 选中树节点 / 点击导航后回调(移动端用于关闭抽屉) */
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
    <div className="px-3 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {children}
    </div>
);

export const FileSidebar: React.FC<FileSidebarProps> = ({
    view, currentFolderId, treeElements, loading, onHome, onSelectView, onAfterNavigate,
}) => {
    const { t } = useI18n();
    const libraryItems: LibraryView[] = ['home', 'recent', 'favorites', 'trash'];

    return (
        <div className="flex h-full flex-col bg-muted/20">
            <SectionLabel>{t('sidebar.library')}</SectionLabel>
            <div className="px-2 space-y-0.5">
                {libraryItems.map((key) => {
                    const active = view === key;
                    return (
                        <Button
                            key={key}
                            variant="ghost"
                            size="sm"
                            className={cn(
                                "w-full justify-start gap-2 h-9 font-normal",
                                active && "bg-accent text-accent-foreground font-medium",
                            )}
                            onClick={() => {
                                if (key === 'home') onHome();
                                else onSelectView(key);
                                onAfterNavigate?.();
                            }}
                        >
                            {LIBRARY_ICONS[key]}
                            {t(LIBRARY_KEYS[key])}
                        </Button>
                    );
                })}
            </div>

            <SectionLabel>{t('sidebar.folders')}</SectionLabel>
            <ScrollArea className="flex-1 min-h-0 px-1">
                {loading ? (
                    <div className="space-y-1 p-2">
                        <Skeleton className="h-7 w-full" />
                        <div className="space-y-1 pl-4">
                            <Skeleton className="h-6 w-[85%]" />
                            <Skeleton className="h-6 w-[90%]" />
                            <Skeleton className="h-6 w-[80%]" />
                            <Skeleton className="h-6 w-[70%]" />
                        </div>
                    </div>
                ) : (
                    <TreeView
                        initialSelectedId={currentFolderId}
                        selectParent
                        size="sm"
                        className="m-0 w-full"
                        elements={treeElements}
                        onTreeSelected={() => onAfterNavigate?.()}
                    />
                )}
            </ScrollArea>
        </div>
    );
};
