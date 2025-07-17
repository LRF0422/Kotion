import React from "react";
import { ExtensionWrapper } from "@kn/common";
import { SyncBlock } from "./sync-block";
import { BlocksIcon } from "@kn/icon";
import { Node, NodeType } from "@tiptap/pm/model";

export const SyncBlockExtension: ExtensionWrapper = {
    name: SyncBlock.name,
    extendsion: SyncBlock,
    slashConfig: [
        {
            icon: <BlocksIcon className="h-4 w-4" />,
            text: '同步块',
            slash: '/sync',
            action: (editor) => {
                editor.commands.insertContent({
                    type: SyncBlock.name,
                    attrs: {
                        id: '88888888'
                    }
                })
            }
        }
    ]
}