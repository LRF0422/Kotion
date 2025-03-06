import { FolderIcon, Trash2, UploadIcon } from "@repo/icon";
import {
    ContextMenu, ContextMenuContent, ContextMenuItem,
    ContextMenuSeparator, ContextMenuShortcut, ContextMenuTrigger
} from "@repo/ui";
import React, { PropsWithChildren, useContext } from "react";
import { FileManageContext, FileManagerState } from "./FileManager";


export const Menu: React.FC<PropsWithChildren> = (props) => {

    const { handleUpload } = useContext(FileManageContext) as FileManagerState

    return <ContextMenu>
        <ContextMenuTrigger className="h-full w-full">
            {props.children}
        </ContextMenuTrigger>
        <ContextMenuContent className="w-[200px]">
            <ContextMenuItem onClick={() => {
                handleUpload('FOLDER', 'Test')
            }}>Create Folder
                <ContextMenuShortcut>
                    <FolderIcon className="h-4 w-4" />
                </ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onClick={() => {
                handleUpload('FILE')
            }}>Upload File
                <ContextMenuShortcut>
                    <UploadIcon className="h-4 w-4" />
                </ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem>Delete
                <ContextMenuShortcut>
                    <Trash2 className="h-4 w-4" />
                </ContextMenuShortcut>
            </ContextMenuItem>
        </ContextMenuContent>
    </ContextMenu>

}