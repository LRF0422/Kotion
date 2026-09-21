/**
 * Pivot table engine.
 *
 * Pure data-in / data-out: it reads a workbook's sheets, unions the configured
 * source ranges, groups by the row/column fields and aggregates the value
 * fields. The result is a plain matrix (plus metadata for styling and
 * drill-down), so the caller can render it into a worksheet, persist it or test
 * it without a DOM.
 */

import type {
    CellValue,
    PivotAggregate,
    PivotConfig,
    PivotDateGroup,
    PivotGroupField,
    PivotRange,
    PivotSource,
    PivotValueField,
    SheetData,
    WorkbookData,
} from './workbook-data'

/** Grid size a generated pivot sheet starts with, so it does not look cramped. */
const DEFAULT_PIVOT_ROWS = 20
const DEFAULT_PIVOT_COLUMNS = 6
const KEY_SEP = '\u0001'

export interface PivotLimits {
    maxRows: number
    maxColumns: number
}

export interface PivotLabels {
    /** Label for the grand-total row/column, e.g. "总计". */
    total: string
    /** Label for the drill-down source column, e.g. "来源". */
    source: string
    /** Human label for an aggregate, e.g. sum -> "求和". */
    aggregate: (kind: PivotAggregate) => string
}

export const defaultPivotLabels: PivotLabels = {
    total: 'Total',
    source: 'Source',
    aggregate: (kind) => kind,
}

/** 0-based column index -> spreadsheet letter label (A, B ... AA). */
function columnLabel(index: number): string {
    let label = ''
    let value = index
    while (value >= 0) {
        label = String.fromCharCode((value % 26) + 65) + label
        value = Math.floor(value / 26) - 1
    }
    return label
}

/** 0-based coordinates -> "A1" style reference. */
function cellRef(row: number, column: number): string {
    return columnLabel(column) + (row + 1)
}

/**
 * Local pad-and-build: keeps this module free of runtime imports so the pure
 * engine can be unit-tested directly by Node (extensionless ESM imports do not
 * resolve there).
 */
function makeSheetData(
    name: string,
    rowCount: number,
    columnCount: number,
    rows: CellValue[][],
    styles: Record<string, string>,
    pivot: PivotConfig,
): SheetData {
    const padded: CellValue[][] = []
    for (let row = 0; row < rowCount; row++) {
        const source = rows[row] ?? []
        const line: CellValue[] = new Array(columnCount)
        for (let column = 0; column < columnCount; column++) {
            line[column] = source[column] === undefined ? null : source[column]
        }
        padded.push(line)
    }
    return {
        name: name || 'Sheet1',
        rows: padded,
        rowCount: Math.max(rowCount, 1),
        columnCount: Math.max(columnCount, 1),
        ...(Object.keys(styles).length > 0 ? { styles } : {}),
        pivot,
    }
}

function cellText(value: CellValue): string {
    return value === null || value === undefined ? '' : String(value)
}

function nonEmpty(value: CellValue): boolean {
    return value !== null && value !== undefined && String(value).trim() !== ''
}

function toNumber(value: CellValue): number | null {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null
    if (typeof value === 'boolean') return value ? 1 : 0
    if (typeof value === 'string') {
        const text = value.trim().replace(/,/g, '')
        if (text === '') return null
        const parsed = Number(text)
        return Number.isFinite(parsed) ? parsed : null
    }
    return null
}

/** Keep averages/sums from surfacing binary-float noise (0.1 + 0.2). */
function round(value: number): number {
    if (!Number.isFinite(value)) return 0
    const rounded = Math.round((value + Number.EPSILON) * 1e10) / 1e10
    return Object.is(rounded, -0) ? 0 : rounded
}

function pad2(value: number): string {
    return value < 10 ? '0' + value : String(value)
}

interface DateParts {
    year: number
    month: number
    day: number
}

/** Excel 1900 date system: serial 1 is 1900-01-01, day 0 offset from 1899-12-30. */
function serialToParts(serial: number): DateParts | null {
    if (!Number.isFinite(serial) || serial <= 0 || serial > 2958465) return null
    const date = new Date(Math.round((serial - 25569) * 86400 * 1000))
    if (Number.isNaN(date.getTime())) return null
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }
}

