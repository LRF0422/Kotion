import { Download, EyeIcon, FcFile, FcOpenedFolder, MoreVertical, Pencil, FolderInput, Copy, Files, Info, Trash2 } from "@kn/icon";
import {
    Card, CardContent, CardFooter, CardHeader, CardTitle, Checkbox, cn,
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
    Button,
} from "@kn/ui";
import { useSafeState } from "@kn/core";
import React, { useEffect, useMemo, useCallback, useState } from "react";
import { FileItem, FileManagerState, useFileManagerState } from "./FileContext";
import { RenameDialog, MoveDialog, FileDetailsDialog } from "./dialogs";


export interface FileCardProps {
    objectId: string,
    isSelect?: boolean
    name: string
    suffix?: string
    isFolder: boolean,
    onSelect: (id: string, checked: boolean) => void
    target?: 'folder' | 'file' | 'both'
}


export const FileCard: React.FC<FileItem> = React.memo((props) => {
    const { isFolder, id, name } = props
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
    const [renameDialogOpen, setRenameDialogOpen] = useState(false);
    const [moveDialogOpen, setMoveDialogOpen] = useState(false);
    const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);

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

    const handleContextMenu = useCallback(() => {
        if (selectable) {
            setChecked(true)
        }
    }, [selectable])

    // Action handlers
    const handleRenameClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setRenameDialogOpen(true);
    }, [])

    const handleMoveClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setMoveDialogOpen(true);
    }, [])

    const handleCopyClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        handleCopy([props]);
    }, [handleCopy, props])

    const handleDuplicateClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        handleDuplicate([props]);
    }, [handleDuplicate, props])

    const handleDeleteClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        handleDelete([id]);
    }, [handleDelete, id])

    const handleDetailsClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setDetailsDialogOpen(true);
    }, [])

    const handleDownloadClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        // TODO: Implement download
    }, [])

    if (!name) return null

    return <>
        <div
            onContextMenu={handleContextMenu}
            onDoubleClick={handleDoubleClick}
            className="group"
        >
            <Card className={cn(
                "w-[160px] border hover:border-primary/50 hover:shadow-md transition-all cursor-pointer",
                checked && "border-primary bg-primary/5",
                loading && "opacity-50 pointer-events-none"
            )}>
                <CardHeader className="p-2">
                    <div className="flex items-center justify-between">
                        {
                            selectable && <Checkbox
                                checked={checked}
                                onCheckedChange={handleCheckChange}
                                disabled={loading}
                            />
                        }
                        <div className="flex items-center gap-0.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                    <Button variant="ghost" size="icon" className="h-6 w-6">
                                        <MoreVertical className="h-3.5 w-3.5" />
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
                </CardHeader>
                <CardContent className="flex items-center justify-center py-4">
                    {
                        isFolder ?
                            <FcOpenedFolder className="h-20 w-20" /> :
                            <FcFile className="h-20 w-20" />
                    }
                </CardContent>
                <CardFooter className="px-2 pb-2 pt-0">
                    <div className="w-full truncate text-xs text-center" title={name}>
                        {name}
                    </div>
                </CardFooter>
            </Card>
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

export const FileCardList: React.FC = React.memo(() => {
    const { currentFolderItems } = useFileManagerState() as FileManagerState

    return <div className="h-full w-full overflow-auto max-h-full">
        <div className="flex flex-wrap w-full gap-2 p-6">
            {
                currentFolderItems.map((it) => (
                    <FileCard
                        key={it.id}
                        {...it}
                    />
                ))
            }
        </div>
    </div>
})