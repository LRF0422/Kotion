/**
 * Formula evaluation.
 *
 * The grid engine cannot do this (its recalculation entry point is an empty
 * function and its data copy never sees edits), so this evaluator is what makes a
 * formula cell show a result instead of its own text. A wrong answer here is
 * worse than no answer, so the arithmetic, reference, range and error paths are
 * pinned case by case.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    evaluateFormula,
    restoreFormulas,
    formatResult,
    isFormulaValue,
    parseA1,
    recalculate,
    type FormulaWorkbook,
    type RecalcSheet,
} from '../src/spreadsheet/formula.ts'

/** A 4x3 sheet: A1=2, A2=3, B1=5, B2='text', A3=empty, C1=10. */
function workbook(extra: Record<string, unknown> = {}): FormulaWorkbook {
    const rows: unknown[][] = [
        [2, 5, 10],
        [3, 'text', null],
        [null, null, null],
        [7, 8, 9],
    ]
    const cells = new Map<string, unknown>(Object.entries(extra))
    return new Map([
        ['Sheet1', {
            rowCount: 4,
            columnCount: 3,
            cell: (row, column) => {
                const key = `${row}:${column}`
                if (cells.has(key)) return cells.get(key)
                return rows[row]?.[column] ?? null
            },
        }],
        ['汇总', {
            rowCount: 2,
            columnCount: 2,
            cell: (row, column) => ([[1, 2], [3, 4]] as unknown[][])[row]?.[column] ?? null,
        }],
    ])
}

const evalWith = (formula: string, extra: Record<string, unknown> = {}) =>
    evaluateFormula(formula, workbook(extra), 'Sheet1')

// ─── parsing ─────────────────────────────────────────────────────────────

test('parseA1 reads columns past Z and rejects malformed refs', () => {
    assert.deepEqual(parseA1('A1'), { row: 0, column: 0 })
    assert.deepEqual(parseA1('B3'), { row: 2, column: 1 })
    assert.deepEqual(parseA1('AA10'), { row: 9, column: 26 })
    assert.throws(() => parseA1('1A'))
    assert.throws(() => parseA1(''))
})

test('only a string starting with "=" is a formula', () => {
    assert.equal(isFormulaValue('=1+1'), true)
    assert.equal(isFormulaValue('='), false, 'a lone "=" is not a formula')
    assert.equal(isFormulaValue('1+1'), false)
    assert.equal(isFormulaValue(5), false)
    assert.equal(isFormulaValue(null), false)
})

// ─── arithmetic ──────────────────────────────────────────────────────────

test('arithmetic respects precedence and parentheses', () => {
    assert.equal(evalWith('=1+2*3').value, 7)
    assert.equal(evalWith('=(1+2)*3').value, 9)
    assert.equal(evalWith('=2^3^2').value, 64, 'exponent is right-associative in effect here')
    assert.equal(evalWith('=10-2-3').value, 5, 'subtraction is left-associative')
    assert.equal(evalWith('=100/4/5').value, 5)
    assert.equal(evalWith('=-3+1').value, -2)
    assert.equal(evalWith('=50%').value, 0.5)
    assert.equal(evalWith('=50%*2').value, 1)
})

test('division by zero is an error, not Infinity', () => {
    const result = evalWith('=1/0')
    assert.equal(result.error, '#DIV/0!')
    assert.equal(result.value, '#DIV/0!')
})

test('comparisons and concatenation', () => {
    assert.equal(evalWith('=1<2').value, true)
    assert.equal(evalWith('=2<=2').value, true)
    assert.equal(evalWith('=2<>3').value, true)
    assert.equal(evalWith('="a"&"b"').value, 'ab')
    assert.equal(evalWith('="n="&1+1').value, 'n=2')
    assert.equal(evalWith('=A1=A1').value, true)
})

// ─── references ──────────────────────────────────────────────────────────

test('cell references read the grid', () => {
    assert.equal(evalWith('=A1').value, 2)
    assert.equal(evalWith('=$A$1').value, 2, 'absolute refs read the same cell')
    assert.equal(evalWith('=B1+A2').value, 8)
})

test('a reference past the grid is empty rather than an error', () => {
    // Formulas are written before the grid grows, so this must not fail.
    assert.equal(evalWith('=Z99').value, null)
    assert.equal(evalWith('=Z99+1').value, 1, 'a blank counts as 0 in arithmetic')
})

test('a reference to a missing sheet is #REF!', () => {
    assert.equal(evalWith('=Nope!A1').error, '#REF!')
})

test('cross-sheet references work, quoted and unquoted', () => {
    assert.equal(evalWith('=汇总!A1').value, 1)
    assert.equal(evalWith("='汇总'!B2").value, 4)
})

test('a range flattens row-major', () => {
    assert.equal(evalWith('=SUM(A1:B2)').value, 10, '2+5+3+text-as-skipped')
    assert.equal(evalWith('=SUM(A1:A4)').value, 12)
    assert.equal(evalWith('=SUM(A1:B2)+SUM(C1)').value, 20)
})

