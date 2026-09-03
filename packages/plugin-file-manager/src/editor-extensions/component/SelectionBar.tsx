import React from "react";
import { Button, cn } from "@kn/ui";
import { XIcon, Check } from "@kn/icon";
import { useFileManagerState } from "./FileContext";
import { getFileActions } from "./fileActions";
import { FileActionsMenu } from "./ActionMenu";

/** 选中项目后显示的安全区感知操作 Dock。 */
export const SelectionBar: React.FC = () => {
    const ctx = useFileManagerState();
    const { selectedFiles, clearSelection, selectable, onConfirmSelectable } = ctx;

    if (selectedFiles.length === 0) return null;

    const actions = getFileActions(selectedFiles, ctx);
    const primary = actions.filter((action) => action.primary);
    const overflow = actions.filter((action) => !action.primary);

    return (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
            <div className={cn(
                "pointer-events-auto grid w-fit max-w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1 rounded-xl border bg-popover p-1.5 shadow-md",
                "animate-in fade-in slide-in-from-bottom-2 duration-150 motion-reduce:animate-none",
            )}>
                <span className="whitespace-nowrap rounded-md bg-primary/10 px-2 py-1 text-xs font-medium tabular-nums text-primary">
                    {ctx.t('selection.selected', { count: selectedFiles.length })}
                </span>

                <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto overscroll-x-contain">
                    {primary.map((action) => (
                        <Button
                            key={action.key}
                            variant="ghost"
                            size="icon"
                            className={cn(
                                "h-11 w-11 shrink-0 rounded-md transition-colors duration-150 active:bg-muted/70 motion-reduce:transition-none lg:h-8 lg:w-8",
                                action.destructive && "text-destructive hover:bg-destructive/10 hover:text-destructive active:bg-destructive/15",
                            )}
                            aria-label={action.label}
                            title={action.label}
                            onClick={action.run}
                        >
                            {action.icon}
                        </Button>
                    ))}

                    {overflow.length > 0 && (
                        <FileActionsMenu
                            actions={overflow}
                            align="end"
                            triggerClassName="h-11 w-11 shrink-0 rounded-md lg:h-8 lg:w-8"
                        />
                    )}
                </div>

                <div className="flex shrink-0 items-center gap-0.5">
                    {selectable && onConfirmSelectable && (
                        <Button
                            size="sm"
                            className="h-11 min-w-11 rounded-md px-3 transition-colors duration-150 active:opacity-90 motion-reduce:transition-none lg:h-8"
                            aria-label={ctx.t('selection.confirm')}
                            onClick={() => onConfirmSelectable(selectedFiles)}
                        >
                            <Check className="h-4 w-4 md:mr-1" />
                            <span className="sr-only md:not-sr-only">{ctx.t('selection.confirm')}</span>
                        </Button>
                    )}

                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11 rounded-md text-muted-foreground transition-colors duration-150 hover:text-foreground active:bg-muted/70 motion-reduce:transition-none lg:h-8 lg:w-8"
                        aria-label={ctx.t('selection.clearSelection')}
                        title={ctx.t('selection.clearSelection')}
                        onClick={clearSelection}
                    >
                        <XIcon className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
};
