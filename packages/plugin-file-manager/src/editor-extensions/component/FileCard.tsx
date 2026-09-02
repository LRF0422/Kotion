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
    } = ctx;
    const { id, name } = props;
    const isTrash = view === 'trash';
    const isFavorite = props.favorite === 1;
    const checked = isSelected(id);

    const handleClick = useCallback((e: React.MouseEvent) => {
        // 触屏:单击直接打开;桌面:单击选中(支持 ctrl/shift)
        if (isTouch) {
            openItem(props);
            return;
        }
        selectItem(props, { ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey }, sortedItems);
    }, [isTouch, openItem, props, selectItem, sortedItems]);

    const handleDoubleClick = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        openItem(props);
    }, [openItem, props]);

    const handleCheck = useCallback(() => {
        // 复选框 = 累加/移除(toggle),不清除其他选择
        selectItem(props, { metaKey: true }, sortedItems);
    }, [selectItem, props, sortedItems]);

    const handleFavorite = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        toggleFavorite(props);
    }, [toggleFavorite, props]);

    if (!name) return null;

    return (
        <div
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            onContextMenu={() => { if (!checked) selectItem(props, {}, sortedItems); }}
            className={cn(
                "group relative flex cursor-pointer select-none flex-col rounded-lg p-1.5",
                "transition-colors duration-150",
                checked ? "bg-primary/5" : "hover:bg-muted/60",
                loading && "opacity-50 pointer-events-none",
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
                        "absolute left-1.5 top-1.5 z-10 transition-opacity",
                        checked || isTouch ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                    )}
                    onClick={(e) => e.stopPropagation()}
                >
                    <Checkbox
                        checked={checked}
                        onCheckedChange={handleCheck}
                        disabled={loading}
                        className="shadow-sm"
                    />
                </div>

                {/* 右上角悬浮操作 */}
                <div className="absolute right-1.5 top-1.5 z-10 flex items-center gap-0.5">
                    {!isTrash && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className={cn(
                                "h-6 w-6 rounded-md bg-background/80 shadow-sm hover:bg-background transition-opacity",
                                isFavorite ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                            )}
                            onClick={handleFavorite}
                            title={isFavorite ? ctx.t('actions.removeFromFavorites') : ctx.t('actions.addToFavorites')}
                        >
                            <StarIcon className={cn("h-3.5 w-3.5", isFavorite && "fill-yellow-400 text-yellow-400")} />
                        </Button>
                    )}
                    <FileActionsMenu
                        actions={getFileActions([props], ctx)}
                        triggerClassName="h-6 w-6 rounded-md bg-background/80 shadow-sm hover:bg-background opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
                    />
                </div>
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
    const { sortedItems } = useFileManagerState();

    return (
        <div className="h-full w-full overflow-auto">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2 p-3">
                {sortedItems.map((it) => (
                    <FileCard key={it.id} {...it} />
                ))}
            </div>
        </div>
    );
});