function dateParts(value: CellValue): DateParts | null {
    if (typeof value === 'number') return serialToParts(value)
    if (typeof value !== 'string') return null
    const text = value.trim()
    if (text === '') return null
    const match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
    if (match) {
        const year = Number(match[1])
        const month = Number(match[2])
        const day = Number(match[3])
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { year, month, day }
        return null
    }
    const serial = Number(text)
    return Number.isFinite(serial) ? serialToParts(serial) : null
}

function dateGroupLabel(parts: DateParts, group: PivotDateGroup): string {
    switch (group) {
        case 'year':
            return String(parts.year)
        case 'quarter':
            return parts.year + ' Q' + (Math.floor((parts.month - 1) / 3) + 1)
        case 'month':
            return parts.year + '-' + pad2(parts.month)
        case 'day':
            return parts.year + '-' + pad2(parts.month) + '-' + pad2(parts.day)
        default:
            return parts.year + '-' + pad2(parts.month) + '-' + pad2(parts.day)
    }
}

/** Group label for one field value, applying the field's date bucket when set. */
export function groupFieldValue(value: CellValue, field: PivotGroupField): string {
    if (!field.dateGroup || field.dateGroup === 'none') return cellText(value).trim()
    const parts = dateParts(value)
    if (!parts) return cellText(value).trim()
    return dateGroupLabel(parts, field.dateGroup)
}

interface Accumulator {
    count: number
    numericCount: number
    sum: number
    min: number
    max: number
}

function createAccumulator(): Accumulator {
    return { count: 0, numericCount: 0, sum: 0, min: Infinity, max: -Infinity }
}

function addValue(accumulator: Accumulator, value: CellValue): void {
    if (nonEmpty(value)) accumulator.count += 1
    const numeric = toNumber(value)
    if (numeric === null) return
    accumulator.numericCount += 1
    accumulator.sum += numeric
    if (numeric < accumulator.min) accumulator.min = numeric
    if (numeric > accumulator.max) accumulator.max = numeric
}

function mergeAccumulator(target: Accumulator, source: Accumulator): void {
    target.count += source.count
    target.numericCount += source.numericCount
    target.sum += source.sum
    if (source.min < target.min) target.min = source.min
    if (source.max > target.max) target.max = source.max
}

function finishAccumulator(accumulator: Accumulator, aggregate: PivotAggregate): CellValue {
    switch (aggregate) {
        case 'count':
            return accumulator.count
        case 'sum':
            return accumulator.numericCount === 0 ? null : round(accumulator.sum)
        case 'average':
            return accumulator.numericCount === 0 ? null : round(accumulator.sum / accumulator.numericCount)
        case 'max':
            return accumulator.numericCount === 0 ? null : round(accumulator.max)
        case 'min':
            return accumulator.numericCount === 0 ? null : round(accumulator.min)
        default:
            return null
    }
}

/**
 * Field labels for the pivot, taken from the first source's header row (or the
 * column letters when the range has no header). Duplicate names are
 * disambiguated ("金额", "金额 (2)").
 */
export function pivotFieldLabels(sheets: SheetData[], sources: PivotSource[], hasHeader: boolean): string[] {
    const first = sources[0]
    const sheet = first ? sheets[first.sheet] : undefined
    const range: PivotRange | undefined = first?.range
    if (!sheet || !range) return []
    const labels: string[] = []
    const used = new Map<string, number>()
    for (let column = range.startColumn; column <= range.endColumn; column++) {
        const raw = hasHeader ? cellText(sheet.rows[range.startRow]?.[column]).trim() : ''
        const base = raw || columnLabel(column)
        const seen = used.get(base) ?? 0
        used.set(base, seen + 1)
        labels.push(seen === 0 ? base : base + ' (' + (seen + 1) + ')')
    }
    return labels
}

interface PivotRecord {
    values: CellValue[]
    sourceSheet: number
    sourceRow: number
    sourceColumn: number
}

