import * as XLSX from 'xlsx'
import type { CellValue, SheetData, WorkbookData } from './workbook-data'

/**
 * Serialize a workbook payload to a .xlsx download.
 *
 * Values, formulas, number formats, merged ranges, column widths and row heights
 * are carried over. Arbitrary CSS styling is still out of scope: the grid stores
 * cell styles as CSS text, which does not map cleanly onto Excel style records.
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
        const worksheet = matrixToSheet(matrix, sheet)
        applyLayout(worksheet, sheet)
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

function currencySymbol(): string {
    return typeof navigator !== 'undefined' && navigator.language?.startsWith('zh') ? '¥' : '$'
}

/** Excel number-format code for a stored format kind. */
function excelFormatCode(kind: string): string {
    switch (kind) {
        case 'decimal':
            return '0.00'
        case 'percent':
            return '0.00%'
        case 'currency':
            return currencySymbol() === '¥' ? '"¥"#,##0.00' : '"$"#,##0.00'
        default:
            return 'General'
    }
}

/** Convert the value matrix, turning `=…` text and stored number formats into real cells. */
function matrixToSheet(matrix: CellValue[][], sheet: SheetData): XLSX.WorkSheet {
    const worksheet: XLSX.WorkSheet = {}
    let maxRow = 0
    let maxColumn = 0

    matrix.forEach((row, rowIndex) => {
        row.forEach((value, columnIndex) => {
            if (value === null || value === undefined || value === '') return
            const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })
            const kind = sheet.numberFormats?.[address]
            const raw = sheet.rawValues?.[address]
            let cell: XLSX.CellObject
            if (kind && kind !== 'general' && typeof raw === 'number' && Number.isFinite(raw)) {
                // Write the real number plus a format code instead of the display string.
                cell = { t: 'n', v: raw, z: excelFormatCode(kind) }
            } else if (typeof value === 'number') {
                cell = { t: 'n', v: value }
            } else if (typeof value === 'boolean') {
                cell = { t: 'b', v: value }
            } else if (typeof value === 'string' && value.startsWith('=')) {
                cell = { t: 'n', f: value.slice(1) }
            } else {
                cell = { t: 's', v: String(value) }
            }
            worksheet[address] = cell
            maxRow = Math.max(maxRow, rowIndex)
            maxColumn = Math.max(maxColumn, columnIndex)
        })
    })

    // Merged ranges may extend past the last cell with a value.
    sheet.merges?.forEach(([, , endColumn, endRow]) => {
        maxRow = Math.max(maxRow, endRow)
        maxColumn = Math.max(maxColumn, endColumn)
    })
    worksheet['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: maxColumn } })
    return worksheet
}

/** Copy sizing and merges onto the worksheet's SheetJS metadata. */
function applyLayout(worksheet: XLSX.WorkSheet, sheet: SheetData): void {
    const widths = sheet.columnWidths ?? {}
    const heights = sheet.rowHeights ?? {}
    const columnCount = Math.max(sheet.columnCount, ...Object.keys(widths).map((key) => Number(key) + 1), 1)
    const rowCount = Math.max(sheet.rowCount, ...Object.keys(heights).map((key) => Number(key) + 1), 1)

    worksheet['!cols'] = Array.from({ length: columnCount }, (_, index) => {
        const width = widths[String(index)]
        return Number.isFinite(width) ? { wpx: width } : {}
    })
    worksheet['!rows'] = Array.from({ length: rowCount }, (_, index) => {
        const height = heights[String(index)]
        return Number.isFinite(height) ? { hpx: height } : {}
    })
    if (sheet.merges && sheet.merges.length > 0) {
        worksheet['!merges'] = sheet.merges.map(([startColumn, startRow, endColumn, endRow]) => ({
            s: { r: startRow, c: startColumn },
            e: { r: endRow, c: endColumn },
        }))
    }
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
