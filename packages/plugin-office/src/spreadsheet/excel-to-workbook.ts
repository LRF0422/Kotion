import * as XLSX from 'xlsx'
import { logger } from '@kn/common'
import {
    createWorkbookFromRows,
    type CellValue,
    type WorkbookData,
} from './workbook-data'

export { triggerExcelFileImport, pickExcelFile, pickExcelFileFromCenter } from './excel-file-picker'

/** Dimensions we are willing to materialise from a file. */
const MAX_ROWS = 10_000
const MAX_COLUMNS = 256
const MAX_SHEETS = 20

/**
 * Parse an Excel/CSV file into a workbook payload.
 *
 * `cellDates` makes SheetJS surface real Date values, so date-formatted cells are
 * imported as readable dates instead of their raw serial numbers. Formulas are
 * preserved as their `=…` text; anything beyond the size caps is dropped with a
 * warning.
 */
export async function parseExcelToWorkbook(file: File, workbookId?: string): Promise<WorkbookData> {
    const arrayBuffer = await file.arrayBuffer()

    let book: XLSX.WorkBook
    try {
        book = XLSX.read(arrayBuffer, { type: 'array', cellFormula: true, cellText: true, cellDates: true })
    } catch (error) {
        logger.warn('[office/spreadsheet] XLSX.read failed', error)
        throw new Error(`无法解析文件「${file.name}」，请确认它是有效的 Excel/CSV 文件`)
    }

    const allSheetNames = book.SheetNames?.filter((name) => !!book.Sheets[name]) ?? []
    if (allSheetNames.length === 0) {
        throw new Error(`文件「${file.name}」中没有可读取的工作表`)
    }
    if (allSheetNames.length > MAX_SHEETS) {
        logger.warn(`[office/spreadsheet] "${file.name}" has ${allSheetNames.length} sheets; importing the first ${MAX_SHEETS}`)
    }
    const sheetNames = allSheetNames.slice(0, MAX_SHEETS)

    // jspreadsheet renders strings; numbers are kept numeric so formulas and
    // sorting behave, everything else is normalised to a display string.
    const sheets = sheetNames.map((sheetName, index) => {
        const sheet = book.Sheets[sheetName]
        const ref = sheet?.['!ref']
        const range = ref ? XLSX.utils.decode_range(ref) : null
        const rows: CellValue[][] = []
        if (range) {
            const totalRows = range.e.r - range.s.r + 1
            const totalColumns = range.e.c - range.s.c + 1
            if (totalRows > MAX_ROWS) {
                logger.warn(`[office/spreadsheet] sheet "${sheetName}" has ${totalRows} rows; importing the first ${MAX_ROWS}`)
            }
            if (totalColumns > MAX_COLUMNS) {
                logger.warn(`[office/spreadsheet] sheet "${sheetName}" has ${totalColumns} columns; importing the first ${MAX_COLUMNS}`)
            }
            const lastRow = Math.min(range.e.r, MAX_ROWS - 1)
            const lastColumn = Math.min(range.e.c, MAX_COLUMNS - 1)
            for (let row = range.s.r; row <= lastRow; row++) {
                const line: CellValue[] = []
                for (let column = range.s.c; column <= lastColumn; column++) {
                    line.push(readCell(sheet, row, column))
                }
                rows.push(line)
            }
        }
        return {
            name: uniqueSheetName(sheetName, index),
            rows,
            rowCount: Math.max(rows.length, 1),
            columnCount: Math.max(rows.reduce((max, line) => Math.max(max, line.length), 0), 1),
        }
    })

    const workbook = createWorkbookFromRows(sheets[0]?.rows ?? [])
    workbook.id = workbookId ?? workbook.id
    workbook.sheets = sheets
    workbook.activeSheet = 0
    return workbook
}

/** Read one cell as a value jspreadsheet can render. */
function readCell(sheet: XLSX.WorkSheet, row: number, column: number): CellValue {
    const cell = sheet?.[XLSX.utils.encode_cell({ r: row, c: column })]
    if (!cell) return null
    if (typeof cell.f === 'string' && cell.f.length > 0) {
        return cell.f.startsWith('=') ? cell.f : `=${cell.f}`
    }
    if (cell.v instanceof Date) {
        if (typeof cell.w === 'string' && cell.w) return cell.w
        return cell.v.toISOString().slice(0, 10)
    }
    if (typeof cell.v === 'number') return cell.v
    if (typeof cell.v === 'boolean') return cell.v
    if (cell.w !== undefined) return cell.w
    if (cell.v === undefined || cell.v === null) return null
    return String(cell.v)
}

/** Excel forbids these characters in sheet names, and caps them at 31 chars. */
function uniqueSheetName(name: string, index: number): string {
    const base = String(name || `Sheet${index + 1}`)
        .replace(/[\\/?*[\]:]/g, ' ')
        .slice(0, 31)
        .trim()
    return base || `Sheet${index + 1}`
}