/** Flatten every source region into per-field records. */
function pivotRecords(sheets: SheetData[], config: PivotConfig): { fields: string[]; records: PivotRecord[] } {
    const fields = pivotFieldLabels(sheets, config.sources, config.hasHeader)
    const records: PivotRecord[] = []
    if (fields.length === 0) return { fields, records }
    for (const source of config.sources) {
        const sheet = sheets[source.sheet]
        if (!sheet) continue
        const range = source.range
        const start = config.hasHeader ? range.startRow + 1 : range.startRow
        for (let row = start; row <= range.endRow; row++) {
            const values = fields.map((_, offset) => sheet.rows[row]?.[range.startColumn + offset] ?? null)
            records.push({ values, sourceSheet: source.sheet, sourceRow: row, sourceColumn: range.startColumn })
        }
    }
    return { fields, records }
}

function fieldIndexMap(labels: string[]): Map<string, number> {
    const map = new Map<string, number>()
    labels.forEach((label, index) => {
        if (!map.has(label)) map.set(label, index)
    })
    return map
}

function groupTuple(record: PivotRecord, fields: PivotGroupField[], indexByField: Map<string, number>): string[] {
    return fields.map((entry) => {
        const index = indexByField.get(entry.field)
        return index === undefined ? '' : groupFieldValue(record.values[index], entry)
    })
}

export interface PivotColumnMeta {
    /** Index into the source column-key list, or -1 for a row-total column. */
    columnIndex: number
    valueIndex: number
    total: boolean
}

export interface PivotResult {
    rows: CellValue[][]
    rowCount: number
    columnCount: number
    /** 0-based index of the grand-total row, or -1 when there is none. */
    totalRowIndex: number
    /** 0-based indices of the row-total columns. */
    totalColumnIndices: number[]
    /** Number of leading row-header columns. */
    rowFieldCount: number
    /** Grouped row tuples (the header row is 0, then one per data row). */
    rowKeys: string[][]
    /** Distinct column-key tuples. */
    columnKeys: string[][]
    /** Output column layout, parallel to the columns after the row headers. */
    columns: PivotColumnMeta[]
}

function valueLabel(field: PivotValueField, multipleValues: boolean, labels: PivotLabels): string {
    return multipleValues ? field.field + ' · ' + labels.aggregate(field.aggregate) : field.field
}

