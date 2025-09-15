import { ExtensionWrapper } from "@kn/common"
import { Folder } from "./folder"
import { FolderIcon } from "@kn/icon"
import React from "react"


declare module '@kn/editor' {
    interface Commands<ReturnType> {
        fileManager: {
            insertFolder: () => ReturnType;
        };
    }
}

export const FolderExtension: ExtensionWrapper = {
    name: 'folder',
    extendsion: Folder,
    slashConfig: [
        {
            text: '文件夹',
            slash: '/folder',
            icon: <FolderIcon  className="h-4 w-4"/>,
            action: (editor) => {
                editor.commands.insertFolder()
            }
        }
    ]
}