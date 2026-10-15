/**
 * Project file explorer test.
 *
 * Runs the real module against a throwaway project, covering the discovery
 * primitives the agent uses: list, filter, search, grep, and vendor-dir
 * skipping.
 *
 * Run: node apps/desktop/src/main/plugin-dev/project-files.test.mjs
 */
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
    compileGlob,
    grepProjectFiles,
    listProjectFiles,
    normalizeFilesParams,
    queryProjectFiles,
    searchProjectFiles,
} from './project-files.mjs'

const results = []
const check = (name, condition, detail = '') => {
    results.push({ name, ok: Boolean(condition), detail })
    console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

const root = join(tmpdir(), 'kn-project-files-' + process.pid)
await rm(root, { recursive: true, force: true })
await mkdir(join(root, 'src'), { recursive: true })
await mkdir(join(root, 'src', 'nested'), { recursive: true })
await mkdir(join(root, 'node_modules', 'dep'), { recursive: true })
await writeFile(join(root, 'src', 'a.ts'), 'export const a = 1\nexport const b = 2\n')
await writeFile(join(root, 'src', 'View.tsx'), 'export const View = () => null\n')
await writeFile(
    join(root, 'src', 'nested', 'deep.ts'),
    ['// header', 'const target = useOptionalService("storage")', 'const other = 1', '// trailing', 'export {}'].join('\n'),
)
await writeFile(join(root, 'README.md'), 'hello\n')
await writeFile(join(root, 'node_modules', 'dep', 'index.ts'), 'export const dep = 1\n')

const listed = await listProjectFiles(root)
check(
    'list: returns project files',
    ['README.md', 'src/View.tsx', 'src/a.ts'].every((path) => listed.files.includes(path)),
    listed.files.join(', '),
)
check('list: skips node_modules', !listed.files.some((path) => path.includes('node_modules')), listed.files.join(', '))

const filtered = await listProjectFiles(root, { include: 'src/' })
check('list: include filter', filtered.files.length === 3 && filtered.files.every((p) => p.startsWith('src/')), filtered.files.join(', '))

const searched = await searchProjectFiles(root, { query: 'export const' })
check('search: finds matching lines', searched.matches.length === 3, JSON.stringify(searched.matches))
check('search: carries path + line', searched.matches.every((m) => m.path && m.line > 0))

const tsxOnly = await searchProjectFiles(root, { query: 'export', include: '.tsx' })
check('search: include filter', tsxOnly.matches.length === 1 && tsxOnly.matches[0].path === 'src/View.tsx', JSON.stringify(tsxOnly.matches))

const capped = await searchProjectFiles(root, { query: 'export', limit: 1 })
check('search: respects limit', capped.matches.length === 1 && capped.truncated === true)

const dispatchedList = await queryProjectFiles(root, {})
check('dispatch: list mode', dispatchedList.kind === 'list' && dispatchedList.files.length === 4)
const dispatchedSearch = await queryProjectFiles(root, { query: 'View' })
check('dispatch: search mode', dispatchedSearch.kind === 'search' && dispatchedSearch.matches.length === 1)

/* ------------------------------------------------------------------ *
 * grep: regex, globs, context, output modes, bounds
 * ------------------------------------------------------------------ */
const grepped = await grepProjectFiles(root, { pattern: 'useOptionalService\\(' })
check(
    'grep: finds a regex match with path + line',
    grepped.kind === 'grep' &&
        grepped.matches.length === 1 &&
        grepped.matches[0].path === 'src/nested/deep.ts' &&
        grepped.matches[0].line === 2,
    JSON.stringify(grepped.matches),
)

const withContext = await grepProjectFiles(root, { pattern: 'useOptionalService', context: 1 })
check(
    'grep: carries context lines',
    withContext.matches[0]?.before?.[0]?.text === '// header' &&
        withContext.matches[0]?.after?.[0]?.text === 'const other = 1',
    JSON.stringify(withContext.matches[0]),
)

const regexAlternation = await grepProjectFiles(root, { pattern: 'export (const|function)' })
check('grep: alternation works', regexAlternation.matches.length === 3, JSON.stringify(regexAlternation.matches.map((m) => m.path)))

const caseSensitive = await grepProjectFiles(root, { pattern: 'HELLO' })
check('grep: case-sensitive by default', caseSensitive.matches.length === 0)
const caseInsensitive = await grepProjectFiles(root, { pattern: 'HELLO', ignoreCase: true })
check('grep: ignoreCase opts in', caseInsensitive.matches.length === 1, JSON.stringify(caseInsensitive.matches))

const globbed = await grepProjectFiles(root, { pattern: 'export', include: '*.tsx' })
check('grep: include glob matches basenames', globbed.matches.length === 1 && globbed.matches[0].path === 'src/View.tsx', JSON.stringify(globbed.matches))
const globbedDeep = await grepProjectFiles(root, { pattern: 'export', include: 'src/nested/**' })
check('grep: nested glob', globbedDeep.matches.length === 1 && globbedDeep.matches[0].path === 'src/nested/deep.ts', JSON.stringify(globbedDeep.matches))
const substringInclude = await grepProjectFiles(root, { pattern: 'export', include: 'src/' })
check(
    'grep: include still takes a plain substring',
    substringInclude.matches.length === 4 &&
        new Set(substringInclude.matches.map((m) => m.path)).size === 3 &&
        substringInclude.matches.every((m) => m.path.startsWith('src/')),
    JSON.stringify(substringInclude.matches.map((m) => m.path)),
)

const filesMode = await grepProjectFiles(root, { pattern: 'export', outputMode: 'files_with_matches' })
check(
    'grep: files_with_matches mode',
    filesMode.mode === 'files_with_matches' && filesMode.matches.length === 0 && filesMode.files.length === 3,
    JSON.stringify(filesMode.files),
)
const countMode = await grepProjectFiles(root, { pattern: 'export', outputMode: 'count' })
check(
    'grep: count mode reports per-file counts',
    countMode.mode === 'count' && countMode.counts.find((entry) => entry.path === 'src/a.ts')?.count === 2,
    JSON.stringify(countMode.counts),
)

const cappedGrep = await grepProjectFiles(root, { pattern: 'export', limit: 1 })
check('grep: reports truncation at the match cap', cappedGrep.matches.length === 1 && cappedGrep.truncated === true)
check('grep: reports how much it scanned', grepped.scanned === 4 && grepped.skippedLarge === 0, JSON.stringify({ scanned: grepped.scanned, skippedLarge: grepped.skippedLarge }))

let badPattern = ''
try {
    await grepProjectFiles(root, { pattern: 'export (' })
} catch (error) {
    badPattern = error.message
}
check('grep: invalid regex refused with the compiler message', /invalid regular expression/.test(badPattern), badPattern)

let emptyPattern = ''
try {
    await grepProjectFiles(root, { pattern: '   ' })
} catch (error) {
    emptyPattern = error.message
}
check('grep: empty pattern refused', /pattern/.test(emptyPattern), emptyPattern)

const dispatchedGrep = await queryProjectFiles(root, { pattern: 'useOptionalService' })
check('dispatch: grep mode', dispatchedGrep.kind === 'grep' && dispatchedGrep.matches.length === 1)
const patternBeatsQuery = await queryProjectFiles(root, { pattern: 'useOptionalService', query: 'hello' })
check('dispatch: pattern wins over query', patternBeatsQuery.kind === 'grep')

/* glob compilation, as used by the include filter */
check(
    'glob: compiles basename and anchored forms',
    compileGlob('*.tsx').test('src/View.tsx') &&
        !compileGlob('*.tsx').test('src/View.ts') &&
        compileGlob('src/**').test('src/nested/deep.ts') &&
        !compileGlob('src/*.ts').test('src/nested/deep.ts'),
)
check('glob: escapes regex metacharacters', compileGlob('a+b.ts').test('a+b.ts') && !compileGlob('a+b.ts').test('aab.ts'))

/* params from the renderer are type-checked, not trusted */
const normalized = normalizeFilesParams({ pattern: 'x', ignoreCase: true, context: 2, outputMode: 'count', limit: 10 })
check(
    'params: well-typed fields kept',
    normalized.pattern === 'x' && normalized.ignoreCase === true && normalized.context === 2 && normalized.outputMode === 'count' && normalized.limit === 10,
    JSON.stringify(normalized),
)
const junk = normalizeFilesParams({ pattern: 42, include: null, ignoreCase: 'yes', context: '3', outputMode: 7, limit: 'lots' })
check(
    'params: ill-typed fields dropped',
    junk.pattern === undefined && junk.include === undefined && junk.ignoreCase === false && junk.context === undefined && junk.outputMode === undefined && junk.limit === undefined,
    JSON.stringify(junk),
)

let empty = ''
try {
    await searchProjectFiles(root, { query: '   ' })
} catch (error) {
    empty = error.message
}
check('guard: empty query refused', /query/.test(empty), empty)

await rm(root, { recursive: true, force: true })

const failed = results.filter((entry) => !entry.ok)
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed')
process.exit(failed.length ? 1 : 0)
