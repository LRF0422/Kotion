import React from "react";
import { Button, cn } from "@kn/ui";
import { XIcon, Check } from "@kn/icon";
import { useFileManagerState } from "./FileContext";
import { getFileActions } from "./fileActions";
import { FileActionsMenu } from "./ActionMenu";

/**
 * 选中 ≥1 项时,从内容区底部浮出的操作栏。
 * 取代旧版工具栏里的 “Actions (N)” 下拉。
 */
export const SelectionBar: React.FC = () => {
    const ctx = useFileManagerState();
    const { selectedFiles, clearSelection, selectable, onConfirmSelectable } = ctx;

    if (selectedFiles.length === 0) return null;

    const actions = getFileActions(selectedFiles, ctx);
    const primary = actions.filter((a) => a.primary);
    const overflow = actions.filter((a) => !a.primary);

    return (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center px-3">
            {/* 实心背景 —— 避免持久 UI 上的 backdrop-filter(Safari 性能约束) */}
            <div className={cn(
                "pointer-events-auto flex items-center gap-0.5 rounded-xl border bg-popover p-1.5 shadow-xl",
                "animate-in fade-in slide-in-from-bottom-2 duration-200",
            )}>
                <span className="mx-1 whitespace-nowrap rounded-md bg-primary/10 px-2 py-1 text-xs font-medium tabular-nums text-primary">
                    {ctx.t('selection.selected', { count: selectedFiles.length })}
                </span>

                {primary.map((a) => (
                    <Button
                        key={a.key}
                        variant="ghost"
                        size="icon"
                        className={cn("h-11 w-11 rounded-md lg:h-8 lg:w-8", a.destructive && "text-destructive hover:bg-destructive/10 hover:text-destructive")}
                        title={a.label}
                        onClick={a.run}
                    >
                        {a.icon}
                    </Button>
                ))}

                {overflow.length > 0 && (
                    <FileActionsMenu actions={overflow} align="end" triggerClassName="h-11 w-11 rounded-md lg:h-8 lg:w-8" />
                )}

                {selectable && onConfirmSelectable && (
                    <Button
                        size="sm"
                        className="h-11 rounded-md lg:h-8"
                        onClick={() => onConfirmSelectable(selectedFiles)}
                    >
                        <Check className="mr-1 h-4 w-4" />
                        {ctx.t('selection.confirm')}
                    </Button>
                )}

                <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 rounded-md lg:h-8 lg:w-8 text-muted-foreground hover:text-foreground"
                    title={ctx.t('selection.clearSelection')}
                    onClick={clearSelection}
                >
                    <XIcon className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
};
