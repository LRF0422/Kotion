import React from "react";
import {
    Button, cn,
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuSeparator, DropdownMenuTrigger,
} from "@kn/ui";
import { MoreVertical } from "@kn/icon";
import type { FileAction } from "./fileActions";

export interface FileActionsMenuProps {
    actions: FileAction[];
    align?: "start" | "end";
    /** 自定义触发器;缺省为一个 ⋯ 图标按钮 */
    trigger?: React.ReactNode;
    triggerClassName?: string;
}

/** 把 `FileAction[]` 渲染成下拉菜单 —— 卡片 / 列表行复用 */
export const FileActionsMenu: React.FC<FileActionsMenuProps> = ({
    actions,
    align = "end",
    trigger,
    triggerClassName,
}) => {
    if (actions.length === 0) return null;

    return (
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                {trigger ?? (
                    <Button
                        variant="ghost"
                        size="icon"
                        className={cn("h-7 w-7", triggerClassName)}
                    >
                        <MoreVertical className="h-4 w-4" />
                    </Button>
                )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align={align} className="w-[190px]">
                {actions.map((action) => (
                    <React.Fragment key={action.key}>
                        {action.separatorBefore && <DropdownMenuSeparator />}
                        <DropdownMenuItem
                            onClick={(e) => {
                                e.stopPropagation();
                                action.run();
                            }}
                            className={cn(action.destructive && "text-destructive focus:text-destructive")}
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
