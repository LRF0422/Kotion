/**
 * A small, self-contained formula evaluator.
 *
 * ## Why this exists
 *
 * VTableSheet ships a formula engine, but it cannot be used as one (all verified
 * against 1.26.8, see docs/VTABLE_MIGRATION.md):
 *
 * - `rebuildAndRecalculate()` is an **empty function** — there is no callable
 *   full recalculation.
 * - The engine keeps its **own `sheetData` copy** that cell edits never reach, so
 *   dependents never see a change.
 * - The only usable entry point is the stateless `calculateFormula(formula)`,
 *   which does **not** parse A1 references — it evaluates a function expression
 *   against nothing.
 *
 * So a formula cell kept rendering its own text and never updated. Rather than
 * depend on that, this module evaluates formulas against the sheet data we
 * already hold: deterministic, testable, and independent of the grid engine.
 *
 * ## Scope
 *
 * Deliberately bounded to what a document editor needs to be correct rather than
 * to everything a desktop spreadsheet does:
 *
 * - arithmetic, comparison, concatenation (`&`) and `%`
 * - cell refs (`B3`), absolute refs (`$B$3`), ranges (`B3:B9`), cross-sheet
 *   (`Sheet2!B3`, and `'My Sheet'!B3`)
 * - functions: SUM, AVERAGE, COUNT, COUNTA, MIN, MAX, ROUND, ABS, IF, AND, OR,
 *   NOT, CONCATENATE, LEFT, RIGHT, MID, LEN
 *
 * Not supported (returns `#NAME?`/`#REF!` rather than a wrong number): unknown
 * functions, array formulas, and whole-column refs like `B:B`.
 *
 * The parser is a hand-written recursive descent over tokens, so it cannot be
 * tricked into `eval`.
 */

/** Anything a formula can read: sheet name → (row, column) → value. */
export interface FormulaSheetData {
    /** 0-based row/column lookup, returning the raw stored value. */
    cell: (row: number, column: number) => unknown
    /** How many rows/columns the sheet has, for range clamping. */
    rowCount: number
    columnCount: number
}

/** All sheets a formula may reference, keyed by their display name. */
export type FormulaWorkbook = Map<string, FormulaSheetData>

export type FormulaError = '#REF!' | '#VALUE!' | '#DIV/0!' | '#NAME?' | '#CYCLE!' | '#N/A'

export interface FormulaResult {
    value: unknown
    error?: FormulaError
}

/** A formula error travelling as a value through the evaluator. */
class FormulaFailure {
    // Plain fields rather than constructor parameter properties: Node's
    // type-stripping test runner rejects the parameter-property syntax.
    code: FormulaError
    detail: string

    constructor(code: FormulaError, detail: string) {
        this.code = code
        this.detail = detail
    }

    toString(): string {
        return this.code
    }
}

// ─── parsing ─────────────────────────────────────────────────────────────

type Token =
    | { kind: 'num'; value: number }
    | { kind: 'str'; value: string }
    | { kind: 'ref'; sheet?: string; from: string; to?: string; absolute?: boolean }
    | { kind: 'ident'; value: string }
    | { kind: 'op'; value: string }
    | { kind: 'end' }

const OPERATORS = ['<=', '>=', '<>', '+', '-', '*', '/', '^', '&', '=', '<', '>', '(', ')', ',', '%'] as const

/**
 * Turn a formula body into tokens.
 *
 * Sheet-qualified references are read as one token so `Sheet1!A1` cannot be
 * mistaken for an identifier followed by a bang.
 */
