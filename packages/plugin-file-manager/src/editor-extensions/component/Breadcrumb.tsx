import React from 'react';
import { ChevronRight, HomeIcon } from '@kn/icon';
import { cn } from '@kn/ui';
import { BreadcrumbItem } from './FileContext';

export interface BreadcrumbProps {
    items: BreadcrumbItem[];
    onNavigate: (folderId: string, folderName: string) => void;
    className?: string;
}

export const Breadcrumb: React.FC<BreadcrumbProps> = ({ items, onNavigate, className }) => {
    if (items.length === 0) return null;

    return (
        <nav className={cn("flex items-center space-x-1 text-sm", className)} aria-label="Breadcrumb">
            <ol className="flex items-center space-x-1">
                {items.map((item, index) => {
                    const isLast = index === items.length - 1;
                    const isFirst = index === 0;

                    return (
                        <li key={item.id} className="flex items-center">
                            {index > 0 && (
                                <ChevronRight className="h-4 w-4 mx-1 text-muted-foreground" />
                            )}
                            <button
                                onClick={() => !isLast && onNavigate(item.id, item.name)}
                                disabled={isLast}
                                className={cn(
                                    "flex items-center gap-1 px-2 py-1 rounded-md transition-colors",
                                    isLast
                                        ? "text-foreground font-medium cursor-default"
                                        : "text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer"
                                )}
                                title={item.name}
                            >
                                {isFirst && <HomeIcon className="h-4 w-4" />}
                                <span className="max-w-[150px] truncate">
                                    {isFirst ? 'Home' : item.name}
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
};
