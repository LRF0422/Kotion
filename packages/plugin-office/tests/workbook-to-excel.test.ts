import { test } from 'node:test'
import assert from 'node:assert/strict'
import { workbookToXlsx } from '../src/spreadsheet/workbook-to-excel.ts'
import { createEmptyWorkbookData } from '../src/spreadsheet/workbook-data.ts'

test('export keeps formulas, number formats and layout', () => {
    const workbook = createEmptyWorkbookData(3, 3)
    const sheet = workbook.sheets[0]
    sheet.rows[0][0] = '=1+1'
    // A formatted cell keeps the display string in rows, but the real number and
    // the format kind are stored alongside it.
    sheet.rows[1][0] = '50.00%'
    sheet.numberFormats = { A2: 'percent' }
    sheet.rawValues = { A2: 0.5 }
    sheet.columnWidths = { '1': 200 }
    sheet.rowHeights = { '2': 40 }
    sheet.merges = [[0, 0, 1, 1]]

    const book = workbookToXlsx(workbook)
    const worksheet = book.Sheets[book.SheetNames[0]]

    assert.equal(worksheet.A1.f, '1+1')
    assert.equal(worksheet.A2.t, 'n')
    assert.equal(worksheet.A2.v, 0.5)
    assert.equal(worksheet.A2.z, '0.00%')
    assert.deepEqual(worksheet['!merges'], [{ s: { r: 0, c: 0 }, e: { r: 1, c: 1 } }])
    assert.equal(worksheet['!cols']?.[1]?.wpx, 200)
    assert.equal(worksheet['!rows']?.[2]?.hpx, 40)
})

test('export names sheets uniquely and safely', () => {
    const workbook = createEmptyWorkbookData(2, 2)
    workbook.sheets.push({ ...workbook.sheets[0], name: workbook.sheets[0].name })
    const book = workbookToXlsx(workbook)
    assert.equal(new Set(book.SheetNames).size, book.SheetNames.length)
})
