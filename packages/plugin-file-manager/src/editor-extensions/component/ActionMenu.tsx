import React, { useCallback, useState } from "react";
import {
    Button, cn,
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuSeparator, DropdownMenuTrigger,
} from "@kn/ui";
import { MoreVertical } from "@kn/icon";
import type { FileAction } from "./fileActions";
import { useFileManagerState } from "./FileContext";

export interface FileActionsMenuProps {
    actions: FileAction[];
    align?: "start" | "end";
    /** 自定义触发器;缺省为一个 ⋯ 图标按钮 */
    trigger?: React.ReactNode;
    triggerClassName?: string;
    ariaLabel?: string;
    onOpenChange?: (open: boolean) => void;
}

/** 把 `FileAction[]` 渲染成下拉菜单 —— 卡片 / 列表行复用 */
export const FileActionsMenu: React.FC<FileActionsMenuProps> = ({
    actions,
    align = "end",
    trigger,
    triggerClassName,
    ariaLabel,
    onOpenChange,
}) => {
    const { t } = useFileManagerState();
    const [open, setOpen] = useState(false);

    const handleOpenChange = useCallback((nextOpen: boolean) => {
        setOpen(nextOpen);
        onOpenChange?.(nextOpen);
    }, [onOpenChange]);

    if (actions.length === 0) return null;

    return (
        <DropdownMenu modal={false} open={open} onOpenChange={handleOpenChange}>
            <DropdownMenuTrigger
                asChild
                aria-label={ariaLabel ?? t('actions.moreActions')}
                aria-expanded={open}
                aria-haspopup="menu"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
            >
                {trigger ?? (
                    <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                            "h-11 w-11 transition-[color,background-color,opacity] duration-150 motion-reduce:transition-none lg:h-7 lg:w-7",
                            triggerClassName,
                            open && "bg-accent text-accent-foreground opacity-100",
                        )}
                    >
                        <MoreVertical className="h-4 w-4" />
                    </Button>
                )}
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align={align}
                className="w-[190px]"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
            >
                {actions.map((action, index) => (
                    <React.Fragment key={action.key}>
                        {index > 0 && action.separatorBefore && <DropdownMenuSeparator />}
                        <DropdownMenuItem
                            onClick={(event) => {
                                event.stopPropagation();
                                action.run();
                            }}
                            className={cn(
                                "h-11 lg:h-8",
                                action.destructive && "text-destructive focus:text-destructive",
                            )}
                        >
                            <span className="mr-2 flex h-4 w-4 items-center justify-center">{action.icon}</span>
                            {action.label}
                        </DropdownMenuItem>
                    </React.Fragment>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
