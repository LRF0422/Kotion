/**
 * Host API reference test.
 *
 * Runs the real module against the real workspace packages, so it verifies the
 * surface the agent reads: listing, searching and reading host package source.
 *
 * Run: node apps/desktop/src/main/plugin-dev/host-api.test.mjs
 */
import { resolve } from 'node:path'
import {
    listHostPackages,
    queryHostApi,
    readHostPackageFile,
    resolveWorkspaceRoot,
    searchHostPackages,
} from './host-api.mjs'

const results = []
const check = (name, condition, detail = '') => {
    results.push({ name, ok: Boolean(condition), detail })
    console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

const root = resolveWorkspaceRoot([
    process.env.KN_WORKSPACE_ROOT,
    process.cwd(),
    resolve(process.cwd(), '..'),
    resolve(process.cwd(), '..', '..'),
])
check('root: located the workspace', typeof root === 'string', String(root))
if (!root) {
    const failedRoot = results.filter((entry) => !entry.ok)
    console.log('\n' + (results.length - failedRoot.length) + '/' + results.length + ' checks passed')
    process.exit(1)
}

const packages = listHostPackages(root)
const names = packages.map((pkg) => pkg.name)
check(
    'list: finds the standard packages',
    ['@kn/common', '@kn/plugin-api', '@kn/ui'].every((name) => names.includes(name)),
    names.join(', '),
)
const pluginApi = packages.find((pkg) => pkg.name === '@kn/plugin-api')
check('list: reports an entry file', Boolean(pluginApi && pluginApi.entry), String(pluginApi && pluginApi.entry))

const search = await searchHostPackages(root, { query: 'PluginConfig', limit: 20 })
check(
    'search: finds PluginConfig in @kn/common',
    search.matches.some((match) => match.package === '@kn/common' && match.path.endsWith('.ts')),
    String(search.matches[0] && search.matches[0].package + ':' + search.matches[0].path + ':' + search.matches[0].line),
)
check('search: matches carry file + line', search.matches.every((match) => Boolean(match.path) && match.line > 0))

const file = await readHostPackageFile(root, { package: '@kn/plugin-api', path: 'src/index.ts' })
check('read: returns the contract entry', file.contents.includes('PLUGIN_API_VERSION'), file.bytes + ' bytes')
check('read: reports a package-relative path', file.path === 'src/index.ts', file.path)

const list = await queryHostApi(root, {})
check('dispatch: list mode', list.kind === 'list' && list.packages.length > 0)
const searched = await queryHostApi(root, { query: 'DockPanelConfig', limit: 5 })
check('dispatch: search mode', searched.kind === 'search' && searched.matches.length > 0)
const read = await queryHostApi(root, { package: '@kn/common', path: 'src/core/dock.ts' })
check('dispatch: read mode', read.kind === 'file' && read.contents.includes('DockPanelConfig'))

let traversal = ''
try {
    await readHostPackageFile(root, { package: '@kn/common', path: '../../package.json' })
} catch (error) {
    traversal = error.message
}
check('guard: traversal refused', /escapes/.test(traversal), traversal)

let unknown = ''
try {
    await readHostPackageFile(root, { package: '@kn/nope', path: 'src/index.ts' })
} catch (error) {
    unknown = error.message
}
check('guard: unknown package refused', /unknown host package/.test(unknown), unknown)

let empty = ''
try {
    await searchHostPackages(root, { query: '   ' })
} catch (error) {
    empty = error.message
}
check('guard: empty query refused', /query/.test(empty), empty)

let noRoot = ''
try {
    await queryHostApi(undefined, {})
} catch (error) {
    noRoot = error.message
}
check('guard: unavailable source explained', /not available/.test(noRoot), noRoot)

const failed = results.filter((entry) => !entry.ok)
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed')
process.exit(failed.length ? 1 : 0)