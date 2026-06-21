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
    return date.toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    })
}

const FileListRow: React.FC<FileItem> = React.memo((props) => {
    const ctx = useFileManagerState()
    const {
        sortedItems, selectItem, isSelected, openItem, loading, view, isTouch, toggleFavorite,
    } = ctx
    const { isFolder, id, name, size, updatedAt, createdAt } = props
    const isTrash = view === 'trash'
    const isFavorite = props.favorite === 1
    const checked = isSelected(id)

    const handleClick = useCallback((e: React.MouseEvent) => {
        if (isTouch) { openItem(props); return }
        selectItem(props, { ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey }, sortedItems)
    }, [isTouch, openItem, props, selectItem, sortedItems])

    const handleDoubleClick = useCallback((e: React.MouseEvent) => {
        e.preventDefault(); e.stopPropagation()
        openItem(props)
    }, [openItem, props])

    const handleCheck = useCallback(() => {
        selectItem(props, { metaKey: true }, sortedItems)
    }, [selectItem, props, sortedItems])

    const handleFavorite = useCallback((e: React.MouseEvent) => {
        e.stopPropagation()
        toggleFavorite(props)
    }, [toggleFavorite, props])

    if (!name) return null

    return (
        <div
            className={cn(
                "group flex items-center px-2 h-11 border-b cursor-pointer select-none transition-colors duration-150",
                checked ? "bg-primary/5" : "hover:bg-muted/50",
                loading && "opacity-50 pointer-events-none",
            )}
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            onContextMenu={() => { if (!checked) selectItem(props, {}, sortedItems) }}
        >
            <div className="w-[36px] flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                <div className={cn(checked || isTouch ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
                    <Checkbox checked={checked} onCheckedChange={handleCheck} disabled={loading} />
                </div>
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5">
                    <FileThumb file={props} size={22} />
                    <span className="truncate text-sm" title={name}>{name}</span>
                    {isFavorite && !isTrash && (
                        <StarIcon className="h-3.5 w-3.5 flex-shrink-0 fill-yellow-400 text-yellow-400" />
                    )}
                </div>
            </div>

            <div className="w-[90px] flex-shrink-0 text-muted-foreground text-sm">
                {isFolder ? '—' : formatFileSize(size || 0)}
            </div>

            <div className="w-[170px] flex-shrink-0 text-muted-foreground text-sm hidden md:block">
                {formatDate(updatedAt || createdAt)}
            </div>

            <div className="w-[72px] flex-shrink-0 flex justify-end items-center gap-0.5">
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
        </div>
    )
})

const SortHeader: React.FC<{ label: string; by: SortBy; className?: string }> = ({ label, by, className }) => {
    const { sortBy, sortOrder, setSort } = useFileManagerState()
    const active = sortBy === by
    return (
        <button
            className={cn("flex items-center gap-1 hover:text-foreground transition-colors", active && "text-foreground", className)}
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
    const { sortedItems } = useFileManagerState()

    return (
        <div className="h-full w-full overflow-auto">
            {/* Header */}
            <div className="flex items-center px-2 h-9 border-b bg-muted/40 text-xs font-medium text-muted-foreground sticky top-0 z-10">
                <div className="w-[36px] flex-shrink-0" />
                <div className="flex-1 min-w-0"><SortHeader label="Name" by="name" /></div>
                <div className="w-[90px] flex-shrink-0"><SortHeader label="Size" by="size" /></div>
                <div className="w-[170px] flex-shrink-0 hidden md:block"><SortHeader label="Modified" by="date" /></div>
                <div className="w-[72px] flex-shrink-0"><span className="sr-only">Actions</span></div>
            </div>
            {/* Body */}
            <div>
                {sortedItems.map((item) => (
                    <FileListRow key={item.id} {...item} />
                ))}
            </div>
        </div>
    )
})
