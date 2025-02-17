import { ExtensionWrapper } from "@repo/common"
import { Folder } from "./folder"
import { FolderIcon } from "@repo/icon"
import React from "react"

export const FolderExtension: ExtensionWrapper = {
    name: 'folder',
    extendsion: Folder,
    slashConfig: [
        {
            text: '文件夹',
            slash: '/folder',
            icon: <FolderIcon />,
            action: (editor) => {
            }
        }
    ]
}