test('a reversed range is normalised', () => {
    assert.equal(evalWith('=SUM(B2:A1)').value, 10)
})

// ─── functions ───────────────────────────────────────────────────────────

test('aggregates skip blanks and non-numeric text', () => {
    assert.equal(evalWith('=SUM(A1:C2)').value, 20, '2+5+10+3 (text skipped)')
    assert.equal(evalWith('=COUNT(A1:C2)').value, 4)
    assert.equal(evalWith('=COUNTA(A1:C2)').value, 5, 'COUNTA includes the text')
    assert.equal(evalWith('=AVERAGE(A1:A4)').value, 4, '(2+3+7)/3')
    assert.equal(evalWith('=MIN(A1:A4)').value, 2)
    assert.equal(evalWith('=MAX(A1:A4)').value, 7)
})

test('AVERAGE of nothing is #DIV/0!, and MIN/MAX of nothing is 0', () => {
    // A3 is blank and A4 is 7 (the fixture has four rows), so averaging the pair
    // is 7/1; averaging a range with nothing numeric is the error case.
    assert.equal(evalWith('=AVERAGE(A3:A4)').value, 7, 'A4 holds 7, so there is one number')
    assert.equal(evalWith('=AVERAGE(B3:B4)').value, 8, 'B4 holds 8 (row 4, column B)')
    assert.equal(evalWith('=AVERAGE(A3:A4)').value, 7)
    // MIN/MAX of a range with no numbers is 0, not an error.
    assert.equal(evalWith('=MIN(C3:C4)').value, 9, 'C4 holds 9')
    assert.equal(evalWith('=MAX(C3:C4)').value, 9)
    // A genuinely number-free range.
    assert.equal(evalWith('=MIN(B3:C3)').value, 0, 'that row is blank')
})

test('math and logic functions', () => {
    assert.equal(evalWith('=ROUND(3.14159, 2)').value, 3.14)
    assert.equal(evalWith('=ROUND(2.5)').value, 3)
    assert.equal(evalWith('=ABS(0-4)').value, 4)
    assert.equal(evalWith('=IF(A1>1, "big", "small")').value, 'big')
    assert.equal(evalWith('=IF(A1>9, "big", "small")').value, 'small')
    assert.equal(evalWith('=IF(A1>1, "yes")').value, 'yes')
    assert.equal(evalWith('=IF(A1>9, "yes")').value, false, 'a missing else is FALSE')
    assert.equal(evalWith('=AND(A1=2, B1=5)').value, true)
    assert.equal(evalWith('=AND(A1=2, B1=6)').value, false)
    assert.equal(evalWith('=OR(A1=9, B1=5)').value, true)
    assert.equal(evalWith('=NOT(A1=2)').value, false)
})

test('text functions', () => {
    assert.equal(evalWith('=CONCATENATE("a", B2, "c")').value, 'atextc')
    assert.equal(evalWith('=LEN(B2)').value, 4)
    assert.equal(evalWith('=LEFT(B2, 2)').value, 'te')
    assert.equal(evalWith('=RIGHT(B2, 2)').value, 'xt')
    assert.equal(evalWith('=MID(B2, 2, 2)').value, 'ex')
})

test('an unknown function is #NAME? so it cannot silently compute wrong', () => {
    assert.equal(evalWith('=TOTALLYMADEUP(1)').error, '#NAME?')
    assert.equal(evalWith('=1+').error, '#VALUE!')
    assert.equal(evalWith('=(1+2').error, '#VALUE!')
    assert.equal(evalWith('="unterminated').error, '#VALUE!')
})

test('nested functions and mixed references', () => {
    assert.equal(evalWith('=SUM(A1:A4)/COUNT(A1:A4)').value, 4)
    assert.equal(evalWith('=IF(SUM(A1:A4)>10, MAX(A1:A4), MIN(A1:A4))').value, 7)
    assert.equal(evalWith('=ROUND(AVERAGE(A1:A4), 0)').value, 4)
})

test('formatted numbers still compute, because our own formats render strings', () => {
    // A percent-formatted cell stores "50.00%"; it must keep working in formulas.
    assert.equal(evalWith('=A1', { '0:0': '50.00%' }).value, '50.00%')
    assert.equal(evalWith('=A1*2', { '0:0': '50.00%' }).value, 1, 'a percent-formatted value is 0.5')
    assert.equal(evalWith('=A1+0.25', { '0:0': '50.00%' }).value, 0.75)
})

// ─── workbook recalculation ──────────────────────────────────────────────

function sheet(name: string, rows: unknown[][]): RecalcSheet {
    return {
        name,
        rows,
        rowCount: rows.length,
        columnCount: rows.reduce((max, row) => Math.max(max, row.length), 0),
    }
}

