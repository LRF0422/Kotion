import { KPlugin, PluginConfig, liftLegacySkills, liftLegacyTools, setFileSelectorImpl } from "@kn/common"
import { FolderExtension } from "./editor-extensions/folder"
import { fileManagerTools } from "./editor-extensions/folder/tools"
import { fileManagerSkill } from "./editor-extensions/folder/skills/file-manager-skill"
import { AttachmentExtension } from "./editor-extensions/attachment"
import { Folder } from "@kn/icon"
import type { Editor } from "@kn/editor"
import React from "react"
import { FileManagerView } from "./editor-extensions/component/FileManager"
import { ImageExtension } from "./editor-extensions/image"
import { showFileSelector } from "./editor-extensions/utils/showFileSelector"

// import "@kn/ui/globals.css"

interface FileManagerPluginConfig extends PluginConfig {
    // Add custom configuration options if needed
    defaultView?: 'grid' | 'list'
    maxUploadSize?: number
}

class FileManager extends KPlugin<FileManagerPluginConfig> {
    constructor(config: FileManagerPluginConfig) {
        super(config)
    }
}

/**
 * File operations themselves are host-owned: `FileService` is a core service
 * registered by `@kn/core`, and this plugin only calls it. The one piece the
 * host cannot own is the picker *dialog* (it is built from this plugin's tree
 * and editor context), so it is published through the common bridge that
 * `fileService.openFileSelector` consumes.
 */
setFileSelectorImpl((options, editor) => showFileSelector(editor as Editor, options))

export const fileManager = new FileManager({
    status: '',
    name: 'File Manager',
    editorExtension: [FolderExtension, ImageExtension, AttachmentExtension],
    tools: liftLegacyTools(fileManagerTools, { scope: 'page' }),
    skills: liftLegacySkills([fileManagerSkill]),
    routes: [
        {
            name: 'fileManager',
            path: '/fileManager',
            element: <FileManagerView className=" h-full" />
        }
    ],
    menus: [
        {
            id: '/fileManager',
            name: 'fileManager',
            key: 'File Manager',
            icon: <Folder className="h-5 w-5" />
        }
    ],
})
