import { ExtensionWrapper } from "@kn/common";
import { Drawnix } from "./drawnix";
import { Paintbrush2 } from "@kn/icon";
import React from "react";


export const DrawnixExtension: ExtensionWrapper = {
    name: 'drawnix',
    extendsion: [Drawnix],
    slashConfig: [
        {
            icon: <Paintbrush2 className="h-4 w-4" />,
            text: 'drawnix',
            slash: '/drawnix',
            action: (editor) => {
                editor.chain().focus().insertDrawnix().run()
            }
        }
    ]
}