/** Compute a pivot table from a set of sheets. */
export function computePivot(
    sheets: SheetData[],
    config: PivotConfig,
    labels: PivotLabels = defaultPivotLabels,
    limits?: PivotLimits,
): PivotResult {
    const empty: PivotResult = {
        rows: [[null]], rowCount: 0, columnCount: 0, totalRowIndex: -1,
        totalColumnIndices: [], rowFieldCount: 1, rowKeys: [], columnKeys: [], columns: [],
    }
    const { fields, records } = pivotRecords(sheets, config)
    if (fields.length === 0) return empty

    const indexByField = fieldIndexMap(fields)
    const valueFields = config.values.length > 0 ? config.values : [{ field: fields[0] ?? '', aggregate: 'count' as PivotAggregate }]
    const rowFields = config.rows.filter((field) => indexByField.has(field.field))
    const columnFields = config.columns.filter((field) => indexByField.has(field.field))

    const rowKeys: string[][] = []
    const columnKeys: string[][] = []
    const rowIndexByKey = new Map<string, number>()
    const columnIndexByKey = new Map<string, number>()
    const buckets: Accumulator[][][] = []

    const indexOf = (keys: string[][], lookup: Map<string, number>, tuple: string[]): number => {
        const key = tuple.join(KEY_SEP)
        const existing = lookup.get(key)
        if (existing !== undefined) return existing
        const index = keys.length
        lookup.set(key, index)
        keys.push(tuple)
        return index
    }

    for (const record of records) {
        const rowTuple = groupTuple(record, rowFields, indexByField)
        const columnTuple = groupTuple(record, columnFields, indexByField)
        const rowIndex = indexOf(rowKeys, rowIndexByKey, rowTuple)
        const columnIndex = indexOf(columnKeys, columnIndexByKey, columnTuple)
        buckets[rowIndex] = buckets[rowIndex] ?? []
        buckets[rowIndex][columnIndex] = buckets[rowIndex][columnIndex] ?? valueFields.map(() => createAccumulator())
        const bucket = buckets[rowIndex][columnIndex]
        valueFields.forEach((field, valueIndex) => addValue(bucket[valueIndex], record.values[indexByField.get(field.field) ?? -1] ?? null))
    }

    if (rowKeys.length === 0) {
        rowKeys.push([])
        buckets.push([valueFields.map(() => createAccumulator())])
    }
    if (columnKeys.length === 0) {
        columnKeys.push([])
        buckets.forEach((row) => { if (!row[0]) row[0] = valueFields.map(() => createAccumulator()) })
    }

    const hasColumnGroups = columnFields.length > 0
    const multipleValues = valueFields.length > 1
    const rowFieldCount = Math.max(rowFields.length, 1)
    const outputRows = 1 + rowKeys.length + (config.showColumnTotals ? 1 : 0)
    const outputColumns = rowFieldCount
        + (columnKeys.length + (hasColumnGroups && config.showRowTotals ? 1 : 0)) * valueFields.length
    if (limits && (outputRows > limits.maxRows || outputColumns > limits.maxColumns)) {
        throw new Error(`Pivot output exceeds ${limits.maxRows} rows or ${limits.maxColumns} columns. Reduce the source range, column groups, or measures.`)
    }
    const columns: PivotColumnMeta[] = []
    const columnLabels: string[] = []
    columnKeys.forEach((columnTuple, columnIndex) => {
        const columnLabel = columnTuple.join(' / ')
        valueFields.forEach((field, valueIndex) => {
            const label = hasColumnGroups && !multipleValues
                ? columnLabel
                : (columnLabel ? columnLabel + ' · ' : '') + valueLabel(field, multipleValues, labels)
            columns.push({ columnIndex, valueIndex, total: false })
            columnLabels.push(label)
        })
    })
    const totalColumnIndices: number[] = []
    if (hasColumnGroups && config.showRowTotals) {
        valueFields.forEach((field, valueIndex) => {
            totalColumnIndices.push(rowFieldCount + columns.length)
            columns.push({ columnIndex: -1, valueIndex, total: true })
            columnLabels.push(labels.total + (multipleValues ? ' · ' + valueLabel(field, true, labels) : ''))
        })
    }

    const rowHeaders = rowFields.length > 0 ? rowFields.map((field) => field.field) : ['']
    const header: CellValue[] = [...rowHeaders, ...columnLabels]
    const body: CellValue[][] = []

    rowKeys.forEach((rowTuple, rowIndex) => {
        const line: CellValue[] = new Array(rowFieldCount).fill(null)
        rowTuple.forEach((value, offset) => { line[offset] = value })
        columns.forEach((column) => {
            const bucketsForRow = buckets[rowIndex] ?? []
            if (column.total) {
                const merged = createAccumulator()
                bucketsForRow.forEach((bucket) => mergeAccumulator(merged, bucket[column.valueIndex]))
                line.push(finishAccumulator(merged, valueFields[column.valueIndex].aggregate))
            } else {
                const bucket = bucketsForRow[column.columnIndex]?.[column.valueIndex]
                line.push(bucket ? finishAccumulator(bucket, valueFields[column.valueIndex].aggregate) : null)
            }
        })
        body.push(line)
    })

    let totalRowIndex = -1
    if (config.showColumnTotals) {
        totalRowIndex = body.length + 1
        const totalLine: CellValue[] = new Array(rowFieldCount).fill(null)
        totalLine[0] = labels.total
        columns.forEach((column) => {
            const merged = createAccumulator()
            rowKeys.forEach((_, rowIndex) => {
                const bucketsForRow = buckets[rowIndex] ?? []
                if (column.total) {
                    bucketsForRow.forEach((bucket) => mergeAccumulator(merged, bucket[column.valueIndex]))
                } else if (bucketsForRow[column.columnIndex]) {
                    mergeAccumulator(merged, bucketsForRow[column.columnIndex][column.valueIndex])
                }
            })
            totalLine.push(finishAccumulator(merged, valueFields[column.valueIndex].aggregate))
        })
        body.push(totalLine)
    }

    const rows = [header, ...body]
    return {
        rows,
        rowCount: rows.length,
        columnCount: header.length,
        totalRowIndex,
        totalColumnIndices,
        rowFieldCount,
        rowKeys,
        columnKeys,
        columns,
    }
}

