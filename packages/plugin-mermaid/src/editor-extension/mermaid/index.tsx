import { ExtensionWrapper } from "@repo/common";
import { Mermaid } from "./mermaid";
import { ChartPieIcon } from "@repo/icon";
import React from "react";


export const MermaidExtension: ExtensionWrapper = {
    name: Mermaid.name,
    extendsion: [Mermaid],
    slashConfig: [
        {
            text: 'mermaid',
            slash: '/mermaid',
            icon: <ChartPieIcon className="h-4 w-4" />,
            action: (editor) => {
                editor.commands.insertMermaid()
            }
        }
    ]
}