export function tokenize(input: string): Token[] {
    const text = input.startsWith('=') ? input.slice(1) : input
    const tokens: Token[] = []
    let index = 0

    while (index < text.length) {
        const char = text[index]!

        if (/\s/.test(char)) {
            index += 1
            continue
        }

        // Quoted sheet name, then a reference: 'My Sheet'!B3
        if (char === "'") {
            const close = text.indexOf("'", index + 1)
            if (close < 0) throw new FormulaFailure('#NAME?', 'unterminated sheet name')
            const sheet = text.slice(index + 1, close)
            // Skip the closing quote **and** the "!" — leaving the "!" in place made
            // `readReference` see `!B2` and report a bad reference.
            if (text[close + 1] !== '!') throw new FormulaFailure('#REF!', `expected "!" after '${sheet}'`)
            const rest = readReference(text, close + 2)
            if (!rest) throw new FormulaFailure('#REF!', `bad reference after '${sheet}'!`)
            tokens.push({ kind: 'ref', sheet, from: rest.from, to: rest.to })
            index = rest.end
            continue
        }

        // Number
        if (/[0-9]/.test(char) || (char === '.' && /[0-9]/.test(text[index + 1] ?? ''))) {
            const match = /^[0-9]*\.?[0-9]+([eE][+-]?[0-9]+)?/.exec(text.slice(index))
            if (!match) throw new FormulaFailure('#VALUE!', 'bad number')
            tokens.push({ kind: 'num', value: Number(match[0]) })
            index += match[0].length
            continue
        }

        // String literal
        if (char === '"') {
            const close = text.indexOf('"', index + 1)
            if (close < 0) throw new FormulaFailure('#VALUE!', 'unterminated string')
            tokens.push({ kind: 'str', value: text.slice(index + 1, close).replace(/""/g, '"') })
            index = close + 1
            continue
        }

        // Reference, optionally sheet-qualified, optionally a range
        const reference = readReference(text, index)
        if (reference) {
            tokens.push({
                kind: 'ref',
                sheet: reference.sheet,
                from: reference.from,
                to: reference.to,
                absolute: reference.absolute,
            })
            index = reference.end
            continue
        }

        // Identifier (function name or boolean). Deliberately excludes "!" so a
        // cross-sheet reference like `Sheet1!A1` reaches `readReference` above
        // instead of being consumed as the name `Sheet1`.
        const identifier = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(text.slice(index))
        if (identifier) {
            tokens.push({ kind: 'ident', value: identifier[0] })
            index += identifier[0].length
            continue
        }

        const operator = OPERATORS.find((candidate) => text.startsWith(candidate, index))
        if (!operator) throw new FormulaFailure('#NAME?', `unexpected character "${char}"`)
        tokens.push({ kind: 'op', value: operator })
        index += operator.length
    }

    tokens.push({ kind: 'end' })
    return tokens
}

interface ReferenceRead {
    sheet?: string
    from: string
    to?: string
    absolute?: boolean
    end: number
}

/**
 * Read a reference (or range) starting at `start`.
 *
 * `A1`, `$A$1`, `A1:B9`, `Sheet1!A1`, `Sheet1!A1:B9` and `#REF!`-free variants
 * are accepted; anything else returns null so the caller can try other tokens.
 */
function readReference(text: string, start: number): ReferenceRead | null {
    const cellPattern = /^(\$?)([A-Za-z]{1,3})(\$?)([0-9]{1,7})/
    // A sheet name may be longer than a column label (and may contain `_`/`.`),
    // so it is matched separately — `Nope!A1` must resolve to "missing sheet",
    // not fall through and be read as the identifier `Nope`.
    // Sheet names are user text and are routinely non-ASCII (`汇总!A1`), so they
    // are not restricted to identifier characters — but they cannot contain "(",
    // ":" or ",", and allowing those made `SUM(Data!A1)` tokenize the sheet as
    // `SUM(Data`, which then failed as a missing sheet.
    const sheetPattern = /^([^!():,]+)!/
    let index = start
    let sheet: string | undefined
    let absolute = false

    const sheetMatch = sheetPattern.exec(text.slice(index))
    if (sheetMatch) {
        sheet = sheetMatch[1]!
        index += sheetMatch[0].length
    }

    const first = cellPattern.exec(text.slice(index))
    if (!first) return null
    if (first[1] || first[3]) absolute = true
    const from = `${first[2]!.toUpperCase()}${first[4]!}`
    index += first[0].length

    let to: string | undefined
    if (text[index] === ':') {
        const second = cellPattern.exec(text.slice(index + 1))
        if (!second) throw new FormulaFailure('#REF!', 'bad range end')
        to = `${second[2]!.toUpperCase()}${second[4]!}`
        index += 1 + second[0].length
    }

    return { sheet, from, to, absolute, end: index }
}

/** `"B12"` → `{ row: 11, column: 1 }` (0-based). */
export function parseA1(ref: string): { row: number; column: number } {
    const match = /^([A-Za-z]{1,3})([0-9]{1,7})$/.exec(ref.trim())
    if (!match) throw new FormulaFailure('#REF!', `bad reference "${ref}"`)
    const letters = match[1]!.toUpperCase()
    let column = 0
    for (let i = 0; i < letters.length; i += 1) {
        column = column * 26 + (letters.charCodeAt(i) - 64)
    }
    return { row: Number.parseInt(match[2]!, 10) - 1, column: column - 1 }
}

