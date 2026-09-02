import { StarIcon } from "@kn/icon";
import { Checkbox, cn, Button } from "@kn/ui";
import React, { useCallback } from "react";
import { FileItem, useFileManagerState } from "./FileContext";
import { FileThumb } from "./FileThumb";
import { FileActionsMenu } from "./ActionMenu";
import { getFileActions } from "./fileActions";
import { formatFileSize } from "../../utils/fileUtils";

export const FileCard: React.FC<FileItem> = React.memo((props) => {
    const ctx = useFileManagerState();
    const {
        sortedItems, selectItem, isSelected, openItem, loading, view, isTouch, toggleFavorite,
        selectable, isItemSelectable,
    } = ctx;
    const { id, name } = props;
    const isTrash = view === 'trash';
    const isFavorite = props.favorite === 1;
    const checked = isSelected(id);
    const eligible = isItemSelectable(props);
    const selectionDisabled = Boolean(selectable && !eligible && !props.isFolder);

    const handleClick = useCallback((e: React.MouseEvent) => {
        if (isTouch && props.isFolder) {
            openItem(props);
            return;
        }
        if (selectionDisabled) return;
        if (isTouch && !selectable) {
            openItem(props);
            return;
        }
        selectItem(props, { ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey }, sortedItems);
    }, [isTouch, openItem, props, selectItem, selectable, selectionDisabled, sortedItems]);

    const handleDoubleClick = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        openItem(props);
    }, [openItem, props]);

    const handleCheck = useCallback(() => {
        if (!eligible) return;
        selectItem(props, { metaKey: true }, sortedItems);
    }, [eligible, selectItem, props, sortedItems]);

    const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            if (selectable && !props.isFolder && eligible) {
                selectItem(props, {}, sortedItems);
            } else if (!selectionDisabled) {
                openItem(props);
            }
        } else if (event.key === ' ' && eligible) {
            event.preventDefault();
            selectItem(props, { metaKey: true }, sortedItems);
        }
    }, [eligible, openItem, props, selectItem, selectable, selectionDisabled, sortedItems]);

    const handleFavorite = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        toggleFavorite(props);
    }, [toggleFavorite, props]);

    if (!name) return null;

    return (
        <div
            role="option"
            tabIndex={loading || selectionDisabled ? -1 : 0}
            aria-selected={checked}
            aria-disabled={loading || selectionDisabled}
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            onKeyDown={handleKeyDown}
            onContextMenu={() => { if (!checked && eligible) selectItem(props, {}, sortedItems); }}
            className={cn(
                "group relative flex cursor-pointer select-none flex-col rounded-lg p-1.5 outline-none",
                "transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring",
                checked ? "bg-primary/5" : "hover:bg-muted/60",
                (loading || selectionDisabled) && "pointer-events-none opacity-50",
            )}
        >
            {/* 预览磁贴 */}
            <div
                className={cn(
                    "relative h-24 w-full overflow-hidden rounded-md",
                    checked && "ring-2 ring-inset ring-primary/30",
                )}
            >
                <FileThumb file={props} size={40} fill />

                {/* 复选框 —— 触屏/已选常驻,桌面 hover 显示 */}
                <div
                    className={cn(
                        "absolute left-1.5 top-1.5 z-10 flex h-11 w-11 items-start justify-start transition-opacity lg:h-auto lg:w-auto",
                        checked || isTouch ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                    )}
                    onClick={(e) => e.stopPropagation()}
                >
                    <Checkbox
                        checked={checked}
                        onCheckedChange={handleCheck}
                        disabled={loading || !eligible}
                        className="shadow-sm"
                    />
                </div>

                {/* 右上角悬浮操作 */}
                {!selectable && (
                    <div className="absolute right-1.5 top-1.5 z-10 flex items-center gap-0.5">
                        {!isTrash && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className={cn(
                                    "h-11 w-11 rounded-md bg-background/80 shadow-sm transition-opacity hover:bg-background lg:h-6 lg:w-6",
                                    isFavorite || isTouch ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                                )}
                                onClick={handleFavorite}
                                aria-label={isFavorite ? ctx.t('actions.removeFromFavorites') : ctx.t('actions.addToFavorites')}
                            >
                                <StarIcon className={cn("h-3.5 w-3.5", isFavorite && "fill-yellow-400 text-yellow-400")} />
                            </Button>
                        )}
                        <FileActionsMenu
                            actions={getFileActions([props], ctx)}
                            triggerClassName={cn(
                                "h-11 w-11 rounded-md bg-background/80 shadow-sm hover:bg-background data-[state=open]:opacity-100 lg:h-6 lg:w-6",
                                isTouch ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                            )}
                        />
                    </div>
                )}
            </div>

            {/* 文件名 + 元信息 */}
            <div className="px-0.5 pt-1.5 text-center">
                <div
                    className="line-clamp-2 w-full break-words text-xs leading-snug text-foreground/90"
                    title={name}
                >
                    {name}
                </div>
                <div className="mt-0.5 h-4 text-[11px] leading-4 text-muted-foreground">
                    {props.isFolder ? ctx.t('details.folder') : formatFileSize(props.size || 0)}
                </div>
            </div>
        </div>
    );
});

export const FileCardList: React.FC = React.memo(() => {
    const { sortedItems, multiple } = useFileManagerState();

    return (
        <div className="h-full w-full overflow-auto">
            <div
                role="listbox"
                aria-multiselectable={multiple}
                className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2 p-3"
            >
                {sortedItems.map((it) => (
                    <FileCard key={it.id} {...it} />
                ))}
            </div>
        </div>
    );
});
