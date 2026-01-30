import { ExtensionWrapper } from "@kn/common";
import { Bitable } from "./bitable-node";
import { TableIcon } from "@kn/icon";
import React from "react";
import { bitableTools } from "./bitable-tools";

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
    tools: bitableTools
};