// ─── evaluating ──────────────────────────────────────────────────────────

/** Coerce for arithmetic: blanks are 0, text that is not numeric fails. */
function toNumber(value: unknown): number {
    if (value === null || value === undefined || value === '') return 0
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new FormulaFailure('#VALUE!', 'not finite')
        return value
    }
    if (typeof value === 'boolean') return value ? 1 : 0
    // A numeric *string* still counts, because our own number formats render
    // values to strings ("12.50%", "¥12.50") and those must keep computing.
    const numeric = asNumberOrNull(value)
    if (numeric === null) throw new FormulaFailure('#VALUE!', `"${String(value)}" is not a number`)
    return numeric
}

/** Loose comparison used by `=`, `<`, `>` etc. Numbers win when both sides are numeric. */
function compare(left: unknown, right: unknown): number {
    const leftNumber = asNumberOrNull(left)
    const rightNumber = asNumberOrNull(right)
    if (leftNumber !== null && rightNumber !== null) return leftNumber - rightNumber
    const a = left === null || left === undefined ? '' : String(left)
    const b = right === null || right === undefined ? '' : String(right)
    return a < b ? -1 : a > b ? 1 : 0
}

function asNumberOrNull(value: unknown): number | null {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null
    if (typeof value === 'boolean') return value ? 1 : 0
    if (value === null || value === undefined || value === '') return 0
    const raw = String(value).trim()
    if (raw === '') return null
    // Our own number formats store the *display* string, so "50.00%" must read as
    // 0.5 — dropping the sign without scaling would make every percent-formatted
    // cell a hundred times too large in any formula.
    const isPercent = raw.endsWith('%')
    const text = raw.replace(/[,\s]/g, '').replace(/[¥$€£%]/g, '')
    if (text === '') return null
    const parsed = Number(text)
    if (!Number.isFinite(parsed)) return null
    return isPercent ? parsed / 100 : parsed
}

/** Flatten range arguments for the aggregate functions, skipping blanks. */
function flatten(values: unknown[]): unknown[] {
    const out: unknown[] = []
    for (const value of values) {
        if (Array.isArray(value)) out.push(...value.flat(2))
        else out.push(value)
    }
    return out
}

function numbersOf(values: unknown[]): number[] {
    const out: number[] = []
    for (const value of flatten(values)) {
        if (value === null || value === undefined || value === '') continue
        const numeric = asNumberOrNull(value)
        if (numeric !== null) out.push(numeric)
    }
    return out
}

/** Function implementations. Keys are upper-case. */
const FUNCTIONS: Record<string, (args: unknown[]) => unknown> = {
    SUM: (args) => numbersOf(args).reduce((a, b) => a + b, 0),
    AVERAGE: (args) => {
        const numbers = numbersOf(args)
        if (numbers.length === 0) throw new FormulaFailure('#DIV/0!', 'AVERAGE of nothing')
        return numbers.reduce((a, b) => a + b, 0) / numbers.length
    },
    COUNT: (args) => numbersOf(args).length,
    COUNTA: (args) => flatten(args).filter((value) => value !== null && value !== undefined && value !== '').length,
    MIN: (args) => {
        const numbers = numbersOf(args)
        return numbers.length === 0 ? 0 : Math.min(...numbers)
    },
    MAX: (args) => {
        const numbers = numbersOf(args)
        return numbers.length === 0 ? 0 : Math.max(...numbers)
    },
    ABS: (args) => Math.abs(toNumber(args[0])),
    ROUND: (args) => {
        const digits = args.length > 1 ? Math.trunc(toNumber(args[1])) : 0
        const factor = 10 ** digits
        return Math.round(toNumber(args[0]) * factor) / factor
    },
    IF: (args) => {
        if (args.length < 2) throw new FormulaFailure('#VALUE!', 'IF needs a condition and a value')
        return truthy(args[0]) ? args[1] : args.length > 2 ? args[2] : false
    },
    AND: (args) => flatten(args).every(truthy),
    OR: (args) => flatten(args).some(truthy),
    NOT: (args) => !truthy(args[0]),
    CONCATENATE: (args) => flatten(args).map((value) => (value === null || value === undefined ? '' : String(value))).join(''),
    LEN: (args) => String(args[0] ?? '').length,
    LEFT: (args) => String(args[0] ?? '').slice(0, args.length > 1 ? Math.trunc(toNumber(args[1])) : 1),
    RIGHT: (args) => {
        const count = args.length > 1 ? Math.trunc(toNumber(args[1])) : 1
        const text = String(args[0] ?? '')
        return count <= 0 ? '' : text.slice(-count)
    },
    MID: (args) => {
        const start = Math.trunc(toNumber(args[1]))
        const count = Math.trunc(toNumber(args[2]))
        return String(args[0] ?? '').substr(Math.max(start - 1, 0), Math.max(count, 0))
    },
}

