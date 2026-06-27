import React from 'react';
import { ChevronRight, HomeIcon, MoreHorizontal } from '@kn/icon';
import {
    cn,
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@kn/ui';
import { BreadcrumbItem } from './FileContext';
import { useI18n } from '../../i18n/use-i18n';

export interface BreadcrumbProps {
    items: BreadcrumbItem[];
    onNavigate: (folderId: string, folderName: string) => void;
    className?: string;
    /** 超过该数量时折叠中间层级为 “…” 下拉(默认 4) */
    maxItems?: number;
}

const Crumb: React.FC<{
    item: BreadcrumbItem;
    isFirst: boolean;
    isLast: boolean;
    onNavigate: (id: string, name: string) => void;
}> = ({ item, isFirst, isLast, onNavigate }) => {
    const { t } = useI18n();
    return (
        <button
            onClick={() => !isLast && onNavigate(item.id, item.name)}
            disabled={isLast}
            className={cn(
                "flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors",
                isLast
                    ? "text-foreground font-medium cursor-default"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer",
            )}
            title={item.name}
        >
            {isFirst && <HomeIcon className="h-4 w-4 flex-shrink-0" />}
            <span className="max-w-[140px] truncate">{isFirst ? t('breadcrumb.home') : item.name}</span>
        </button>
    );
};

export const Breadcrumb: React.FC<BreadcrumbProps> = ({ items, onNavigate, className, maxItems = 4 }) => {
    const { t } = useI18n();
    if (items.length === 0) return null;

    const collapsed = items.length > maxItems;
    // 折叠时:首项 + “…” + 最后两项;中间项进下拉
    const head = collapsed ? items.slice(0, 1) : items;
    const middle = collapsed ? items.slice(1, items.length - 2) : [];
    const tail = collapsed ? items.slice(items.length - 2) : [];

    const renderCrumb = (item: BreadcrumbItem, index: number, total: number, offset: number) => (
        <li key={item.id} className="flex items-center">
            {offset + index > 0 && <ChevronRight className="mx-0.5 h-4 w-4 text-muted-foreground/60" />}
            <Crumb
                item={item}
                isFirst={offset + index === 0}
                isLast={offset + index === items.length - 1}
                onNavigate={onNavigate}
            />
        </li>
    );

    return (
        <nav className={cn("flex items-center text-sm min-w-0", className)} aria-label={t('breadcrumb.label')}>
            <ol className="flex items-center min-w-0">
                {head.map((item, i) => renderCrumb(item, i, items.length, 0))}

                {collapsed && (
                    <li className="flex items-center">
                        <ChevronRight className="mx-0.5 h-4 w-4 text-muted-foreground/60" />
                        <DropdownMenu modal={false}>
                            <DropdownMenuTrigger className="rounded-md px-1.5 py-1 text-muted-foreground hover:text-foreground hover:bg-accent">
                                <MoreHorizontal className="h-4 w-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                                {middle.map((item) => (
                                    <DropdownMenuItem key={item.id} onClick={() => onNavigate(item.id, item.name)}>
                                        <span className="max-w-[200px] truncate">{item.name}</span>
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </li>
                )}

                {tail.map((item, i) => renderCrumb(item, i, items.length, items.length - tail.length))}
            </ol>
        </nav>
    );
};
