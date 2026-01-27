import React, { useCallback, useState, useEffect } from "react"
import { FileItem, FileManagerState, useFileManagerState } from "./FileContext"
import {
    Checkbox,
    cn,
    Button,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@kn/ui"
import { useSafeState } from "@kn/core"
import { Download, FcFile, FcOpenedFolder, MoreVertical, Pencil, FolderInput, Copy, Files, Info, Trash2 } from "@kn/icon"
import { formatFileSize } from "../../utils/fileUtils"
import { RenameDialog, MoveDialog, FileDetailsDialog } from "./dialogs"


export interface FileListProps {
    files: FileItem[],
    selectedFiles: string[],
    setSelectFiles: any
}

/**
 * Format date to readable string
 */
const formatDate = (dateString?: string): string => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    })
}

/**
 * Single row component for the file list
 */
const FileListRow: React.FC<FileItem> = React.memo((props) => {
    const { isFolder, id, name, size, updatedAt, createdAt } = props
    const {
        selectedFiles,
        setSelectFiles,
        selectable,
        navigateToFolder,
        loading,
        handleRename,
        handleMove,
        handleCopy,
        handleDuplicate,
        handleDelete,
        currentFolderId,
    } = useFileManagerState() as FileManagerState

    const [checked, setChecked] = useSafeState<boolean>(false)

    // Dialog states
    const [renameDialogOpen, setRenameDialogOpen] = useState(false)
    const [moveDialogOpen, setMoveDialogOpen] = useState(false)
    const [detailsDialogOpen, setDetailsDialogOpen] = useState(false)

    useEffect(() => {
        setChecked(!!selectedFiles.find(it => it.id === id))
    }, [selectedFiles, id])

    const handleCheckChange = useCallback((value: boolean) => {
        if (value) {
            setSelectFiles([...selectedFiles, props])
        } else {
            setSelectFiles(selectedFiles.filter(it => it.id !== id))
        }
    }, [selectedFiles, props, id, setSelectFiles])

    const handleDoubleClick = useCallback((e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (isFolder) {
            navigateToFolder(id, name)
        }
    }, [isFolder, id, name, navigateToFolder])

    const handleRowClick = useCallback(() => {
        handleCheckChange(!checked)
    }, [handleCheckChange, checked])

    // Action handlers
    const handleRenameClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation()
        setRenameDialogOpen(true)
    }, [])

    const handleMoveClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation()
        setMoveDialogOpen(true)
    }, [])

    const handleCopyClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation()
        handleCopy([props])
    }, [handleCopy, props])

    const handleDuplicateClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation()
        handleDuplicate([props])
    }, [handleDuplicate, props])

    const handleDeleteClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation()
        handleDelete([id])
    }, [handleDelete, id])

    const handleDetailsClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation()
        setDetailsDialogOpen(true)
    }, [])

    const handleDownloadClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation()
        // TODO: Implement download
    }, [])

    if (!name) return null

    return <>
        <div
            className={cn(
                "flex items-center px-3 py-2 border-b cursor-pointer hover:bg-muted/50 transition-colors",
                checked && "bg-primary/5",
                loading && "opacity-50 pointer-events-none"
            )}
            onClick={handleRowClick}
            onDoubleClick={handleDoubleClick}
        >
            {/* Checkbox */}
            <div className="w-[40px] flex-shrink-0">
                {selectable && (
                    <Checkbox
                        checked={checked}
                        onCheckedChange={handleCheckChange}
                        onClick={(e) => e.stopPropagation()}
                        disabled={loading}
                    />
                )}
            </div>

            {/* Name */}
            <div className="flex-1 min-w-0 font-medium">
                <div className="flex items-center gap-2">
                    {isFolder ? (
                        <FcOpenedFolder className="h-5 w-5 flex-shrink-0" />
                    ) : (
                        <FcFile className="h-5 w-5 flex-shrink-0" />
                    )}
                    <span className="truncate" title={name}>{name}</span>
                </div>
            </div>

            {/* Size */}
            <div className="w-[100px] flex-shrink-0 text-muted-foreground text-sm">
                {isFolder ? '-' : formatFileSize(size || 0)}
            </div>

            {/* Modified */}
            <div className="w-[180px] flex-shrink-0 text-muted-foreground text-sm hidden md:block">
                {formatDate(updatedAt || createdAt)}
            </div>

            {/* Actions */}
            <div className="w-[40px] flex-shrink-0 flex justify-end">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[180px]">
                        <DropdownMenuItem onClick={handleRenameClick}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleMoveClick}>
                            <FolderInput className="h-4 w-4 mr-2" />
                            Move to...
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleCopyClick}>
                            <Copy className="h-4 w-4 mr-2" />
                            Copy
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleDuplicateClick}>
                            <Files className="h-4 w-4 mr-2" />
                            Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {!isFolder && (
                            <DropdownMenuItem onClick={handleDownloadClick}>
                                <Download className="h-4 w-4 mr-2" />
                                Download
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={handleDetailsClick}>
                            <Info className="h-4 w-4 mr-2" />
                            Properties
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={handleDeleteClick} className="text-destructive focus:text-destructive">
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>

        {/* Dialogs */}
        <RenameDialog
            open={renameDialogOpen}
            onOpenChange={setRenameDialogOpen}
            file={props}
            onConfirm={handleRename}
        />
        <MoveDialog
            open={moveDialogOpen}
            onOpenChange={setMoveDialogOpen}
            files={[props]}
            onConfirm={handleMove}
            currentFolderId={currentFolderId}
        />
        <FileDetailsDialog
            open={detailsDialogOpen}
            onOpenChange={setDetailsDialogOpen}
            file={props}
        />
    </>
})

