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
    const { handleUpload, selectedFiles, loading, selectAll, clearSelection, view, selectable, multiple } = ctx;

    const fileActions = selectedFiles.length > 0 ? getFileActions(selectedFiles, ctx) : [];

    return (
        <ContextMenu>
            <ContextMenuTrigger className="block h-full w-full">
                {props.children}
            </ContextMenuTrigger>
            <ContextMenuContent className="w-[220px]">
                {(!selectable || multiple) && (
                    <ContextMenuItem className="h-11 lg:h-8" onClick={selectAll} disabled={loading}>
                        <CheckSquare className="mr-2 h-4 w-4" /> {ctx.t('contextMenu.selectAll')}
                        <ContextMenuShortcut>⌘A</ContextMenuShortcut>
                    </ContextMenuItem>
                )}
                {selectedFiles.length > 0 && (
                    <ContextMenuItem className="h-11 lg:h-8" onClick={clearSelection} disabled={loading}>
                        <Square className="mr-2 h-4 w-4" /> {ctx.t('contextMenu.clear', { count: selectedFiles.length })}
                    </ContextMenuItem>
                )}

                {!selectable && view !== 'trash' && (
                    <>
                        <ContextMenuSeparator />
                        <ContextMenuItem className="h-11 lg:h-8" onClick={() => handleUpload('FOLDER')} disabled={loading}>
                            <FolderPlusIcon className="mr-2 h-4 w-4" /> {ctx.t('contextMenu.newFolder')}
                        </ContextMenuItem>
                        <ContextMenuItem className="h-11 lg:h-8" onClick={() => handleUpload('FILE')} disabled={loading}>
                            <UploadIcon className="mr-2 h-4 w-4" /> {ctx.t('contextMenu.uploadFile')}
                        </ContextMenuItem>
                    </>
                )}

                {fileActions.length > 0 && (
                    <>
                        <ContextMenuSeparator />
                        {fileActions.map((action, index) => (
                            <React.Fragment key={action.key}>
                                {index > 0 && action.separatorBefore && <ContextMenuSeparator />}
                                <ContextMenuItem
                                    onClick={action.run}
                                    disabled={loading}
                                    className={cn(
                                        "h-11 lg:h-8",
                                        action.destructive && "text-destructive focus:text-destructive",
                                    )}
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
