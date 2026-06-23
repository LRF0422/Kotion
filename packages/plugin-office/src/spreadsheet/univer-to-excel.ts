import * as XLSX from 'xlsx'

/**
 * Convert Univer IWorkbookData (the snapshot stored on the node) back into a
 * SheetJS workbook. This is the reverse of `parseExcelToUniverData`.
 *
 * Preserves: cell values (string/number/boolean), formulas, merged cells,
 * column widths and row heights. Cell styling (font/color/border) is NOT
 * round-tripped — SheetJS community edition has limited style support.
 */

// Univer cell value types (mirror of excel-to-univer.ts)
const CellValueType = {
    STRING: 1,
    NUMBER: 2,
    BOOLEAN: 3,
} as const

export function univerDataToWorkbook(workbookData: Record<string, any> | null): XLSX.WorkBook {
    const wb = XLSX.utils.book_new()

    const sheets: Record<string, any> = workbookData?.sheets ?? {}
    // Respect the saved sheet order; fall back to object key order.
    const order: string[] =
        Array.isArray(workbookData?.sheetOrder) && workbookData.sheetOrder.length > 0
            ? workbookData.sheetOrder
            : Object.keys(sheets)

    // Track used sheet names to avoid SheetJS duplicate-name errors.
    const usedNames = new Set<string>()

    if (order.length === 0) {
        // Empty workbook — emit a single blank sheet so the file is valid.
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), 'Sheet1')
        return wb
    }

    order.forEach((sheetId, sheetIndex) => {
        const sheet = sheets[sheetId]
        if (!sheet) return

        const ws: XLSX.WorkSheet = {}
        const cellData: Record<number, Record<number, any>> = sheet.cellData ?? {}

        let maxRow = 0
        let maxCol = 0

        for (const rKey of Object.keys(cellData)) {
            const r = Number(rKey)
            const rowObj = cellData[r]
            if (!rowObj) continue
            for (const cKey of Object.keys(rowObj)) {
                const c = Number(cKey)
                const cell = rowObj[c]
                if (!cell) continue

                const xlsxCell = univerCellToXlsx(cell)
                if (!xlsxCell) continue

                ws[XLSX.utils.encode_cell({ r, c })] = xlsxCell
                if (r > maxRow) maxRow = r
                if (c > maxCol) maxCol = c
            }
        }

        // Reference range — required for SheetJS to know the sheet extent.
        ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: maxCol } })

        // Merged cells
        if (Array.isArray(sheet.mergeData) && sheet.mergeData.length > 0) {
            ws['!merges'] = sheet.mergeData.map((m: any) => ({
                s: { r: m.startRow, c: m.startColumn },
                e: { r: m.endRow, c: m.endColumn },
            }))
        }

        // Column widths (pixels → SheetJS wpx)
        if (sheet.columnData && Object.keys(sheet.columnData).length > 0) {
            const cols: any[] = []
            for (const idxKey of Object.keys(sheet.columnData)) {
                const idx = Number(idxKey)
                const w = sheet.columnData[idx]?.w
                if (typeof w === 'number') cols[idx] = { wpx: w }
            }
            if (cols.length > 0) ws['!cols'] = cols
        }

        // Row heights (pixels → SheetJS hpx)
        if (sheet.rowData && Object.keys(sheet.rowData).length > 0) {
            const rows: any[] = []
            for (const idxKey of Object.keys(sheet.rowData)) {
                const idx = Number(idxKey)
                const h = sheet.rowData[idx]?.h
                if (typeof h === 'number') rows[idx] = { hpx: h }
            }
            if (rows.length > 0) ws['!rows'] = rows
        }

        const name = uniqueSheetName(sheet.name || `Sheet${sheetIndex + 1}`, usedNames)
        XLSX.utils.book_append_sheet(wb, ws, name)
    })

    // Guard: a workbook must contain at least one sheet.
    if (wb.SheetNames.length === 0) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), 'Sheet1')
    }

    return wb
}

/** Convert a single Univer cell to a SheetJS cell object. */
function univerCellToXlsx(cell: Record<string, any>): XLSX.CellObject | null {
    const out: any = {}

    // Formula (Univer stores with a leading '='; SheetJS expects it without).
    if (typeof cell.f === 'string' && cell.f.length > 0) {
        out.f = cell.f.startsWith('=') ? cell.f.slice(1) : cell.f
    }

    const v = cell.v
    if (cell.t === CellValueType.NUMBER || typeof v === 'number') {
        out.t = 'n'
        out.v = typeof v === 'number' ? v : Number(v)
        if (Number.isNaN(out.v)) out.v = 0
    } else if (cell.t === CellValueType.BOOLEAN || typeof v === 'boolean') {
        out.t = 'b'
        out.v = typeof v === 'boolean' ? v : v === 'true' || v === 1
    } else if (v !== undefined && v !== null) {
        out.t = 's'
        out.v = String(v)
    } else if (out.f) {
        // Formula with no cached value — leave as string-typed shell.
        out.t = 'n'
    } else {
        return null
    }

    return out as XLSX.CellObject
}

/** Ensure sheet names are unique and within Excel's 31-char limit. */
function uniqueSheetName(name: string, used: Set<string>): string {
    // Excel forbids these chars in sheet names: \ / ? * [ ] :
    let base = name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim() || 'Sheet'
    let candidate = base
    let i = 1
    while (used.has(candidate.toLowerCase())) {
        const suffix = `_${i++}`
        candidate = base.slice(0, 31 - suffix.length) + suffix
    }
    used.add(candidate.toLowerCase())
    return candidate
}

/**
 * Serialize Univer workbook data to a .xlsx file and trigger a browser download.
 */
export function downloadWorkbookAsExcel(
    workbookData: Record<string, any> | null,
    filename = 'spreadsheet.xlsx',
): void {
    const wb = univerDataToWorkbook(workbookData)
    const arrayBuffer: ArrayBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([arrayBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    // Revoke on next tick so the download has a chance to start.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
}
