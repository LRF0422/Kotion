import { ipcMain } from 'electron'
import { createResponse, createErrorResponse } from './index'
import * as pluginService from '../services/plugin.service'

export const registerPluginIpcHandlers = () => {
    // List all plugins
    ipcMain.handle('plugin:list', async () => {
        try {
            const plugins = await pluginService.listPlugins()
            return createResponse(plugins)
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Get plugin by ID
    ipcMain.handle('plugin:get', async (_event, id: string) => {
        try {
            const plugin = await pluginService.getPlugin(id)
            return createResponse(plugin)
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Create plugin
    ipcMain.handle('plugin:create', async (_event, data: pluginService.CreatePluginData) => {
        try {
            const plugin = await pluginService.createPlugin(data)
            return createResponse(plugin)
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Install plugin
    ipcMain.handle('plugin:install', async (_event, id: string) => {
        try {
            await pluginService.installPlugin(id)
            return createResponse(null, true, 'Plugin installed')
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Uninstall plugin
    ipcMain.handle('plugin:uninstall', async (_event, id: string) => {
        try {
            await pluginService.uninstallPlugin(id)
            return createResponse(null, true, 'Plugin uninstalled')
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Update plugin
    ipcMain.handle('plugin:update', async (_event, data: any) => {
        try {
            const plugin = await pluginService.updatePlugin(data)
            return createResponse(plugin)
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Get installed plugins
    ipcMain.handle('plugin:getInstalled', async () => {
        try {
            const plugins = await pluginService.getInstalledPlugins()
            return createResponse(plugins)
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Toggle plugin
    ipcMain.handle('plugin:toggle', async (_event, { id, enabled }: { id: string; enabled: boolean }) => {
        try {
            await pluginService.togglePlugin(id, enabled)
            return createResponse(null, true, enabled ? 'Plugin enabled' : 'Plugin disabled')
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })
}
