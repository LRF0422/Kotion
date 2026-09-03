import React from 'react';
import { ChevronRight, HomeIcon, MoreHorizontal } from '@kn/icon';
import {
    cn,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@kn/ui';
import { BreadcrumbItem } from './FileContext';
import { useI18n } from '../../i18n/use-i18n';

export interface BreadcrumbProps {
    items: BreadcrumbItem[];
    onNavigate: (folderId: string, folderName: string) => void;
    className?: string;
    maxItems?: number;
    showHomeLabel?: boolean;
}

const Crumb: React.FC<{
    item: BreadcrumbItem;
    isFirst: boolean;
    isLast: boolean;
    showHomeLabel: boolean;
    onNavigate: (id: string, name: string) => void;
}> = ({ item, isFirst, isLast, showHomeLabel, onNavigate }) => {
    const { t } = useI18n();
    return (
        <button
            onClick={() => !isLast && onNavigate(item.id, item.name)}
            disabled={isLast}
            aria-current={isLast ? 'page' : undefined}
            aria-label={isFirst && !showHomeLabel ? t('breadcrumb.home') : undefined}
            className={cn(
                "flex h-11 min-w-0 items-center gap-1 rounded-md px-2 text-[13px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-muted/70 motion-reduce:transition-none lg:h-8 lg:px-1.5",
                isLast
                    ? "cursor-default font-medium text-foreground"
                    : "cursor-pointer text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
            title={item.name}
        >
            {isFirst && <HomeIcon className="h-4 w-4 flex-shrink-0" />}
            {(!isFirst || showHomeLabel) && (
                <span className={cn("truncate", isLast ? "max-w-[200px]" : "max-w-[120px]")}>
                    {isFirst ? t('breadcrumb.home') : item.name}
                </span>
            )}
        </button>
    );
};

export const Breadcrumb: React.FC<BreadcrumbProps> = ({
    items,
    onNavigate,
    className,
    maxItems = 5,
    showHomeLabel = true,
}) => {
    const { t } = useI18n();
    if (items.length === 0) return null;

    const collapsed = items.length > maxItems;
    const tailCount = collapsed ? Math.max(1, maxItems - 2) : 0;
    const head = collapsed ? items.slice(0, 1) : items;
    const middle = collapsed ? items.slice(1, items.length - tailCount) : [];
    const tail = collapsed ? items.slice(items.length - tailCount) : [];

    const renderCrumb = (item: BreadcrumbItem, absoluteIndex: number) => {
        const isLast = absoluteIndex === items.length - 1;
        return (
            <li key={item.id} className={cn("flex min-w-0 items-center", isLast && "flex-1")}>
                {absoluteIndex > 0 && <ChevronRight className="mx-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/40" />}
                <Crumb
                    item={item}
                    isFirst={absoluteIndex === 0}
                    isLast={isLast}
                    showHomeLabel={showHomeLabel}
                    onNavigate={onNavigate}
                />
            </li>
        );
    };

    return (
        <nav className={cn("flex min-w-0 items-center overflow-hidden text-sm", className)} aria-label={t('breadcrumb.label')}>
            <ol className="flex min-w-0 flex-1 items-center overflow-hidden">
                {head.map((item, index) => renderCrumb(item, index))}

                {collapsed && (
                    <li className="flex flex-shrink-0 items-center">
                        <ChevronRight className="mx-0.5 h-3.5 w-3.5 text-muted-foreground/40" />
                        <DropdownMenu modal={false}>
                            <DropdownMenuTrigger
                                className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-muted/70 motion-reduce:transition-none lg:h-8 lg:w-8"
                                aria-label={t('breadcrumb.more')}
                            >
                                <MoreHorizontal className="h-4 w-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="min-w-[200px]">
                                {middle.map((item) => (
                                    <DropdownMenuItem
                                        key={item.id}
                                        onClick={() => onNavigate(item.id, item.name)}
                                        className="min-h-11 rounded-md lg:min-h-8"
                                    >
                                        <span className="max-w-[240px] truncate">{item.name}</span>
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </li>
                )}

                {tail.map((item, index) => renderCrumb(item, items.length - tail.length + index))}
            </ol>
        </nav>
    );
};
