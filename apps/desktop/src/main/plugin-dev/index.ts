/**
 * `dev:*` IPC handlers for the plugin studio.
 *
 * Wraps {@link DevSessionManager} with the same validation rules as the rest of
 * the desktop surface: every path a caller supplies is resolved against the fs
 * allowlist (standard user directories plus anything a native dialog granted),
 * and the only process this can ever spawn is the plugin dev-server script.
 */
import { ipcMain, BrowserWindow, app } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { DevSessionManager } from './manager.mjs'

/** Subdirectory of userData that the studio owns; see DEV_PROJECTS_DIR_NAME. */
const PROJECTS_DIR_NAME = 'plugin-projects'

/**
 * The studio's managed projects directory.
 *
 * It lives under `userData`, which the fs allowlist already covers, so creating
 * and building a project needs no native folder dialog. Created eagerly so the
 * first `dev.start` on a managed project cannot fail on a missing directory.
 */
export const resolveProjectsDir = async (): Promise<string> => {
    const dir = join(app.getPath('userData'), PROJECTS_DIR_NAME)
    await mkdir(dir, { recursive: true })
    return dir
}

const asRecord = (value: unknown): Record<string, any> =>
    value && typeof value === 'object' ? (value as Record<string, any>) : {}

const requireString = (value: unknown, field: string): string => {
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`dev: "${field}" must be a non-empty string`)
    }
    return value
}

export interface DevIpcOptions {
    /** Resolve + validate an absolute path against the fs allowlist. */
    assertAllowedPath: (target: unknown, field?: string) => string
}

export function setupDevIpcHandlers({ assertAllowedPath }: DevIpcOptions): DevSessionManager {
    const manager = new DevSessionManager()

    const broadcast = (event: string, status: unknown) => {
        for (const window of BrowserWindow.getAllWindows()) {
            if (!window.isDestroyed()) window.webContents.send('desktop:event:dev', { type: event, status })
        }
    }
    manager.onEvent(broadcast)

    const handle = (capability: string, fn: (event: IpcMainInvokeEvent, params: unknown) => unknown) => {
        ipcMain.handle('desktop:' + capability, (event, params) => fn(event, params))
    }

    handle('dev.start', async (_event, raw) => {
        const params = asRecord(raw)
        return manager.start({
            root: assertAllowedPath(params.root, 'root'),
            watch: params.watch !== false,
            writeToDisk: params.writeToDisk === true,
            externals: Array.isArray(params.externals)
                ? params.externals.filter((value: unknown): value is string => typeof value === 'string')
                : [],
        })
    })

    handle('dev.stop', (_event, raw) => {
        const params = asRecord(raw)
        return manager.stop({ root: assertAllowedPath(params.root, 'root') })
    })

    handle('dev.build', async (_event, raw) => {
        const params = asRecord(raw)
        return manager.build({
            root: assertAllowedPath(params.root, 'root'),
            writeToDisk: params.writeToDisk === true,
            watch: false,
            externals: Array.isArray(params.externals)
                ? params.externals.filter((value: unknown): value is string => typeof value === 'string')
                : [],
        })
    })

    handle('dev.status', (_event, raw) => {
        const params = asRecord(raw)
        const root = params.root ? assertAllowedPath(params.root, 'root') : undefined
        return manager.status(root ? { root } : {})
    })

    handle('dev.logs', (_event, raw) => {
        const params = asRecord(raw)
        const limit = typeof params.limit === 'number' && params.limit > 0 ? Math.min(params.limit, 1000) : 200
        return manager.logs({ root: assertAllowedPath(params.root, 'root'), limit })
    })

    handle('dev.scaffold', async (_event, raw) => {
        const params = asRecord(raw)
        const name = requireString(params.name, 'name')
        if (!/^[a-z0-9][a-z0-9._-]*$/i.test(name)) {
            throw new Error('dev: "name" must be a valid package name (letters, digits, . _ -)')
        }
        // No parentDir => the host's own projects directory, no dialog needed.
        const parentDir = params.parentDir
            ? assertAllowedPath(params.parentDir, 'parentDir')
            : undefined
        return manager.scaffold({
            parentDir,
            projectsDir: parentDir ? undefined : await resolveProjectsDir(),
            name,
            displayName: typeof params.displayName === 'string' ? params.displayName : undefined,
            pluginKey: typeof params.pluginKey === 'string' ? params.pluginKey : undefined,
            overwrite: params.overwrite === true,
        })
    })

    handle('dev.list', async (_event, raw) => {
        const params = asRecord(raw)
        const dir = params.dir ? assertAllowedPath(params.dir, 'dir') : await resolveProjectsDir()
        return manager.listProjects({ dir })
    })

    handle('dev.readFile', async (_event, raw) => {
        const params = asRecord(raw)
        const filePath = assertAllowedPath(params.path, 'path')
        return await readFile(filePath, 'utf8')
    })

    handle('dev.writeFile', async (_event, raw) => {
        const params = asRecord(raw)
        const filePath = assertAllowedPath(params.path, 'path')
        if (typeof params.contents !== 'string') {
            throw new Error('dev: "contents" must be a string')
        }
        await mkdir(dirname(filePath), { recursive: true })
        await writeFile(filePath, params.contents, 'utf8')
    })

    return manager
}
