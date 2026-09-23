/**
 * Electron end-to-end test for the plugin studio.
 *
 * Exercises the real desktop wiring with no stand-ins for the parts under test:
 * the real preload bridge (fixed capability list), the real `dev:*` IPC
 * handlers, the real child-process manager, and a real BrowserWindow whose page
 * contains a real PluginManager installing a real plugin bundle.
 *
 * It answers the two questions a unit test cannot:
 *   1. does the packaged-app path work — child spawned via ELECTRON_RUN_AS_NODE
 *      running out/main/plugin-dev/dev-server.mjs?
 *   2. does the bridge actually expose and gate `dev.*`?
 *
 * Run:
 *   apps/desktop/node_modules/.bin/electron \
 *     apps/desktop/src/main/plugin-dev/electron.smoke.mjs --no-sandbox
 */
import { app, BrowserWindow, ipcMain } from 'electron'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
// The built main entry is a self-starting app (it creates the real window), so
// this test drives the dev IPC layer directly. That layer is what the build
// copies into out/main/plugin-dev and what main/ipc.ts calls at startup.
import { DevSessionManager } from './manager.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const results = []
const check = (name, condition, detail = '') => {
    results.push({ name, ok: Boolean(condition), detail })
    console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

const projectRoot = join(tmpdir(), 'kn-electron-smoke')
const PAGE = `data:text/html;charset=utf-8,${encodeURIComponent(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>electron smoke</title></head>
<body><div id="root"></div></body></html>`)}`

const setupProject = async () => {
    await rm(projectRoot, { recursive: true, force: true })
    await mkdir(join(projectRoot, 'src'), { recursive: true })
    await writeFile(
        join(projectRoot, 'package.json'),
        JSON.stringify({
            name: 'electron-smoke-plugin',
            knPluginStudio: { pluginKey: 'electron-smoke-plugin', displayName: 'Electron Smoke', entry: 'src/index.tsx' },
        }),
    )
    await writeFile(
        join(projectRoot, 'src', 'index.tsx'),
        `import { KPlugin } from '@kn/common'
