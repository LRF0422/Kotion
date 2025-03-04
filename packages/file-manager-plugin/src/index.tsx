
import { KPlugin, PluginConfig } from "@repo/common"
import { FolderExtension } from "./editor-extensions/folder"
import { Folder } from "@repo/icon"
import React from "react"
import { FileManagerView } from "./editor-extensions/component/FileManager"

import "@repo/ui/globals.css"

interface FileManagerPluginConfig extends PluginConfig {



}
class FileManager extends KPlugin<FileManagerPluginConfig> {
}

export const fileManager = new FileManager({
    status: '',
    name: 'test',
    editorExtension: [FolderExtension],
    routes: [
        {
            name: 'fileManager',
            path: '/fileManager',
            element: <FileManagerView className=" h-full" />
        }
    ],
    menus: [
        {
            id: 'fileManager',
            name: 'fileManager',
            key: '文件管理',
            icon: <Folder className="h-5 w-5" />
        }
    ]
})