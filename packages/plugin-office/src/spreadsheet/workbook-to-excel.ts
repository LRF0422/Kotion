import * as XLSX from 'xlsx'
import type { CellValue, WorkbookData } from './workbook-data'

/**
 * Serialize a workbook payload to a .xlsx download.
 *
 * Column widths and row heights are not tracked by the grid, so the exported
 * file carries values and formulas; formatting beyond that is out of scope.
 */
export function downloadWorkbookAsExcel(workbook: WorkbookData | null, filename = 'spreadsheet.xlsx'): void {
    const book = workbookToXlsx(workbook)
    const arrayBuffer: ArrayBuffer = XLSX.write(book, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([arrayBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    // Revoke on the next tick so the download has a chance to start.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Build a SheetJS workbook from a payload. */
export function workbookToXlsx(workbook: WorkbookData | null): XLSX.WorkBook {
    const book = XLSX.utils.book_new()
    const sheets = workbook?.sheets ?? []
    const used = new Set<string>()

    if (sheets.length === 0) {
        XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([[]]), 'Sheet1')
        return book
    }

    sheets.forEach((sheet, index) => {
        const matrix = trimTrailingEmpties(sheet.rows)
        const worksheet = matrixToSheet(matrix)
        XLSX.utils.book_append_sheet(book, worksheet, uniqueSheetName(sheet.name, index, used))
    })

    if (book.SheetNames.length === 0) {
        XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([[]]), 'Sheet1')
    }
    return book
}

/** Drop trailing empty rows/columns so the exported range is tight. */
function trimTrailingEmpties(rows: CellValue[][]): CellValue[][] {
    let lastRow = -1
    let lastColumn = -1
    rows.forEach((row, rowIndex) => {
        row.forEach((value, columnIndex) => {
            if (value !== null && value !== undefined && value !== '') {
                lastRow = Math.max(lastRow, rowIndex)
                lastColumn = Math.max(lastColumn, columnIndex)
            }
        })
    })
    if (lastRow < 0 || lastColumn < 0) return []
    return rows.slice(0, lastRow + 1).map((row) => row.slice(0, lastColumn + 1))
}

/** Convert the value matrix, turning `=…` text into real formulas. */
function matrixToSheet(matrix: CellValue[][]): XLSX.WorkSheet {
    const worksheet: XLSX.WorkSheet = {}
    let maxRow = 0
    let maxColumn = 0

    matrix.forEach((row, rowIndex) => {
        row.forEach((value, columnIndex) => {
            if (value === null || value === undefined || value === '') return
            const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })
            const cell: XLSX.CellObject = typeof value === 'number'
                ? { t: 'n', v: value }
                : typeof value === 'boolean'
                    ? { t: 'b', v: value }
                    : typeof value === 'string' && value.startsWith('=')
                        ? { t: 'n', f: value.slice(1) }
                        : { t: 's', v: String(value) }
            worksheet[address] = cell
            maxRow = Math.max(maxRow, rowIndex)
            maxColumn = Math.max(maxColumn, columnIndex)
        })
    })

    worksheet['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: maxColumn } })
    return worksheet
}

function uniqueSheetName(name: string, index: number, used: Set<string>): string {
    const base = String(name || `Sheet${index + 1}`)
        .replace(/[\\/?*[\]:]/g, ' ')
        .slice(0, 31)
        .trim() || `Sheet${index + 1}`
    let candidate = base
    let suffix = 1
    while (used.has(candidate.toLowerCase())) {
        const tag = `_${suffix++}`
        candidate = base.slice(0, 31 - tag.length) + tag
    }
    used.add(candidate.toLowerCase())
    return candidate
}
