import { ipcMain } from 'electron'
import { registerAuthIpcHandlers } from './auth.ipc'
import { registerUserIpcHandlers } from './user.ipc'
import { registerSpaceIpcHandlers } from './space.ipc'
import { registerPageIpcHandlers } from './page.ipc'
import { registerPluginIpcHandlers } from './plugin.ipc'
import { registerFileIpcHandlers } from './file.ipc'
import { registerImIpcHandlers } from './im.ipc'

/**
 * Register all IPC handlers for the main process
 */
export const registerAllIpcHandlers = () => {
    console.log('Registering IPC handlers...')

    // Register all handlers
    registerAuthIpcHandlers()
    registerUserIpcHandlers()
    registerSpaceIpcHandlers()
    registerPageIpcHandlers()
    registerPluginIpcHandlers()
    registerFileIpcHandlers()
    registerImIpcHandlers()

    console.log('All IPC handlers registered successfully')
}

/**
 * Helper to create a standard response
 */
export const createResponse = <T>(data: T, success = true, msg = 'Success', code = 200) => {
    return {
        code,
        success,
        msg,
        data
    }
}

/**
 * Helper to create an error response
 */
export const createErrorResponse = (msg: string, code = 500) => {
    return {
        code,
        success: false,
        msg,
        data: null
    }
}

export { ipcMain }
