import { ExtensionWrapper } from "@kn/common"
import { Folder } from "./folder"
import { FolderIcon } from "@kn/icon"
import React from "react"
import { fileManagerTools } from "./tools"
import { fileManagerSkill } from "./skills/file-manager-skill"
import { createT } from "../../i18n"


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
            text: createT()('slashCommands.folder'),
            slash: '/folder',
            icon: <FolderIcon className="h-4 w-4" />,
            action: (editor) => {
                editor.commands.insertFolder()
            }
        }
    ],
    tools: fileManagerTools,
    skills: [fileManagerSkill]
}