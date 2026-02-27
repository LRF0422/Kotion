import { ExtensionWrapper } from "@kn/common"
import { SpreadsheetNode } from "./spreadsheet-node"
import { Sheet } from "@kn/icon"
import React from "react"

export const SpreadsheetExtension: ExtensionWrapper = {
    name: SpreadsheetNode.name,
    extendsion: [SpreadsheetNode],
    slashConfig: [
        {
            text: 'spreadsheet',
            slash: '/spreadsheet',
            icon: <Sheet className="h-4 w-4" />,
            action: (editor) => {
                editor.commands.insertSpreadsheet()
            },
        },
        {
            text: 'excel',
            slash: '/excel',
            icon: <Sheet className="h-4 w-4" />,
            action: (editor) => {
                editor.commands.insertSpreadsheet()
            },
        },
        {
            text: '电子表格',
            slash: '/电子表格',
            icon: <Sheet className="h-4 w-4" />,
            action: (editor) => {
                editor.commands.insertSpreadsheet()
            },
        },
    ],
}
