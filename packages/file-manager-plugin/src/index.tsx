
import { KPlugin, PluginConfig } from "@repo/common"
import { FolderExtension } from "./editor-extensions/folder"
import { Folder } from "@repo/icon"
import React from "react"
import "@repo/ui/globals.css"

interface FileManagerPluginConfig extends PluginConfig {



}
class FileManager extends KPlugin<FileManagerPluginConfig> {
}

export const fileManager = new FileManager({
    status: '',
    name: 'test',
    editorExtension: [FolderExtension],
    menus: [
        {
            id: 'fileManager',
            name: 'fileManager',
            key: '文件管理',
            icon: <Folder className="h-5 w-5" />,
            onClick: () => {
                console.log('fileManager')
            }
        }
    ]
})