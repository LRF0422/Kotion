import React from "react";
import { Button, cn, Separator } from "@kn/ui";
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
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center px-3">
            <div className={cn(
                "pointer-events-auto flex items-center gap-1 rounded-full border bg-popover/95 px-2 py-1.5",
                "shadow-lg backdrop-blur supports-[backdrop-filter]:bg-popover/80",
                "animate-in fade-in slide-in-from-bottom-2 duration-200",
            )}>
                <span className="px-2 text-sm font-medium tabular-nums">
                    {selectedFiles.length} selected
                </span>
                <Separator orientation="vertical" className="h-5" />

                {primary.map((a) => (
                    <Button
                        key={a.key}
                        variant="ghost"
                        size="icon"
                        className={cn("h-8 w-8 rounded-full", a.destructive && "text-destructive hover:text-destructive")}
                        title={a.label}
                        onClick={a.run}
                    >
                        {a.icon}
                    </Button>
                ))}

                {overflow.length > 0 && (
                    <FileActionsMenu actions={overflow} align="end" triggerClassName="h-8 w-8 rounded-full" />
                )}

                <Separator orientation="vertical" className="h-5" />

                {selectable && onConfirmSelectable && (
                    <Button
                        size="sm"
                        className="h-8 rounded-full"
                        onClick={() => onConfirmSelectable(selectedFiles)}
                    >
                        <Check className="mr-1 h-4 w-4" />
                        Confirm
                    </Button>
                )}

                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full"
                    title="Clear selection"
                    onClick={clearSelection}
                >
                    <XIcon className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
};
