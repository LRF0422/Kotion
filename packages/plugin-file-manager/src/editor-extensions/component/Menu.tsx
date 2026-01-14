import { FolderIcon, Trash2, UploadIcon } from "@kn/icon";
import {
    ContextMenu, ContextMenuContent, ContextMenuItem,
    ContextMenuSeparator, ContextMenuShortcut, ContextMenuTrigger
} from "@kn/ui";
import React, { PropsWithChildren, useContext, useCallback } from "react";
import { FileManageContext, FileManagerState } from "./FileContext";


export const Menu: React.FC<PropsWithChildren> = React.memo((props) => {

    const { handleUpload, handleDelete, selectedFiles, loading } = useContext(FileManageContext) as FileManagerState

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

    return <ContextMenu>
        <ContextMenuTrigger className="h-full w-full">
            {props.children}
        </ContextMenuTrigger>
        <ContextMenuContent className="w-[200px]">
            <ContextMenuItem onClick={handleCreateFolder} disabled={loading}>
                Create Folder
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
            <ContextMenuSeparator />
            <ContextMenuItem
                onClick={handleDeleteSelected}
                disabled={loading || selectedFiles.length === 0}
                className="text-destructive"
            >
                Delete {selectedFiles.length > 0 ? `(${selectedFiles.length})` : ''}
                <ContextMenuShortcut>
                    <Trash2 className="h-4 w-4" />
                </ContextMenuShortcut>
            </ContextMenuItem>
        </ContextMenuContent>
    </ContextMenu>

})