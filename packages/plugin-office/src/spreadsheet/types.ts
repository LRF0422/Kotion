export interface SpreadsheetAttrs {
    /** Univer IWorkbookData snapshot, null for a fresh workbook */
    workbookData: Record<string, any> | null
    /** Block height in pixels */
    height: number
}
