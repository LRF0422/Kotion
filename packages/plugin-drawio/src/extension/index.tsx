import { ExtensionWrapper } from "@kn/common";
import { Drawio } from "./drawio";
import { ChartNetworkIcon } from "@kn/icon";
import React from "react";

declare module "@kn/editor" {
    interface Commands<ReturnType> {
        drawio: {
            insertDrawIo: () => ReturnType;

            update: (image: string) => ReturnType
        };
    }
}

export const DrawioExtension: ExtensionWrapper = {
    name: "drawio",
    extendsion: Drawio.configure({
        openDialog: "dblclick"
    }),
    slashConfig: [
        {
            icon: <ChartNetworkIcon className="h-4 w-4" />,
            text: 'drawio',
            slash: '/drawio',
            action: (editor) => {
                editor.commands.insertDrawIo()
            }
        }
    ]
}