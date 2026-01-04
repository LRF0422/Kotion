
import { KPlugin, PluginConfig } from "@kn/common"
import { FolderExtension } from "./editor-extensions/folder"
import { Folder } from "@kn/icon"
import React from "react"
import { FileManagerView } from "./editor-extensions/component/FileManager"
import { ImageExtension } from "./editor-extensions/image"

// import "@kn/ui/globals.css"

interface FileManagerPluginConfig extends PluginConfig {



}
class FileManager extends KPlugin<FileManagerPluginConfig> {
}

export const fileManager = new FileManager({
    status: '',
    name: 'File Manager',
    editorExtension: [FolderExtension, ImageExtension],
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