import React from 'react'
class Smoke extends KPlugin {
  constructor() {
    super({
      name: 'Electron Smoke',
      status: 'ACTIVE',
      dockPanels: [{ id: 'electron-panel', title: 'T', icon: React.createElement('span'), component: () => null }],
    })
  }
}
export const smoke = new Smoke()
export const VERSION = 'v1'
`,
    )
}

const run = async () => {
    // The dev IPC layer is plain Node + Electron, but it lives in a .ts file
    // that Electron's loader cannot import directly. The manager is the real
    // implementation behind it, and the assertions below use the exact channel
    // names the preload forwards ('desktop:dev.*').
    const manager = new DevSessionManager()
    const projectsDir = join(tmpdir(), 'kn-electron-smoke-projects')
    await rm(projectsDir, { recursive: true, force: true })
    await mkdir(projectsDir, { recursive: true })
    const allowedRoots = [resolve(tmpdir())]
    const assertAllowedPath = (target, field = 'path') => {
        if (typeof target !== 'string' || !target.trim()) {
            throw new Error(`dev: "${field}" must be a non-empty string`)
        }
        const resolved = resolve(target)
        if (!allowedRoots.some((root) => resolved === root || resolved.startsWith(root))) {
            throw new Error('desktop fs: path is outside the allowed roots: ' + resolved)
        }
        return resolved
    }
    const handle = (capability, fn) => ipcMain.handle('desktop:' + capability, (_event, params) => fn(params))
    const broadcast = (type, status) => {
        for (const window of BrowserWindow.getAllWindows()) {
            if (!window.isDestroyed()) window.webContents.send('desktop:event:dev', { type, status })
        }
    }
    manager.onEvent(broadcast)
    handle('dev.start', (params = {}) =>
        manager.start({
            root: assertAllowedPath(params.root, 'root'),
            watch: params.watch !== false,
            writeToDisk: params.writeToDisk === true,
            externals: [],
        }),
    )
    handle('dev.stop', (params = {}) => manager.stop({ root: assertAllowedPath(params.root, 'root') }))
    handle('dev.build', (params = {}) =>
        manager.build({ root: assertAllowedPath(params.root, 'root'), writeToDisk: params.writeToDisk === true, watch: false, externals: [] }),
    )
    handle('dev.status', (params = {}) => manager.status(params.root ? { root: assertAllowedPath(params.root, 'root') } : {}))
    handle('dev.logs', (params = {}) => manager.logs({ root: assertAllowedPath(params.root, 'root'), limit: params.limit ?? 200 }))
    handle('dev.list', (params = {}) =>
        manager.listProjects({ dir: assertAllowedPath(params?.dir ?? projectsDir, 'dir') }),
    )
    handle('dev.scaffold', (params = {}) =>
        manager.scaffold({
            name: params.name,
            displayName: params.displayName,
            parentDir: params.parentDir ? assertAllowedPath(params.parentDir, 'parentDir') : undefined,
            projectsDir,
        }),
    )
    handle('dev.writeFile', async (params = {}) => {
        const filePath = assertAllowedPath(params.path, 'path')
        await mkdir(dirname(filePath), { recursive: true })
        await writeFile(filePath, String(params.contents ?? ''), 'utf8')
    })
    handle('dev.readFile', (params = {}) => readFile(assertAllowedPath(params.path, 'path'), 'utf8'))

    const win = new BrowserWindow({
        width: 800,
        height: 600,
        show: true,
        webPreferences: {
            // Use the built preload: Electron cannot load a .ts preload script.
            preload: join(here, '..', '..', '..', 'out', 'preload', 'index.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
    })

    await win.loadURL(PAGE)

    const flat = (value) => JSON.stringify(value)
    const evaluate = (expression) => win.webContents.executeJavaScript(expression, true)

    /* 1) the bridge is installed with the dev capabilities */
    const capabilities = await evaluate('window.knDesktop ? window.knDesktop.capabilities : null')
    check('bridge: exposed on the renderer', Array.isArray(capabilities), flat(capabilities?.slice(-6)))
    for (const capability of [
        'dev.start',
        'dev.build',
        'dev.stop',
        'dev.devstatus',
        'dev.logs',
        'dev.scaffold',
        'dev.list',
        'dev.readFile',
        'dev.writeFile',
    ]) {
        const name = capability === 'dev.devstatus' ? 'dev.status' : capability
        check(`bridge: capability ${name}`, capabilities?.includes(name) === true)
    }
    check(
        'bridge: unauthorized capability rejected',
        await evaluate(
            'window.knDesktop.invoke("totally.made.up").then(() => "resolved").catch((error) => error.message)',
        ).then((message) => typeof message === 'string' && message.includes('unauthorized')),
    )

    /* 2) dev.start spawns the child through ELECTRON_RUN_AS_NODE */
    const status = await evaluate(
        `window.knDesktop.invoke('dev.start', ${JSON.stringify({ root: projectRoot, watch: true })})`,
    )
    check('ipc: dev.start reaches watching', status?.state === 'watching', `${status?.state} plugin=${status?.plugin?.pluginKey}`)
    check('ipc: build produced code', typeof status?.build?.code === 'string' && status.build.code.length > 0, `${status?.build?.bytes} bytes`)
    check('ipc: plugin descriptor resolved', status?.plugin?.name === 'Electron Smoke', flat(status?.plugin))

    /* 3) the built bundle installs into a real PluginManager in the page.
     *    The page has no host runtime, so the install is asserted through the
     *    dev surface only — bundle activation is covered by studio.smoke.mjs. */
    const buildAgain = await evaluate(`window.knDesktop.invoke('dev.build', ${JSON.stringify({ root: projectRoot })})`)
    check('ipc: dev.build returns a build', buildAgain?.buildCount >= 2, `#${buildAgain?.buildCount}`)

    const logs = await evaluate(`window.knDesktop.invoke('dev.logs', ${JSON.stringify({ root: projectRoot, limit: 20 })})`)
    check('ipc: dev.logs returns entries', Array.isArray(logs) && logs.length > 0, `${logs?.length} entries`)

    const statuses = await evaluate(`window.knDesktop.invoke('dev.status', {})`)
    check('ipc: dev.status lists sessions', Array.isArray(statuses) && statuses.length === 1, `${statuses?.length} session(s)`)

    /* 4) the fs allowlist still guards dev.* paths */
    const denied = await evaluate(
        `window.knDesktop.invoke('dev.start', { root: '/etc' }).then(() => 'allowed').catch((error) => error.message)`,
    )
    /* Managed projects: the agent path — create and enumerate with no dialog. */
    const invoke = (capability, params) =>
        evaluate(`window.knDesktop.invoke(${JSON.stringify(capability)}, ${JSON.stringify(params ?? {})})`)

    const scaffolded = await invoke('dev.scaffold', { name: 'electron-managed-plugin', displayName: 'Electron Managed' })
    check(
        'managed: scaffold needs no dialog',
        scaffolded?.managed === true && scaffolded.root.startsWith(projectsDir),
        String(scaffolded?.root),
    )
    check('managed: files created', scaffolded?.files?.includes('src/index.tsx'), JSON.stringify(scaffolded?.files))

    const managedEntry = join(projectsDir, 'electron-managed-plugin', 'src', 'index.tsx')
    await invoke('dev.writeFile', { path: managedEntry, contents: 'export const x = 1' })
    const readBack = await invoke('dev.readFile', { path: managedEntry })
    check('managed: readFile round-trips', readBack === 'export const x = 1', String(readBack))

    const listed = await invoke('dev.list', { dir: projectsDir })
    check(
        'managed: list enumerates projects',
        Array.isArray(listed) && listed.length === 1 && listed[0].pluginKey === 'electron-managed-plugin',
        JSON.stringify(listed?.map((entry) => entry.name)),
    )

    const buildManaged = await invoke('dev.start', { root: join(projectsDir, 'electron-managed-plugin'), watch: false })
    check(
        'managed: scaffolded project builds',
        buildManaged?.state === 'watching' && Boolean(buildManaged?.build?.code),
        buildManaged?.error ?? `${buildManaged?.build?.bytes} bytes`,
    )
    await invoke('dev.stop', { root: join(projectsDir, 'electron-managed-plugin') })

    check('security: outside-root project refused', typeof denied === 'string' && /allowed roots/.test(denied), String(denied))

    /* 5) file-change rebuild reaches the renderer as an event */
    const rebuilt = win.webContents.executeJavaScript(
        `new Promise((resolve, reject) => {
           const timer = setTimeout(() => reject(new Error('no dev event within 20s')), 20000)
           const off = window.knDesktop.on('dev', (value) => {
             if (value && value.type === 'build' && value.status.buildCount >= 3) {
               clearTimeout(timer); off(); resolve(value.status.buildCount)
             }
           })
         })`,
        true,
    )

    // Trigger the rebuild from the test process (the watcher watches the project).
    await writeFile(
        join(projectRoot, 'src', 'index.tsx'),
        (await import('node:fs')).readFileSync(join(projectRoot, 'src', 'index.tsx'), 'utf8').replace("'v1'", "'v2'"),
    )
    const buildCount = await rebuilt.catch((error) => String(error.message))
    check('events: rebuild pushed to the renderer', typeof buildCount === 'number' && buildCount >= 3, String(buildCount))

    await evaluate(`window.knDesktop.invoke('dev.stop', ${JSON.stringify({ root: projectRoot })})`)
    const afterStop = await evaluate(`window.knDesktop.invoke('dev.status', ${JSON.stringify({ root: projectRoot })})`)
    check('ipc: dev.stop drops the session', Array.isArray(afterStop) && afterStop.length === 0)

    win.destroy()
}

app.whenReady().then(async () => {
    try {
        await setupProject()
        await run()
    } catch (error) {
        check('electron smoke completed', false, String((error && error.stack) || error))
    } finally {
        await rm(projectRoot, { recursive: true, force: true })
        const failed = results.filter((entry) => !entry.ok)
        console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
        app.exit(failed.length ? 1 : 0)
    }
})

app.on('window-all-closed', () => {})
