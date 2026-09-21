import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
    Button,
    Checkbox,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Input,
    Label,
    ScrollArea,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Toggle,
    cn,
} from "@kn/ui"
import { X } from "@kn/icon"
import type { GridApi } from "./useJspreadsheet"
import { computePivot, pivotFieldLabels, upsertPivotSheet, type PivotLabels } from "./pivot"
import {
    formatCellRef,
    parseRangeSpec,
    type PivotAggregate,
    type PivotConfig,
    type PivotDateGroup,
    type PivotGroupField,
    type PivotRange,
    type PivotSource,
    type PivotValueField,
    type SheetData,
    type WorkbookData,
} from "./workbook-data"
import { translate } from "../i18n"

const AGGREGATES: PivotAggregate[] = ['sum', 'count', 'average', 'max', 'min']
const DATE_GROUPS: PivotDateGroup[] = ['none', 'year', 'quarter', 'month', 'day']
type FieldArea = 'rows' | 'columns' | 'values'

interface SourceDraft {
    sheet: number
    text: string
}

interface PivotDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    grid: GridApi
}

/** Bounding box of the populated cells, or null when the sheet is empty. */
function usedRange(sheet: SheetData): PivotRange | null {
    let endRow = -1
    let endColumn = -1
    sheet.rows.forEach((row, rowIndex) => {
        row.forEach((value, columnIndex) => {
            if (value !== null && value !== undefined && value !== '') {
                endRow = Math.max(endRow, rowIndex)
                endColumn = Math.max(endColumn, columnIndex)
            }
        })
    })
    return endRow < 0 ? null : { startRow: 0, startColumn: 0, endRow, endColumn }
}

function rangeText(range: PivotRange): string {
    return formatCellRef(range.startRow, range.startColumn) + ':' + formatCellRef(range.endRow, range.endColumn)
}

/**
 * Create / regenerate a pivot table.
 *
 * A form over the pure pivot engine: pick one or more source ranges (cross-sheet
 * union), drag fields into the row / column / value lanes, choose date buckets
 * and aggregates, and the grid appends a generated worksheet that stays in sync.
 */
