import { ExtensionWrapper } from "@kn/common"
import { SpreadsheetNode } from "./spreadsheet-node"
import { Sheet } from "@kn/icon"
import React from "react"
import { triggerExcelFileImport, parseExcelToUniverData } from "./excel-to-univer"

const importExcelAction = async (editor: any) => {
    const file = await triggerExcelFileImport()
    if (!file) return
    const workbookData = await parseExcelToUniverData(file)
    editor.commands.insertSpreadsheet(workbookData)
}

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
        {
            text: 'import-excel',
            slash: '/import-excel',
            icon: <Sheet className="h-4 w-4" />,
            action: importExcelAction,
        },
        {
            text: '导入Excel',
            slash: '/导入Excel',
            icon: <Sheet className="h-4 w-4" />,
            action: importExcelAction,
        },
    ],
}
