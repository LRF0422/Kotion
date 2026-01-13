import { ExtensionWrapper } from "@kn/common";
import { Bitable } from "./bitable-node";
import { TableIcon } from "@kn/icon";
import React from "react";
import { z } from "@kn/ui";

export const BitableExtension: ExtensionWrapper = {
    name: Bitable.name,
    extendsion: [Bitable],
    slashConfig: [
        {
            text: 'bitable',
            slash: '/bitable',
            icon: <TableIcon className="h-4 w-4" />,
            action: (editor) => {
                editor.commands.insertBitable();
            }
        },
        {
            text: '多维表格',
            slash: '/多维表格',
            icon: <TableIcon className="h-4 w-4" />,
            action: (editor) => {
                editor.commands.insertBitable();
            }
        }
    ],
    tools: [
        {
            name: 'bitable',
            description: '插入多维表格（类似飞书多维表格）',
            inputSchema: z.object({
                fields: z.array(z.string()).optional().describe("字段名称列表"),
            }),
            execute: (editor) => async (params: { fields?: string[] }) => {
                editor.commands.insertBitable(params.fields);
            }
        },
    ]
};
