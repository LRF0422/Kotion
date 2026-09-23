/**
 * Plugin studio end-to-end smoke test.
 *
 * Runs the real chain, with no stubs of the parts under test:
 *
 *   DevSessionManager (main process)
 *     -> spawns dev-server.mjs with ELECTRON_RUN_AS_NODE (the packaged-app path)
 *     -> esbuild bundling + file watching
 *   PluginManager.installPluginFromSource (real, from the built @kn/common)
 *     -> Blob URL + the real PluginScriptLoader
 *     -> API version handshake + KPlugin extraction
 *   ...then a source edit must produce a hot-reloaded plugin, and a broken edit
 *   must not kill the session.
 *
 * The only stand-ins are browser globals: `document` implements the tiny slice
 * of the script-tag contract `PluginScriptLoader` relies on, `Blob` exposes the
 * text the loader passed in, and React is a stub because @kn/common touches it
 * at import time. Nothing that executes the bundle is stubbed.
 *
 * Run: node apps/desktop/src/main/plugin-dev/studio.smoke.mjs
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { DevSessionManager } from './manager.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..', '..', '..', '..', '..')
const require = createRequire(import.meta.url)

/** Real React, not a stub: @kn/common's dependency graph builds classes from it. */
const React = require('react')

const results = []
const check = (name, condition, detail = '') => {
    results.push({ name, ok: Boolean(condition), detail })
    console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

/* ------------------------------------------------------------------ *
 * 1. Browser globals
 * ------------------------------------------------------------------ */
const blobs = new Map()
let blobSeq = 0

const makeDocumentStub = (onScript) => {
    const document = {
        _scripts: [],
        head: {
            appendChild(script) {
                document._scripts.push(script)
                // Classic scripts execute asynchronously in a browser too.
                queueMicrotask(() => onScript(script))
                return script
            },
            removeChild(script) {
                const index = document._scripts.indexOf(script)
                if (index >= 0) document._scripts.splice(index, 1)
            },
        },
        createElement() {
            return {
                _attrs: new Map(),
                _listeners: new Map(),
                setAttribute(name, value) {
                    this._attrs.set(name, value)
                },
                addEventListener(type, listener) {
                    this._listeners.set(type, listener)
                },
                removeEventListener(type) {
                    this._listeners.delete(type)
                },
            }
        },
    }
    return document
}

class StubBlob {
    constructor(parts) {
        this.__text = parts.join('')
    }
}

const ReactStub = React

const hostNamespace = {}
const documentStub = makeDocumentStub((script) => {
    const onLoad = script._listeners.get('load')
    const onError = script._listeners.get('error')
    try {
        const src = String(script._attrs.get('src') || '')
        if (!src.startsWith('blob:kn-test/')) throw new Error(`unexpected script src: ${src}`)
        const code = blobs.get(src.slice('blob:kn-test/'.length))
        if (code === undefined) throw new Error(`unknown blob url: ${src}`)
        // eslint-disable-next-line no-new-func
        new Function('window', 'globalThis', 'console', code)(globalThis.window, globalThis, console)
        onLoad && onLoad()
    } catch (error) {
        if (onError) onError(error)
        else throw error
    }
})

const browserGlobals = {
    document: documentStub,
    __KN__: hostNamespace,
    React: ReactStub,
    ReactDOM: { createRoot: () => ({ render: () => {}, unmount: () => {} }) },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    // @kn/common reads location at import time (auth redirects / request base).
    location: { href: 'http://localhost/', origin: 'http://localhost', pathname: '/', search: '', hash: '' },
    navigator: { userAgent: 'node-smoke', platform: 'darwin', language: 'en' },
    // react-query installs a visibilitychange listener at import time.
    addEventListener: () => {},
    removeEventListener: () => {},
}

documentStub.visibilityState = 'visible'

// Node declares `window` as a getter-only global, so install it explicitly.
Object.defineProperty(globalThis, 'window', {
    value: browserGlobals,
    writable: true,
    configurable: true,
})
globalThis.document = documentStub
globalThis.React = ReactStub
globalThis.ReactDOM = browserGlobals.ReactDOM
globalThis.Blob = StubBlob
globalThis.URL.createObjectURL = (blob) => {
    const id = `b${++blobSeq}`
    blobs.set(id, blob.__text)
    return `blob:kn-test/${id}`
}
globalThis.URL.revokeObjectURL = (url) => {
    blobs.delete(String(url).slice('blob:kn-test/'.length))
}

/* ------------------------------------------------------------------ *
 * 2. The real @kn/common source, bundled here so the test exercises the
 *    published `dist/index.js` loader path without importing the app bundle
 *    (which drags in react-router, react-query and the whole UI kit).
 * ------------------------------------------------------------------ */
const esbuild = await import('esbuild')
const tiptapStub = join(tmpdir(), 'kn-studio-tiptap-stub.js')
await writeFile(tiptapStub, 'export class Editor {}\nexport default { Editor }\n')

const builderPlugin = {
    name: 'tiptap-stub',
    setup(build) {
        build.onResolve({ filter: /^@tiptap\/core$/ }, () => ({ path: tiptapStub }))
    },
}

const built = await esbuild.build({
    // Two entries: the loader is a singleton module, so the test and the
    // manager must resolve the same instance from one graph.
    entryPoints: [
        join(repoRoot, 'packages', 'common', 'src', 'core', 'PluginManager.ts'),
        join(repoRoot, 'packages', 'common', 'src', 'utils', 'import-util.ts'),
    ],
    outdir: tmpdir(),
    entryNames: 'kn-studio-[name]',
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    target: ['node20'],
    jsx: 'transform',
    loader: { '.ts': 'ts', '.tsx': 'tsx' },
    // lodash is bundled: the emitted modules live in tmp and could not resolve
    // the repo's node_modules. React stays external so the host namespace and
    // the bundle share one instance of it.
    external: ['react', 'react-dom', '@tiptap/core'],
    plugins: [builderPlugin],
    logLevel: 'silent',
})

const entryPathFor = (suffix) => {
    const file = built.outputFiles.find((output) => output.path.endsWith(suffix))
    if (!file) throw new Error(`bundler produced no ${suffix}`)
    return file.path
}

const managerPath = entryPathFor('kn-studio-PluginManager.js')
await Promise.all(built.outputFiles.map((output) => writeFile(output.path, output.text)))
const { PluginManager, KPlugin } = await import(pathToFileURL(managerPath).href)

hostNamespace.getPlugin = (key) => hostNamespace._registry?.get(key)
hostNamespace.findPlugin = (key) => hostNamespace._registry?.get(key)
hostNamespace.definePlugin = (key, exports, meta) => {
    hostNamespace._registry = hostNamespace._registry || new Map()
    hostNamespace._registry.set(key, { exports, meta })
}
hostNamespace.hostApiVersion = '2.2.0'
// The bundle shim resolves `@kn/common` to window.__KN__.common, and
// PluginManager finds plugins via `instanceof KPlugin` — so the host namespace
// must publish the same real class the manager uses, not a look-alike.
hostNamespace.common = { KPlugin }
hostNamespace.ui = {}
hostNamespace.icon = {}
hostNamespace.editor = {}

const pluginManager = new PluginManager(
    { resolveUrl: (path) => path, hostApiVersion: '2.2.0', coreServices: {} },
    [],
)

/* ------------------------------------------------------------------ *
 * 3. Project fixture
 * ------------------------------------------------------------------ */
const root = join(tmpdir(), 'kn-studio-smoke')

const writeIndex = (version) =>
    writeFile(
        join(root, 'src', 'index.tsx'),
        `import { KPlugin } from '@kn/common'
import React from 'react'
import { Panel } from './Panel'

class Smoke extends KPlugin {
  constructor() {
    super({
      name: 'Smoke Dev Plugin',
      status: 'ACTIVE',
      dockPanels: [
        { id: 'smoke-panel', title: 'Smoke', icon: React.createElement('span', null, 'S'), component: Panel },
      ],
    })
  }
}

export const smokePlugin = new Smoke()
export const VERSION = '${version}'
`,
    )

await rm(root, { recursive: true, force: true })
await mkdir(join(root, 'src'), { recursive: true })
await writeFile(
    join(root, 'package.json'),
    JSON.stringify(
        {
            name: 'smoke-dev-plugin',
            knPluginStudio: {
                pluginKey: 'smoke-dev-plugin',
                displayName: 'Smoke Dev Plugin',
                entry: 'src/index.tsx',
            },
        },
        null,
        2,
    ),
)
await writeIndex('v1')
await writeFile(
    join(root, 'src', 'Panel.tsx'),
    `import React from 'react'
export const Panel = () => React.createElement('div', null, 'panel-v1')
`,
)

/* ------------------------------------------------------------------ *
 * 4. Run
 * ------------------------------------------------------------------ */
const manager = new DevSessionManager()

const waitFor = (predicate, label, timeoutMs = 25000) =>
    new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            unsubscribe()
            reject(new Error(`timeout waiting for ${label}`))
        }, timeoutMs)
        const unsubscribe = manager.onEvent((event, status) => {
            if (predicate(event, status)) {
                clearTimeout(timer)
                unsubscribe()
                resolve(status)
            }
        })
    })

