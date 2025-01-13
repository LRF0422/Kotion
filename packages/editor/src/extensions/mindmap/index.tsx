import { ExtensionWrapper } from "../../editor";
import { MindMap } from "./mindmap";
import { IconMindTemplate } from "../../icons";
import { MapIcon } from "@repo/icon";
import React from "react";


export const MindMapExtension: ExtensionWrapper = {
    name: MindMap.name,
    extendsion: MindMap,
    slashConfig: [{
        icon: <MapIcon className="h-4 w-4" />,
        text: '思维导图',
        slash: '/mindMap',
        action: (editor) => {
            editor.commands.insertMindMap()
        }
    }]
}