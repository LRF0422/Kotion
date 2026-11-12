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

/* ------------------------------------------------------------------ *
 * Precise reads: one declaration / one interface member
 *
 * The agent's expensive mistake is reading a whole contract file to learn one
 * type. These modes are what the studio's `getDesktopCapability` builds on.
 * ------------------------------------------------------------------ */
const declaration = await readHostPackageFile(root, {
    package: '@kn/common',
    path: 'src/core/desktop/fs.ts',
    symbol: 'DesktopFileStat',
})
check(
    'declaration: returns one type, not the file',
    declaration.symbol === 'DesktopFileStat' &&
        declaration.contents.includes('export interface DesktopFileStat') &&
        !declaration.contents.includes('DesktopDirEntry'),
    declaration.contents.slice(0, 60),
)
check(
    'declaration: reports its own line range + file size',
    declaration.startLine > 0 &&
        declaration.endLine >= declaration.startLine &&
        declaration.totalLines > declaration.endLine,
    JSON.stringify({
        start: declaration.startLine,
        end: declaration.endLine,
        total: declaration.totalLines,
    }),
)

let unknownDeclaration = ''
try {
    await readHostPackageFile(root, {
        package: '@kn/common',
        path: 'src/core/desktop/fs.ts',
        symbol: 'NoSuchDeclaration',
    })
} catch (error) {
    unknownDeclaration = error.message
}
check(
    'declaration: unknown symbol is an error, not a whole file',
    /not found/.test(unknownDeclaration) && /NoSuchDeclaration/.test(unknownDeclaration),
    unknownDeclaration,
)

const declarations = await queryHostApi(root, {
    package: '@kn/common',
    symbols: ['SshExecOptions', 'StorageListOptions', 'NoSuchType'],
})
check(
    'dispatch: declarations mode resolves symbols across modules',
    declarations.kind === 'declarations' &&
        declarations.declarations.length === 2 &&
        JSON.stringify(declarations.missing) === JSON.stringify(['NoSuchType']),
    JSON.stringify({
        found: declarations.declarations.map((entry) => entry.symbol),
        missing: declarations.missing,
    }),
)
check(
    'dispatch: declarations carry package + path + line range',
    declarations.declarations.every(
        (entry) => entry.package === '@kn/common' && entry.path.endsWith('.ts') && entry.startLine > 0,
    ) &&
        declarations.declarations.some((entry) => entry.path === 'src/core/desktop/ssh.ts'),
    JSON.stringify(declarations.declarations.map((entry) => entry.path)),
)

const members = await queryHostApi(root, {
    package: '@kn/common',
    path: 'src/core/desktop/contract.ts',
    members: ['fs.readFile', 'ssh.exec', 'nope.nothing'],
})
check(
    'dispatch: contract mode returns members with params/result',
    members.kind === 'contract' &&
        members.entries.length === 2 &&
        members.entries.every((entry) => /params/.test(entry.text) && /result/.test(entry.text)) &&
        JSON.stringify(members.missing) === JSON.stringify(['nope.nothing']),
    JSON.stringify({ entries: members.entries.map((entry) => entry.member), missing: members.missing }),
)
check(
    'dispatch: contract members report their line range',
    members.entries.every(
        (entry) => entry.startLine > 0 && entry.endLine >= entry.startLine && entry.totalLines >= entry.endLine,
    ),
)

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