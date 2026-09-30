/**
 * Bundler self-test (plain Node, no Electron).
 *
 * Builds a tiny plugin project, executes the produced bundle against a fake
 * `window.__KN__`, and asserts that registration, host-module wiring and build
 * failure reporting all behave.
 *
 * Run: node apps/desktop/src/main/plugin-dev/bundler.test.mjs
 */
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import {
    SCAFFOLD_TEMPLATES,
    buildPlugin,
    hostNameForExternal,
    pluginCssScope,
    readProjectManifest,
    renderScaffold,
} from './bundler.mjs'

const results = []
const check = (name, condition, detail = '') => {
    results.push({ name, ok: Boolean(condition), detail })
    console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

const root = join(tmpdir(), 'kn-studio-bundler-test')

const writeProject = async (indexSource, manifestExtra = {}) => {
    await rm(root, { recursive: true, force: true })
    await mkdir(join(root, 'src'), { recursive: true })
    await writeFile(
        join(root, 'package.json'),
        JSON.stringify(
            {
                name: 'test-dev-plugin',
                version: '0.0.1',
                knPluginStudio: { pluginKey: 'test-dev-plugin', displayName: 'Test Dev Plugin', entry: 'src/index.tsx' },
                ...manifestExtra,
            },
            null,
            2,
        ),
    )
    await writeFile(join(root, 'src', 'index.tsx'), indexSource)
}

/* ------------------------------------------------------------------ *
 * 1. happy path
 * ------------------------------------------------------------------ */
await writeProject(`
import { KPlugin } from '@kn/common'
import React from 'react'
import { DevPanel } from './DevPanel'

class TestPlugin extends KPlugin<any> {}

export const testPlugin = new TestPlugin({
  name: 'Test Dev Plugin',
  status: 'ACTIVE',
  dockPanels: [{ id: 'test-panel', title: 'Test', icon: React.createElement('span', null, 'x'), component: DevPanel }],
})
`)

await writeFile(
    join(root, 'src', 'DevPanel.tsx'),
    `import React from 'react'
export const DevPanel: React.FC = () => React.createElement('div', null, 'panel')
`,
)

const manifest = await readProjectManifest(root)
check('manifest: entry resolved', manifest.entry?.endsWith('src/index.tsx'), manifest.entry)
check('manifest: pluginKey read', manifest.pluginKey === 'test-dev-plugin', manifest.pluginKey)
check('manifest: displayName read', manifest.displayName === 'Test Dev Plugin')

check('css scope: plain key', pluginCssScope('test-dev-plugin') === '[data-kn-plugin="test-dev-plugin"]', pluginCssScope('test-dev-plugin'))
check('css scope: quotes escaped', pluginCssScope('a"b') === '[data-kn-plugin="a\\"b"]', pluginCssScope('a"b'))
check('css scope: backslashes escaped', pluginCssScope('a\\b') === '[data-kn-plugin="a\\\\b"]', pluginCssScope('a\\b'))

const built = await buildPlugin({
    root,
    entry: manifest.entry,
    pluginKey: manifest.pluginKey,
    name: manifest.name,
})
check('build: succeeds', built.ok, built.ok ? '' : (built.errors || []).join(' | '))
check('build: collected modules', built.ok && built.modules.length === 2, JSON.stringify(built.modules))
check('build: iife wrapper', built.ok && built.code.includes('kn-plugin://test-dev-plugin'))
check('build: shim used for @kn/common', built.ok && built.code.includes('__KN__.common'))
check('build: shim present in bundle', built.ok && built.code.includes('function __knRequire'))
check('build: shim ordered before its tables', built.ok && built.code.indexOf('var __host_knCommon') < built.code.indexOf('var __knExact'))
check('build: externals redirected to shim', built.ok && !/(?<![$\w])__require\d*\s*\(/.test(built.code))
check('build: registration uses host registry', built.ok && built.code.includes('definePlugin'))
check('build: no bundled react source', built.ok && !built.code.includes('react.development'))

/* Execute the bundle against a fake host window (the bundle declares `var
 * window`, so the fake must live on globalThis rather than be passed in).
 * `extras.namespace` adds host globals to `__KN__`; `extras.globals` sets plain
 * `globalThis` properties (the fallback path for declared externals). */
const runBundle = (code, extras = {}) => {
    const calls = []
    const KN = {
        hostApiVersion: '2.1.0',
        common: { KPlugin: class KPlugin { constructor(config) { Object.assign(this, config) } } },
        ui: {},
        icon: {},
        editor: {},
        definePlugin(key, exports, meta) {
            calls.push({ key, exports, meta })
            KN.__exports = exports
        },
        ...(extras.namespace || {}),
    }
    globalThis.window = { __KN__: KN }
    globalThis.React = {
        createElement: (type, props, ...children) => ({ type, props, children }),
        Fragment: 'Fragment',
        useState: (value) => [value, () => {}],
    }
    globalThis.ReactDOM = {}
    const assigned = Object.keys(extras.globals || {})
    for (const name of assigned) globalThis[name] = extras.globals[name]
    try {
        // eslint-disable-next-line no-new-func
        new Function('console', code)(extras.console || console)
    } finally {
        for (const name of assigned) delete globalThis[name]
        delete globalThis.window
        delete globalThis.React
        delete globalThis.ReactDOM
    }
    return calls
}

const registered = runBundle(built.code)
check('runtime: registered plugin', registered.length === 1, `keys=${registered.map((r) => r.key).join(',')}`)
check('runtime: apiVersion reported', registered[0]?.meta?.apiVersion === '2.1.0', JSON.stringify(registered[0]?.meta))
check(
    'runtime: KPlugin instance exported',
    Object.values(registered[0]?.exports || {}).some((value) => value && value.name === 'Test Dev Plugin'),
    Object.keys(registered[0]?.exports || {}).join(','),
)

/* ------------------------------------------------------------------ *
 * 1b. Scaffold templates: every generated project must build and register
 *     untouched — an agent's first `createPluginProject` must not look broken.
 * ------------------------------------------------------------------ */
const templatesRoot = join(tmpdir(), 'kn-studio-bundler-templates')
const writeScaffold = async (dir, files) => {
    await rm(dir, { recursive: true, force: true })
    for (const [relativePath, contents] of Object.entries(files)) {
        const target = join(dir, relativePath)
        await mkdir(dirname(target), { recursive: true })
        await writeFile(target, contents)
    }
}

check(
    'template: default is panel',
    JSON.parse(renderScaffold({ name: 'defaulted', pluginKey: 'defaulted', displayName: 'Defaulted' })['package.json'])
        .knPluginStudio.template === 'panel',
)

for (const template of SCAFFOLD_TEMPLATES) {
    const title = 'Probe ' + template
    const files = renderScaffold({
        name: 'probe-' + template,
        pluginKey: 'probe-' + template,
        displayName: title,
        template,
    })
    const dir = join(templatesRoot, template)
    await writeScaffold(dir, files)

    const manifest = JSON.parse(files['package.json'])
    check(`template ${template}: manifest records the template`, manifest.knPluginStudio.template === template)
    check(`template ${template}: writes an entry and a README`, 'src/index.tsx' in files && 'README.md' in files)

    const builtTemplate = await buildPlugin({
        root: dir,
        entry: join(dir, 'src/index.tsx'),
        pluginKey: 'probe-' + template,
        name: title,
    })
    check(`template ${template}: builds as-is`, builtTemplate.ok, (builtTemplate.errors || []).join(' | '))

    const registeredTemplate = builtTemplate.ok ? runBundle(builtTemplate.code) : []
    check(
        `template ${template}: registers a KPlugin instance`,
        registeredTemplate.length === 1
            && Object.values(registeredTemplate[0]?.exports || {}).some((value) => value && value.name === title),
        Object.keys(registeredTemplate[0]?.exports || {}).join(','),
    )
}

let unknownTemplate = ''
try {
    renderScaffold({ name: 'x', pluginKey: 'x', displayName: 'X', template: 'not-a-template' })
} catch (error) {
    unknownTemplate = error.message
}
check(
    'template: unknown rejected with the list',
    /not-a-template/.test(unknownTemplate) && SCAFFOLD_TEMPLATES.every((name) => unknownTemplate.includes(name)),
    unknownTemplate,
)
await rm(templatesRoot, { recursive: true, force: true })

/* ------------------------------------------------------------------ *
 * 1c. Declared externals resolve to host globals instead of being bundled
 * ------------------------------------------------------------------ */
check(
    'externals: scope dropped for the host name',
    hostNameForExternal('@scope/pkg') === 'pkg'
        && hostNameForExternal('@kn/chart') === 'chart'
        && hostNameForExternal('lodash') === 'lodash',
)

const externalsRoot = join(tmpdir(), 'kn-studio-bundler-externals')
await rm(externalsRoot, { recursive: true, force: true })
await mkdir(join(externalsRoot, 'src'), { recursive: true })
await writeFile(
    join(externalsRoot, 'package.json'),
    JSON.stringify({ name: 'externals-plugin', knPluginStudio: { pluginKey: 'externals-plugin', entry: 'src/index.tsx' } }),
)
const writeExternalsIndex = (source) => writeFile(join(externalsRoot, 'src', 'index.tsx'), source)

await writeExternalsIndex(`
import { KPlugin } from '@kn/common'
import SomeLib from 'SomeLib'
import { helper } from '@scope/pkg'

export const probe = new KPlugin({ name: 'Externals', status: 'ACTIVE' })
export const fromNamespace = SomeLib.tag
export const fromGlobal = helper()
`)

const externalsBuilt = await buildPlugin({
    root: externalsRoot,
    entry: join(externalsRoot, 'src/index.tsx'),
    pluginKey: 'externals-plugin',
    name: 'Externals',
    externals: ['SomeLib', '@scope/pkg'],
})
check('externals: build succeeds with declared externals', externalsBuilt.ok, (externalsBuilt.errors || []).join(' | '))
check(
    'externals: not bundled into the output',
    externalsBuilt.ok && !externalsBuilt.code.includes('SomeLib = {') && externalsBuilt.code.includes('__KNNAME__SomeLib'),
)

const externalsRuns = runBundle(externalsBuilt.code, {
    namespace: { SomeLib: { tag: 'ns' } },
    globals: { pkg: { helper: () => 'global' } },
})
const externalsExports = externalsRuns[0]?.exports || {}
check('externals: resolved from the host namespace', externalsExports.fromNamespace === 'ns', String(externalsExports.fromNamespace))
check('externals: falls back to the window global', externalsExports.fromGlobal === 'global', String(externalsExports.fromGlobal))

/* A declared external the host does not publish degrades to `{}` — loudly, so
 * the console points at the missing host module instead of failing later. */
await writeExternalsIndex(`
import { KPlugin } from '@kn/common'
import Gone from 'Gone'

export const probe = new KPlugin({ name: 'Externals', status: 'ACTIVE' })
export const keys = Object.keys(Gone).length
`)
const missingBuilt = await buildPlugin({
    root: externalsRoot,
    entry: join(externalsRoot, 'src/index.tsx'),
    pluginKey: 'externals-plugin',
    name: 'Externals',
    externals: ['Gone'],
})
const warnings = []
runBundle(missingBuilt.code, {
    console: { warn: (message) => warnings.push(message), error() {}, log() {} },
})
check(
    'externals: a missing module warns exactly once',
    warnings.filter((message) => message.includes('Gone')).length === 1,
    JSON.stringify(warnings),
)
await rm(externalsRoot, { recursive: true, force: true })

/* ------------------------------------------------------------------ *
 * 2. build failure is reported, not thrown
 * ------------------------------------------------------------------ */
await writeProject(`import { doesNotExist } from './missing'\nexport const x = doesNotExist\n`)
const failed = await buildPlugin({ root, entry: join(root, 'src/index.tsx'), pluginKey: 'broken', name: 'broken' })
check('failure: ok=false', failed.ok === false)
check('failure: error message present', (failed.errors || []).length > 0, (failed.errors || [])[0])

/* ------------------------------------------------------------------ *
 * 3. missing entry / missing key are reported
 * ------------------------------------------------------------------ */
const noEntry = await buildPlugin({ root, entry: null, pluginKey: 'x', name: 'x' })
check('guard: missing entry', noEntry.ok === false && /entry/i.test(noEntry.errors[0]), noEntry.errors?.[0])
const noKey = await buildPlugin({ root, entry: join(root, 'src/index.tsx'), pluginKey: '', name: 'x' })
check('guard: missing pluginKey', noKey.ok === false && /pluginKey/i.test(noKey.errors[0]), noKey.errors?.[0])

await rm(root, { recursive: true, force: true })

const failedChecks = results.filter((entry) => !entry.ok)
console.log(`\n${results.length - failedChecks.length}/${results.length} checks passed`)
process.exit(failedChecks.length ? 1 : 0)
