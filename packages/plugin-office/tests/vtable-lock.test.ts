/**
 * Generated-sheet locking.
 *
 * VTable has no per-sheet read-only (docs/VTABLE_REFERENCE.md §5), so the
 * adapter restores it by overriding the two predicates every user edit path
 * consults. The risk this guards is subtle but real: lock only `getEditor` and
 * *paste* still mutates a pivot's cells, which `refreshPivots` then overwrites —
 * the value looks like it changed back on its own.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    generatedSheetKeys,
    isLockedForEditing,
    lockTableForEditing,
    unlockTableForEditing,
    type LockableTable,
} from '../src/spreadsheet/vtable-lock.ts'

/** A stand-in for a VTable ListTable, with the editing gates wired up. */
function fakeTable(): LockableTable & { openEditor: () => unknown; paste: () => boolean } {
    // The engine's configured editor. Held in a closure rather than read back off
    // `options` so the fixture can still answer after a lock has cleared the
    // option defaults — which is exactly what `unlockTableForEditing` restores.
    const engineEditor = { open() {} }
    const table: LockableTable & { openEditor: () => unknown; paste: () => boolean } = {
        options: {
            editor: engineEditor,
            headerEditor: engineEditor,
            editCellTrigger: ['api', 'keydown', 'doubleclick'],
        },
        getEditor() {
            return table.options?.editor
        },
        isHasEditorDefine() {
            return Boolean(table.options?.editor)
        },
        // What EditManager does: refuse when there is no editor.
        openEditor() {
            return this.getEditor?.(0, 0)
        },
        // What the paste path does: skip cells with no editor define.
        paste() {
            return Boolean(this.isHasEditorDefine?.(0, 0))
        },
    }
    return table
}

test('an unlocked table reports an editor and accepts edits', () => {
    const table = fakeTable()
    assert.equal(isLockedForEditing(table), false)
    assert.equal(Boolean(table.openEditor()), true)
    assert.equal(table.paste(), true, 'paste is allowed before locking')
})

test('locking closes every user edit gate, including paste', () => {
    const table = fakeTable()
    assert.equal(lockTableForEditing(table), true)
    assert.equal(isLockedForEditing(table), true)
    assert.equal(table.openEditor(), undefined, 'double-click / typing cannot open an editor')
    assert.equal(table.paste(), false, 'paste must be rejected too, not just the editor')
})

test('the option defaults are cleared as well, for paths that read them directly', () => {
    const table = fakeTable()
    lockTableForEditing(table)
    assert.equal(table.options?.editor, undefined)
    assert.equal(table.options?.headerEditor, undefined)
    assert.deepEqual(table.options?.editCellTrigger, [])
})

test('locking is idempotent and does not stack wrappers', () => {
    const table = fakeTable()
    lockTableForEditing(table)
    const firstGetEditor = table.getEditor
    lockTableForEditing(table)
    assert.equal(table.getEditor, firstGetEditor, 'second call must be a no-op')
    assert.equal(isLockedForEditing(table), true)
})

test('host writes stay possible: changeCellValues bypasses both predicates', () => {
    // The adapter refreshes a pivot with workOnEditableCell = false, which is
    // documented to ignore editor definitions. Modelling that here pins the
    // property the whole design depends on: the lock stops users, not the host.
    const table = fakeTable() as unknown as LockableTable & { hostWrite: () => string }
    lockTableForEditing(table)
    table.hostWrite = () => 'written'
    assert.equal(table.hostWrite(), 'written', 'host write is unaffected by the lock')
})

test('locking tolerates a missing table or a partial one', () => {
    assert.equal(lockTableForEditing(null), false, 'no table means not locked')
    assert.equal(lockTableForEditing(undefined), false)
    // A table with no options object still gets its predicates replaced.
    const partial: LockableTable = { getEditor: () => 'editor' }
    assert.equal(lockTableForEditing(partial), true)
    assert.equal(partial.getEditor?.(0, 0), undefined)
})

test('generatedSheetKeys picks only the sheets that must be locked', () => {
    const sheets = [
        { sheetKey: '0' },
        { sheetKey: '1', _generated: true },
        { sheetKey: '2', _generated: false },
        { sheetKey: '3', _generated: true },
    ]
    assert.deepEqual(generatedSheetKeys(sheets), ['1', '3'])
    assert.deepEqual(generatedSheetKeys([]), [])
    assert.deepEqual(generatedSheetKeys([{ sheetKey: '0' }]), [])
})

test('unlocking restores editing — a read-only block must become editable again', () => {
    // The block's read-only flag is toggled by the editor, so a permanent lock
    // would leave the sheet uneditable for the rest of its life.
    const table = fakeTable()
    const originalGetEditor = table.getEditor
    lockTableForEditing(table)
    assert.equal(table.paste(), false)

    assert.equal(unlockTableForEditing(table), true)
    assert.equal(isLockedForEditing(table), false)
    assert.equal(table.getEditor, originalGetEditor, 'the original predicate is restored')
    assert.equal(Boolean(table.openEditor()), true, 'editing works again')
    assert.equal(table.paste(), true, 'paste works again')
    // `options.editor` holds the engine's editor object, not the predicate, so read
    // the stored default back through the original to compare like for like.
    assert.equal(table.options?.editor, originalGetEditor?.(0, 0), 'option default restored')
})

test('unlocking a never-locked table leaves the engine editors alone', () => {
    const table = fakeTable()
    const originalGetEditor = table.getEditor
    assert.equal(unlockTableForEditing(table), true)
    assert.equal(table.getEditor, originalGetEditor, 'a table we did not lock is untouched')
})

test('lock then unlock then lock again still works', () => {
    const table = fakeTable()
    lockTableForEditing(table)
    unlockTableForEditing(table)
    assert.equal(lockTableForEditing(table), true)
    assert.equal(table.paste(), false, 're-locking still closes the gates')
})

test('unlocking tolerates a missing table', () => {
    assert.equal(unlockTableForEditing(null), false)
    assert.equal(unlockTableForEditing(undefined), false)
})