export const PivotDialog: React.FC<PivotDialogProps> = ({ open, onOpenChange, grid }) => {
    const t = translate
    const [workbook, setWorkbook] = useState<WorkbookData | null>(null)
    const [sources, setSources] = useState<SourceDraft[]>([])
    const [hasHeader, setHasHeader] = useState(true)
    const [rowFields, setRowFields] = useState<PivotGroupField[]>([])
    const [columnFields, setColumnFields] = useState<PivotGroupField[]>([])
    const [valueFields, setValueFields] = useState<PivotValueField[]>([])
    const [showRowTotals, setShowRowTotals] = useState(true)
    const [showColumnTotals, setShowColumnTotals] = useState(true)
    const [outputName, setOutputName] = useState('')
    const [error, setError] = useState('')

    const gridRef = useRef(grid)
    gridRef.current = grid
    const dragRef = useRef<{ area: FieldArea; index: number } | null>(null)

    // Snapshot the live workbook only when the dialog opens; the grid object is
    // recreated on every parent render and must not wipe the form.
    useEffect(() => {
        if (!open) return
        const live = gridRef.current
        const snapshot = live.getSnapshot()
        if (!snapshot) return
        setWorkbook(snapshot)
        const active = Math.min(Math.max(live.getActiveSheetIndex(), 0), snapshot.sheets.length - 1)
        const sheet = snapshot.sheets[active]
        const selection = live.getSelection()
        const initial = selection && (selection.endRow > selection.startRow || selection.endColumn > selection.startColumn)
            ? selection
            : usedRange(sheet)
        setSources([{ sheet: active, text: initial ? rangeText(initial) : '' }])
        setHasHeader(true)
        setRowFields([])
        setColumnFields([])
        setValueFields([])
        setShowRowTotals(true)
        setShowColumnTotals(true)
        setOutputName(t('spreadsheet.pivot.outputNamePlaceholder'))
        setError('')
    }, [open])

    const parsedSources = useMemo(() => {
        const out: PivotSource[] = []
        for (const draft of sources) {
            const range = parseRangeSpec(draft.text)
            if (range) out.push({ sheet: draft.sheet, range })
        }
        return out
    }, [sources])

    const fields = useMemo(() => {
        if (!workbook || parsedSources.length === 0) return [] as string[]
        return pivotFieldLabels(workbook.sheets, parsedSources, hasHeader)
    }, [workbook, parsedSources, hasHeader])

    const fieldKey = fields.join('\u0001')
    useEffect(() => {
        setRowFields((previous) => previous.filter((entry) => fields.includes(entry.field)))
        setColumnFields((previous) => previous.filter((entry) => fields.includes(entry.field)))
        setValueFields((previous) => previous.filter((entry) => fields.includes(entry.field)))
    }, [fieldKey]) // eslint-disable-line react-hooks/exhaustive-deps

    const listFor = useCallback((area: FieldArea): (PivotGroupField | PivotValueField)[] => {
        if (area === 'rows') return rowFields
        if (area === 'columns') return columnFields
        return valueFields
    }, [rowFields, columnFields, valueFields])

    const applyList = useCallback((area: FieldArea, next: any[]) => {
        if (area === 'rows') setRowFields(next)
        else if (area === 'columns') setColumnFields(next)
        else setValueFields(next)
    }, [])

    const areaOf = useCallback((field: string): FieldArea | null => {
        if (rowFields.some((entry) => entry.field === field)) return 'rows'
        if (columnFields.some((entry) => entry.field === field)) return 'columns'
        if (valueFields.some((entry) => entry.field === field)) return 'values'
        return null
    }, [rowFields, columnFields, valueFields])

    const makeEntry = useCallback((field: string, area: FieldArea, previous?: PivotGroupField | PivotValueField) => {
        if (area === 'values') {
            const aggregate = previous && 'aggregate' in previous ? previous.aggregate : 'sum'
            return { field, aggregate }
        }
        const dateGroup = previous && 'dateGroup' in previous ? previous.dateGroup : undefined
        return dateGroup ? { field, dateGroup } : { field }
    }, [])

    const assign = useCallback((field: string, area: FieldArea) => {
        const previous = [...rowFields, ...columnFields, ...valueFields].find((entry) => entry.field === field)
        setRowFields((prev) => prev.filter((entry) => entry.field !== field))
        setColumnFields((prev) => prev.filter((entry) => entry.field !== field))
        setValueFields((prev) => prev.filter((entry) => entry.field !== field))
        const entry = makeEntry(field, area, previous)
        if (area === 'rows') setRowFields((prev) => [...prev, entry as PivotGroupField])
        else if (area === 'columns') setColumnFields((prev) => [...prev, entry as PivotGroupField])
        else setValueFields((prev) => [...prev, entry as PivotValueField])
    }, [rowFields, columnFields, valueFields, makeEntry])

    const removeField = useCallback((field: string) => {
        setRowFields((prev) => prev.filter((entry) => entry.field !== field))
        setColumnFields((prev) => prev.filter((entry) => entry.field !== field))
        setValueFields((prev) => prev.filter((entry) => entry.field !== field))
    }, [])

    const moveField = useCallback((from: FieldArea, fromIndex: number, to: FieldArea, toIndex: number) => {
        const fromList = [...listFor(from)]
        const [item] = fromList.splice(fromIndex, 1)
        if (!item) return
        const entry = makeEntry(item.field, to, item)
        const toList = from === to ? fromList : [...listFor(to)]
        const index = Math.max(0, Math.min(toIndex, toList.length))
        toList.splice(index, 0, entry)
        applyList(to, toList)
        if (from !== to) applyList(from, fromList)
    }, [listFor, makeEntry, applyList])

    const setDateGroup = useCallback((field: string, dateGroup: PivotDateGroup) => {
        const apply = (entry: PivotGroupField): PivotGroupField => {
            if (entry.field !== field) return entry
            return dateGroup === 'none' ? { field } : { field, dateGroup }
        }
        setRowFields((prev) => prev.map(apply))
        setColumnFields((prev) => prev.map(apply))
    }, [])

    const setAggregate = useCallback((field: string, aggregate: PivotAggregate) => {
        setValueFields((prev) => prev.map((entry) => entry.field === field ? { ...entry, aggregate } : entry))
    }, [])

    const handleCreate = useCallback(() => {
        if (!workbook) return
        if (parsedSources.length === 0 || parsedSources.length !== sources.length) {
            setError(t('spreadsheet.pivot.invalidRange'))
            return
        }
        const hasPivotSource = parsedSources.some((source) => workbook.sheets[source.sheet]?.pivot)
        if (hasPivotSource) {
            setError(t('spreadsheet.pivot.sourceIsPivot'))
            return
        }
        if (rowFields.length === 0 && columnFields.length === 0 && valueFields.length === 0) {
            setError(t('spreadsheet.pivot.needFields'))
            return
        }
        if (valueFields.length === 0) {
            setError(t('spreadsheet.pivot.needValues'))
            return
        }
        const config: PivotConfig = {
            sources: parsedSources,
            hasHeader,
            rows: rowFields,
            columns: columnFields,
            values: valueFields,
            showRowTotals,
            showColumnTotals,
        }
        const labels: PivotLabels = {
            total: t('spreadsheet.pivot.total'),
            source: t('spreadsheet.pivot.source'),
            aggregate: (kind) => t('spreadsheet.pivot.aggregate.' + kind),
        }
        const name = outputName.trim() || t('spreadsheet.pivot.outputNamePlaceholder')
        gridRef.current.replaceAll(upsertPivotSheet(workbook, config, name, labels))
        onOpenChange(false)
    }, [
        workbook, parsedSources, sources, hasHeader, rowFields, columnFields, valueFields,
        showRowTotals, showColumnTotals, outputName, onOpenChange, t,
    ])

    const preview = useMemo(() => {
        if (!workbook || parsedSources.length === 0 || valueFields.length === 0) return null
        const labels: PivotLabels = { total: t('spreadsheet.pivot.total'), source: '', aggregate: () => '' }
        const result = computePivot(workbook.sheets, {
            sources: parsedSources, hasHeader,
            rows: rowFields, columns: columnFields, values: valueFields,
            showRowTotals, showColumnTotals,
        }, labels)
        return { rows: result.rows.length, columns: result.columnCount }
    }, [workbook, parsedSources, hasHeader, rowFields, columnFields, valueFields, showRowTotals, showColumnTotals, t])

    const renderChip = (area: FieldArea, entry: PivotGroupField | PivotValueField, index: number) => {
        const field = entry.field
        const isValue = area === 'values'
        const dateGroup = !isValue && 'dateGroup' in entry && entry.dateGroup ? entry.dateGroup : 'none'
        const aggregate = isValue && 'aggregate' in entry ? entry.aggregate : 'sum'
        return (
            <div
                key={field}
                draggable
                onDragStart={() => { dragRef.current = { area, index } }}
                onDragEnd={() => { dragRef.current = null }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                    event.preventDefault()
                    const drag = dragRef.current
                    if (drag) moveField(drag.area, drag.index, area, index)
                    dragRef.current = null
                }}
                className="flex items-center gap-1 rounded-md border bg-background px-1.5 py-1 text-xs shadow-sm"
            >
                <span className="cursor-grab truncate" title={field}>{field}</span>
                {isValue ? (
                    <Select value={aggregate} onValueChange={(next) => setAggregate(field, next as PivotAggregate)}>
                        <SelectTrigger className="h-5 w-[72px] border-0 px-1 text-[11px] shadow-none">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {AGGREGATES.map((kind) => (
                                <SelectItem key={kind} value={kind} className="text-xs">
                                    {t('spreadsheet.pivot.aggregate.' + kind)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ) : (
                    <Select value={dateGroup} onValueChange={(next) => setDateGroup(field, next as PivotDateGroup)}>
                        <SelectTrigger className="h-5 w-[72px] border-0 px-1 text-[11px] shadow-none">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {DATE_GROUPS.map((kind) => (
                                <SelectItem key={kind} value={kind} className="text-xs">
                                    {t('spreadsheet.pivot.dateGroup' + kind.charAt(0).toUpperCase() + kind.slice(1))}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
                <button
                    type="button"
                    className="rounded p-0.5 text-muted-foreground hover:bg-accent"
                    aria-label={t('spreadsheet.pivot.removeSource')}
                    onClick={() => removeField(field)}
                >
                    <X className="h-3 w-3" />
                </button>
            </div>
        )
    }

    const lane = (area: FieldArea, label: string) => (
        <div
            className="min-h-[38px] rounded-md border border-dashed p-1.5"
            onDragOver={(event) => { event.preventDefault() }}
            onDrop={(event) => {
                event.preventDefault()
                const drag = dragRef.current
                if (drag) moveField(drag.area, drag.index, area, listFor(area).length)
                dragRef.current = null
            }}
        >
            <div className="mb-1 text-[11px] font-medium text-muted-foreground">{label}</div>
            {listFor(area).length === 0 ? (
                <p className="px-1 py-1 text-[11px] text-muted-foreground/70">{t('spreadsheet.pivot.dragHint')}</p>
            ) : (
                <div className="flex flex-wrap gap-1">
                    {listFor(area).map((entry, index) => renderChip(area, entry, index))}
                </div>
            )}
        </div>
    )

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{t('spreadsheet.pivot.title')}</DialogTitle>
                    <DialogDescription>{t('spreadsheet.pivot.description')}</DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">{t('spreadsheet.pivot.sources')}</Label>
                        <div className="space-y-1.5">
                            {sources.map((draft, index) => (
                                <div key={index} className="flex items-center gap-2">
                                    <Select
                                        value={String(draft.sheet)}
                                        onValueChange={(value) => setSources((prev) => prev.map((entry, i) => i === index ? { ...entry, sheet: Number(value) } : entry))}
                                    >
                                        <SelectTrigger className="h-8 w-[150px] text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {(workbook?.sheets ?? []).map((sheet, sheetIndex) => (
                                                <SelectItem key={sheetIndex} value={String(sheetIndex)} className="text-xs" disabled={!!sheet.pivot}>
                                                    {sheet.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Input
                                        className="h-8 flex-1 text-xs"
                                        value={draft.text}
                                        placeholder="A1:D20"
                                        onChange={(event) => setSources((prev) => prev.map((entry, i) => i === index ? { ...entry, text: event.target.value.toUpperCase() } : entry))}
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 shrink-0"
                                        disabled={sources.length <= 1}
                                        aria-label={t('spreadsheet.pivot.removeSource')}
                                        onClick={() => setSources((prev) => prev.filter((_, i) => i !== index))}
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-muted-foreground"
                            onClick={() => setSources((prev) => [...prev, { sheet: prev[0]?.sheet ?? 0, text: prev[0]?.text ?? '' }])}
                        >
                            + {t('spreadsheet.pivot.addSource')}
                        </Button>
                    </div>

                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Checkbox checked={hasHeader} onCheckedChange={(checked) => setHasHeader(checked === true)} />
                        {t('spreadsheet.pivot.firstRowHeader')}
                    </label>

                    <div className="rounded-md border">
                        <div className="flex items-center justify-between border-b px-3 py-2 text-xs font-medium">
                            <span>{t('spreadsheet.pivot.fields')}</span>
                            {preview && <span className="text-muted-foreground">{preview.rows} × {preview.columns}</span>}
                        </div>
                        {fields.length === 0 ? (
                            <p className="px-3 py-6 text-center text-xs text-muted-foreground">{t('spreadsheet.pivot.empty')}</p>
                        ) : (
                            <ScrollArea className="max-h-40">
                                <div className="divide-y">
                                    {fields.map((field) => {
                                        const area = areaOf(field)
                                        return (
                                            <div key={field} className="flex items-center gap-2 px-3 py-1.5">
                                                <span className="min-w-0 flex-1 truncate text-xs" title={field}>{field}</span>
                                                <div className="flex items-center gap-1">
                                                    {(['rows', 'columns', 'values'] as FieldArea[]).map((option) => (
                                                        <Toggle
                                                            key={option}
                                                            size="sm"
                                                            pressed={area === option}
                                                            onPressedChange={(pressed) => {
                                                                if (pressed) assign(field, option)
                                                                else if (area === option) removeField(field)
                                                            }}
                                                            className={cn('h-6 px-2 text-[11px]', area === option && 'bg-secondary')}
                                                        >
                                                            {t('spreadsheet.pivot.' + option)}
                                                        </Toggle>
                                                    ))}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </ScrollArea>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">{t('spreadsheet.pivot.layout')}</Label>
                        {lane('rows', t('spreadsheet.pivot.rows'))}
                        {lane('columns', t('spreadsheet.pivot.columns'))}
                        {lane('values', t('spreadsheet.pivot.values'))}
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                        <label className="flex items-center gap-2">
                            <Checkbox checked={showColumnTotals} onCheckedChange={(checked) => setShowColumnTotals(checked === true)} />
                            {t('spreadsheet.pivot.columnTotals')}
                        </label>
                        <label className="flex items-center gap-2">
                            <Checkbox checked={showRowTotals} onCheckedChange={(checked) => setShowRowTotals(checked === true)} />
                            {t('spreadsheet.pivot.rowTotals')}
                        </label>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">{t('spreadsheet.pivot.outputName')}</Label>
                        <Input
                            className="h-8 text-xs"
                            value={outputName}
                            placeholder={t('spreadsheet.pivot.outputNamePlaceholder')}
                            onChange={(event) => setOutputName(event.target.value)}
                        />
                    </div>

                    {error && <p className="text-xs text-destructive">{error}</p>}
                </div>

                <DialogFooter>
                    <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                        {t('spreadsheet.pivot.cancel')}
                    </Button>
                    <Button type="button" size="sm" onClick={handleCreate} disabled={!workbook || fields.length === 0}>
                        {t('spreadsheet.pivot.createAction')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

PivotDialog.displayName = 'PivotDialog'