/**
 * Legacy FileList component (kept for backwards compatibility)
 */
export const FileList: React.FC<FileListProps> = (props) => {
    const { files } = props
    return (
        <div className="not-prose border-none">
            {/* Header */}
            <div className="flex items-center px-3 py-2 border-b bg-muted/50 text-sm font-medium text-muted-foreground">
                <div className="w-[40px] flex-shrink-0"></div>
                <div className="flex-1 min-w-0">Name</div>
                <div className="w-[100px] flex-shrink-0">Size</div>
                <div className="w-[180px] flex-shrink-0 hidden md:block">Modified</div>
                <div className="w-[40px] flex-shrink-0"></div>
            </div>
            {/* Body */}
            {files.map(file => (
                <div key={file.id} className="flex items-center px-3 py-2 border-b">
                    <div className="w-[40px] flex-shrink-0"><Checkbox /></div>
                    <div className="flex-1 min-w-0">{file.name}</div>
                    <div className="w-[100px] flex-shrink-0">{formatFileSize(file.size || 0)}</div>
                    <div className="w-[180px] flex-shrink-0 hidden md:block">{formatDate(file.updatedAt || file.createdAt)}</div>
                    <div className="w-[40px] flex-shrink-0"></div>
                </div>
            ))}
        </div>
    )
}

/**
 * File list view component using context
 */
export const FileListView: React.FC = React.memo(() => {
    const { currentFolderItems, selectable } = useFileManagerState() as FileManagerState

    return (
        <div className="h-full w-full overflow-auto max-h-full">
            {/* Header */}
            <div className="flex items-center px-3 py-2 border-b bg-muted/50 text-sm font-medium text-muted-foreground sticky top-0 z-10">
                <div className="w-[40px] flex-shrink-0">
                    {selectable && <span className="sr-only">Select</span>}
                </div>
                <div className="flex-1 min-w-0">Name</div>
                <div className="w-[100px] flex-shrink-0">Size</div>
                <div className="w-[180px] flex-shrink-0 hidden md:block">Modified</div>
                <div className="w-[40px] flex-shrink-0">
                    <span className="sr-only">Actions</span>
                </div>
            </div>
            {/* Body */}
            <div>
                {currentFolderItems.map((item) => (
                    <FileListRow key={item.id} {...item} />
                ))}
            </div>
        </div>
    )
})