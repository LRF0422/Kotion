
import { KPlugin, PluginConfig } from "@kn/common"
import { FolderExtension } from "./editor-extensions/folder"
import { AttachmentExtension } from "./editor-extensions/attachment"
import { Folder } from "@kn/icon"
import React from "react"
import { FileManagerView } from "./editor-extensions/component/FileManager"
import { ImageExtension } from "./editor-extensions/image"
import { getFileService } from "./services/FileServiceImpl"

// Export FileService related components
export * from "./services"

// Export file selector utilities
export { showFileSelector } from "./editor-extensions/utils/showFileSelector"
export { showFolderDlg } from "./editor-extensions/utils/showFolderDlg"
export { FileManagerView } from "./editor-extensions/component/FileManager"
export type { FileManagerProps } from "./editor-extensions/component/FileManager"

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

// Create FileService instance for registration
const fileService = getFileService();

export const fileManager = new FileManager({
    status: '',
    name: 'File Manager',
    editorExtension: [FolderExtension, ImageExtension, AttachmentExtension],
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
    ],
    // Register FileService to be accessed via useService/useFileService
    services: {
        fileService: fileService
    }
})