import React from "react";
import { ExtensionWrapper } from "../../editor";
import { Excalidraw } from "./excalidraw";
import { PaintBucket } from "@repo/icon";


export const ExcalidrawExtension: ExtensionWrapper = {
    name: 'excalidraw',
    extendsion: [Excalidraw],
    slashConfig: [
        {
            text: 'excalidraw',
            icon: <PaintBucket className="h-4 w-4" />,
            slash: '/excalidraw',
            action: (editor) => {
                editor.commands.insertExcalidraw()
            }
        }
    ]
}