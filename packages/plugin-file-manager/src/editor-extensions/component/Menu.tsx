import { FolderIcon, Trash2, UploadIcon, Pencil, FolderInput, Copy, Files, Info } from "@kn/icon";
import {
    ContextMenu, ContextMenuContent, ContextMenuItem,
    ContextMenuSeparator, ContextMenuShortcut, ContextMenuTrigger,
    ContextMenuSub, ContextMenuSubTrigger, ContextMenuSubContent,
} from "@kn/ui";
import React, { PropsWithChildren, useContext, useCallback, useState } from "react";
import { FileManageContext, FileManagerState, FileItem } from "./FileContext";
import { RenameDialog, MoveDialog, FileDetailsDialog } from "./dialogs";


export const Menu: React.FC<PropsWithChildren> = React.memo((props) => {

    const {
        handleUpload,
        handleDelete,
        selectedFiles,
        loading,
        handleRename,
        handleMove,
        handleCopy,
        handleDuplicate,
        currentFolderId,
        selectAll,
        clearSelection,
    } = useContext(FileManageContext) as FileManagerState

    // Dialog states
    const [renameDialogOpen, setRenameDialogOpen] = useState(false);
    const [moveDialogOpen, setMoveDialogOpen] = useState(false);
    const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
    const [targetFile, setTargetFile] = useState<FileItem | null>(null);

    const handleCreateFolder = useCallback(() => {
        handleUpload('FOLDER', 'New Folder')
    }, [handleUpload])

    const handleUploadFile = useCallback(() => {
        handleUpload('FILE')
    }, [handleUpload])

    const handleDeleteSelected = useCallback(() => {
        if (selectedFiles.length > 0) {
            handleDelete(selectedFiles.map(f => f.id))
        }
    }, [handleDelete, selectedFiles])

    const handleRenameClick = useCallback(() => {
        if (selectedFiles.length === 1) {
            setTargetFile(selectedFiles[0]);
            setRenameDialogOpen(true);
        }
    }, [selectedFiles])

    const handleMoveClick = useCallback(() => {
        if (selectedFiles.length > 0) {
            setMoveDialogOpen(true);
        }
    }, [selectedFiles])

    const handleCopyClick = useCallback(() => {
        if (selectedFiles.length > 0) {
            handleCopy(selectedFiles);
        }
    }, [handleCopy, selectedFiles])

    const handleDuplicateClick = useCallback(() => {
        if (selectedFiles.length > 0) {
            handleDuplicate(selectedFiles);
        }
    }, [handleDuplicate, selectedFiles])

    const handleDetailsClick = useCallback(() => {
        if (selectedFiles.length === 1) {
            setTargetFile(selectedFiles[0]);
            setDetailsDialogOpen(true);
        }
    }, [selectedFiles])

    const handleSelectAll = useCallback(() => {
        selectAll();
    }, [selectAll])

    const handleClearSelection = useCallback(() => {
        clearSelection();
    }, [clearSelection])

    return <>
        <ContextMenu>
            <ContextMenuTrigger className="h-full w-full">
                {props.children}
            </ContextMenuTrigger>
            <ContextMenuContent className="w-[220px]">
                {/* Selection Actions */}
                <ContextMenuItem onClick={handleSelectAll} disabled={loading}>
                    Select All
                    <ContextMenuShortcut>Ctrl+A</ContextMenuShortcut>
                </ContextMenuItem>
                {selectedFiles.length > 0 && (
                    <ContextMenuItem onClick={handleClearSelection} disabled={loading}>
                        Clear Selection ({selectedFiles.length})
                    </ContextMenuItem>
                )}

                <ContextMenuSeparator />

                {/* Create Actions */}
                <ContextMenuItem onClick={handleCreateFolder} disabled={loading}>
                    New Folder
                    <ContextMenuShortcut>
                        <FolderIcon className="h-4 w-4" />
                    </ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuItem onClick={handleUploadFile} disabled={loading}>
                    Upload File
                    <ContextMenuShortcut>
                        <UploadIcon className="h-4 w-4" />
                    </ContextMenuShortcut>
                </ContextMenuItem>

                {selectedFiles.length > 0 && (
                    <>
                        <ContextMenuSeparator />

                        {/* Single File Actions */}
                        {selectedFiles.length === 1 && (
                            <>
                                <ContextMenuItem onClick={handleRenameClick} disabled={loading}>
                                    Rename
                                    <ContextMenuShortcut>
                                        <Pencil className="h-4 w-4" />
                                    </ContextMenuShortcut>
                                </ContextMenuItem>
                                <ContextMenuItem onClick={handleDetailsClick} disabled={loading}>
                                    Properties
                                    <ContextMenuShortcut>
                                        <Info className="h-4 w-4" />
                                    </ContextMenuShortcut>
                                </ContextMenuItem>
                            </>
                        )}

                        {/* Multi-File Actions */}
                        <ContextMenuItem onClick={handleMoveClick} disabled={loading}>
                            Move to...
                            <ContextMenuShortcut>
                                <FolderInput className="h-4 w-4" />
                            </ContextMenuShortcut>
                        </ContextMenuItem>
                        <ContextMenuItem onClick={handleCopyClick} disabled={loading}>
                            Copy
                            <ContextMenuShortcut>
                                <Copy className="h-4 w-4" />
                            </ContextMenuShortcut>
                        </ContextMenuItem>
                        <ContextMenuItem onClick={handleDuplicateClick} disabled={loading}>
                            Duplicate
                            <ContextMenuShortcut>
                                <Files className="h-4 w-4" />
                            </ContextMenuShortcut>
                        </ContextMenuItem>

                        <ContextMenuSeparator />

                        {/* Destructive Actions */}
                        <ContextMenuItem
                            onClick={handleDeleteSelected}
                            disabled={loading}
                            className="text-destructive focus:text-destructive"
                        >
                            Delete {selectedFiles.length > 1 ? `(${selectedFiles.length})` : ''}
                            <ContextMenuShortcut>
                                <Trash2 className="h-4 w-4" />
                            </ContextMenuShortcut>
                        </ContextMenuItem>
                    </>
                )}
            </ContextMenuContent>
        </ContextMenu>

        {/* Dialogs */}
        <RenameDialog
            open={renameDialogOpen}
            onOpenChange={setRenameDialogOpen}
            file={targetFile}
            onConfirm={handleRename}
        />
        <MoveDialog
            open={moveDialogOpen}
            onOpenChange={setMoveDialogOpen}
            files={selectedFiles}
            onConfirm={handleMove}
            currentFolderId={currentFolderId}
        />
        <FileDetailsDialog
            open={detailsDialogOpen}
            onOpenChange={setDetailsDialogOpen}
            file={targetFile}
        />
    </>

})