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
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { buildPlugin, pluginCssScope, readProjectManifest } from './bundler.mjs'

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
 * window`, so the fake must live on globalThis rather than be passed in). */
const runBundle = (code) => {
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
    }
    globalThis.window = { __KN__: KN }
    globalThis.React = {
        createElement: (type, props, ...children) => ({ type, props, children }),
        Fragment: 'Fragment',
        useState: (value) => [value, () => {}],
    }
    globalThis.ReactDOM = {}
    try {
        // eslint-disable-next-line no-new-func
        new Function('console', code)(console)
    } finally {
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
