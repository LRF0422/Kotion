import * as XLSX from 'xlsx'

/**
 * Trigger a file picker for Excel files and return the selected file.
 */
export function triggerExcelFileImport(): Promise<File | null> {
    return new Promise((resolve) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.xlsx,.xls,.csv'
        input.onchange = () => {
            const file = input.files?.[0] ?? null
            resolve(file)
        }
        // User cancelled
        input.addEventListener('cancel', () => resolve(null))
        input.click()
    })
}

// Univer cell value types
const CellValueType = {
    STRING: 1,
    NUMBER: 2,
    BOOLEAN: 3,
} as const

/**
 * Parse an Excel file and convert it to Univer IWorkbookData format.
 */
export async function parseExcelToUniverData(file: File): Promise<Record<string, any>> {
    const arrayBuffer = await file.arrayBuffer()
    const workbook = XLSX.read(arrayBuffer, { type: 'array' })

    const sheets: Record<string, any> = {}
    const sheetOrder: string[] = []

    workbook.SheetNames.forEach((sheetName, sheetIndex) => {
        const ws = workbook.Sheets[sheetName]
        if (!ws) return

        const sheetId = `sheet-${sheetIndex}`
        sheetOrder.push(sheetId)

        // Get sheet range
        const ref = ws['!ref']
        const range = ref ? XLSX.utils.decode_range(ref) : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } }
        const rowCount = range.e.r + 1
        const columnCount = range.e.c + 1

        // Build cellData sparse matrix
        const cellData: Record<number, Record<number, any>> = {}

        for (let r = range.s.r; r <= range.e.r; r++) {
            for (let c = range.s.c; c <= range.e.c; c++) {
                const cellAddress = XLSX.utils.encode_cell({ r, c })
                const cell = ws[cellAddress]
                if (!cell) continue

                if (!cellData[r]) cellData[r] = {}

                const cellInfo: any = { v: cell.v }

                if (typeof cell.v === 'number') {
                    cellInfo.t = CellValueType.NUMBER
                } else if (typeof cell.v === 'boolean') {
                    cellInfo.t = CellValueType.BOOLEAN
                } else {
                    cellInfo.t = CellValueType.STRING
                    // Use formatted text if available
                    if (cell.w !== undefined) {
                        cellInfo.v = cell.w
                    } else if (cell.v !== undefined) {
                        cellInfo.v = String(cell.v)
                    }
                }

                cellData[r][c] = cellInfo
            }
        }

        // Process merge cells
        const mergeData: any[] = []
        if (ws['!merges']) {
            for (const merge of ws['!merges']) {
                mergeData.push({
                    startRow: merge.s.r,
                    startColumn: merge.s.c,
                    endRow: merge.e.r,
                    endColumn: merge.e.c,
                })
            }
        }

        // Process column widths
        const columnData: Record<number, any> = {}
        if (ws['!cols']) {
            ws['!cols'].forEach((col: any, idx: number) => {
                if (col && col.wpx) {
                    columnData[idx] = { w: col.wpx }
                } else if (col && col.wch) {
                    // Convert character width to pixels (approx 8px per char)
                    columnData[idx] = { w: col.wch * 8 }
                }
            })
        }

        // Process row heights
        const rowData: Record<number, any> = {}
        if (ws['!rows']) {
            ws['!rows'].forEach((row: any, idx: number) => {
                if (row && row.hpx) {
                    rowData[idx] = { h: row.hpx }
                } else if (row && row.hpt) {
                    // Convert points to pixels (1pt ≈ 1.333px)
                    rowData[idx] = { h: Math.round(row.hpt * 1.333) }
                }
            })
        }

        sheets[sheetId] = {
            id: sheetId,
            name: sheetName,
            rowCount: Math.max(rowCount, 100),
            columnCount: Math.max(columnCount, 26),
            cellData,
            mergeData: mergeData.length > 0 ? mergeData : undefined,
            columnData: Object.keys(columnData).length > 0 ? columnData : undefined,
            rowData: Object.keys(rowData).length > 0 ? rowData : undefined,
            defaultColumnWidth: 88,
            defaultRowHeight: 24,
        }
    })

    return {
        id: `workbook-${Date.now()}`,
        sheetOrder,
        sheets,
        appVersion: '1.0.0',
    }
}
