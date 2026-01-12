import { ExtensionWrapper } from "@kn/common";
import { Mermaid } from "./mermaid";
import { ChartPieIcon } from "@kn/icon";
import React from "react";
import { z } from "@kn/ui";


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
    ],
    tools: [
        {
            name: 'mermaid',
            description: '插入 Mermaid 图表',
            inputSchema: z.object({
                code: z.string().describe("Mermaid 代码"),
            }),
            execute: (editor) => async (params: { code: string }) => {
                editor.commands.insertMermaid(params.code)
            }
        },
    ]
}