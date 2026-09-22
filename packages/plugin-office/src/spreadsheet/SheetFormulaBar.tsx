import React, { useCallback, useEffect, useRef, useState } from "react"
import type { GridApi } from "./grid-api"
import { formatCellRef, parseRangeSpec } from "./workbook-data"
import { translate } from "../i18n"

/**
 * Excel-style formula bar: a reference box (A1, A1:C4 …) on the left and the
 * active cell's content on the right.
 *
 * The grid stays the source of truth. The bar reads from the grid API whenever
 * the selection changes (its own edits are the only thing that suppresses the
 * sync) and writes back through the ordinary grid API, so a formula-bar edit is
 * saved, undoable and broadcast exactly like an in-cell edit.
 */

interface FormulaBarProps {
    grid: GridApi
    /** Bumped by the view whenever the selection may have changed. */
    refreshKey: number
    /** The grid is not mounted yet — everything is inert. */
    disabled?: boolean
    /** Document is read-only: navigate, but do not write. */
    readOnly?: boolean
}

export const SheetFormulaBar: React.FC<FormulaBarProps> = React.memo(({
    grid,
    refreshKey,
    disabled,
    readOnly,
}) => {
    const [reference, setReference] = useState('A1')
    const [value, setValue] = useState('')
    // While an input is focused the grid must not overwrite what is typed.
    const [editingReference, setEditingReference] = useState(false)
    const [editingValue, setEditingValue] = useState(false)
    // Selection the value belongs to; also the anchor an edit is written to.
    const anchorRef = useRef({ row: 0, column: 0 })
    // Values when each input gained focus, so Escape can revert and an unchanged
    // blur does not write (and trigger a save).
    const referenceOnFocusRef = useRef('A1')
    const valueOnFocusRef = useRef('')
    // Set by Escape so the following blur does not commit the abandoned edit.
    const cancelReferenceRef = useRef(false)
    const cancelValueRef = useRef(false)
    const t = translate

    useEffect(() => {
        if (editingReference || editingValue || disabled) return
        const selection = grid.getSelection()
        if (!selection) return
        const { startRow, startColumn, endRow, endColumn } = selection
        anchorRef.current = { row: startRow, column: startColumn }
        setReference(startRow === endRow && startColumn === endColumn
            ? formatCellRef(startRow, startColumn)
            : `${formatCellRef(startRow, startColumn)}:${formatCellRef(endRow, endColumn)}`)
        const cell = grid.readCell(grid.getActiveSheetIndex(), startRow, startColumn)
        setValue(cell === null || cell === undefined ? '' : String(cell))
    }, [grid, refreshKey, editingReference, editingValue, disabled])

    const commitReference = useCallback(() => {
        setEditingReference(false)
        if (cancelReferenceRef.current) {
            cancelReferenceRef.current = false
            return
        }
        if (reference === referenceOnFocusRef.current) return
        const bounds = parseRangeSpec(reference)
        if (!bounds) return
        grid.selectRange(bounds.startRow, bounds.startColumn, bounds.endRow, bounds.endColumn)
    }, [grid, reference])

    const commitValue = useCallback(() => {
        setEditingValue(false)
        if (cancelValueRef.current) {
            cancelValueRef.current = false
            return
        }
        if (disabled || readOnly) return
        if (value === valueOnFocusRef.current) return
        const { row, column } = anchorRef.current
        grid.writeRange(grid.getActiveSheetIndex(), row, column, [[value]])
    }, [disabled, readOnly, grid, value])

    return (
        <div className="kn-sheet__formula">
            <input
                className="kn-sheet__namebox"
                value={reference}
                disabled={disabled}
                spellCheck={false}
                aria-label={t('spreadsheet.formula.reference')}
                title={t('spreadsheet.formula.reference')}
                onChange={(event) => {
                    setEditingReference(true)
                    setReference(event.target.value)
                }}
                onFocus={(event) => {
                    referenceOnFocusRef.current = reference
                    cancelReferenceRef.current = false
                    setEditingReference(true)
                    event.currentTarget.select()
                }}
                onBlur={commitReference}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur()
                    else if (event.key === 'Escape') {
                        cancelReferenceRef.current = true
                        setReference(referenceOnFocusRef.current)
                        setEditingReference(false)
                        event.currentTarget.blur()
                    }
                }}
            />
            <span className="kn-sheet__fx" aria-hidden="true">{t('spreadsheet.formula.fx')}</span>
            <input
                className="kn-sheet__formula-input"
                value={value}
                disabled={disabled}
                readOnly={readOnly}
                spellCheck={false}
                aria-label={t('spreadsheet.formula.content')}
                title={t('spreadsheet.formula.content')}
                onChange={(event) => {
                    setEditingValue(true)
                    setValue(event.target.value)
                }}
                onFocus={() => {
                    valueOnFocusRef.current = value
                    cancelValueRef.current = false
                    setEditingValue(true)
                }}
                onBlur={commitValue}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur()
                    else if (event.key === 'Escape') {
                        cancelValueRef.current = true
                        setValue(valueOnFocusRef.current)
                        setEditingValue(false)
                        event.currentTarget.blur()
                    }
                }}
            />
        </div>
    )
})
SheetFormulaBar.displayName = 'SheetFormulaBar'
