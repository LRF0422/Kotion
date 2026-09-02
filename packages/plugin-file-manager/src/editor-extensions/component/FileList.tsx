import React, { useCallback } from "react"
import { FileItem, SortBy, useFileManagerState } from "./FileContext"
import { Checkbox, cn, Button } from "@kn/ui"
import { StarIcon, ChevronUp, ChevronDown } from "@kn/icon"
import { formatFileSize } from "../../utils/fileUtils"
import { FileThumb } from "./FileThumb"
import { FileActionsMenu } from "./ActionMenu"
import { getFileActions } from "./fileActions"

/** Format date to readable string */
const formatDate = (dateString?: string): string => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    if (Number.isNaN(date.getTime())) return '-'
    return date.toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    })
}

const FileListRow: React.FC<FileItem> = React.memo((props) => {
    const ctx = useFileManagerState()
    const {
        sortedItems, selectItem, isSelected, openItem, loading, view, isTouch, toggleFavorite,
        selectable, isItemSelectable,
    } = ctx
    const { isFolder, id, name, size, updatedAt, createdAt } = props
    const isTrash = view === 'trash'
    const isFavorite = props.favorite === 1
    const checked = isSelected(id)
    const eligible = isItemSelectable(props)
    const selectionDisabled = Boolean(selectable && !eligible && !props.isFolder)

    const handleClick = useCallback((e: React.MouseEvent) => {
        if (isTouch && props.isFolder) { openItem(props); return }
        if (selectionDisabled) return
        if (isTouch && !selectable) { openItem(props); return }
        selectItem(props, { ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey }, sortedItems)
    }, [isTouch, openItem, props, selectItem, selectable, selectionDisabled, sortedItems])

    const handleDoubleClick = useCallback((e: React.MouseEvent) => {
        e.preventDefault(); e.stopPropagation()
        openItem(props)
    }, [openItem, props])

    const handleCheck = useCallback(() => {
        if (!eligible) return
        selectItem(props, { metaKey: true }, sortedItems)
    }, [eligible, selectItem, props, sortedItems])

    const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
        if (event.key === 'Enter') {
            event.preventDefault()
            if (selectable && !props.isFolder && eligible) selectItem(props, {}, sortedItems)
            else if (!selectionDisabled) openItem(props)
        } else if (event.key === ' ' && eligible) {
            event.preventDefault()
            selectItem(props, { metaKey: true }, sortedItems)
        }
    }, [eligible, openItem, props, selectItem, selectable, selectionDisabled, sortedItems])

    const handleFavorite = useCallback((e: React.MouseEvent) => {
        e.stopPropagation()
        toggleFavorite(props)
    }, [toggleFavorite, props])

    if (!name) return null

    return (
        <div
            role="option"
            tabIndex={loading || selectionDisabled ? -1 : 0}
            aria-selected={checked}
            aria-disabled={loading || selectionDisabled}
            className={cn(
                "group flex min-h-11 items-center rounded-md px-2 cursor-pointer select-none outline-none transition-colors duration-100 lg:min-h-10",
                "focus-visible:ring-2 focus-visible:ring-ring",
                checked ? "bg-primary/10 hover:bg-primary/10" : "hover:bg-muted/60",
                (loading || selectionDisabled) && "pointer-events-none opacity-50",
            )}
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            onKeyDown={handleKeyDown}
            onContextMenu={() => { if (!checked && eligible) selectItem(props, {}, sortedItems) }}
        >
            <div className="flex w-8 flex-shrink-0 items-center justify-center" onClick={(e) => e.stopPropagation()}>
                <div className={cn(checked || isTouch ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
                    <Checkbox checked={checked} onCheckedChange={handleCheck} disabled={loading || !eligible} />
                </div>
            </div>

            <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <FileThumb file={props} size={24} />
                <span className="truncate text-sm" title={name}>{name}</span>
            </div>

            <div className="w-20 flex-shrink-0 text-xs text-muted-foreground">
                {isFolder ? '—' : formatFileSize(size || 0)}
            </div>

            <div className="w-44 flex-shrink-0 text-xs text-muted-foreground hidden md:block">
                {formatDate(updatedAt || createdAt)}
            </div>

            {!selectable && (
                <div className="flex w-24 flex-shrink-0 items-center justify-end gap-0.5 lg:w-16">
                    {!isTrash && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className={cn(
                                "h-11 w-11 transition-opacity lg:h-7 lg:w-7",
                                isFavorite || isTouch ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                            )}
                            onClick={handleFavorite}
                            aria-label={isFavorite ? ctx.t('actions.removeFromFavorites') : ctx.t('actions.addToFavorites')}
                        >
                            <StarIcon className={cn("h-4 w-4", isFavorite && "fill-yellow-400 text-yellow-400")} />
                        </Button>
                    )}
                    <FileActionsMenu
                        actions={getFileActions([props], ctx)}
                        triggerClassName={cn(
                            "h-11 w-11 data-[state=open]:opacity-100 lg:h-7 lg:w-7",
                            isTouch ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                        )}
                    />
                </div>
            )}
        </div>
    )
})

const SortHeader: React.FC<{ label: string; by: SortBy; className?: string }> = ({ label, by, className }) => {
    const { sortBy, sortOrder, setSort } = useFileManagerState()
    const active = sortBy === by
    return (
        <button
            className={cn(
                "flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:text-foreground",
                active && "text-foreground",
                className,
            )}
            onClick={() => setSort(by)}
        >
            {label}
            {active && (sortOrder === 'asc'
                ? <ChevronUp className="h-3.5 w-3.5" />
                : <ChevronDown className="h-3.5 w-3.5" />)}
        </button>
    )
}

/** File list view component using context */
export const FileListView: React.FC = React.memo(() => {
    const { sortedItems, t, selectable, multiple } = useFileManagerState()

    return (
        <div className="h-full w-full overflow-auto">
            {/* Header —— 与行的列宽/水平留白严格对齐(px-3.5 = p-1.5 + px-2) */}
            <div className="sticky top-0 z-10 flex h-9 items-center border-b bg-background px-3.5 text-xs font-medium text-muted-foreground">
                <div className="w-8 flex-shrink-0" />
                <div className="min-w-0 flex-1"><SortHeader label={t('listHeader.name')} by="name" /></div>
                <div className="w-20 flex-shrink-0"><SortHeader label={t('listHeader.size')} by="size" /></div>
                <div className="w-44 flex-shrink-0 hidden md:block"><SortHeader label={t('listHeader.modified')} by="date" /></div>
                <div className={cn("flex-shrink-0", selectable ? "w-0" : "w-24 lg:w-16")}>
                    <span className="sr-only">{t('listHeader.actions')}</span>
                </div>
            </div>
            {/* Body —— Notion 风格无分隔线圆角行 */}
            <div role="listbox" aria-multiselectable={multiple} className="flex flex-col gap-0.5 p-1.5">
                {sortedItems.map((item) => (
                    <FileListRow key={item.id} {...item} />
                ))}
            </div>
        </div>
    )
})
