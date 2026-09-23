/**
 * Tailwind compiler test.
 *
 * Compiles a throwaway plugin project against the real host Tailwind config and
 * asserts the utilities it uses are present.
 *
 * Run: node apps/desktop/src/main/plugin-dev/tailwind.test.mjs
 */
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildPluginCss, loadTailwindConfig } from './tailwind.mjs'

const results = []
const check = (name, condition, detail = '') => {
    results.push({ name, ok: Boolean(condition), detail })
    console.log((condition ? 'ok  ' : 'FAIL') + ' ' + name + (detail ? ' — ' + detail : ''))
}

const loaded = loadTailwindConfig()
check('config: host Tailwind config loads', Boolean(loaded.config), String(loaded.from))

const root = join(tmpdir(), 'kn-tailwind-' + process.pid)
await rm(root, { recursive: true, force: true })
await mkdir(join(root, 'src'), { recursive: true })
await writeFile(
    join(root, 'src', 'index.tsx'),
    'export const A = () => <div className="text-red-500 grid-cols-3 rounded-md" />',
)

const built = await buildPluginCss({ root })
check('css: no warnings', built.warnings.length === 0, JSON.stringify(built.warnings))
check('css: built non-empty', built.css.length > 0, String(built.css.length) + ' bytes')
check('css: includes text-red-500', built.css.includes('.text-red-500'), '')
check('css: includes grid-cols-3', built.css.includes('.grid-cols-3'), '')
check('css: uses host theme token for rounded-md', built.css.includes('--radius'), '')
check('css: no leaked @keyframes', !built.css.includes('@keyframes'), '')
check('css: only class rules remain', !built.css.includes('*, ::before, ::after'), '')

const empty = join(tmpdir(), 'kn-tailwind-empty-' + process.pid)
await rm(empty, { recursive: true, force: true })
await mkdir(empty, { recursive: true })
const noContent = await buildPluginCss({ root: empty })
check('css: empty project yields no css', noContent.css === '' && noContent.warnings.length === 0, JSON.stringify(noContent))

await rm(root, { recursive: true, force: true })
await rm(empty, { recursive: true, force: true })

const failed = results.filter((entry) => !entry.ok)
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed')
process.exit(failed.length ? 1 : 0)
