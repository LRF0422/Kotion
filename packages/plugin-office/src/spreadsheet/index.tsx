import { ExtensionWrapper } from "@kn/common"
import { SpreadsheetNode } from "./spreadsheet-node"
import { Sheet } from "@kn/icon"
import React from "react"
import { triggerExcelFileImport } from "./excel-file-picker"
import { spreadsheetTools } from "./tools"
import { spreadsheetExpertSkill } from "./skills"
import { createT } from "../i18n"

const t = createT();

const importExcelAction = async (editor: any) => {
    const file = await triggerExcelFileImport()
    if (!file) return
    const { parseExcelToUniverData } = await import("./excel-to-univer")
    const workbookData = await parseExcelToUniverData(file)
    editor.commands.insertSpreadsheet(workbookData)
}

export const SpreadsheetExtension: ExtensionWrapper = {
    name: SpreadsheetNode.name,
    extendsion: [SpreadsheetNode],
    slashConfig: [
        {
            text: t('slashCommands.spreadsheet'),
            slash: '/spreadsheet',
            icon: <Sheet className="h-4 w-4" />,
            action: (editor) => {
                editor.commands.insertSpreadsheet()
            },
        },
        {
            text: t('slashCommands.importExcel'),
            slash: '/import-excel',
            icon: <Sheet className="h-4 w-4" />,
            action: importExcelAction,
        },
    ],
    tools: spreadsheetTools,
    skills: [spreadsheetExpertSkill],
}
