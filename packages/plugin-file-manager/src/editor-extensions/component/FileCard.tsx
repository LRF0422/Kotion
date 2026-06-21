import { StarIcon } from "@kn/icon";
import { Checkbox, cn, Button } from "@kn/ui";
import React, { useCallback } from "react";
import { FileItem, useFileManagerState } from "./FileContext";
import { FileThumb } from "./FileThumb";
import { FileActionsMenu } from "./ActionMenu";
import { getFileActions } from "./fileActions";

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
                "group relative flex flex-col items-center rounded-xl border p-3 cursor-pointer select-none",
                "transition-colors duration-150",
                checked
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-transparent hover:border-border hover:bg-muted/50",
                loading && "opacity-50 pointer-events-none",
            )}
        >
            {/* 复选框 —— 触屏/已选常驻,桌面 hover 显示 */}
            <div
                className={cn(
                    "absolute left-2 top-2 z-10 transition-opacity",
                    checked || isTouch ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                )}
                onClick={(e) => e.stopPropagation()}
            >
                <Checkbox checked={checked} onCheckedChange={handleCheck} disabled={loading} />
            </div>

            {/* 右上角操作区 */}
            <div className="absolute right-1.5 top-1.5 z-10 flex items-center gap-0.5">
                {!isTrash && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                            "h-7 w-7 transition-opacity",
                            isFavorite ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                        )}
                        onClick={handleFavorite}
                        title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                    >
                        <StarIcon className={cn("h-4 w-4", isFavorite && "fill-yellow-400 text-yellow-400")} />
                    </Button>
                )}
                <FileActionsMenu
                    actions={getFileActions([props], ctx)}
                    triggerClassName="opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
                />
            </div>

            {/* 缩略图 */}
            <div className="flex h-20 w-full items-center justify-center py-2">
                <FileThumb file={props} size={64} />
            </div>

            {/* 文件名 */}
            <div
                className="mt-1 line-clamp-2 w-full break-words text-center text-xs leading-snug text-foreground/90"
                title={name}
            >
                {name}
            </div>
        </div>
    );
});

export const FileCardList: React.FC = React.memo(() => {
    const { sortedItems } = useFileManagerState();

    return (
        <div className="h-full w-full overflow-auto">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-2 p-4">
                {sortedItems.map((it) => (
                    <FileCard key={it.id} {...it} />
                ))}
            </div>
        </div>
    );
});
