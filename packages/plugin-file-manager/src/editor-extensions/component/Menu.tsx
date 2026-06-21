import { FolderPlusIcon, UploadIcon, CheckSquare, Square } from "@kn/icon";
import {
    ContextMenu, ContextMenuContent, ContextMenuItem,
    ContextMenuSeparator, ContextMenuShortcut, ContextMenuTrigger, cn,
} from "@kn/ui";
import React, { PropsWithChildren } from "react";
import { useFileManagerState } from "./FileContext";
import { getFileActions } from "./fileActions";

export const Menu: React.FC<PropsWithChildren> = React.memo((props) => {
    const ctx = useFileManagerState();
    const { handleUpload, selectedFiles, loading, selectAll, clearSelection, view } = ctx;

    const fileActions = selectedFiles.length > 0 ? getFileActions(selectedFiles, ctx) : [];

    return (
        <ContextMenu>
            <ContextMenuTrigger className="block h-full w-full">
                {props.children}
            </ContextMenuTrigger>
            <ContextMenuContent className="w-[220px]">
                <ContextMenuItem onClick={selectAll} disabled={loading}>
                    <CheckSquare className="mr-2 h-4 w-4" /> Select All
                    <ContextMenuShortcut>⌘A</ContextMenuShortcut>
                </ContextMenuItem>
                {selectedFiles.length > 0 && (
                    <ContextMenuItem onClick={clearSelection} disabled={loading}>
                        <Square className="mr-2 h-4 w-4" /> Clear ({selectedFiles.length})
                    </ContextMenuItem>
                )}

                {view !== 'trash' && (
                    <>
                        <ContextMenuSeparator />
                        <ContextMenuItem onClick={() => handleUpload('FOLDER')} disabled={loading}>
                            <FolderPlusIcon className="mr-2 h-4 w-4" /> New Folder
                        </ContextMenuItem>
                        <ContextMenuItem onClick={() => handleUpload('FILE')} disabled={loading}>
                            <UploadIcon className="mr-2 h-4 w-4" /> Upload File
                        </ContextMenuItem>
                    </>
                )}

                {fileActions.length > 0 && (
                    <>
                        <ContextMenuSeparator />
                        {fileActions.map((action) => (
                            <React.Fragment key={action.key}>
                                {action.separatorBefore && <ContextMenuSeparator />}
                                <ContextMenuItem
                                    onClick={action.run}
                                    disabled={loading}
                                    className={cn(action.destructive && "text-destructive focus:text-destructive")}
                                >
                                    <span className="mr-2 flex h-4 w-4 items-center justify-center">{action.icon}</span>
                                    {action.label}
                                </ContextMenuItem>
                            </React.Fragment>
                        ))}
                    </>
                )}
            </ContextMenuContent>
        </ContextMenu>
    );
});
