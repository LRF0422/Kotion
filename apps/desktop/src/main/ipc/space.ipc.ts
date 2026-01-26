import { ipcMain } from 'electron'
import { createResponse, createErrorResponse } from './index'
import * as spaceService from '../services/space.service'

export const registerSpaceIpcHandlers = () => {
    // List all spaces
    ipcMain.handle('space:list', async () => {
        try {
            const spaces = await spaceService.listSpaces()
            return createResponse({ records: spaces, total: spaces.length })
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Get personal space
    ipcMain.handle('space:getPersonal', async () => {
        try {
            const space = await spaceService.getPersonalSpace()
            return createResponse(space)
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Get space detail
    ipcMain.handle('space:getDetail', async (_event, id: string) => {
        try {
            const space = await spaceService.getSpaceDetail(id)
            return createResponse(space)
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Create space
    ipcMain.handle('space:create', async (_event, data: spaceService.CreateSpaceData) => {
        try {
            const space = await spaceService.createSpace(data)
            return createResponse(space)
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Update space
    ipcMain.handle('space:update', async (_event, { id, data }: { id: string; data: Partial<spaceService.CreateSpaceData> }) => {
        try {
            const space = await spaceService.updateSpace(id, data)
            return createResponse(space)
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Delete space
    ipcMain.handle('space:delete', async (_event, id: string) => {
        try {
            await spaceService.deleteSpace(id)
            return createResponse(null, true, 'Space deleted successfully')
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Add space to favorites
    ipcMain.handle('space:addFavorite', async (_event, id: string) => {
        try {
            await spaceService.addSpaceFavorite(id)
            return createResponse(null, true, 'Added to favorites')
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Remove space from favorites
    ipcMain.handle('space:removeFavorite', async (_event, id: string) => {
        try {
            await spaceService.removeSpaceFavorite(id)
            return createResponse(null, true, 'Removed from favorites')
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Get space members
    ipcMain.handle('space:getMembers', async (_event, id: string) => {
        try {
            const members = await spaceService.getSpaceMembers(id)
            return createResponse(members)
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })

    // Save space as template
    ipcMain.handle('space:saveAsTemplate', async (_event, id: string) => {
        try {
            await spaceService.saveSpaceAsTemplate(id)
            return createResponse(null, true, 'Saved as template')
        } catch (error: any) {
            return createErrorResponse(error.message)
        }
    })
}
