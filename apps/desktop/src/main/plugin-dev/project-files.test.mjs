/**
 * Project file explorer test.
 *
 * Runs the real module against a throwaway project, covering the discovery
 * primitives the agent uses: list, filter, search, and vendor-dir skipping.
 *
 * Run: node apps/desktop/src/main/plugin-dev/project-files.test.mjs
 */
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listProjectFiles, queryProjectFiles, searchProjectFiles } from './project-files.mjs'

const results = []
const check = (name, condition, detail = '') => {
    results.push({ name, ok: Boolean(condition), detail })
    console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

const root = join(tmpdir(), 'kn-project-files-' + process.pid)
await rm(root, { recursive: true, force: true })
await mkdir(join(root, 'src'), { recursive: true })
await mkdir(join(root, 'node_modules', 'dep'), { recursive: true })
await writeFile(join(root, 'src', 'a.ts'), 'export const a = 1\nexport const b = 2\n')
await writeFile(join(root, 'src', 'View.tsx'), 'export const View = () => null\n')
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
check('list: include filter', filtered.files.length === 2 && filtered.files.every((p) => p.startsWith('src/')), filtered.files.join(', '))

const searched = await searchProjectFiles(root, { query: 'export const' })
check('search: finds matching lines', searched.matches.length === 3, JSON.stringify(searched.matches))
check('search: carries path + line', searched.matches.every((m) => m.path && m.line > 0))

const tsxOnly = await searchProjectFiles(root, { query: 'export', include: '.tsx' })
check('search: include filter', tsxOnly.matches.length === 1 && tsxOnly.matches[0].path === 'src/View.tsx', JSON.stringify(tsxOnly.matches))

const capped = await searchProjectFiles(root, { query: 'export', limit: 1 })
check('search: respects limit', capped.matches.length === 1 && capped.truncated === true)

const dispatchedList = await queryProjectFiles(root, {})
check('dispatch: list mode', dispatchedList.kind === 'list' && dispatchedList.files.length === 3)
const dispatchedSearch = await queryProjectFiles(root, { query: 'View' })
check('dispatch: search mode', dispatchedSearch.kind === 'search' && dispatchedSearch.matches.length === 1)

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
