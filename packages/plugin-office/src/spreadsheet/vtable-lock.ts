/**
 * Locking generated (pivot) sheets.
 *
 * VTable has **no per-sheet read-only**: `ISheetDefine` carries no
 * `readOnly`/`protected`/`disabled`, and `createWorkSheetInstance` writes
 * `editor` / `headerEditor` / `editCellTrigger` *after* spreading the sheet
 * definition, so a config value cannot survive. See docs/VTABLE_REFERENCE.md §5
 * for the source anchors.
 *
 * Without a lock a user can type into a pivot's generated cells, and the next
 * `refreshPivots` overwrites it — the value appears to change back by itself.
 * This module restores the guarantee the jspreadsheet adapter had via
 * `readOnly: true` on the sheet.
 *
 * The lock works by overriding the two predicates every edit path consults:
 *
 * - `getEditor(col, row)` — `EditManager.startEditCell` refuses when it returns
 *   falsy, which covers double-click, typing and the API entry point.
 * - `isHasEditorDefine(col, row)` — the keyboard paste path and row/column
 *   deletion check this, so it has to agree or paste would still mutate cells.
 *
 * Host writes are deliberately still allowed: the adapter refreshes a pivot with
 * `changeCellValues(..., workOnEditableCell = false)`, which bypasses both
 * predicates. That is what lets the host write results into a locked sheet.
 */

/** The slice of a VTable `ListTable` this lock touches. */
export interface LockableTable {
    getEditor?: (col: number, row: number) => unknown
    isHasEditorDefine?: (col: number, row: number) => boolean
    options?: {
        editor?: unknown
        headerEditor?: unknown
        editCellTrigger?: unknown[]
        [key: string]: unknown
    }
    /** Set by {@link lockTableForEditing} so the lock is idempotent. */
    __knEditingLocked?: boolean
    /**
     * The editor predicates as they were before locking, so the lock can be
     * lifted again. Without these, toggling a block from read-only back to
     * editable would leave it permanently locked.
     */
    __knEditingLockSaved?: {
        getEditor?: LockableTable['getEditor']
        isHasEditorDefine?: LockableTable['isHasEditorDefine']
        editor?: unknown
        headerEditor?: unknown
        editCellTrigger?: unknown[]
    }
}

/**
 * Make a table reject user edits while leaving host writes intact.
 *
 * Idempotent: calling it twice does not stack wrappers.
 *
 * @returns true when the table is locked (or already was), false when there is
 *          nothing lockable — a caller that gets false must not assume the sheet
 *          is protected.
 */
export function lockTableForEditing(table: LockableTable | null | undefined): boolean {
    if (!table || typeof table !== 'object') return false
    if (table.__knEditingLocked) return true

    // Remember what we are about to replace, so `unlockTableForEditing` can put
    // the table back rather than leaving it locked for the rest of its life.
    table.__knEditingLockSaved = {
        getEditor: table.getEditor,
        isHasEditorDefine: table.isHasEditorDefine,
        editor: table.options?.editor,
        headerEditor: table.options?.headerEditor,
        editCellTrigger: table.options?.editCellTrigger,
    }

    // Both predicates must answer "no editor" or an edit path slips through.
    table.getEditor = () => undefined
    table.isHasEditorDefine = () => false

    // Belt and braces: clearing the option defaults means even a code path that
    // reads `options.editor` directly (rather than going through `getEditor`)
    // finds nothing to open.
    if (table.options && typeof table.options === 'object') {
        table.options.editor = undefined
        table.options.headerEditor = undefined
        table.options.editCellTrigger = []
    }

    table.__knEditingLocked = true
    return true
}

/**
 * Lift a lock applied by {@link lockTableForEditing}.
 *
 * Restores the saved predicates. If the table was never locked by us, this is a
 * no-op — clearing `__knEditingLocked` alone would leave the stubbed-out
 * predicates in place and the table silently uneditable.
 *
 * @returns true when the table is editable again.
 */
export function unlockTableForEditing(table: LockableTable | null | undefined): boolean {
    if (!table || typeof table !== 'object') return false
    const saved = table.__knEditingLockSaved
    if (!table.__knEditingLocked || !saved) {
        // Not locked by us: leave whatever editors the engine set up alone.
        return !table.__knEditingLocked
    }

    if (saved.getEditor) table.getEditor = saved.getEditor
    else delete table.getEditor
    if (saved.isHasEditorDefine) table.isHasEditorDefine = saved.isHasEditorDefine
    else delete table.isHasEditorDefine

    if (table.options && typeof table.options === 'object') {
        table.options.editor = saved.editor
        table.options.headerEditor = saved.headerEditor
        table.options.editCellTrigger = saved.editCellTrigger
    }

    delete table.__knEditingLockSaved
    delete table.__knEditingLocked
    return true
}

/** True when {@link lockTableForEditing} has been applied. */
export function isLockedForEditing(table: LockableTable | null | undefined): boolean {
    return Boolean(table?.__knEditingLocked)
}

/**
 * Keys of the sheets in a workbook that must be locked: the generated ones.
 *
 * A pivot sheet's cells are a pure function of its sources, so letting a user
 * edit them would be lost work.
 */
export function generatedSheetKeys(
    sheets: ReadonlyArray<{ sheetKey: string; _generated?: boolean }>,
): string[] {
    return sheets.filter((sheet) => sheet._generated).map((sheet) => sheet.sheetKey)
}
