import { ExtensionWrapper } from "@kn/common";
import { Folder } from "./folder";
import { FolderInline } from "./folder-inline";
import { FolderIcon } from "@kn/icon";
import React from "react";
import { fileManagerTools } from "./tools";
import { fileManagerSkill } from "./skills/file-manager-skill";
import { createT } from "../../i18n";
import { showFileSelector } from "../utils/showFileSelector";


declare module '@kn/editor' {
    interface Commands<ReturnType> {
        fileManager: {
            insertFolder: () => ReturnType;
            insertInlineFolder: (options: { folderId: string; folderName: string }) => ReturnType;
        };
    }
}

export const FolderExtension: ExtensionWrapper = {
    name: 'folder',
    extendsion: [Folder, FolderInline],
    slashConfig: [
        {
            text: createT()('slashCommands.folder'),
            slash: '/folder',
            icon: <FolderIcon className="h-4 w-4" />,
            action: (editor) => {
                editor.commands.insertFolder();
            },
        },
        {
            text: createT()('slashCommands.folderInline'),
            slash: '/folder-inline',
            icon: <FolderIcon className="h-4 w-4" />,
            action: (editor) => {
                void showFileSelector(editor, {
                    multiple: false,
                    target: 'folder',
                }).then((files) => {
                    if (files?.length !== 1 || !files[0].isFolder) return;
                    editor.commands.insertInlineFolder({
                        folderId: String(files[0].id),
                        folderName: files[0].name,
                    });
                });
            },
        },
    ],
    tools: fileManagerTools,
    skills: [fileManagerSkill],
};
