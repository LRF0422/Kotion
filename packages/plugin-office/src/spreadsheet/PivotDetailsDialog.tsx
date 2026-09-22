import React, { useEffect, useMemo, useRef, useState } from "react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    ScrollArea,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@kn/ui"
import type { GridApi } from "./grid-api"
import { computePivot, pivotDrillDown, type PivotLabels } from "./pivot"
import { formatCellRef, type CellValue, type WorkbookData } from "./workbook-data"
import { translate } from "../i18n"

/** Rows shown at most, so a huge source cannot freeze the dialog. */
const MAX_DETAIL_ROWS = 500

export interface PivotDrillTarget {
    sheetIndex: number
    row: number
    column: number
}

interface PivotDetailsDialogProps {
    target: PivotDrillTarget | null
    onOpenChange: (open: boolean) => void
    grid: GridApi
}

/** Drill-down: the source rows behind one generated pivot value cell. */
export const PivotDetailsDialog: React.FC<PivotDetailsDialogProps> = ({ target, onOpenChange, grid }) => {
    const t = translate
    const [workbook, setWorkbook] = useState<WorkbookData | null>(null)
    const gridRef = useRef(grid)
    gridRef.current = grid

    useEffect(() => {
        if (!target) return
        setWorkbook(gridRef.current.getSnapshot())
    }, [target])

    const detail = useMemo(() => {
        if (!workbook || !target) return null
        const config = workbook.sheets[target.sheetIndex]?.pivot
        if (!config) return null
        const labels: PivotLabels = {
            total: t('spreadsheet.pivot.total'),
            source: t('spreadsheet.pivot.source'),
            aggregate: (kind) => t('spreadsheet.pivot.aggregate.' + kind),
        }
        const result = computePivot(workbook.sheets, config, labels)
        return pivotDrillDown(workbook.sheets, config, result, target.row, target.column, labels)
    }, [workbook, target, t])

    const sheetName = target ? workbook?.sheets[target.sheetIndex]?.name ?? '' : ''
    const cellRef = target ? formatCellRef(target.row, target.column) : ''
    const rows = detail ? detail.rows.slice(0, MAX_DETAIL_ROWS) : []

    return (
        <Dialog open={!!target} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>{t('spreadsheet.pivot.detailsTitle')}</DialogTitle>
                    <DialogDescription>{sheetName} · {cellRef} · {rows.length}{detail && detail.rows.length > rows.length ? '+' : ''}</DialogDescription>
                </DialogHeader>
                {rows.length === 0 ? (
                    <p className="py-8 text-center text-xs text-muted-foreground">{t('spreadsheet.pivot.detailsEmpty')}</p>
                ) : (
                    <ScrollArea className="max-h-[60vh] rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    {detail!.headers.map((header) => (
                                        <TableHead key={header} className="h-8 whitespace-nowrap text-xs">{header}</TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.map((row, rowIndex) => (
                                    <TableRow key={rowIndex}>
                                        {row.map((value: CellValue, columnIndex) => (
                                            <TableCell key={columnIndex} className="h-7 whitespace-nowrap px-2 py-1 text-xs">
                                                {value === null || value === undefined ? '' : String(value)}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                )}
            </DialogContent>
        </Dialog>
    )
}

PivotDetailsDialog.displayName = 'PivotDetailsDialog'