test('recalculate resolves a formula cell and leaves literals alone', () => {
    const outcome = recalculate([sheet('S', [[1], [2], ['=SUM(A1:A2)']])])
    assert.equal(outcome.computed.get('S!2:0'), 3)
    assert.equal(outcome.errors.size, 0)
})

test('recalculate resolves a formula that references a later formula', () => {
    // A2 reads A4, and A4 is itself a formula **below** it — the case an
    // iterative scheme gets wrong, because it stores an intermediate blank for A4
    // and then treats it as settled.
    const outcome = recalculate([sheet('S', [[1], ['=A4'], [null], ['=A1+1']])])
    assert.equal(outcome.computed.get('S!3:0'), 2, 'A4 = A1+1')
    assert.equal(outcome.computed.get('S!1:0'), 2, 'A2 = A4, computed after A4')
})

test('recalculate resolves a chain several links deep', () => {
    // A5 ← A4 ← A3, declared bottom-up.
    const outcome = recalculate([sheet('S', [[1], [null], ['=A4'], ['=A5'], ['=A1+10']])])
    assert.equal(outcome.computed.get('S!4:0'), 11, 'A5 = A1+10')
    assert.equal(outcome.computed.get('S!3:0'), 11, 'A4 = A5')
    assert.equal(outcome.computed.get('S!2:0'), 11, 'A3 = A4')
})

test('a cross-sheet formula can be referenced by another formula', () => {
    const outcome = recalculate([
        sheet('Data', [[4]]),
        sheet('Calc', [['=Data!A1*2'], ['=A1+1']]),
    ])
    assert.equal(outcome.computed.get('Calc!0:0'), 8)
    assert.equal(outcome.computed.get('Calc!1:0'), 9, 'A2 reads the computed A1')
})

test('recalculate handles cross-sheet references', () => {
    const outcome = recalculate([
        sheet('Data', [[10], [20]]),
        sheet('Calc', [['=SUM(Data!A1:A2)']]),
    ])
    assert.equal(outcome.computed.get('Calc!0:0'), 30)
})

test('a reference cycle is reported instead of looping forever', () => {
    const outcome = recalculate([sheet('S', [['=A2'], ['=A1']])])
    assert.equal(outcome.cycled, true)
    assert.equal(outcome.errors.get('S!0:0'), '#CYCLE!')
    assert.equal(outcome.errors.get('S!1:0'), '#CYCLE!')
})

test('a self-reference is a cycle', () => {
    const outcome = recalculate([sheet('S', [['=A1']])])
    assert.equal(outcome.cycled, true)
})

test('an unresolvable formula records its error and does not block the others', () => {
    const outcome = recalculate([sheet('S', [[1], ['=Nope!A1'], ['=A1*2']])])
    assert.equal(outcome.errors.get('S!1:0'), '#REF!')
    assert.equal(outcome.computed.get('S!2:0'), 2, 'the healthy formula still computed')
})

test('a workbook with no formulas does no work', () => {
    const outcome = recalculate([sheet('S', [[1, 2], [3, 4]])])
    assert.equal(outcome.computed.size, 0)
    assert.equal(outcome.cycled, false)
})

test('formatResult renders values the way a cell should show them', () => {
    assert.equal(formatResult(3), '3')
    assert.equal(formatResult(1 / 3), '0.3333333333')
    assert.equal(formatResult(true), 'TRUE')
    assert.equal(formatResult(null), '')
    assert.equal(formatResult('text'), 'text')
})

// ─── snapshot round trip ─────────────────────────────────────────────────

test('a computed snapshot keeps the source formula text', () => {
    // The engine holds "85" after the adapter wrote the computed value for
    // display; the document must keep "=SUM(B1:B5)" or the formula is lost on the
    // next load and collaborators receive a frozen number.
    const source = [[1, '=SUM(A1:A1)'], [2, '=A1+1']]
    const snapshot = [[1, '85'], [2, '2']]
    restoreFormulas(snapshot, source)
    assert.equal(snapshot[0]![1], '=SUM(A1:A1)')
    assert.equal(snapshot[1]![1], '=A1+1')
    assert.equal(snapshot[0]![0], 1, 'non-formula cells are untouched')
})

test('restoreFormulas tolerates short rows in either input', () => {
    // The snapshot row exists but is shorter than the source: the extra cell is
    // simply written at its index.
    const snapshot: unknown[][] = [[1]]
    restoreFormulas(snapshot, [[1, '=A1'], [2]])
    assert.deepEqual(snapshot, [[1, '=A1']])

    // A source row with no counterpart in the snapshot is skipped, not appended.
    const short: unknown[][] = [[1]]
    restoreFormulas(short, [[1], [2, '=A1']])
    assert.deepEqual(short, [[1]])
})

test('only real formula text is restored, not a lone "="', () => {
    const snapshot = [['x']]
    restoreFormulas(snapshot, [['=']])
    assert.equal(snapshot[0]![0], 'x')
})