const exportsOf = (key) => hostNamespace._registry?.get(key)?.exports ?? {}
const versionOf = (key) => Object.values(exportsOf(key)).find((value) => typeof value === 'string')

try {
    /* 1) start: the manager spawns the child through the Electron binary path. */
    const started = await manager.start({ root, watch: true })
    check(
        'dev session: reached watching',
        started.state === 'watching',
        `${started.state} pluginKey=${started.plugin.pluginKey}`,
    )
    check('dev session: first build', Boolean(started.build?.code), `${started.build?.bytes} bytes`)
    check(
        'dev session: modules tracked',
        started.build?.modules?.includes('src/index.tsx'),
        JSON.stringify(started.build?.modules),
    )

    /* 2) install through the real PluginManager source path. */
    const installed = await pluginManager.installPluginFromSource({
        code: started.build.code,
        pluginKey: started.plugin.pluginKey,
        name: started.plugin.name,
        version: 'dev.1',
        replace: true,
    })
    check('plugin manager: install from source', installed === true)
    check('plugin manager: plugin active', pluginManager.hasPlugin('Smoke Dev Plugin'))
    check(
        'plugin manager: dock panel contributed',
        pluginManager.getPlugin('Smoke Dev Plugin')?.dockPanels?.[0]?.id === 'smoke-panel',
    )
    check(
        'bundle: v1 executed in host',
        versionOf('smoke-dev-plugin') === 'v1',
        String(versionOf('smoke-dev-plugin')),
    )
    check(
        'bundle: api version handshake',
        hostNamespace._registry.get('smoke-dev-plugin')?.meta?.apiVersion === '2.2.0',
        JSON.stringify(hostNamespace._registry.get('smoke-dev-plugin')?.meta),
    )

    /* 3) edit: watcher rebuilds, re-install hot-swaps. */
    await writeIndex('v2')
    const rebuilt = await waitFor((event, status) => event === 'build' && status.buildCount >= 2, 'rebuild #2')
    check('hot reload: rebuild fired', true, `#${rebuilt.buildCount} in ${rebuilt.build.durationMs}ms`)

    const reinstalled = await pluginManager.installPluginFromSource({
        code: rebuilt.build.code,
        pluginKey: rebuilt.plugin.pluginKey,
        name: rebuilt.plugin.name,
        version: `dev.${rebuilt.buildCount}`,
        replace: true,
    })
    check('hot reload: replace install', reinstalled === true)
    check(
        'hot reload: exactly one instance active',
        pluginManager.getAllPluginNames().filter((name) => name === 'Smoke Dev Plugin').length === 1,
        JSON.stringify(pluginManager.getAllPluginNames()),
    )
    check('hot reload: v2 active', versionOf('smoke-dev-plugin') === 'v2', String(versionOf('smoke-dev-plugin')))

    /* 4) broken edit must not kill the session, and must recover. */
    await writeFile(
        join(root, 'src', 'Panel.tsx'),
        `import React from 'react'\nexport const Panel = () => React.createElement('div', null, 'broken'\n`,
    )
    const failure = await waitFor((event) => event === 'build-error', 'build-error')
    check('errors: surfaced with file', /Panel\.tsx/.test(failure.error || ''), (failure.error || '').split('\n')[0])
    check(
        'errors: session survived',
        manager.status({ root })[0]?.state === 'watching',
        manager.status({ root })[0]?.state,
    )

    await writeFile(
        join(root, 'src', 'Panel.tsx'),
        `import React from 'react'\nexport const Panel = () => React.createElement('div', null, 'panel-v3')\n`,
    )
    const recovered = await waitFor((event, status) => event === 'build' && status.buildCount >= 3, 'recovery build #3')
    check('errors: recovery after fix', recovered.build.code.includes('panel-v3'))


    /* 5) managed projects: scaffolding needs no directory dialog, and the
     *    result is enumerable — this is what lets an agent create a project. */
    const projectsDir = join(tmpdir(), 'kn-studio-managed')
    await rm(projectsDir, { recursive: true, force: true })
    await mkdir(projectsDir, { recursive: true })

    const created = await manager.scaffold({ projectsDir, name: 'agent-made-plugin', displayName: 'Agent Made' })
    check('managed: scaffold without parentDir', created.managed === true && created.root.startsWith(projectsDir), created.root)
    check('managed: files written', created.files.includes('src/index.tsx') && created.files.includes('package.json'), JSON.stringify(created.files))

    const manifestOnDisk = JSON.parse(await readFile(join(created.root, 'package.json'), 'utf8'))
    check(
        'managed: manifest declares the studio block',
        manifestOnDisk.knPluginStudio?.pluginKey === 'agent-made-plugin' &&
            manifestOnDisk.knPluginStudio?.entry === 'src/index.tsx',
        JSON.stringify(manifestOnDisk.knPluginStudio),
    )
    const onDisk = await readFile(join(created.root, 'src', 'index.tsx'), 'utf8')
    check('managed: entry exports a KPlugin instance', onDisk.includes('KPlugin') && onDisk.includes('export const'), 'generated entry looks valid')

    const listed = await manager.listProjects({ dir: projectsDir })
    check('managed: list finds the project', listed.length === 1, JSON.stringify(listed.map((item) => item.name)))
    check('managed: list reports pluginKey', listed[0]?.pluginKey === 'agent-made-plugin', String(listed[0]?.pluginKey))
    check('managed: list resolves entry', Boolean(listed[0]?.entry && listed[0].entry.endsWith('index.tsx')), String(listed[0]?.entry))

    // A scaffolded project must be buildable as-is: if the template does not
    // compile, an agent's first create would look like a broken host.
    const agentBuild = await manager.build({ root: created.root })
    check('managed: generated project builds', agentBuild.buildCount === 1 && Boolean(agentBuild.build?.code), agentBuild.error ?? `${agentBuild.build?.bytes} bytes`)
    check('managed: list marks the active session', (await manager.listProjects({ dir: projectsDir }))[0]?.active === true)
    manager.stop({ root: created.root })
    await rm(projectsDir, { recursive: true, force: true })

    /* 6) stop releases the child. */
    manager.stop({ root })
    check('dev session: stop drops the session', manager.status({ root }).length === 0)
} catch (error) {
    check('smoke run completed', false, String((error && error.stack) || error))
} finally {
    manager.dispose()
    await rm(root, { recursive: true, force: true })
}

const failedChecks = results.filter((entry) => !entry.ok)
console.log(`\n${results.length - failedChecks.length}/${results.length} checks passed`)
process.exit(failedChecks.length ? 1 : 0)