/** Text form of a value for concatenation: blanks are empty, not "null". */
function display(value: unknown): string {
    if (value === null || value === undefined) return ''
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
    return String(value)
}

function truthy(value: unknown): boolean {
    if (typeof value === 'boolean') return value
    if (value === null || value === undefined || value === '') return false
    if (typeof value === 'number') return value !== 0
    const text = String(value).trim().toUpperCase()
    if (text === 'FALSE') return false
    if (text === 'TRUE') return true
    return text !== ''
}

/**
 * Evaluate a formula against a workbook.
 *
 * `currentSheet` is the display name of the sheet holding the formula, used to
 * resolve unqualified references.
 */
export function evaluateFormula(
    formula: string,
    workbook: FormulaWorkbook,
    currentSheet: string,
): FormulaResult {
    let tokens: Token[]
    try {
        tokens = tokenize(formula)
    } catch (error) {
        return failure(error)
    }

    let position = 0
    const peek = (): Token => tokens[position]!
    const next = (): Token => tokens[position++]!
    const eat = (operator: string): boolean => {
        const token = peek()
        if (token.kind === 'op' && token.value === operator) {
            position += 1
            return true
        }
        return false
    }
    const expect = (operator: string): void => {
        if (!eat(operator)) throw new FormulaFailure('#VALUE!', `expected "${operator}"`)
    }

    // Declared as function statements, not `const` arrows: `readPrimary` calls
    // back into the additive level for parentheses and arguments, and a `const`
    // arrow would still be in its temporal dead zone at that point — which threw
    // and surfaced as a bogus `#VALUE!` for every parenthesised formula.
    function readReferenceValue(token: Extract<Token, { kind: 'ref' }>): unknown {
        const sheetName = token.sheet ?? currentSheet
        const sheet = workbook.get(sheetName)
        if (!sheet) throw new FormulaFailure('#REF!', `no sheet named "${sheetName}"`)
        const from = parseA1(token.from)
        if (!token.to) {
            if (from.row >= sheet.rowCount || from.column >= sheet.columnCount) {
                // Reading outside the grid is an empty cell, not an error: the
                // grid grows on write and formulas are written before it does.
                return null
            }
            return sheet.cell(from.row, from.column)
        }
        const to = parseA1(token.to)
        const values: unknown[] = []
        for (let row = Math.min(from.row, to.row); row <= Math.max(from.row, to.row); row += 1) {
            for (let column = Math.min(from.column, to.column); column <= Math.max(from.column, to.column); column += 1) {
                if (row >= sheet.rowCount || column >= sheet.columnCount) {
                    values.push(null)
                    continue
                }
                values.push(sheet.cell(row, column))
            }
        }
        return values
    }

    function readPrimary(): unknown {
        const token = next()
        if (token.kind === 'num') return token.value
        if (token.kind === 'str') return token.value
        if (token.kind === 'ref') return readReferenceValue(token)
        if (token.kind === 'op' && token.value === '(') {
            const value = readComparison()
            expect(')')
            return value
        }
        if (token.kind === 'op' && (token.value === '-' || token.value === '+')) {
            const value = toNumber(readPrimary())
            return token.value === '-' ? -value : value
        }
        if (token.kind === 'ident') {
            const upper = token.value.toUpperCase()
            if (upper === 'TRUE') return true
            if (upper === 'FALSE') return false
            if (peek().kind === 'op' && (peek() as { value: string }).value === '(') {
                next() // consume "("
                const args: unknown[] = []
                if (!(peek().kind === 'op' && (peek() as { value: string }).value === ')')) {
                    do {
                        args.push(readComparison())
                    } while (eat(','))
                }
                expect(')')
                const fn = FUNCTIONS[upper]
                if (!fn) throw new FormulaFailure('#NAME?', `unknown function ${upper}`)
                return fn(args)
            }
            throw new FormulaFailure('#NAME?', `unknown name ${token.value}`)
        }
        throw new FormulaFailure('#VALUE!', 'unexpected end of formula')
    }

    function readPower(): unknown {
        let value = readPrimary()
        while (eat('^')) value = toNumber(value) ** toNumber(readPrimary())
        return value
    }

    function readPercent(): unknown {
        let value = readPower()
        while (eat('%')) value = toNumber(value) / 100
        return value
    }

    function readTerm(): unknown {
        let value = readPercent()
        for (;;) {
            if (eat('*')) value = toNumber(value) * toNumber(readPercent())
            else if (eat('/')) {
                const divisor = toNumber(readPercent())
                if (divisor === 0) throw new FormulaFailure('#DIV/0!', 'division by zero')
                value = toNumber(value) / divisor
            } else return value
        }
    }

    function readAdditive(): unknown {
        let value = readTerm()
        for (;;) {
            if (eat('+')) value = toNumber(value) + toNumber(readTerm())
            else if (eat('-')) value = toNumber(value) - toNumber(readTerm())
            else return value
        }
    }

    /**
     * Concatenation binds **looser** than arithmetic, matching Excel:
     * `="n="&1+1` is `"n=" & 2`. Getting this backwards made every such formula
     * try to add a string to a number.
     */
    function readConcat(): unknown {
        let value = readAdditive()
        while (eat('&')) {
            const right = readAdditive()
            value = `${display(value)}${display(right)}`
        }
        return value
    }

    function readComparison(): unknown {
        let value = readConcat()
        for (;;) {
            if (eat('=')) value = compare(value, readConcat()) === 0
            else if (eat('<>')) value = compare(value, readConcat()) !== 0
            else if (eat('<=')) value = compare(value, readConcat()) <= 0
            else if (eat('>=')) value = compare(value, readConcat()) >= 0
            else if (eat('<')) value = compare(value, readConcat()) < 0
            else if (eat('>')) value = compare(value, readConcat()) > 0
            else return value
        }
    }

    try {
        const value = readComparison()
        if (peek().kind !== 'end') throw new FormulaFailure('#VALUE!', 'unexpected trailing input')
        return { value }
    } catch (error) {
        return failure(error)
    }
}

