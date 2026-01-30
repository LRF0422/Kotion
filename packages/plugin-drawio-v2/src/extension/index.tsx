import { ExtensionWrapper } from "@kn/common";
import { DrawioV2 } from "./drawio";
import { ChartNetworkIcon } from "@kn/icon";
import React from "react";

declare module "@kn/editor" {
    interface Commands<ReturnType> {
        drawioV2: {
            insertDrawioV2: () => ReturnType;
            updateDrawioV2: (image: string) => ReturnType;
        };
    }
}

export const DrawioV2Extension: ExtensionWrapper = {
    name: "drawioV2",
    extendsion: DrawioV2.configure({
        openDialog: "dblclick"
    }),
    slashConfig: [
        {
            icon: <ChartNetworkIcon className="h-4 w-4" />,
            text: 'Drawio Diagram (Enhanced)',
            slash: '/drawio-v2',
            action: (editor) => {
                editor.commands.insertDrawioV2()
            }
        },
        {
            icon: <ChartNetworkIcon className="h-4 w-4" />,
            text: '流程图增强版',
            slash: '/流程图v2',
            action: (editor) => {
                editor.commands.insertDrawioV2()
            }
        }
    ]
}
