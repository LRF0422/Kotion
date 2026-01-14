
import { KPlugin, PluginConfig } from "@kn/common"
import { FolderExtension } from "./editor-extensions/folder"
import { Folder } from "@kn/icon"
import React from "react"
import { FileManagerView } from "./editor-extensions/component/FileManager"
import { ImageExtension } from "./editor-extensions/image"

// import "@kn/ui/globals.css"

interface FileManagerPluginConfig extends PluginConfig {
    // Add custom configuration options here if needed
    defaultView?: 'grid' | 'list'
    maxUploadSize?: number
}

class FileManager extends KPlugin<FileManagerPluginConfig> {
    constructor(config: FileManagerPluginConfig) {
        super(config)
    }
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
            key: 'File Manager',
            icon: <Folder className="h-5 w-5" />
        }
    ]
})