function failure(error: unknown): FormulaResult {
    if (error instanceof FormulaFailure) return { value: error.code, error: error.code }
    return { value: '#VALUE!', error: '#VALUE!' }
}

/** True when a stored value is a formula, i.e. starts with `=`. */
export function isFormulaValue(value: unknown): boolean {
    return typeof value === 'string' && value.startsWith('=') && value.length > 1
}

/**
 * How many passes over the sheet a dependency chain may take.
 *
 * Formulas are recomputed in sheet order; a chain that references a cell below
 * it needs another pass. The cap keeps a reference cycle from looping forever,
 * which is what `#CYCLE!` reports.
 */
export const MAX_RECALC_PASSES = 12

export interface RecalcSheet {
    name: string
    rows: unknown[][]
    rowCount: number
    columnCount: number
}

export interface RecalcOutcome {
    /** Computed value per `"row:col"` for every formula cell that resolved. */
    computed: Map<string, unknown>
    /** Cell key → error code, for formulas that could not be evaluated. */
    errors: Map<string, FormulaError>
    /** True when the pass cap was hit, i.e. a reference cycle is likely. */
    cycled: boolean
}

/**
 * Compute every formula cell in a workbook.
 *
 * Reference cycles are resolved the way a spreadsheet does: the pass cap stops
 * the loop and the offending cells report `#CYCLE!`.
 */
