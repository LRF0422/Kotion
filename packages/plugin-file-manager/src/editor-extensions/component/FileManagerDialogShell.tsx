import React from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    cn,
} from "@kn/ui";

export interface FileManagerDialogShellProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: string;
    children: React.ReactNode;
    contentClassName?: string;
    bodyClassName?: string;
}

export const FileManagerDialogShell: React.FC<FileManagerDialogShellProps> = ({
    open,
    onOpenChange,
    title,
    description,
    children,
    contentClassName,
    bodyClassName,
}) => (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
            className={cn(
                "flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 shadow-none sm:rounded-none",
                "md:h-[82dvh] md:max-h-[82dvh] md:w-[calc(100vw-3rem)] md:max-w-[1024px] md:rounded-xl md:border md:shadow-lg",
                "[&>button]:right-[calc(env(safe-area-inset-right)+0.5rem)] [&>button]:top-[calc(env(safe-area-inset-top)+0.25rem)] [&>button]:flex [&>button]:h-11 [&>button]:w-11 [&>button]:items-center [&>button]:justify-center [&>button]:rounded-md",
                "[&>button]:transition-[color,background-color,opacity,transform] [&>button]:duration-150 [&>button:hover]:bg-muted [&>button:focus-visible]:outline-none [&>button:focus-visible]:ring-2 [&>button:focus-visible]:ring-ring [&>button:focus-visible]:ring-offset-2 [&>button:active]:scale-[0.98] [&>button:active]:bg-muted/80 motion-reduce:[&>button]:transition-none",
                "md:[&>button]:right-2 md:[&>button]:top-2 lg:[&>button]:right-3 lg:[&>button]:top-3 lg:[&>button]:h-8 lg:[&>button]:w-8",
                contentClassName,
            )}
        >
            <DialogHeader className="relative z-10 shrink-0 border-b bg-background pb-3 pl-[calc(env(safe-area-inset-left)+1rem)] pr-[calc(env(safe-area-inset-right)+3.75rem)] pt-[calc(env(safe-area-inset-top)+0.75rem)] text-left md:px-4 md:py-3 md:pr-14">
                <DialogTitle>{title}</DialogTitle>
                {description && (
                    <DialogDescription>{description}</DialogDescription>
                )}
            </DialogHeader>
            <div
                className={cn(
                    "min-h-0 flex-1 overflow-hidden pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] md:p-0",
                    bodyClassName,
                )}
            >
                {children}
            </div>
        </DialogContent>
    </Dialog>
);