export interface PivotDetail {
    fields: string[]
    headers: string[]
    rows: CellValue[][]
}

/**
 * Underlying source rows behind one output cell (drill-down). `sheetRow` /
 * `sheetColumn` are the cell's coordinates on the generated pivot sheet.
 */
export function pivotDrillDown(
    sheets: SheetData[],
    config: PivotConfig,
    result: PivotResult,
    sheetRow: number,
    sheetColumn: number,
    labels: PivotLabels = defaultPivotLabels,
): PivotDetail | null {
    if (sheetRow <= 0 || sheetRow >= result.rows.length) return null
    const isTotalRow = sheetRow === result.totalRowIndex
    const rowTuple = isTotalRow ? null : result.rowKeys[sheetRow - 1]
    if (rowTuple === undefined) return null

    let columnMeta: PivotColumnMeta | null = null
    if (sheetColumn >= result.rowFieldCount) {
        columnMeta = result.columns[sheetColumn - result.rowFieldCount] ?? null
    }

    const { fields, records } = pivotRecords(sheets, config)
    const indexByField = fieldIndexMap(fields)
    const rowFields = config.rows.filter((field) => indexByField.has(field.field))
    const columnFields = config.columns.filter((field) => indexByField.has(field.field))

    const matched = records.filter((record) => {
        if (rowTuple !== null && groupTuple(record, rowFields, indexByField).join(KEY_SEP) !== rowTuple.join(KEY_SEP)) {
            return false
        }
        if (columnMeta && columnMeta.columnIndex >= 0) {
            const target = result.columnKeys[columnMeta.columnIndex]
            if (!target) return false
            if (groupTuple(record, columnFields, indexByField).join(KEY_SEP) !== target.join(KEY_SEP)) return false
        }
        return true
    })

    const rows = matched.map((record) => {
        const sheetName = sheets[record.sourceSheet]?.name ?? ''
        return [...record.values, sheetName + '!' + cellRef(record.sourceRow, record.sourceColumn)] as CellValue[]
    })
    return { fields, headers: [...fields, labels.source], rows }
}

/** Bold header / totals styling for a generated pivot sheet. */
function pivotStyles(result: PivotResult): Record<string, string> {
    const styles: Record<string, string> = {}
    for (let column = 0; column < result.columnCount; column++) {
        styles[cellRef(0, column)] = 'font-weight: bold'
    }
    if (result.totalRowIndex >= 0) {
        for (let column = 0; column < result.columnCount; column++) {
            styles[cellRef(result.totalRowIndex, column)] = 'font-weight: bold'
        }
    }
    for (const column of result.totalColumnIndices) {
        for (let row = 0; row < result.rows.length; row++) {
            styles[cellRef(row, column)] = 'font-weight: bold'
        }
    }
    return styles
}

/** Build the output worksheet for a pivot definition. */
export function buildPivotSheet(
    workbook: WorkbookData,
    config: PivotConfig,
    name: string,
    labels: PivotLabels = defaultPivotLabels,
    limits?: PivotLimits,
): SheetData {
    const result = computePivot(workbook.sheets, config, labels, limits)
    const columnCount = Math.max(result.columnCount, DEFAULT_PIVOT_COLUMNS)
    const rowCount = Math.max(result.rows.length, DEFAULT_PIVOT_ROWS)
    return makeSheetData(name, rowCount, columnCount, result.rows, pivotStyles(result), config)
}

/**
 * Return a new workbook with the pivot sheet created (or replaced, when a sheet
 * of the same name already exists) and selected.
 */
export function upsertPivotSheet(
    workbook: WorkbookData,
    config: PivotConfig,
    name: string,
    labels: PivotLabels = defaultPivotLabels,
    limits?: PivotLimits,
): WorkbookData {
    const sheet = buildPivotSheet(workbook, config, name, labels, limits)
    const sheets = workbook.sheets.slice()
    const existing = sheets.findIndex((entry) => entry.name === name && entry.pivot)
    let activeSheet: number
    if (existing >= 0) {
        sheets[existing] = sheet
        activeSheet = existing
    } else {
        sheets.push(sheet)
        activeSheet = sheets.length - 1
    }
    return { ...workbook, sheets, activeSheet }
}
