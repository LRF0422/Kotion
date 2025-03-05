import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@repo/ui";
import React, { PropsWithChildren } from "react";


export const Menu: React.FC<PropsWithChildren> = (props) => {

    return <ContextMenu>
        <ContextMenuTrigger className="h-full w-full">
            {props.children}
        </ContextMenuTrigger>
        <ContextMenuContent>
            <ContextMenuItem>Create Folder</ContextMenuItem>
            <ContextMenuItem>Upload File</ContextMenuItem>
        </ContextMenuContent>
    </ContextMenu>

}