export function recalculate(workbookSheets: RecalcSheet[]): RecalcOutcome {
    const source: FormulaWorkbook = new Map()
    for (const sheet of workbookSheets) {
        source.set(sheet.name, {
            rowCount: sheet.rowCount,
            columnCount: sheet.columnCount,
            cell: (row, column) => sheet.rows[row]?.[column] ?? null,
        })
    }

    const cellKey = (sheet: string, row: number, column: number): string => `${sheet}!${row}:${column}`
    /** Final value per cell. Only successful, cycle-free results are recorded. */
    const settled = new Map<string, unknown>()
    const errors = new Map<string, FormulaError>()
    /** Keys currently being evaluated, for cycle detection. */
    const inFlight = new Set<string>()
    /** Keys that were found to be part of a cycle. */
    const cyclic = new Set<string>()

    /**
     * Resolve a cell to its value, computing it on demand.
     *
     * On demand rather than in passes: a chain like `A2 = A3` where `A3` is itself
     * a formula must read `A3`'s *result*, and an iterative scheme has to store an
     * intermediate `null` for it — which then looks like a settled value and is
     * never revisited. Recursion with memoisation has no such intermediate state.
     * Cycles are caught by `inFlight` before they can recurse forever.
     */
    const resolveCell = (sheetName: string, row: number, column: number): unknown => {
        const key = cellKey(sheetName, row, column)
        if (settled.has(key)) return settled.get(key)
        const raw = source.get(sheetName)?.cell(row, column) ?? null
        if (!isFormulaValue(raw)) return raw
        if (inFlight.has(key)) throw new FormulaFailure('#CYCLE!', `cycle at ${key}`)

        inFlight.add(key)
        try {
            const result = evaluateFormula(String(raw), buildOverlay(), sheetName)
            if (result.error) {
                errors.set(key, result.error)
                // Deliberately **not** memoised. Caching an error made it final: a
                // chain like `A2 = A3` (where A3 is a formula) read A3's
                // not-yet-computed state as `null`, cached it, and never revisited
                // it — so A2 stayed empty even after A3 resolved.
                return result.value
            }
            // Reading a cell that turned out to be cyclical makes this cell part of
            // the cycle too, so it reports one rather than a value.
            if (cyclic.size > 0) {
                cyclic.add(key)
                errors.set(key, '#CYCLE!')
                return '#CYCLE!'
            }
            errors.delete(key)
            settled.set(key, result.value)
            return result.value
        } catch (error) {
            const code: FormulaError = error instanceof FormulaFailure ? error.code : '#VALUE!'
            if (code === '#CYCLE!') {
                // Every cell on the way out is part of the cycle, not just the one
                // that first noticed it: A1→A2→A1 must report both, and the one
                // that merely *read* a cycle must not look like it computed a value.
                cyclic.add(key)
                errors.set(key, code)
                return code
            }
            errors.set(key, code)
            return code
        } finally {
            inFlight.delete(key)
        }
    }

    /**
     * A view of the workbook for one evaluation.
     *
     * Rebuilt per call rather than shared: a formula must read its dependencies'
     * *results*, and those only exist once they have been resolved. A single map
     * created up front saw an empty `settled` for every formula.
     */
    const buildOverlay = (): FormulaWorkbook => {
        const overlay: FormulaWorkbook = new Map()
        for (const sheet of workbookSheets) {
            overlay.set(sheet.name, {
                rowCount: sheet.rowCount,
                columnCount: sheet.columnCount,
                cell: (row, column) => resolveCell(sheet.name, row, column),
            })
        }
        return overlay
    }

    for (const sheet of workbookSheets) {
        for (let row = 0; row < sheet.rows.length; row += 1) {
            const line = sheet.rows[row] ?? []
            for (let column = 0; column < line.length; column += 1) {
                if (isFormulaValue(line[column])) resolveCell(sheet.name, row, column)
            }
        }
    }

    // Reconcile the two views of a cycle. `cyclic` is authoritative for
    // membership (it is built while unwinding the recursion, so it has every cell
    // on the cycle), while `errors` is what callers read — and a cell can end up
    // in `settled` with the sentinel value rather than throwing.
    for (const key of cyclic) {
        errors.set(key, '#CYCLE!')
        settled.delete(key)
    }
    for (const [key, value] of settled) {
        if (value === '#CYCLE!') {
            errors.set(key, '#CYCLE!')
            settled.delete(key)
        }
    }
    return { computed: settled, errors, cycled: [...errors.values()].includes('#CYCLE!') }
}

/** Display text for a computed formula value. */
export function formatResult(value: unknown): string {
    if (value === null || value === undefined) return ''
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
    if (typeof value === 'number') return String(Math.round(value * 1e10) / 1e10)
    return String(value)
}

/**
 * Put formula text back into a snapshot read from the engine.
 *
 * `applyFormulas` writes computed values into the engine so they render, but the
 * engine's data is what a snapshot reads back — so without this the saved payload
 * would contain `85` where the user wrote `=SUM(B1:B5)`. That loses the formula on
 * every reload and sends collaborators a frozen value instead of a formula.
 *
 * Only cells that hold a formula in `sourceRows` are touched.
 */
export function restoreFormulas(
    snapshotRows: unknown[][],
    sourceRows: unknown[][],
): void {
    for (let row = 0; row < sourceRows.length; row += 1) {
        const source = sourceRows[row]
        if (!source) continue
        for (let column = 0; column < source.length; column += 1) {
            const original = source[column]
            if (!isFormulaValue(original)) continue
            const target = snapshotRows[row]
            if (!target) continue
            target[column] = original
        }
    }
}
