import { ExtensionWrapper, logger } from "@kn/common"
import { SpreadsheetNode } from "./spreadsheet-node"
import { Sheet } from "@kn/icon"
import React from "react"
import { pickExcelFileFromCenter } from "./excel-file-picker"
import { spreadsheetTools } from "./tools"
import { spreadsheetExpertSkill } from "./skills"
import { createT } from "../i18n"

const t = createT();

/**
 * Slash-command import: parse the chosen Excel/CSV file and insert a new
 * spreadsheet block pre-filled with its contents.
 */
const importExcelAction = async (editor: any) => {
    const { file, error } = await pickExcelFileFromCenter(editor)
    if (error) {
        logger.warn('[office/spreadsheet] import rejected:', error)
        return
    }
    if (!file) return
    try {
        const { parseExcelToWorkbook } = await import("./excel-to-workbook")
        const workbookData = await parseExcelToWorkbook(file)
        editor.commands.insertSpreadsheet(workbookData)
    } catch (err) {
        logger.error('[office/spreadsheet] failed to import Excel file', err)
    }
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
