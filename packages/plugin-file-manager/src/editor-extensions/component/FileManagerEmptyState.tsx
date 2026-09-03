import React from "react";
import { type LucideIcon } from "@kn/icon";
import { Button, cn } from "@kn/ui";

export interface FileManagerEmptyStateProps {
    icon: LucideIcon;
    title: string;
    description?: string;
    tone?: 'default' | 'error';
    action?: {
        label: string;
        onClick: () => void;
    };
    className?: string;
}

export const FileManagerEmptyState: React.FC<FileManagerEmptyStateProps> = ({
    icon: Icon,
    title,
    description,
    tone = 'default',
    action,
    className,
}) => {
    const isError = tone === 'error';

    return (
        <div
            className={cn(
                "flex w-full max-w-none flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center",
                isError
                    ? "border-destructive/30 bg-destructive/[0.04]"
                    : "border-border/70 bg-muted/20",
                className,
            )}
            role={isError ? "alert" : undefined}
        >
            <div
                className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-lg border bg-background",
                    isError ? "border-destructive/25 text-destructive" : "border-border/70 text-muted-foreground",
                )}
            >
                <Icon className="h-5 w-5" aria-hidden="true" />
            </div>
            <h2 className={cn("mt-4 text-sm font-medium", isError ? "text-destructive" : "text-foreground")}>{title}</h2>
            {description && (
                <p className="mt-1 max-w-md whitespace-pre-line text-[13px] leading-5 text-muted-foreground">
                    {description}
                </p>
            )}
            {action && (
                <Button
                    type="button"
                    variant="outline"
                    onClick={action.onClick}
                    className={cn(
                        "mt-4 h-11 px-4 active:bg-accent/80 lg:h-8 lg:px-3 lg:text-xs",
                        isError && "border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive active:bg-destructive/15",
                    )}
                >
                    {action.label}
                </Button>
            )}
        </div>
    );
};
